import { WorldCommandSchema, hasExactlyKeys, type WorldCommand } from '@signal-atlas/contracts';

import { canonicalHash } from './hash.js';
import type { WorldProjection } from './state.js';

export type CommandValidationCode =
  | 'invalid_schema'
  | 'wrong_expedition'
  | 'idempotency_conflict'
  | 'invalid_state'
  | 'missing_reference'
  | 'invalid_reference';

export interface CommandValidationIssue {
  code: CommandValidationCode;
  path: Array<string | number>;
  message: string;
}

export type CommandValidationResult =
  | {
      accepted: true;
      duplicate: boolean;
      command: WorldCommand;
    }
  | {
      accepted: false;
      issues: CommandValidationIssue[];
    };

export interface CommandIdempotencyRecord {
  commandId: string;
  commandHash: string;
}

export type CommandIdempotencyLedger = Readonly<Record<string, CommandIdempotencyRecord>>;

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function unknownCommand(command: never): never {
  throw new Error(`Unhandled command type: ${(command as { type: string }).type}.`);
}

export function validateWorldCommand(
  input: unknown,
  state: WorldProjection,
  ledger: CommandIdempotencyLedger = {},
): CommandValidationResult {
  const parsed = WorldCommandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      accepted: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'invalid_schema',
        path: issue.path.map((segment) =>
          typeof segment === 'symbol' ? (segment.description ?? segment.toString()) : segment,
        ),
        message: issue.message,
      })),
    };
  }

  const command = parsed.data;
  const issues: CommandValidationIssue[] = [];
  const addIssue = (code: CommandValidationCode, path: Array<string | number>, message: string) =>
    issues.push({ code, path, message });

  if (command.expeditionId !== state.expedition.id) {
    addIssue(
      'wrong_expedition',
      ['expeditionId'],
      `Command targets expedition ${command.expeditionId}; projection expects ${state.expedition.id}.`,
    );
  }

  const existingCommand = ledger[command.idempotencyKey];
  if (existingCommand) {
    if (
      existingCommand.commandId === command.id &&
      existingCommand.commandHash === canonicalHash(command) &&
      issues.length === 0
    ) {
      return { accepted: true, duplicate: true, command };
    }
    addIssue(
      'idempotency_conflict',
      ['idempotencyKey'],
      `Idempotency key is already bound to command ${existingCommand.commandId} with different content.`,
    );
  }

  if (command.actor.kind === 'agent') {
    if (!command.actor.id) {
      addIssue('invalid_reference', ['actor', 'id'], 'Agent commands require an actor ID.');
    } else if (!state.agentsById[command.actor.id]) {
      addIssue(
        'missing_reference',
        ['actor', 'id'],
        `Actor agent ${command.actor.id} does not exist.`,
      );
    }
  }

  const requireAgent = (id: string, path: Array<string | number>) => {
    if (!state.agentsById[id]) {
      addIssue('missing_reference', path, `Agent ${id} does not exist.`);
    }
  };
  const requirePlace = (id: string, path: Array<string | number>) => {
    if (!state.worldManifest.places.some((place) => place.id === id)) {
      addIssue('missing_reference', path, `Place ${id} does not exist.`);
    }
  };
  const requireMission = (id: string, path: Array<string | number>) => {
    if (!state.missionsById[id]) {
      addIssue('missing_reference', path, `Mission ${id} does not exist.`);
    }
  };

  switch (command.type) {
    case 'expedition.start':
      if (!['setup', 'paused'].includes(state.expedition.status)) {
        addIssue(
          'invalid_state',
          ['type'],
          `Cannot start an expedition in ${state.expedition.status} state.`,
        );
      }
      break;
    case 'expedition.pause':
      if (state.expedition.status !== 'active') {
        addIssue(
          'invalid_state',
          ['type'],
          `Cannot pause an expedition in ${state.expedition.status} state.`,
        );
      }
      break;
    case 'expedition.change_speed':
      if (['resolved', 'archived'].includes(state.expedition.status)) {
        addIssue(
          'invalid_state',
          ['type'],
          `Cannot change speed in ${state.expedition.status} state.`,
        );
      }
      break;
    case 'agent.assign_mission': {
      const mission = command.payload.mission;
      if (state.missionsById[mission.id]) {
        addIssue(
          'invalid_reference',
          ['payload', 'mission', 'id'],
          `Mission ${mission.id} exists.`,
        );
      }
      if (mission.expeditionId !== state.expedition.id) {
        addIssue(
          'wrong_expedition',
          ['payload', 'mission', 'expeditionId'],
          `Mission belongs to expedition ${mission.expeditionId}.`,
        );
      }
      requireAgent(mission.assignedAgentId, ['payload', 'mission', 'assignedAgentId']);
      mission.targetAgentIds?.forEach((id, index) =>
        requireAgent(id, ['payload', 'mission', 'targetAgentIds', index]),
      );
      mission.sourceIds?.forEach((id, index) => {
        if (!state.sourcesById[id]) {
          addIssue(
            'missing_reference',
            ['payload', 'mission', 'sourceIds', index],
            `Source ${id} does not exist.`,
          );
        }
      });
      mission.signalIds?.forEach((id, index) => {
        if (!state.signalsById[id]) {
          addIssue(
            'missing_reference',
            ['payload', 'mission', 'signalIds', index],
            `Signal ${id} does not exist.`,
          );
        }
      });
      if (mission.destinationPlaceId) {
        requirePlace(mission.destinationPlaceId, ['payload', 'mission', 'destinationPlaceId']);
        const place = state.worldManifest.places.find(
          (candidate) => candidate.id === mission.destinationPlaceId,
        );
        if (place && !place.missionVerbs.includes(mission.verb)) {
          addIssue(
            'invalid_reference',
            ['payload', 'mission', 'verb'],
            `${place.name} does not support the ${mission.verb} mission verb.`,
          );
        }
      }
      break;
    }
    case 'agent.cancel_mission': {
      requireMission(command.payload.missionId, ['payload', 'missionId']);
      const mission = state.missionsById[command.payload.missionId];
      if (mission && ['completed', 'failed', 'canceled'].includes(mission.status)) {
        addIssue(
          'invalid_state',
          ['payload', 'missionId'],
          `Mission ${mission.id} is already ${mission.status}.`,
        );
      }
      break;
    }
    case 'agent.reorder_missions': {
      requireAgent(command.payload.agentId, ['payload', 'agentId']);
      const agent = state.agentsById[command.payload.agentId];
      if (agent && !sameMembers(agent.queuedMissionIds, command.payload.orderedMissionIds)) {
        addIssue(
          'invalid_reference',
          ['payload', 'orderedMissionIds'],
          'Reorder payload must contain exactly the current queued mission IDs.',
        );
      }
      break;
    }
    case 'agent.skip_travel': {
      requireAgent(command.payload.agentId, ['payload', 'agentId']);
      requireMission(command.payload.missionId, ['payload', 'missionId']);
      const agent = state.agentsById[command.payload.agentId];
      if (agent && (!agent.movement || agent.activeMissionId !== command.payload.missionId)) {
        addIssue(
          'invalid_state',
          ['payload', 'missionId'],
          `Agent ${agent.id} is not traveling for mission ${command.payload.missionId}.`,
        );
      }
      break;
    }
    case 'meeting.request':
      requirePlace(command.payload.placeId, ['payload', 'placeId']);
      command.payload.participantAgentIds.forEach((id, index) =>
        requireAgent(id, ['payload', 'participantAgentIds', index]),
      );
      if (
        new Set(command.payload.participantAgentIds).size !==
        command.payload.participantAgentIds.length
      ) {
        addIssue(
          'invalid_reference',
          ['payload', 'participantAgentIds'],
          'Meeting participants must be unique.',
        );
      }
      break;
    case 'professor.query': {
      const query = command.payload.query;
      if (query.expeditionId !== state.expedition.id) {
        addIssue(
          'wrong_expedition',
          ['payload', 'query', 'expeditionId'],
          `Professor query belongs to expedition ${query.expeditionId}.`,
        );
      }
      query.selectedSourceIds.forEach((id, index) => {
        if (!state.sourcesById[id]) {
          addIssue(
            'missing_reference',
            ['payload', 'query', 'selectedSourceIds', index],
            `Source ${id} does not exist.`,
          );
        }
      });
      query.selectedSignalIds.forEach((id, index) => {
        if (!state.signalsById[id]) {
          addIssue(
            'missing_reference',
            ['payload', 'query', 'selectedSignalIds', index],
            `Signal ${id} does not exist.`,
          );
        }
      });
      break;
    }
    case 'forecast.commit': {
      const commit = command.payload.commit;
      if (commit.expeditionId !== state.expedition.id) {
        addIssue(
          'wrong_expedition',
          ['payload', 'commit', 'expeditionId'],
          `Forecast commit belongs to expedition ${commit.expeditionId}.`,
        );
      }
      const outcomeIds = state.market.outcomes.map((outcome) => outcome.id);
      if (
        !hasExactlyKeys(commit.previousProbabilities, outcomeIds) ||
        !hasExactlyKeys(commit.newProbabilities, outcomeIds)
      ) {
        addIssue(
          'invalid_reference',
          ['payload', 'commit', 'newProbabilities'],
          'Forecast probability keys must exactly match market outcome IDs.',
        );
      }
      commit.evidenceSignalIds.forEach((id, index) => {
        if (!state.signalsById[id]) {
          addIssue(
            'missing_reference',
            ['payload', 'commit', 'evidenceSignalIds', index],
            `Signal ${id} does not exist.`,
          );
        }
      });
      if (commit.actor.kind === 'agent') {
        if (!commit.actor.id) {
          addIssue(
            'invalid_reference',
            ['payload', 'commit', 'actor', 'id'],
            'Agent forecast commits require an actor ID.',
          );
        } else {
          requireAgent(commit.actor.id, ['payload', 'commit', 'actor', 'id']);
        }
      }
      break;
    }
    case 'runtime.retry_turn': {
      requireAgent(command.payload.agentId, ['payload', 'agentId']);
      requireMission(command.payload.missionId, ['payload', 'missionId']);
      const turn = state.agentTurnsById[command.payload.failedTurnId];
      const mission = state.missionsById[command.payload.missionId];
      if (!turn) {
        addIssue(
          'missing_reference',
          ['payload', 'failedTurnId'],
          `Failed turn ${command.payload.failedTurnId} does not exist.`,
        );
      } else if (
        turn.status !== 'failed' ||
        !turn.recoverable ||
        turn.agentId !== command.payload.agentId ||
        turn.missionId !== command.payload.missionId
      ) {
        addIssue(
          'invalid_state',
          ['payload', 'failedTurnId'],
          `Turn ${turn.turnId} is not a recoverable failure for the selected agent and mission.`,
        );
      }
      if (mission && mission.status !== 'failed') {
        addIssue(
          'invalid_state',
          ['payload', 'missionId'],
          `Mission ${mission.id} must be failed before its turn can be retried.`,
        );
      }
      break;
    }
    default:
      unknownCommand(command);
  }

  return issues.length > 0
    ? { accepted: false, issues }
    : { accepted: true, duplicate: false, command };
}

export function recordAcceptedCommand(
  ledger: CommandIdempotencyLedger,
  command: WorldCommand,
): CommandIdempotencyLedger {
  return {
    ...ledger,
    [command.idempotencyKey]: {
      commandId: command.id,
      commandHash: canonicalHash(command),
    },
  };
}
