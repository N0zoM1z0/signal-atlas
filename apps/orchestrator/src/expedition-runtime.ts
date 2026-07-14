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
  validateWorldCommand,
  type CommandIdempotencyLedger,
  type CommandValidationIssue,
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

export class ExpeditionRuntime {
  readonly #fixture: ExpeditionFixture;
  #projection: WorldProjection;
  #events: WorldEvent[];
  #ledger: CommandIdempotencyLedger = {};
  readonly #acceptedByKey = new Map<string, AcceptedCommandResult>();

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

    const newEvents = this.#eventsForCommand(command);
    if (!newEvents) {
      return { accepted: false, issues: [unsupportedCommandIssue(command.type)] };
    }

    let nextProjection = this.#projection;
    for (const event of newEvents) nextProjection = reduceWorldEvent(nextProjection, event);

    this.#projection = nextProjection;
    this.#events = [...this.#events, ...newEvents];
    this.#ledger = recordAcceptedCommand(this.#ledger, command);
    const result: AcceptedCommandResult = {
      accepted: true,
      duplicate: false,
      commandId: command.id,
      events: structuredClone(newEvents),
      sequence: this.#projection.sequence,
    };
    this.#acceptedByKey.set(command.idempotencyKey, result);
    return structuredClone(result);
  }

  #eventsForCommand(command: WorldCommand): WorldEvent[] | undefined {
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
        return [event(1, 'expedition.started', { startedAt: command.issuedAt })];
      case 'expedition.pause':
        return [event(1, 'expedition.paused', command.payload)];
      case 'expedition.change_speed':
        return [
          event(1, 'expedition.speed_changed', {
            previousSpeed: this.#projection.expedition.simulationSpeed,
            newSpeed: command.payload.speed,
          }),
        ];
      case 'agent.assign_mission':
        return [
          event(1, 'agent.mission.queued', { mission: command.payload.mission }),
          event(2, 'agent.mission.assigned', {
            missionId: command.payload.mission.id,
            agentId: command.payload.mission.assignedAgentId,
          }),
        ];
      case 'agent.cancel_mission':
        return [event(1, 'agent.mission.canceled', command.payload)];
      case 'agent.reorder_missions':
        return [event(1, 'agent.mission.reordered', command.payload)];
      case 'meeting.request':
      case 'professor.query':
      case 'forecast.commit':
      case 'runtime.retry_turn':
        return undefined;
    }
  }
}
