import {
  AgentTurnInputSchema,
  AgentTurnOutputSchema,
  parseWorldEvent,
  SCHEMA_VERSION,
  type ExpeditionFixture,
  type AgentTurnInput,
  type AgentTurnOutput,
  type WorldCommand,
  type WorldEvent,
} from '@signal-atlas/contracts';
import {
  CodexTurnScheduler,
  getAgentRoleProfile,
  isPromiseLike,
  type CodexDriver,
  type CodexRuntimeDiagnostics,
  type CodexRuntimeEvent,
  type RuntimeTurnRecord,
  type RuntimeTurnStatus,
} from '@signal-atlas/codex-runtime';
import {
  recordAcceptedCommand,
  reduceWorldEvent,
  replayFixture,
  selectRoutePlan,
  validateWorldCommand,
  knowledgeKey,
  type CommandIdempotencyLedger,
  type CommandValidationIssue,
  type RouteLeg,
  type RoutePlan,
  type WorldProjection,
} from '@signal-atlas/simulation';

import {
  createFixtureCodexDriver,
  type FixtureMissionScenario,
  type ScriptedFixtureTurn,
} from './fixture-mission-driver.js';
import { createScriptedProfessorResponse } from './fixture-professor-driver.js';

export interface AcceptedCommandResult {
  accepted: true;
  duplicate: boolean;
  commandId: string;
  events: WorldEvent[];
  sequence: number;
}

export interface RejectedCommandResult {
  accepted: false;
  issues: CommandValidationIssue[];
}

export type SubmitCommandResult = AcceptedCommandResult | RejectedCommandResult;

interface ScheduledTravel {
  agentId: string;
  missionId: string;
  plan: RoutePlan;
  legIndex: number;
  elapsedMs: number;
  emittedProgressStep: number;
}

interface ScheduledWork {
  agentId: string;
  missionId: string;
  turnId: string;
  remainingMs: number;
  schedulerManaged: boolean;
  turn?: ScriptedFixtureTurn;
  output?: AgentTurnOutput;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

interface ScheduledMeeting {
  meetingId: string;
  placeId: string;
  participantAgentIds: string[];
  missionIdsByAgentId: Record<string, string>;
}

interface CommandEventPlan {
  events: WorldEvent[];
  scheduleTravel?: ScheduledTravel;
  scheduleTravels?: ScheduledTravel[];
  scheduleWork?: ScheduledWork;
  scheduleMeeting?: ScheduledMeeting;
  clearScheduledForAgentId?: string;
}

export interface ExpeditionRuntimeOptions {
  missionDriver?: CodexDriver<AgentTurnInput, ScriptedFixtureTurn>;
  missionDriverFactory?: (
    scenario: () => FixtureMissionScenario,
  ) => CodexDriver<AgentTurnInput, ScriptedFixtureTurn>;
  maxConcurrentTurns?: number;
  defaultTurnTimeoutMs?: number;
}

function actorForEvent(actor: WorldCommand['actor']): WorldEvent['actor'] {
  return actor.id ? { kind: actor.kind, id: actor.id } : { kind: actor.kind };
}

function unsupportedCommandIssue(type: string): CommandValidationIssue {
  return {
    code: 'invalid_state',
    path: ['type'],
    message: `Command ${type} is valid but is not handled by this runtime milestone.`,
  };
}

function addMilliseconds(timestamp: string, durationMs: number): string {
  return new Date(new Date(timestamp).getTime() + durationMs).toISOString();
}

export class ExpeditionRuntime {
  readonly #fixture: ExpeditionFixture;
  readonly #missionDriver: CodexDriver<AgentTurnInput, ScriptedFixtureTurn>;
  readonly #maxConcurrentTurns: number;
  readonly #defaultTurnTimeoutMs: number;
  #turnScheduler: CodexTurnScheduler<AgentTurnInput, ScriptedFixtureTurn> | undefined;
  #projection: WorldProjection;
  #events: WorldEvent[];
  #ledger: CommandIdempotencyLedger = {};
  readonly #acceptedByKey = new Map<string, AcceptedCommandResult>();
  readonly #travelByAgentId = new Map<string, ScheduledTravel>();
  readonly #workByAgentId = new Map<string, ScheduledWork>();
  readonly #attemptByMissionId = new Map<string, number>();
  readonly #meetingsById = new Map<string, ScheduledMeeting>();
  readonly #meetingIdByMissionId = new Map<string, string>();
  readonly #driverEvents: CodexRuntimeEvent[] = [];
  #missionScenario: FixtureMissionScenario = 'success';

  constructor(fixture: ExpeditionFixture, options: ExpeditionRuntimeOptions = {}) {
    this.#fixture = structuredClone(fixture);
    this.#maxConcurrentTurns = options.maxConcurrentTurns ?? 2;
    this.#defaultTurnTimeoutMs = options.defaultTurnTimeoutMs ?? 30_000;
    if (!Number.isInteger(this.#maxConcurrentTurns) || this.#maxConcurrentTurns < 1) {
      throw new Error('Runtime turn concurrency must be a positive integer.');
    }
    this.#missionDriver =
      options.missionDriver ??
      options.missionDriverFactory?.(() => this.#missionScenario) ??
      createFixtureCodexDriver(this.#fixture, () => this.#missionScenario);
    this.#turnScheduler = this.#createTurnScheduler();
    const replay = replayFixture(this.#fixture);
    this.#projection = replay.projection;
    this.#events = structuredClone(this.#fixture.initialEvents);
  }

  get expeditionId(): string {
    return this.#projection.expedition.id;
  }

  snapshot(): WorldProjection {
    return structuredClone(this.#projection);
  }

  eventsAfter(sequence: number): WorldEvent[] {
    return structuredClone(this.#events.filter((event) => event.sequence > sequence));
  }

  fixtureConfiguration(): { seed: string; missionScenario: FixtureMissionScenario } {
    return { seed: this.#fixture.seed, missionScenario: this.#missionScenario };
  }

  setFixtureMissionScenario(scenario: FixtureMissionScenario): void {
    this.#missionScenario = scenario;
  }

  runtimeDiagnostics(): CodexRuntimeDiagnostics {
    if (this.#turnScheduler) {
      const diagnostics = this.#turnScheduler.diagnostics();
      return {
        ...diagnostics,
        turns: [...diagnostics.turns].sort(
          (left, right) =>
            right.requestedAt.localeCompare(left.requestedAt) ||
            left.turnId.localeCompare(right.turnId),
        ),
      };
    }
    const terminalTurns: RuntimeTurnRecord[] = Object.values(this.#projection.agentTurnsById).map(
      (turn) => {
        const mission = this.#projection.missionsById[turn.missionId];
        const status: RuntimeTurnStatus =
          turn.status === 'completed'
            ? 'completed'
            : turn.code?.includes('timeout')
              ? 'timed_out'
              : turn.code?.includes('cancel')
                ? 'canceled'
                : 'failed';
        return {
          turnId: turn.turnId,
          expeditionId: this.expeditionId,
          agentId: turn.agentId,
          missionId: turn.missionId,
          driverId: this.#missionDriver.id,
          status,
          attempt: this.#attemptByMissionId.get(turn.missionId) ?? 1,
          requestedAt: mission?.startedAt ?? mission?.createdAt ?? turn.recordedAt,
          timeoutMs: mission?.budget.timeoutMs ?? this.#defaultTurnTimeoutMs,
          queuedAt: mission?.createdAt ?? turn.recordedAt,
          finishedAt: turn.recordedAt,
          ...(turn.code || turn.message
            ? {
                error: {
                  code: turn.code ?? 'runtime_turn_failed',
                  message: turn.message ?? 'The agent turn failed.',
                  recoverable: turn.recoverable ?? false,
                },
              }
            : {}),
        };
      },
    );
    const activeTurns: RuntimeTurnRecord[] = [...this.#workByAgentId.values()].map((task) => {
      const mission = this.#projection.missionsById[task.missionId];
      return {
        turnId: task.turnId,
        expeditionId: this.expeditionId,
        agentId: task.agentId,
        missionId: task.missionId,
        driverId: this.#missionDriver.id,
        status: 'running',
        attempt: task.turn?.attempt ?? this.#attemptByMissionId.get(task.missionId) ?? 1,
        requestedAt: mission?.startedAt ?? mission?.createdAt ?? this.#projection.market.updatedAt,
        timeoutMs: mission?.budget.timeoutMs ?? this.#defaultTurnTimeoutMs,
        queuedAt: mission?.createdAt ?? this.#projection.market.updatedAt,
        startedAt: mission?.startedAt ?? mission?.createdAt ?? this.#projection.market.updatedAt,
      };
    });
    const turns = [...terminalTurns, ...activeTurns].sort(
      (left, right) =>
        right.requestedAt.localeCompare(left.requestedAt) ||
        left.turnId.localeCompare(right.turnId),
    );
    const turnStatuses: RuntimeTurnStatus[] = [
      'queued',
      'running',
      'completed',
      'failed',
      'canceled',
      'timed_out',
    ];
    return {
      driver: this.#missionDriver.diagnostics(),
      scheduler: {
        maxConcurrency: this.#maxConcurrentTurns,
        defaultTimeoutMs: this.#defaultTurnTimeoutMs,
        activeCount: activeTurns.length,
        queuedCount: 0,
      },
      totals: Object.fromEntries(
        turnStatuses.map((status) => [
          status,
          turns.filter((turn) => turn.status === status).length,
        ]),
      ) as Record<RuntimeTurnStatus, number>,
      turns,
      recentEvents: structuredClone(this.#driverEvents.slice(-40)),
    };
  }

  resetToFixture(): void {
    for (const task of this.#workByAgentId.values()) {
      if (task.schedulerManaged) this.#turnScheduler?.cancel(task.turnId, 'Fixture reset.');
    }
    const replay = replayFixture(this.#fixture);
    this.#projection = replay.projection;
    this.#events = structuredClone(this.#fixture.initialEvents);
    this.#ledger = {};
    this.#acceptedByKey.clear();
    this.#travelByAgentId.clear();
    this.#workByAgentId.clear();
    this.#attemptByMissionId.clear();
    this.#meetingsById.clear();
    this.#meetingIdByMissionId.clear();
    this.#driverEvents.length = 0;
    this.#missionScenario = 'success';
    this.#turnScheduler = this.#createTurnScheduler();
  }

  async waitForRuntimeIdle(): Promise<void> {
    await this.#turnScheduler?.waitForIdle();
    await Promise.resolve();
  }

  submit(input: unknown): SubmitCommandResult {
    const validation = validateWorldCommand(input, this.#projection, this.#ledger);
    if (!validation.accepted) return validation;

    const command = validation.command;
    if (validation.duplicate) {
      const original = this.#acceptedByKey.get(command.idempotencyKey);
      if (!original) {
        return {
          accepted: false,
          issues: [
            {
              code: 'invalid_state',
              path: ['idempotencyKey'],
              message: 'The idempotency ledger has no stored result for this command.',
            },
          ],
        };
      }
      return { ...structuredClone(original), duplicate: true };
    }

    const plan = this.#eventPlanForCommand(command);
    if (!plan) {
      return { accepted: false, issues: [unsupportedCommandIssue(command.type)] };
    }

    let nextProjection = this.#projection;
    for (const event of plan.events) nextProjection = reduceWorldEvent(nextProjection, event);

    this.#projection = nextProjection;
    this.#events = [...this.#events, ...plan.events];
    this.#ledger = recordAcceptedCommand(this.#ledger, command);
    if (plan.clearScheduledForAgentId) {
      this.#travelByAgentId.delete(plan.clearScheduledForAgentId);
      const work = this.#workByAgentId.get(plan.clearScheduledForAgentId);
      if (work?.schedulerManaged) {
        this.#turnScheduler?.cancel(work.turnId, 'Mission canceled by an accepted world command.');
      }
      this.#workByAgentId.delete(plan.clearScheduledForAgentId);
    }
    if (plan.scheduleTravel) {
      this.#travelByAgentId.set(plan.scheduleTravel.agentId, plan.scheduleTravel);
    }
    for (const travel of plan.scheduleTravels ?? []) {
      this.#travelByAgentId.set(travel.agentId, travel);
    }
    if (plan.scheduleWork) this.#workByAgentId.set(plan.scheduleWork.agentId, plan.scheduleWork);
    if (plan.scheduleMeeting) {
      this.#meetingsById.set(plan.scheduleMeeting.meetingId, plan.scheduleMeeting);
      for (const missionId of Object.values(plan.scheduleMeeting.missionIdsByAgentId)) {
        this.#meetingIdByMissionId.set(missionId, plan.scheduleMeeting.meetingId);
      }
    }
    const meetingEvents = this.#completeReadyMeetings(command.issuedAt);
    const result: AcceptedCommandResult = {
      accepted: true,
      duplicate: false,
      commandId: command.id,
      events: structuredClone([...plan.events, ...meetingEvents]),
      sequence: this.#projection.sequence,
    };
    this.#acceptedByKey.set(command.idempotencyKey, result);
    return structuredClone(result);
  }

  /** Advance scheduled travel by real elapsed time. Global speed scales time, never event order. */
  advance(elapsedRealMs: number, occurredAt = new Date().toISOString()): WorldEvent[] {
    if (!Number.isFinite(elapsedRealMs) || elapsedRealMs <= 0) return [];
    if (this.#projection.expedition.status !== 'active') return [];
    const speed = this.#projection.expedition.simulationSpeed;
    if (speed === 0) return [];

    const appended: WorldEvent[] = [];
    // Capture existing work first so a long tick cannot count the same elapsed time toward both
    // the final travel leg and newly-started location work.
    const existingWork = [...this.#workByAgentId.values()].sort((left, right) =>
      left.agentId.localeCompare(right.agentId),
    );
    const tasks = [...this.#travelByAgentId.values()].sort((left, right) =>
      left.agentId.localeCompare(right.agentId),
    );
    for (const task of tasks) {
      let remainingMs = elapsedRealMs * speed;
      while (remainingMs > 0 && this.#travelByAgentId.has(task.agentId)) {
        const leg = task.plan.legs[task.legIndex];
        if (!leg) {
          this.#travelByAgentId.delete(task.agentId);
          break;
        }
        const availableMs = leg.durationMs - task.elapsedMs;
        const consumedMs = Math.min(remainingMs, availableMs);
        task.elapsedMs += consumedMs;
        remainingMs -= consumedMs;

        const targetStep = Math.min(10, Math.floor((task.elapsedMs / leg.durationMs) * 10));
        for (let step = task.emittedProgressStep + 1; step <= targetStep; step += 1) {
          appended.push(
            this.#appendSystemEvent(
              `evt-travel-${task.missionId}-${task.legIndex}-progress-${step}`,
              'agent.travel.progressed',
              {
                agentId: task.agentId,
                routeId: leg.routeId,
                progress: step / 10,
              },
              occurredAt,
              task.missionId,
            ),
          );
          task.emittedProgressStep = step;
        }

        if (task.elapsedMs < leg.durationMs) break;

        appended.push(
          this.#appendSystemEvent(
            `evt-travel-${task.missionId}-${task.legIndex}-arrived`,
            'agent.arrived',
            {
              agentId: task.agentId,
              missionId: task.missionId,
              placeId: leg.toPlaceId,
            },
            occurredAt,
            task.missionId,
          ),
        );

        const nextLegIndex = task.legIndex + 1;
        const nextLeg = task.plan.legs[nextLegIndex];
        if (nextLeg) {
          task.legIndex = nextLegIndex;
          task.elapsedMs = 0;
          task.emittedProgressStep = 0;
          appended.push(
            this.#appendSystemEvent(
              `evt-travel-${task.missionId}-${nextLegIndex}-started`,
              'agent.travel.started',
              this.#travelStartedPayload(task.agentId, task.missionId, nextLeg, occurredAt),
              occurredAt,
              task.missionId,
            ),
          );
        } else {
          this.#travelByAgentId.delete(task.agentId);
          const meetingId = this.#meetingIdByMissionId.get(task.missionId);
          if (meetingId) {
            appended.push(
              this.#appendSystemEvent(
                `evt-meeting-arrival-${meetingId}-${task.agentId}`,
                'agent.mission.completed',
                { missionId: task.missionId, completedAt: occurredAt },
                occurredAt,
                meetingId,
              ),
            );
          } else {
            appended.push(
              this.#appendSystemEvent(
                `evt-work-${task.missionId}-started`,
                'agent.work.started',
                { agentId: task.agentId, missionId: task.missionId },
                occurredAt,
                task.missionId,
              ),
            );
            const mission = this.#projection.missionsById[task.missionId];
            if (!mission) continue;
            const effectivePlaceId =
              mission.destinationPlaceId ??
              this.#projection.agentsById[task.agentId]?.placeId ??
              task.plan.toPlaceId;
            const scheduled = this.#createScheduledWork(mission, effectivePlaceId);
            this.#workByAgentId.set(task.agentId, scheduled);
          }
        }
      }
    }

    appended.push(...this.#completeReadyMeetings(occurredAt));

    for (const task of existingWork) {
      if (this.#workByAgentId.get(task.agentId) !== task) continue;
      if (task.error) {
        this.#workByAgentId.delete(task.agentId);
        appended.push(...this.#completeFailedScheduledWork(task, occurredAt));
        continue;
      }
      if (!task.turn) continue;
      task.remainingMs -= elapsedRealMs * speed;
      if (task.remainingMs > 0) continue;
      this.#workByAgentId.delete(task.agentId);
      appended.push(...this.#completeScheduledWork(task, occurredAt));
    }

    return structuredClone(appended);
  }

  #createScheduledWork(
    mission: WorldProjection['missionsById'][string],
    effectivePlaceId: string,
  ): ScheduledWork {
    const attempt = (this.#attemptByMissionId.get(mission.id) ?? 0) + 1;
    this.#attemptByMissionId.set(mission.id, attempt);
    const agent = this.#projection.agentsById[mission.assignedAgentId];
    if (!agent)
      throw new Error(`Cannot schedule a turn for missing agent ${mission.assignedAgentId}.`);
    const place = this.#projection.worldManifest.places.find(
      (candidate) => candidate.id === effectivePlaceId,
    );
    const input = AgentTurnInputSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      turnId: `turn-${mission.id}-${attempt}`,
      expeditionId: this.expeditionId,
      agentId: mission.assignedAgentId,
      mission,
      effectivePlaceId,
      attempt,
      knownSourceIds: agent.knownSourceIds,
      knownSignalIds: agent.knownSignalIds,
      allowedCapabilities:
        place?.capabilityBindings.map((binding) => binding.canonicalCapability) ?? [],
      requestedAt: mission.startedAt ?? mission.createdAt,
      timeoutMs: mission.budget.timeoutMs,
    });
    if (this.#turnScheduler) {
      const task: ScheduledWork = {
        agentId: mission.assignedAgentId,
        missionId: mission.id,
        turnId: input.turnId,
        remainingMs: 0,
        schedulerManaged: true,
      };
      const scheduled = this.#turnScheduler.submit(input);
      void scheduled.completion
        .then((result) => {
          if (!result.artifacts) {
            task.error = {
              code: 'runtime_missing_artifacts',
              message: `Driver ${this.#missionDriver.id} returned no mission artifacts.`,
              recoverable: false,
            };
            return;
          }
          task.turn = result.artifacts;
          task.output = AgentTurnOutputSchema.parse(result.output);
          // The process latency has already elapsed while the world remained responsive.
          task.remainingMs = 0;
        })
        .catch((error: unknown) => {
          task.error = this.#runtimeError(error);
        });
      return task;
    }

    const controller = new AbortController();
    const driverResult = this.#missionDriver.runTurn(input, {
      signal: controller.signal,
      deadlineAt: addMilliseconds(input.requestedAt, input.timeoutMs),
      emit: (detail) => {
        this.#driverEvents.push({
          id: `runtime-${input.turnId}-${this.#driverEvents.length + 1}`,
          type: 'driver.event',
          turnId: input.turnId,
          occurredAt: input.requestedAt,
          detail: structuredClone(detail),
        });
      },
    });
    if (isPromiseLike(driverResult)) {
      controller.abort();
      throw new Error(
        `Driver ${this.#missionDriver.id} is asynchronous; schedule it through CodexTurnScheduler.`,
      );
    }
    const output = AgentTurnOutputSchema.parse(driverResult.output);
    if (output.agentId !== input.agentId || output.missionId !== input.mission.id) {
      throw new Error('Scripted driver output identity does not match the scheduled turn.');
    }
    const turn = driverResult.artifacts;
    if (!turn)
      throw new Error(`Driver ${this.#missionDriver.id} did not return fixture artifacts.`);
    return {
      agentId: mission.assignedAgentId,
      missionId: mission.id,
      turnId: turn.turnId,
      remainingMs: turn.latencyMs,
      schedulerManaged: false,
      turn,
      output,
    };
  }

  #completeScheduledWork(task: ScheduledWork, occurredAt: string): WorldEvent[] {
    const { output, turn } = task;
    if (!turn || !output) throw new Error(`Cannot complete unresolved turn ${task.turnId}.`);
    const agent = this.#projection.agentsById[task.agentId];
    if (!agent) throw new Error(`Cannot complete a turn for missing agent ${task.agentId}.`);
    const profile = getAgentRoleProfile(agent.role, agent.profileVersion);
    const appended: WorldEvent[] = [];
    const emit = (label: string, type: WorldEvent['type'], payload: unknown) => {
      const event = this.#appendSystemEvent(
        `evt-${turn.turnId}-${label}`,
        type,
        payload,
        occurredAt,
        task.missionId,
      );
      appended.push(event);
    };

    emit('pref-started', 'pref.call.started', {
      callId: turn.callId,
      missionId: task.missionId,
      agentId: task.agentId,
      capability: turn.capability,
      argumentsHash: turn.argumentsHash,
    });

    if (turn.scenario === 'timeout' || turn.scenario === 'invalid_result') {
      const invalid = turn.scenario === 'invalid_result';
      const code = invalid ? 'fixture_invalid_result' : 'fixture_timeout';
      const message = invalid
        ? 'The scripted source response did not satisfy the result contract.'
        : 'The scripted source request exceeded its injected time limit.';
      emit('pref-failed', 'pref.call.failed', {
        callId: turn.callId,
        code,
        message,
        retryable: true,
      });
      emit('dialogue', 'agent.dialogue.emitted', {
        agentId: task.agentId,
        text: turn.dialogue,
        sourceIds: [],
        signalIds: [],
      });
      emit('failed', 'agent.turn.failed', {
        agentId: task.agentId,
        missionId: task.missionId,
        turnId: turn.turnId,
        code,
        message,
        recoverable: true,
      });
      emit('mission-failed', 'agent.mission.failed', {
        missionId: task.missionId,
        code,
        message,
      });
      return appended;
    }

    for (const source of turn.sources) {
      if (!this.#projection.sourcesById[source.id]) {
        const previousSourceId = source.supersedesSourceId;
        if (previousSourceId && this.#projection.sourcesById[previousSourceId]) {
          emit(`source-${source.id}`, 'source.superseded', { previousSourceId, source });
          for (const previousSignal of Object.values(this.#projection.signalsById)) {
            if (
              previousSignal.status === 'stale' ||
              !previousSignal.sourceIds.includes(previousSourceId)
            ) {
              continue;
            }
            emit(`stale-${previousSignal.id}`, 'signal.marked_stale', {
              signalId: previousSignal.id,
              reason: 'A newer version of a linked Pref source was recorded.',
              newerSourceId: source.id,
            });
          }
        } else {
          emit(`source-${source.id}`, 'source.recorded', { source });
        }
      }
    }
    emit('pref-completed', 'pref.call.completed', {
      callId: turn.callId,
      sourceIds: turn.sources.map((source) => source.id),
      durationMs: turn.latencyMs,
    });
    for (const claim of turn.claims) {
      if (!this.#projection.claimsById[claim.id]) {
        emit(`claim-${claim.id}`, 'claim.created', { claim });
      }
    }
    for (const signal of turn.signals) {
      if (signal.status === 'stale') {
        for (const previousSignal of Object.values(this.#projection.signalsById)) {
          if (
            previousSignal.id === signal.id ||
            previousSignal.status === 'stale' ||
            !previousSignal.sourceIds.some((sourceId) => signal.sourceIds.includes(sourceId))
          ) {
            continue;
          }
          emit(`cache-stale-${previousSignal.id}`, 'signal.marked_stale', {
            signalId: previousSignal.id,
            reason: 'The live provider was unavailable and only a stale cached result remained.',
          });
        }
      }
      const existing = this.#projection.signalsById[signal.id];
      if (!existing) {
        emit(`signal-${signal.id}`, 'signal.created', { signal });
      } else if (signal.status === 'stale' && existing.status !== 'stale') {
        emit(`stale-${signal.id}`, 'signal.marked_stale', {
          signalId: signal.id,
          reason: 'The live provider was unavailable and only a stale cached result remained.',
        });
      }
    }

    const shouldUpdateBelief = turn.signals.some(
      (signal) =>
        signal.direction !== 'context' &&
        signal.impact.probabilityPointRange !== undefined &&
        !this.#projection.knowledgeByKey[knowledgeKey(task.agentId, 'signal', signal.id)],
    );
    for (const [objectType, values] of [
      ['source', turn.sources],
      ['claim', turn.claims],
      ['signal', turn.signals],
    ] as const) {
      for (const value of values) {
        if (this.#projection.knowledgeByKey[knowledgeKey(task.agentId, objectType, value.id)]) {
          continue;
        }
        emit(`knowledge-${objectType}-${value.id}`, 'agent.knowledge.acquired', {
          knowledge: {
            agentId: task.agentId,
            objectType,
            objectId: value.id,
            acquiredAt: occurredAt,
            acquisition: { kind: 'retrieved', missionId: task.missionId },
          },
        });
      }
    }

    if (shouldUpdateBelief && turn.signals.length > 0) {
      emit('belief', 'belief.updated', {
        update: this.#beliefUpdate(task, occurredAt),
      });
    }
    emit('dialogue', 'agent.dialogue.emitted', {
      agentId: task.agentId,
      text: turn.dialogue,
      sourceIds: turn.sources.map((source) => source.id),
      signalIds: turn.signals.map((signal) => signal.id),
    });
    emit('completed', 'agent.turn.completed', {
      agentId: task.agentId,
      missionId: task.missionId,
      turnId: turn.turnId,
      sourceIds: turn.sources.map((source) => source.id),
      signalIds: turn.signals.map((signal) => signal.id),
      profileId: profile.profileId,
      profileVersion: profile.version,
      publicRationale: output.rationale,
      unknowns: [...output.unknowns],
    });
    emit('mission-completed', 'agent.mission.completed', {
      missionId: task.missionId,
      completedAt: occurredAt,
    });
    return appended;
  }

  #beliefUpdate(task: ScheduledWork, occurredAt: string) {
    if (!task.turn) throw new Error(`Cannot update belief from unresolved turn ${task.turnId}.`);
    const agent = this.#projection.agentsById[task.agentId];
    if (!agent) throw new Error(`Cannot update belief for missing agent ${task.agentId}.`);
    const previousProbabilities = structuredClone(agent.belief.probabilities);
    const newProbabilities = { ...previousProbabilities };

    const directionalSignals = task.turn.signals.filter(
      (signal) => signal.direction !== 'context' && signal.impact.probabilityPointRange,
    );
    for (const signal of directionalSignals) {
      const targetOutcomeId = signal.targetOutcomeId;
      const range = signal.impact.probabilityPointRange;
      if (!targetOutcomeId || !range || newProbabilities[targetOutcomeId] === undefined) continue;
      const previousTarget = newProbabilities[targetOutcomeId];
      const target = Math.min(0.99, Math.max(0.01, previousTarget + (range.low + range.high) / 2));
      const previousRemainder = 1 - previousTarget;
      const nextRemainder = 1 - target;
      newProbabilities[targetOutcomeId] = target;
      const otherOutcomeIds = Object.keys(newProbabilities).filter((id) => id !== targetOutcomeId);
      for (const outcomeId of otherOutcomeIds) {
        const weight =
          previousRemainder > 0
            ? (newProbabilities[outcomeId] ?? 0) / previousRemainder
            : 1 / otherOutcomeIds.length;
        newProbabilities[outcomeId] = nextRemainder * weight;
      }
    }

    return {
      id: `belief-${task.turn.turnId}`,
      expeditionId: this.expeditionId,
      actor: { kind: 'agent' as const, id: task.agentId },
      previousProbabilities,
      newProbabilities,
      rationale: task.output?.rationale ?? 'Updated from validated mission evidence.',
      evidenceSignalIds: directionalSignals.map((signal) => signal.id),
      assumptions: task.output?.assumptions ?? [],
      createdAt: occurredAt,
    };
  }

  #completeFailedScheduledWork(task: ScheduledWork, occurredAt: string): WorldEvent[] {
    const error = task.error ?? {
      code: 'runtime_turn_failed',
      message: 'The Codex runtime did not return a usable result.',
      recoverable: true,
    };
    const dialogue =
      error.code === 'runtime_timeout'
        ? 'The local Codex turn reached its time limit, so I recorded no evidence.'
        : 'The local Codex boundary failed before a valid result was accepted. I recorded no evidence.';
    return [
      this.#appendSystemEvent(
        `evt-${task.turnId}-dialogue`,
        'agent.dialogue.emitted',
        { agentId: task.agentId, text: dialogue, sourceIds: [], signalIds: [] },
        occurredAt,
        task.missionId,
      ),
      this.#appendSystemEvent(
        `evt-${task.turnId}-failed`,
        'agent.turn.failed',
        {
          agentId: task.agentId,
          missionId: task.missionId,
          turnId: task.turnId,
          code: error.code,
          message: error.message,
          recoverable: error.recoverable,
        },
        occurredAt,
        task.missionId,
      ),
      this.#appendSystemEvent(
        `evt-${task.turnId}-mission-failed`,
        'agent.mission.failed',
        { missionId: task.missionId, code: error.code, message: error.message },
        occurredAt,
        task.missionId,
      ),
    ];
  }

  #runtimeError(error: unknown): NonNullable<ScheduledWork['error']> {
    if (error && typeof error === 'object') {
      const candidate = error as { code?: unknown; message?: unknown; recoverable?: unknown };
      return {
        code: typeof candidate.code === 'string' ? candidate.code : 'runtime_driver_failed',
        message:
          typeof candidate.message === 'string'
            ? candidate.message
            : 'The Codex runtime failed without a message.',
        recoverable: typeof candidate.recoverable === 'boolean' ? candidate.recoverable : true,
      };
    }
    return {
      code: 'runtime_driver_failed',
      message: String(error),
      recoverable: true,
    };
  }

  #createTurnScheduler(): CodexTurnScheduler<AgentTurnInput, ScriptedFixtureTurn> | undefined {
    return this.#missionDriver.kind !== 'scripted'
      ? new CodexTurnScheduler({
          driver: this.#missionDriver,
          maxConcurrency: this.#maxConcurrentTurns,
          defaultTimeoutMs: this.#defaultTurnTimeoutMs,
        })
      : undefined;
  }

  #completeReadyMeetings(occurredAt: string): WorldEvent[] {
    const appended: WorldEvent[] = [];
    const meetings = [...this.#meetingsById.values()].sort((left, right) =>
      left.meetingId.localeCompare(right.meetingId),
    );
    for (const meeting of meetings) {
      const ready = meeting.participantAgentIds.every((agentId) => {
        const agent = this.#projection.agentsById[agentId];
        const missionId = meeting.missionIdsByAgentId[agentId];
        const mission = missionId ? this.#projection.missionsById[missionId] : undefined;
        return (
          agent?.placeId === meeting.placeId &&
          !agent.movement &&
          (!missionId || mission?.status === 'completed')
        );
      });
      if (!ready) continue;
      appended.push(...this.#completeMeeting(meeting, occurredAt));
      this.#meetingsById.delete(meeting.meetingId);
      for (const missionId of Object.values(meeting.missionIdsByAgentId)) {
        this.#meetingIdByMissionId.delete(missionId);
      }
    }
    return appended;
  }

  #completeMeeting(meeting: ScheduledMeeting, occurredAt: string): WorldEvent[] {
    const appended: WorldEvent[] = [];
    const emit = (label: string, type: WorldEvent['type'], payload: unknown) => {
      const event = this.#appendSystemEvent(
        `evt-${meeting.meetingId}-${label}`,
        type,
        payload,
        occurredAt,
        meeting.meetingId,
      );
      appended.push(event);
    };
    const beforeSignalsByAgentId = Object.fromEntries(
      meeting.participantAgentIds.map((agentId) => [
        agentId,
        [...(this.#projection.agentsById[agentId]?.knownSignalIds ?? [])].sort(),
      ]),
    ) as Record<string, string[]>;
    const availableSignalIds = [
      ...new Set(meeting.participantAgentIds.flatMap((id) => beforeSignalsByAgentId[id] ?? [])),
    ].sort();
    const disagreementTypes: Array<'evidence' | 'model' | 'prior'> = [];
    const knowledgeSignatures = new Set(
      meeting.participantAgentIds.map((id) => (beforeSignalsByAgentId[id] ?? []).join('|')),
    );
    if (knowledgeSignatures.size > 1) disagreementTypes.push('evidence');
    if (availableSignalIds.length > 1) disagreementTypes.push('model');
    const yesProbabilities = meeting.participantAgentIds.flatMap((id) => {
      const probability = this.#projection.agentsById[id]?.belief.probabilities['yes'];
      return probability === undefined ? [] : [probability];
    });
    if (
      yesProbabilities.length > 1 &&
      Math.max(...yesProbabilities) - Math.min(...yesProbabilities) >= 0.01
    ) {
      disagreementTypes.push('prior');
    }

    emit('started', 'meeting.started', {
      meeting: {
        id: meeting.meetingId,
        expeditionId: this.expeditionId,
        placeId: meeting.placeId,
        participantAgentIds: meeting.participantAgentIds,
        startedAt: occurredAt,
        sharedSignalIds: [],
        disagreementTypes,
      },
    });

    for (const signalId of availableSignalIds) {
      const fromAgentId = meeting.participantAgentIds.find((id) =>
        beforeSignalsByAgentId[id]?.includes(signalId),
      );
      const toAgentIds = meeting.participantAgentIds.filter(
        (id) => !beforeSignalsByAgentId[id]?.includes(signalId),
      );
      if (!fromAgentId || toAgentIds.length === 0) continue;
      emit(`share-${signalId}`, 'meeting.signal_shared', {
        meetingId: meeting.meetingId,
        signalId,
        fromAgentId,
        toAgentIds,
      });
      for (const agentId of toAgentIds) {
        emit(`knowledge-${agentId}-${signalId}`, 'agent.knowledge.acquired', {
          knowledge: {
            agentId,
            objectType: 'signal',
            objectId: signalId,
            acquiredAt: occurredAt,
            acquisition: {
              kind: 'shared',
              fromAgentId,
              meetingId: meeting.meetingId,
            },
          },
        });
      }
    }

    for (const agentId of meeting.participantAgentIds) {
      const learnedSignalIds = availableSignalIds.filter(
        (signalId) => !beforeSignalsByAgentId[agentId]?.includes(signalId),
      );
      if (learnedSignalIds.length === 0) continue;
      emit(`belief-${agentId}`, 'belief.updated', {
        update: this.#meetingBeliefUpdate(agentId, learnedSignalIds, occurredAt, meeting.meetingId),
      });
    }

    const participantNames = meeting.participantAgentIds.map(
      (id) => this.#projection.agentsById[id]?.displayName ?? id,
    );
    const priorRange =
      yesProbabilities.length > 0
        ? `${Math.round(Math.min(...yesProbabilities) * 100)}–${Math.round(
            Math.max(...yesProbabilities) * 100,
          )}% YES`
        : 'unrecorded';
    const negativeSignals = availableSignalIds.filter(
      (id) => this.#projection.signalsById[id]?.direction === 'opposes_outcome',
    );
    const agreements = [
      `All ${participantNames.length} participants now hold ${availableSignalIds.length} shared signal${availableSignalIds.length === 1 ? '' : 's'}.`,
      ...(negativeSignals.length > 1
        ? [
            'Current conditions and the historical base rate both press against YES without proving NO.',
          ]
        : ['Evidence direction remains provisional and should not be treated as certainty.']),
    ];
    const disagreements = [
      ...(disagreementTypes.includes('evidence')
        ? ['Evidence: participants entered with different signal sets and source vantage points.']
        : []),
      ...(disagreementTypes.includes('model')
        ? [
            'Model: fresh conditions and historical cases may overlap; their independence is not yet established.',
          ]
        : []),
      ...(disagreementTypes.includes('prior')
        ? [`Prior: participant estimates spanned ${priorRange} before the exchange.`]
        : []),
    ];
    emit('memo', 'meeting.memo_created', {
      meetingId: meeting.meetingId,
      memo: {
        summary: `${participantNames.join(', ')} exchanged ${availableSignalIds.length} signal${availableSignalIds.length === 1 ? '' : 's'} at Lantern Square and preserved the unresolved independence question.`,
        agreements,
        disagreements,
        followUpMissionProposals: [
          {
            agentId: meeting.participantAgentIds.includes('kestrel')
              ? 'kestrel'
              : meeting.participantAgentIds[0],
            verb: 'consult_professor',
            objective:
              'Ask Professor Vale whether the shared weather and historical signals are independent.',
            destinationPlaceId: 'professor',
          },
        ],
      },
    });
    emit('ended', 'meeting.ended', { meetingId: meeting.meetingId, endedAt: occurredAt });
    return appended;
  }

  #meetingBeliefUpdate(
    agentId: string,
    signalIds: readonly string[],
    occurredAt: string,
    meetingId: string,
  ) {
    const agent = this.#projection.agentsById[agentId];
    if (!agent) throw new Error(`Cannot update belief for missing agent ${agentId}.`);
    const previousProbabilities = structuredClone(agent.belief.probabilities);
    const newProbabilities = { ...previousProbabilities };
    for (const signalId of signalIds) {
      const signal = this.#projection.signalsById[signalId];
      const targetOutcomeId = signal?.targetOutcomeId;
      const range = signal?.impact.probabilityPointRange;
      if (!targetOutcomeId || !range || newProbabilities[targetOutcomeId] === undefined) continue;
      const previousTarget = newProbabilities[targetOutcomeId];
      const target = Math.min(0.99, Math.max(0.01, previousTarget + (range.low + range.high) / 2));
      const previousRemainder = 1 - previousTarget;
      const nextRemainder = 1 - target;
      newProbabilities[targetOutcomeId] = target;
      const otherOutcomeIds = Object.keys(newProbabilities).filter((id) => id !== targetOutcomeId);
      for (const outcomeId of otherOutcomeIds) {
        const weight =
          previousRemainder > 0
            ? (newProbabilities[outcomeId] ?? 0) / previousRemainder
            : 1 / otherOutcomeIds.length;
        newProbabilities[outcomeId] = nextRemainder * weight;
      }
    }
    return {
      id: `belief-${meetingId}-${agentId}`,
      expeditionId: this.expeditionId,
      actor: { kind: 'agent' as const, id: agentId },
      previousProbabilities,
      newProbabilities,
      rationale: `Reassessed after learning ${signalIds
        .map((id) => this.#projection.signalsById[id]?.headline ?? id)
        .join('; ')} at Lantern Square.`,
      evidenceSignalIds: [...signalIds],
      assumptions: ['Shared signals remain directional evidence; independence is unreviewed.'],
      createdAt: occurredAt,
    };
  }

  #appendSystemEvent(
    id: string,
    type: WorldEvent['type'],
    payload: unknown,
    occurredAt: string,
    correlationId: string,
  ): WorldEvent {
    const event = parseWorldEvent({
      id,
      expeditionId: this.expeditionId,
      sequence: this.#projection.sequence + 1,
      type,
      occurredAt,
      recordedAt: occurredAt,
      actor: { kind: 'system' },
      causationId: correlationId,
      correlationId,
      schemaVersion: SCHEMA_VERSION,
      payload,
    });
    this.#projection = reduceWorldEvent(this.#projection, event);
    this.#events = [...this.#events, event];
    return event;
  }

  #travelStartedPayload(agentId: string, missionId: string, leg: RouteLeg, startedAt: string) {
    const speed = this.#projection.expedition.simulationSpeed || 1;
    return {
      agentId,
      missionId,
      routeId: leg.routeId,
      fromPlaceId: leg.fromPlaceId,
      toPlaceId: leg.toPlaceId,
      startedAt,
      endsAt: addMilliseconds(startedAt, Math.ceil(leg.durationMs / speed)),
      durationMs: leg.durationMs,
    };
  }

  #eventPlanForCommand(command: WorldCommand): CommandEventPlan | undefined {
    const base = {
      expeditionId: command.expeditionId,
      occurredAt: command.issuedAt,
      recordedAt: command.issuedAt,
      actor: actorForEvent(command.actor),
      causationId: command.id,
      correlationId: command.id,
      schemaVersion: SCHEMA_VERSION,
    };
    const event = (offset: number, type: WorldEvent['type'], payload: unknown): WorldEvent =>
      parseWorldEvent({
        ...base,
        id: `evt-${command.id}-${offset}`,
        sequence: this.#projection.sequence + offset,
        type,
        payload,
      });

    switch (command.type) {
      case 'expedition.start':
        return { events: [event(1, 'expedition.started', { startedAt: command.issuedAt })] };
      case 'expedition.pause':
        return { events: [event(1, 'expedition.paused', command.payload)] };
      case 'expedition.change_speed':
        return {
          events: [
            event(1, 'expedition.speed_changed', {
              previousSpeed: this.#projection.expedition.simulationSpeed,
              newSpeed: command.payload.speed,
            }),
          ],
        };
      case 'agent.assign_mission': {
        const mission = command.payload.mission;
        const agent = this.#projection.agentsById[mission.assignedAgentId];
        const events = [
          event(1, 'agent.mission.queued', { mission }),
          event(2, 'agent.mission.assigned', {
            missionId: mission.id,
            agentId: mission.assignedAgentId,
          }),
        ];
        if (
          !agent ||
          agent.activeMissionId ||
          agent.movement ||
          agent.queuedMissionIds.length > 0
        ) {
          return { events };
        }
        if (!mission.destinationPlaceId || mission.destinationPlaceId === agent.placeId) {
          events.push(
            event(3, 'agent.work.started', {
              agentId: mission.assignedAgentId,
              missionId: mission.id,
            }),
          );
          return {
            events,
            scheduleWork: this.#createScheduledWork(
              mission,
              mission.destinationPlaceId ?? agent.placeId,
            ),
          };
        }
        const routePlan = selectRoutePlan(
          this.#projection.worldManifest,
          agent.placeId,
          mission.destinationPlaceId,
        );
        const firstLeg = routePlan?.legs[0];
        if (!routePlan || !firstLeg) return undefined;
        events.push(
          event(
            3,
            'agent.travel.started',
            this.#travelStartedPayload(agent.id, mission.id, firstLeg, command.issuedAt),
          ),
        );
        return {
          events,
          scheduleTravel: {
            agentId: agent.id,
            missionId: mission.id,
            plan: routePlan,
            legIndex: 0,
            elapsedMs: 0,
            emittedProgressStep: 0,
          },
        };
      }
      case 'agent.cancel_mission': {
        const mission = this.#projection.missionsById[command.payload.missionId];
        const agent = mission ? this.#projection.agentsById[mission.assignedAgentId] : undefined;
        return {
          events: [event(1, 'agent.mission.canceled', command.payload)],
          ...(mission && agent?.activeMissionId === mission.id
            ? { clearScheduledForAgentId: mission.assignedAgentId }
            : {}),
        };
      }
      case 'agent.reorder_missions':
        return { events: [event(1, 'agent.mission.reordered', command.payload)] };
      case 'agent.skip_travel': {
        const task = this.#travelByAgentId.get(command.payload.agentId);
        if (!task || task.missionId !== command.payload.missionId) return undefined;
        const events: WorldEvent[] = [];
        let offset = 1;
        for (let index = task.legIndex; index < task.plan.legs.length; index += 1) {
          const leg = task.plan.legs[index];
          if (!leg) continue;
          if (index > task.legIndex) {
            events.push(
              event(
                offset++,
                'agent.travel.started',
                this.#travelStartedPayload(task.agentId, task.missionId, leg, command.issuedAt),
              ),
            );
          }
          events.push(
            event(offset++, 'agent.travel.progressed', {
              agentId: task.agentId,
              routeId: leg.routeId,
              progress: 1,
            }),
          );
          events.push(
            event(offset++, 'agent.arrived', {
              agentId: task.agentId,
              missionId: task.missionId,
              placeId: leg.toPlaceId,
            }),
          );
        }
        const meetingId = this.#meetingIdByMissionId.get(task.missionId);
        if (meetingId) {
          events.push(
            event(offset, 'agent.mission.completed', {
              missionId: task.missionId,
              completedAt: command.issuedAt,
            }),
          );
          return {
            events,
            clearScheduledForAgentId: task.agentId,
          };
        }
        events.push(
          event(offset, 'agent.work.started', {
            agentId: task.agentId,
            missionId: task.missionId,
          }),
        );
        const mission = this.#projection.missionsById[task.missionId];
        if (!mission) return undefined;
        return {
          events,
          clearScheduledForAgentId: task.agentId,
          scheduleWork: this.#createScheduledWork(
            mission,
            mission.destinationPlaceId ?? this.#projection.agentsById[task.agentId]?.placeId ?? '',
          ),
        };
      }
      case 'meeting.request': {
        const events: WorldEvent[] = [
          event(1, 'meeting.requested', {
            meetingId: command.payload.meetingId,
            placeId: command.payload.placeId,
            participantAgentIds: command.payload.participantAgentIds,
          }),
        ];
        const scheduleTravels: ScheduledTravel[] = [];
        const missionIdsByAgentId: Record<string, string> = {};
        let offset = 2;
        for (const agentId of command.payload.participantAgentIds) {
          const agent = this.#projection.agentsById[agentId];
          if (!agent || agent.placeId === command.payload.placeId) continue;
          const routePlan = selectRoutePlan(
            this.#projection.worldManifest,
            agent.placeId,
            command.payload.placeId,
          );
          const firstLeg = routePlan?.legs[0];
          if (!routePlan || !firstLeg) return undefined;
          const missionId = `meeting-mission-${command.payload.meetingId}-${agentId}`;
          const mission = {
            id: missionId,
            expeditionId: this.expeditionId,
            assignedAgentId: agentId,
            verb: 'meet_agent' as const,
            objective: 'Join the team evidence exchange at Lantern Square.',
            destinationPlaceId: command.payload.placeId,
            targetAgentIds: command.payload.participantAgentIds.filter((id) => id !== agentId),
            budget: { maxToolCalls: 0, timeoutMs: 30_000 },
            status: 'draft' as const,
            createdBy: command.actor,
            createdAt: command.issuedAt,
          };
          events.push(
            event(offset++, 'agent.mission.queued', { mission }),
            event(offset++, 'agent.mission.assigned', { missionId, agentId }),
            event(
              offset++,
              'agent.travel.started',
              this.#travelStartedPayload(agentId, missionId, firstLeg, command.issuedAt),
            ),
          );
          missionIdsByAgentId[agentId] = missionId;
          scheduleTravels.push({
            agentId,
            missionId,
            plan: routePlan,
            legIndex: 0,
            elapsedMs: 0,
            emittedProgressStep: 0,
          });
        }
        return {
          events,
          scheduleTravels,
          scheduleMeeting: {
            meetingId: command.payload.meetingId,
            placeId: command.payload.placeId,
            participantAgentIds: [...command.payload.participantAgentIds],
            missionIdsByAgentId,
          },
        };
      }
      case 'professor.query': {
        const query = command.payload.query;
        const response = createScriptedProfessorResponse(this.#fixture, this.#projection, query);
        const events: WorldEvent[] = [event(1, 'professor.query.started', { query })];
        const selectedSignalIds = [...new Set(query.selectedSignalIds)].sort();
        const hasEnoughEvidence =
          query.mode === 'correlation_check' &&
          selectedSignalIds.length >= 2 &&
          !response.answer.startsWith('Insufficient evidence:');
        const alreadyAssessed = Object.values(this.#projection.correlationsById).some(
          (correlation) =>
            [...correlation.signalIds].sort().join('|') === selectedSignalIds.join('|'),
        );
        if (hasEnoughEvidence && !alreadyAssessed) {
          events.push(
            event(events.length + 1, 'correlation.detected', {
              correlation: {
                id: `correlation-${query.id}`,
                signalIds: selectedSignalIds,
                relationship: 'possibly_correlated',
                reasons: [
                  'The selected records describe different evidence layers but may share a crosswind-delay mechanism.',
                  'Distinct sources and signal IDs do not establish statistical independence.',
                ],
                assessedAt: command.issuedAt,
              },
            }),
          );
        }
        events.push(event(events.length + 1, 'professor.response.created', { response }));
        return { events };
      }
      case 'forecast.commit': {
        const commit = command.payload.commit;
        return {
          events: [
            event(1, 'forecast.committed', {
              commitId: commit.id,
              actor: commit.actor,
              previousProbabilities: commit.previousProbabilities,
              newProbabilities: commit.newProbabilities,
              ...(commit.uncertainty ? { uncertainty: commit.uncertainty } : {}),
              rationale: commit.rationale,
              evidenceSignalIds: commit.evidenceSignalIds,
              assumptions: commit.assumptions,
              commitType: commit.commitType,
              publicNote: commit.publicNote,
              ...(commit.privateMemo ? { privateMemo: commit.privateMemo } : {}),
              scoringEligible: commit.scoringEligible,
            }),
          ],
        };
      }
      case 'runtime.retry_turn': {
        const failedTurn = this.#projection.agentTurnsById[command.payload.failedTurnId];
        const mission = this.#projection.missionsById[command.payload.missionId];
        const agent = this.#projection.agentsById[command.payload.agentId];
        if (
          !failedTurn ||
          failedTurn.status !== 'failed' ||
          !failedTurn.recoverable ||
          failedTurn.agentId !== command.payload.agentId ||
          failedTurn.missionId !== command.payload.missionId ||
          !mission ||
          mission.status !== 'failed' ||
          !agent
        ) {
          return undefined;
        }
        return {
          events: [
            event(1, 'agent.work.started', {
              agentId: command.payload.agentId,
              missionId: command.payload.missionId,
            }),
          ],
          scheduleWork: this.#createScheduledWork(
            mission,
            mission.destinationPlaceId ?? agent.placeId,
          ),
        };
      }
    }
  }
}
