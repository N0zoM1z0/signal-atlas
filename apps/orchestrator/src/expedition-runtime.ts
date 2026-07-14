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
  type CommandIdempotencyLedger,
  type CommandValidationIssue,
  type RouteLeg,
  type RoutePlan,
  type WorldProjection,
} from '@signal-atlas/simulation';

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

interface CommandEventPlan {
  events: WorldEvent[];
  schedule?: ScheduledTravel;
  clearTravelForAgentId?: string;
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
    if (plan.clearTravelForAgentId) this.#travelByAgentId.delete(plan.clearTravelForAgentId);
    if (plan.schedule) this.#travelByAgentId.set(plan.schedule.agentId, plan.schedule);
    const result: AcceptedCommandResult = {
      accepted: true,
      duplicate: false,
      commandId: command.id,
      events: structuredClone(plan.events),
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
          appended.push(
            this.#appendSystemEvent(
              `evt-work-${task.missionId}-started`,
              'agent.work.started',
              { agentId: task.agentId, missionId: task.missionId },
              occurredAt,
              task.missionId,
            ),
          );
          this.#travelByAgentId.delete(task.agentId);
        }
      }
    }

    return structuredClone(appended);
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
          return { events };
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
          schedule: {
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
        return {
          events: [event(1, 'agent.mission.canceled', command.payload)],
          ...(mission ? { clearTravelForAgentId: mission.assignedAgentId } : {}),
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
        events.push(
          event(offset, 'agent.work.started', {
            agentId: task.agentId,
            missionId: task.missionId,
          }),
        );
        return { events, clearTravelForAgentId: task.agentId };
      }
      case 'meeting.request':
      case 'professor.query':
      case 'forecast.commit':
      case 'runtime.retry_turn':
        return undefined;
    }
  }
}
