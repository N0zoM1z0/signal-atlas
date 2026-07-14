import {
  parseWorldEvent,
  SCHEMA_VERSION,
  type ExpeditionFixture,
  type WorldCommand,
  type WorldEvent,
} from '@signal-atlas/contracts';
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
  createScriptedFixtureTurn,
  type FixtureMissionScenario,
  type ScriptedFixtureTurn,
} from './fixture-mission-driver.js';

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
  remainingMs: number;
  turn: ScriptedFixtureTurn;
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
  #projection: WorldProjection;
  #events: WorldEvent[];
  #ledger: CommandIdempotencyLedger = {};
  readonly #acceptedByKey = new Map<string, AcceptedCommandResult>();
  readonly #travelByAgentId = new Map<string, ScheduledTravel>();
  readonly #workByAgentId = new Map<string, ScheduledWork>();
  readonly #attemptByMissionId = new Map<string, number>();
  readonly #meetingsById = new Map<string, ScheduledMeeting>();
  readonly #meetingIdByMissionId = new Map<string, string>();
  #missionScenario: FixtureMissionScenario = 'success';

  constructor(fixture: ExpeditionFixture) {
    this.#fixture = structuredClone(fixture);
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

  resetToFixture(): void {
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
    this.#missionScenario = 'success';
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
    const turn = createScriptedFixtureTurn(this.#fixture, {
      mission,
      effectivePlaceId,
      attempt,
      scenario: this.#missionScenario,
    });
    return {
      agentId: mission.assignedAgentId,
      missionId: mission.id,
      remainingMs: turn.latencyMs,
      turn,
    };
  }

  #completeScheduledWork(task: ScheduledWork, occurredAt: string): WorldEvent[] {
    const { turn } = task;
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
        emit(`source-${source.id}`, 'source.recorded', { source });
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
      if (!this.#projection.signalsById[signal.id]) {
        emit(`signal-${signal.id}`, 'signal.created', { signal });
      }
    }

    const shouldUpdateBelief = turn.signals.some(
      (signal) => !this.#projection.knowledgeByKey[knowledgeKey(task.agentId, 'signal', signal.id)],
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
    });
    emit('mission-completed', 'agent.mission.completed', {
      missionId: task.missionId,
      completedAt: occurredAt,
    });
    return appended;
  }

  #beliefUpdate(task: ScheduledWork, occurredAt: string) {
    const agent = this.#projection.agentsById[task.agentId];
    if (!agent) throw new Error(`Cannot update belief for missing agent ${task.agentId}.`);
    const previousProbabilities = structuredClone(agent.belief.probabilities);
    const newProbabilities = { ...previousProbabilities };

    for (const signal of task.turn.signals) {
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
      rationale: `Updated from ${task.turn.signals.map((signal) => signal.headline).join('; ')}.`,
      evidenceSignalIds: task.turn.signals.map((signal) => signal.id),
      assumptions: ['Fixture impact ranges are directional evidence, not certainty.'],
      createdAt: occurredAt,
    };
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
      case 'professor.query':
      case 'forecast.commit':
        return undefined;
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
