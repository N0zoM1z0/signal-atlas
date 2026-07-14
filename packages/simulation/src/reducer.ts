import {
  SCHEMA_VERSION,
  hasExactlyKeys,
  type Agent,
  type Mission,
  type Signal,
  type WorldEvent,
} from '@signal-atlas/contracts';

import {
  IllegalTransitionError,
  NonContiguousSequenceError,
  UnsupportedEventTypeError,
  UnsupportedEventVersionError,
  WrongExpeditionError,
} from './errors.js';
import {
  knowledgeKey,
  type AgentTurnProjection,
  type ForecastProjection,
  type PrefCallProjection,
  type SignalShareProjection,
  type WorldProjection,
} from './state.js';

function requireEntity<T>(record: Record<string, T>, id: string, label: string): T {
  const entity = record[id];
  if (!entity) {
    throw new IllegalTransitionError(`${label} ${id} does not exist in the projection.`);
  }
  return entity;
}

function ensureNewEntity<T>(record: Record<string, T>, id: string, label: string): void {
  if (record[id]) {
    throw new IllegalTransitionError(`${label} ${id} already exists in the projection.`);
  }
}

function appendUnique(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function sameProbabilities(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  return (
    hasExactlyKeys(left, Object.keys(right)) &&
    Object.entries(left).every(([outcomeId, probability]) => right[outcomeId] === probability)
  );
}

function requirePlace(state: WorldProjection, placeId: string): void {
  if (!state.worldManifest.places.some((place) => place.id === placeId)) {
    throw new IllegalTransitionError(`Place ${placeId} does not exist in the world manifest.`);
  }
}

function requireOutcome(state: WorldProjection, outcomeId: string): void {
  if (!state.market.outcomes.some((outcome) => outcome.id === outcomeId)) {
    throw new IllegalTransitionError(`Outcome ${outcomeId} does not exist in the market.`);
  }
}

function requireKnownIds<T>(
  record: Record<string, T>,
  ids: readonly string[],
  label: string,
): void {
  for (const id of ids) {
    requireEntity(record, id, label);
  }
}

function validateSignalReferences(state: WorldProjection, signal: Signal): void {
  if (signal.marketId !== state.market.id) {
    throw new IllegalTransitionError(
      `Signal ${signal.id} references market ${signal.marketId}; expected ${state.market.id}.`,
    );
  }
  requireKnownIds(state.claimsById, signal.claimIds, 'Claim');
  requireKnownIds(state.sourcesById, signal.sourceIds, 'Source');
  if (signal.targetOutcomeId) {
    requireOutcome(state, signal.targetOutcomeId);
  }
  if (signal.discoveredByAgentId) {
    requireEntity(state.agentsById, signal.discoveredByAgentId, 'Agent');
  }
}

function updateAgent(
  state: WorldProjection,
  agentId: string,
  update: (agent: Agent) => Agent,
): WorldProjection {
  const agent = requireEntity(state.agentsById, agentId, 'Agent');
  return {
    ...state,
    agentsById: {
      ...state.agentsById,
      [agentId]: update(structuredClone(agent)),
    },
  };
}

function updateMission(
  state: WorldProjection,
  missionId: string,
  update: (mission: Mission) => Mission,
): WorldProjection {
  const mission = requireEntity(state.missionsById, missionId, 'Mission');
  return {
    ...state,
    missionsById: {
      ...state.missionsById,
      [missionId]: update(structuredClone(mission)),
    },
  };
}

function finishMission(
  state: WorldProjection,
  missionId: string,
  status: 'completed' | 'failed' | 'canceled',
  completedAt: string,
): WorldProjection {
  const mission = requireEntity(state.missionsById, missionId, 'Mission');
  let next = updateMission(state, missionId, (current) => ({
    ...current,
    status,
    completedAt,
  }));
  next = updateAgent(next, mission.assignedAgentId, (agent) => {
    agent.queuedMissionIds = agent.queuedMissionIds.filter((id) => id !== missionId);
    if (agent.activeMissionId === missionId) {
      delete agent.activeMissionId;
      delete agent.movement;
      agent.publicState = 'idle';
    }
    return agent;
  });
  return next;
}

function appendSignalShare(
  state: WorldProjection,
  event: WorldEvent,
  share: Omit<SignalShareProjection, 'eventId' | 'sequence' | 'sharedAt'>,
): WorldProjection {
  requireEntity(state.signalsById, share.signalId, 'Signal');
  requireEntity(state.agentsById, share.fromAgentId, 'Agent');
  requireKnownIds(state.agentsById, share.toAgentIds, 'Agent');
  if (!state.knowledgeByKey[knowledgeKey(share.fromAgentId, 'signal', share.signalId)]) {
    throw new IllegalTransitionError(
      `Agent ${share.fromAgentId} cannot share signal ${share.signalId} without a knowledge edge.`,
    );
  }
  return {
    ...state,
    signalShares: [
      ...state.signalShares,
      {
        ...structuredClone(share),
        eventId: event.id,
        sequence: event.sequence,
        sharedAt: event.occurredAt,
      },
    ],
  };
}

function finalizeEvent(state: WorldProjection, event: WorldEvent): WorldProjection {
  return {
    ...state,
    sequence: event.sequence,
    expedition: {
      ...state.expedition,
      currentSequence: event.sequence,
    },
    appliedEventIds: [...state.appliedEventIds, event.id],
    appliedEvents: [
      ...state.appliedEvents,
      {
        id: event.id,
        sequence: event.sequence,
        type: event.type,
        occurredAt: event.occurredAt,
      },
    ],
  };
}

function assertNeverEvent(event: never): never {
  const runtimeType = (event as { type?: unknown }).type;
  throw new UnsupportedEventTypeError(
    typeof runtimeType === 'string' ? runtimeType : '<missing event type>',
  );
}

export function reduceWorldEvent(state: WorldProjection, event: WorldEvent): WorldProjection {
  const runtimeVersion = (event as { schemaVersion: number }).schemaVersion;
  if (runtimeVersion !== SCHEMA_VERSION) {
    throw new UnsupportedEventVersionError(runtimeVersion);
  }
  if (event.expeditionId !== state.expedition.id) {
    throw new WrongExpeditionError(state.expedition.id, event.expeditionId);
  }
  if (state.appliedEventIds.includes(event.id)) {
    return state;
  }
  if (event.sequence !== state.sequence + 1) {
    throw new NonContiguousSequenceError(state.sequence + 1, event.sequence);
  }

  let next = state;

  switch (event.type) {
    case 'expedition.created': {
      if (event.payload.marketId !== state.market.id) {
        throw new IllegalTransitionError(
          `Expedition event references market ${event.payload.marketId}; expected ${state.market.id}.`,
        );
      }
      if (event.payload.worldManifestId !== state.worldManifest.id) {
        throw new IllegalTransitionError(
          `Expedition event references manifest ${event.payload.worldManifestId}; expected ${state.worldManifest.id}.`,
        );
      }
      next = {
        ...state,
        expedition: {
          ...state.expedition,
          marketId: event.payload.marketId,
          worldManifestId: event.payload.worldManifestId,
          mode: event.payload.mode,
        },
      };
      break;
    }
    case 'expedition.started':
      next = {
        ...state,
        expedition: {
          ...state.expedition,
          status: 'active',
          startedAt: state.expedition.startedAt ?? event.payload.startedAt,
        },
      };
      break;
    case 'expedition.paused':
      next = {
        ...state,
        expedition: { ...state.expedition, status: 'paused' },
      };
      break;
    case 'expedition.speed_changed':
      if (state.expedition.simulationSpeed !== event.payload.previousSpeed) {
        throw new IllegalTransitionError(
          `Speed change expected ${event.payload.previousSpeed}; projection is ${state.expedition.simulationSpeed}.`,
        );
      }
      next = {
        ...state,
        expedition: {
          ...state.expedition,
          simulationSpeed: event.payload.newSpeed,
        },
      };
      break;
    case 'expedition.resolved':
      requireOutcome(state, event.payload.resolvedOutcomeId);
      next = {
        ...state,
        expedition: {
          ...state.expedition,
          status: 'resolved',
          endedAt: event.payload.resolvedAt,
        },
      };
      break;
    case 'expedition.archived':
      next = {
        ...state,
        expedition: {
          ...state.expedition,
          status: 'archived',
          endedAt: event.payload.archivedAt,
        },
      };
      break;

    case 'agent.spawned': {
      const agent = event.payload.agent;
      ensureNewEntity(state.agentsById, agent.id, 'Agent');
      requirePlace(state, agent.placeId);
      next = {
        ...state,
        agentsById: { ...state.agentsById, [agent.id]: structuredClone(agent) },
      };
      break;
    }
    case 'agent.mission.queued': {
      const mission = event.payload.mission;
      ensureNewEntity(state.missionsById, mission.id, 'Mission');
      if (mission.expeditionId !== state.expedition.id) {
        throw new IllegalTransitionError(
          `Mission ${mission.id} belongs to expedition ${mission.expeditionId}.`,
        );
      }
      requireEntity(state.agentsById, mission.assignedAgentId, 'Agent');
      if (mission.destinationPlaceId) {
        requirePlace(state, mission.destinationPlaceId);
      }
      next = {
        ...state,
        missionsById: {
          ...state.missionsById,
          [mission.id]: { ...structuredClone(mission), status: 'queued' },
        },
      };
      next = updateAgent(next, mission.assignedAgentId, (agent) => {
        agent.queuedMissionIds = appendUnique(agent.queuedMissionIds, mission.id);
        return agent;
      });
      break;
    }
    case 'agent.mission.assigned': {
      requireEntity(state.agentsById, event.payload.agentId, 'Agent');
      const existing = requireEntity(state.missionsById, event.payload.missionId, 'Mission');
      next = updateMission(state, existing.id, (mission) => ({
        ...mission,
        assignedAgentId: event.payload.agentId,
        status: mission.status === 'draft' ? 'queued' : mission.status,
      }));
      if (existing.assignedAgentId !== event.payload.agentId) {
        next = updateAgent(next, existing.assignedAgentId, (agent) => {
          agent.queuedMissionIds = agent.queuedMissionIds.filter((id) => id !== existing.id);
          return agent;
        });
      }
      next = updateAgent(next, event.payload.agentId, (agent) => {
        agent.queuedMissionIds = appendUnique(agent.queuedMissionIds, existing.id);
        return agent;
      });
      break;
    }
    case 'agent.mission.reordered': {
      const agent = requireEntity(state.agentsById, event.payload.agentId, 'Agent');
      if (!sameMembers(agent.queuedMissionIds, event.payload.orderedMissionIds)) {
        throw new IllegalTransitionError(
          `Mission reorder for ${agent.id} must contain exactly the current queued mission IDs.`,
        );
      }
      next = updateAgent(state, agent.id, (current) => ({
        ...current,
        queuedMissionIds: [...event.payload.orderedMissionIds],
      }));
      break;
    }
    case 'agent.mission.canceled':
      next = finishMission(state, event.payload.missionId, 'canceled', event.occurredAt);
      break;
    case 'agent.mission.completed':
      next = finishMission(state, event.payload.missionId, 'completed', event.payload.completedAt);
      break;
    case 'agent.mission.failed':
      next = finishMission(state, event.payload.missionId, 'failed', event.occurredAt);
      break;
    case 'agent.travel.started': {
      const payload = event.payload;
      const agent = requireEntity(state.agentsById, payload.agentId, 'Agent');
      const mission = requireEntity(state.missionsById, payload.missionId, 'Mission');
      const route = state.worldManifest.routes.find(
        (candidate) => candidate.id === payload.routeId,
      );
      if (!route) {
        throw new IllegalTransitionError(`Route ${payload.routeId} does not exist.`);
      }
      const followsRoute =
        (route.fromPlaceId === payload.fromPlaceId && route.toPlaceId === payload.toPlaceId) ||
        (route.bidirectional &&
          route.fromPlaceId === payload.toPlaceId &&
          route.toPlaceId === payload.fromPlaceId);
      if (!followsRoute) {
        throw new IllegalTransitionError(`Travel event does not follow route ${route.id}.`);
      }
      if (agent.placeId !== payload.fromPlaceId) {
        throw new IllegalTransitionError(
          `Agent ${agent.id} is at ${agent.placeId}, not ${payload.fromPlaceId}.`,
        );
      }
      if (mission.assignedAgentId !== agent.id) {
        throw new IllegalTransitionError(
          `Mission ${mission.id} is not assigned to agent ${agent.id}.`,
        );
      }
      next = updateMission(state, mission.id, (current) => ({
        ...current,
        status: 'traveling',
        startedAt: current.startedAt ?? payload.startedAt,
      }));
      next = updateAgent(next, agent.id, (current) => ({
        ...current,
        movement: {
          routeId: payload.routeId,
          fromPlaceId: payload.fromPlaceId,
          toPlaceId: payload.toPlaceId,
          startedAt: payload.startedAt,
          endsAt: payload.endsAt,
          progress: 0,
        },
        activeMissionId: mission.id,
        queuedMissionIds: current.queuedMissionIds.filter((id) => id !== mission.id),
        publicState: 'traveling',
      }));
      break;
    }
    case 'agent.travel.progressed': {
      const agent = requireEntity(state.agentsById, event.payload.agentId, 'Agent');
      if (!agent.movement || agent.movement.routeId !== event.payload.routeId) {
        throw new IllegalTransitionError(
          `Agent ${agent.id} is not traveling on route ${event.payload.routeId}.`,
        );
      }
      if (event.payload.progress < agent.movement.progress) {
        throw new IllegalTransitionError(
          `Agent ${agent.id} travel progress cannot move backward from ${agent.movement.progress} to ${event.payload.progress}.`,
        );
      }
      next = updateAgent(state, agent.id, (current) => {
        if (!current.movement) {
          throw new IllegalTransitionError(`Agent ${current.id} has no active movement.`);
        }
        current.movement.progress = event.payload.progress;
        return current;
      });
      break;
    }
    case 'agent.arrived': {
      requirePlace(state, event.payload.placeId);
      if (event.payload.missionId) {
        const mission = requireEntity(state.missionsById, event.payload.missionId, 'Mission');
        if (mission.assignedAgentId !== event.payload.agentId) {
          throw new IllegalTransitionError(
            `Mission ${mission.id} is not assigned to agent ${event.payload.agentId}.`,
          );
        }
      }
      next = updateAgent(state, event.payload.agentId, (agent) => {
        if (!agent.movement) {
          throw new IllegalTransitionError(`Agent ${agent.id} has no active movement to complete.`);
        }
        if (agent.movement.toPlaceId !== event.payload.placeId) {
          throw new IllegalTransitionError(
            `Agent ${agent.id} movement targets ${agent.movement.toPlaceId}, not ${event.payload.placeId}.`,
          );
        }
        delete agent.movement;
        agent.placeId = event.payload.placeId;
        agent.publicState = 'idle';
        if (event.payload.missionId) {
          agent.activeMissionId = event.payload.missionId;
        }
        return agent;
      });
      break;
    }
    case 'agent.work.started': {
      const mission = requireEntity(state.missionsById, event.payload.missionId, 'Mission');
      if (mission.assignedAgentId !== event.payload.agentId) {
        throw new IllegalTransitionError(
          `Mission ${mission.id} is not assigned to agent ${event.payload.agentId}.`,
        );
      }
      if (mission.destinationPlaceId) {
        const agent = requireEntity(state.agentsById, event.payload.agentId, 'Agent');
        if (agent.placeId !== mission.destinationPlaceId) {
          throw new IllegalTransitionError(
            `Agent ${agent.id} must reach mission destination ${mission.destinationPlaceId} before work starts.`,
          );
        }
      }
      next = updateMission(state, mission.id, (current) => {
        const running = {
          ...current,
          status: 'running' as const,
          startedAt: current.startedAt ?? event.occurredAt,
        };
        delete running.completedAt;
        return running;
      });
      next = updateAgent(next, event.payload.agentId, (agent) => ({
        ...agent,
        activeMissionId: mission.id,
        publicState: 'working',
      }));
      break;
    }
    case 'agent.turn.completed': {
      const payload = event.payload;
      requireEntity(state.agentsById, payload.agentId, 'Agent');
      requireEntity(state.missionsById, payload.missionId, 'Mission');
      requireKnownIds(state.sourcesById, payload.sourceIds, 'Source');
      requireKnownIds(state.signalsById, payload.signalIds, 'Signal');
      const turn: AgentTurnProjection = {
        eventId: event.id,
        sequence: event.sequence,
        turnId: payload.turnId,
        agentId: payload.agentId,
        missionId: payload.missionId,
        status: 'completed',
        sourceIds: [...payload.sourceIds],
        signalIds: [...payload.signalIds],
        recordedAt: event.recordedAt,
      };
      next = {
        ...state,
        agentTurnsById: { ...state.agentTurnsById, [turn.turnId]: turn },
      };
      next = updateAgent(next, payload.agentId, (agent) => ({
        ...agent,
        publicState: 'idle',
        lastTurnAt: event.occurredAt,
      }));
      break;
    }
    case 'agent.turn.failed': {
      const payload = event.payload;
      requireEntity(state.agentsById, payload.agentId, 'Agent');
      requireEntity(state.missionsById, payload.missionId, 'Mission');
      const turnId = payload.turnId ?? event.id;
      const turn: AgentTurnProjection = {
        eventId: event.id,
        sequence: event.sequence,
        turnId,
        agentId: payload.agentId,
        missionId: payload.missionId,
        status: 'failed',
        sourceIds: [],
        signalIds: [],
        code: payload.code,
        message: payload.message,
        recoverable: payload.recoverable,
        recordedAt: event.recordedAt,
      };
      next = {
        ...state,
        agentTurnsById: { ...state.agentTurnsById, [turnId]: turn },
      };
      next = updateAgent(next, payload.agentId, (agent) => ({
        ...agent,
        publicState: 'error',
        lastTurnAt: event.occurredAt,
      }));
      break;
    }
    case 'agent.dialogue.emitted':
      requireEntity(state.agentsById, event.payload.agentId, 'Agent');
      requireKnownIds(state.sourcesById, event.payload.sourceIds, 'Source');
      requireKnownIds(state.signalsById, event.payload.signalIds, 'Signal');
      next = {
        ...state,
        dialogue: [
          ...state.dialogue,
          {
            eventId: event.id,
            sequence: event.sequence,
            agentId: event.payload.agentId,
            text: event.payload.text,
            sourceIds: [...event.payload.sourceIds],
            signalIds: [...event.payload.signalIds],
            emittedAt: event.occurredAt,
          },
        ],
      };
      break;
    case 'agent.knowledge.acquired': {
      const knowledge = event.payload.knowledge;
      requireEntity(state.agentsById, knowledge.agentId, 'Agent');
      if (knowledge.objectType === 'source') {
        requireEntity(state.sourcesById, knowledge.objectId, 'Source');
      } else if (knowledge.objectType === 'signal') {
        requireEntity(state.signalsById, knowledge.objectId, 'Signal');
      } else if (knowledge.objectType === 'claim') {
        requireEntity(state.claimsById, knowledge.objectId, 'Claim');
      }
      const key = knowledgeKey(knowledge.agentId, knowledge.objectType, knowledge.objectId);
      if (!state.knowledgeByKey[key]) {
        next = {
          ...state,
          knowledgeByKey: {
            ...state.knowledgeByKey,
            [key]: {
              ...structuredClone(knowledge),
              eventId: event.id,
              sequence: event.sequence,
            },
          },
        };
        next = updateAgent(next, knowledge.agentId, (agent) => {
          if (knowledge.objectType === 'source') {
            agent.knownSourceIds = appendUnique(agent.knownSourceIds, knowledge.objectId);
          } else if (knowledge.objectType === 'signal') {
            agent.knownSignalIds = appendUnique(agent.knownSignalIds, knowledge.objectId);
          }
          return agent;
        });
      }
      break;
    }

    case 'pref.call.started': {
      const payload = event.payload;
      if (state.prefCallsById[payload.callId]) {
        throw new IllegalTransitionError(`Pref call ${payload.callId} already exists.`);
      }
      const call: PrefCallProjection = {
        callId: payload.callId,
        status: 'running',
        startedEventId: event.id,
        capability: payload.capability,
        argumentsHash: payload.argumentsHash,
        ...(payload.missionId ? { missionId: payload.missionId } : {}),
        ...(payload.agentId ? { agentId: payload.agentId } : {}),
      };
      next = {
        ...state,
        prefCallsById: { ...state.prefCallsById, [call.callId]: call },
      };
      break;
    }
    case 'pref.call.completed': {
      const existing = requireEntity(state.prefCallsById, event.payload.callId, 'Pref call');
      if (existing.status !== 'running') {
        throw new IllegalTransitionError(
          `Pref call ${existing.callId} cannot complete from ${existing.status} state.`,
        );
      }
      next = {
        ...state,
        prefCallsById: {
          ...state.prefCallsById,
          [existing.callId]: {
            ...existing,
            status: 'completed',
            completedEventId: event.id,
            sourceIds: [...event.payload.sourceIds],
            durationMs: event.payload.durationMs,
          },
        },
      };
      break;
    }
    case 'pref.call.failed': {
      const existing = requireEntity(state.prefCallsById, event.payload.callId, 'Pref call');
      if (existing.status !== 'running') {
        throw new IllegalTransitionError(
          `Pref call ${existing.callId} cannot fail from ${existing.status} state.`,
        );
      }
      next = {
        ...state,
        prefCallsById: {
          ...state.prefCallsById,
          [existing.callId]: {
            ...existing,
            status: 'failed',
            completedEventId: event.id,
            error: {
              code: event.payload.code,
              message: event.payload.message,
              retryable: event.payload.retryable,
            },
          },
        },
      };
      break;
    }
    case 'source.recorded': {
      const source = event.payload.source;
      ensureNewEntity(state.sourcesById, source.id, 'Source');
      next = {
        ...state,
        sourcesById: { ...state.sourcesById, [source.id]: structuredClone(source) },
      };
      break;
    }
    case 'source.superseded': {
      requireEntity(state.sourcesById, event.payload.previousSourceId, 'Source');
      const source = event.payload.source;
      ensureNewEntity(state.sourcesById, source.id, 'Source');
      if (
        source.supersedesSourceId &&
        source.supersedesSourceId !== event.payload.previousSourceId
      ) {
        throw new IllegalTransitionError(
          `Source ${source.id} supersedes ${source.supersedesSourceId}, not ${event.payload.previousSourceId}.`,
        );
      }
      next = {
        ...state,
        sourcesById: { ...state.sourcesById, [source.id]: structuredClone(source) },
      };
      break;
    }
    case 'claim.created': {
      const claim = event.payload.claim;
      ensureNewEntity(state.claimsById, claim.id, 'Claim');
      requireKnownIds(state.sourcesById, claim.sourceIds, 'Source');
      if (claim.extractor.kind === 'agent' && claim.extractor.id) {
        requireEntity(state.agentsById, claim.extractor.id, 'Agent');
      }
      next = {
        ...state,
        claimsById: { ...state.claimsById, [claim.id]: structuredClone(claim) },
      };
      break;
    }
    case 'claim.disputed': {
      const claim = requireEntity(state.claimsById, event.payload.claimId, 'Claim');
      requireKnownIds(state.sourcesById, event.payload.sourceIds, 'Source');
      next = {
        ...state,
        claimsById: {
          ...state.claimsById,
          [claim.id]: { ...claim, status: 'disputed' },
        },
        claimDisputes: [
          ...state.claimDisputes,
          {
            eventId: event.id,
            sequence: event.sequence,
            claimId: claim.id,
            reason: event.payload.reason,
            sourceIds: [...event.payload.sourceIds],
            disputedAt: event.occurredAt,
          },
        ],
      };
      break;
    }
    case 'signal.created': {
      const signal = event.payload.signal;
      ensureNewEntity(state.signalsById, signal.id, 'Signal');
      validateSignalReferences(state, signal);
      next = {
        ...state,
        signalsById: { ...state.signalsById, [signal.id]: structuredClone(signal) },
      };
      break;
    }
    case 'signal.updated': {
      const signal = event.payload.signal;
      requireEntity(state.signalsById, signal.id, 'Signal');
      validateSignalReferences(state, signal);
      next = {
        ...state,
        signalsById: { ...state.signalsById, [signal.id]: structuredClone(signal) },
      };
      break;
    }
    case 'signal.shared':
      next = appendSignalShare(state, event, {
        signalId: event.payload.signalId,
        fromAgentId: event.payload.fromAgentId,
        toAgentIds: [...event.payload.toAgentIds],
        ...(event.payload.meetingId ? { meetingId: event.payload.meetingId } : {}),
      });
      break;
    case 'signal.marked_stale': {
      const signal = requireEntity(state.signalsById, event.payload.signalId, 'Signal');
      if (event.payload.newerSourceId) {
        requireEntity(state.sourcesById, event.payload.newerSourceId, 'Source');
      }
      next = {
        ...state,
        signalsById: {
          ...state.signalsById,
          [signal.id]: {
            ...signal,
            status: 'stale',
            freshness: {
              ...signal.freshness,
              label: 'stale',
              ...(event.payload.newerSourceId
                ? { newerSourceId: event.payload.newerSourceId }
                : {}),
            },
          },
        },
      };
      break;
    }
    case 'correlation.detected': {
      const correlation = event.payload.correlation;
      ensureNewEntity(state.correlationsById, correlation.id, 'Correlation');
      requireKnownIds(state.signalsById, correlation.signalIds, 'Signal');
      next = {
        ...state,
        correlationsById: {
          ...state.correlationsById,
          [correlation.id]: structuredClone(correlation),
        },
      };
      break;
    }

    case 'meeting.requested':
      requirePlace(state, event.payload.placeId);
      requireKnownIds(state.agentsById, event.payload.participantAgentIds, 'Agent');
      ensureNewEntity(state.meetingRequestsById, event.payload.meetingId, 'Meeting request');
      next = {
        ...state,
        meetingRequestsById: {
          ...state.meetingRequestsById,
          [event.payload.meetingId]: {
            eventId: event.id,
            sequence: event.sequence,
            meetingId: event.payload.meetingId,
            placeId: event.payload.placeId,
            participantAgentIds: [...event.payload.participantAgentIds],
            requestedAt: event.occurredAt,
          },
        },
      };
      break;
    case 'meeting.started': {
      const meeting = event.payload.meeting;
      ensureNewEntity(state.meetingsById, meeting.id, 'Meeting');
      requirePlace(state, meeting.placeId);
      requireKnownIds(state.agentsById, meeting.participantAgentIds, 'Agent');
      for (const agentId of meeting.participantAgentIds) {
        const agent = requireEntity(state.agentsById, agentId, 'Agent');
        if (agent.placeId !== meeting.placeId) {
          throw new IllegalTransitionError(
            `Agent ${agent.id} is at ${agent.placeId}, not meeting place ${meeting.placeId}.`,
          );
        }
      }
      next = {
        ...state,
        meetingsById: { ...state.meetingsById, [meeting.id]: structuredClone(meeting) },
      };
      for (const agentId of meeting.participantAgentIds) {
        next = updateAgent(next, agentId, (agent) => ({
          ...agent,
          publicState: 'meeting',
        }));
      }
      break;
    }
    case 'meeting.signal_shared': {
      const meeting = requireEntity(state.meetingsById, event.payload.meetingId, 'Meeting');
      next = appendSignalShare(state, event, {
        signalId: event.payload.signalId,
        fromAgentId: event.payload.fromAgentId,
        toAgentIds: [...event.payload.toAgentIds],
        meetingId: meeting.id,
      });
      next = {
        ...next,
        meetingsById: {
          ...next.meetingsById,
          [meeting.id]: {
            ...meeting,
            sharedSignalIds: appendUnique(meeting.sharedSignalIds, event.payload.signalId),
          },
        },
      };
      break;
    }
    case 'meeting.memo_created': {
      const meeting = requireEntity(state.meetingsById, event.payload.meetingId, 'Meeting');
      next = {
        ...state,
        meetingsById: {
          ...state.meetingsById,
          [meeting.id]: { ...meeting, memo: structuredClone(event.payload.memo) },
        },
        meetingMemosById: {
          ...state.meetingMemosById,
          [meeting.id]: {
            eventId: event.id,
            sequence: event.sequence,
            meetingId: meeting.id,
            memo: structuredClone(event.payload.memo),
            createdAt: event.occurredAt,
          },
        },
      };
      break;
    }
    case 'meeting.ended': {
      const meeting = requireEntity(state.meetingsById, event.payload.meetingId, 'Meeting');
      next = {
        ...state,
        meetingsById: {
          ...state.meetingsById,
          [meeting.id]: { ...meeting, endedAt: event.payload.endedAt },
        },
      };
      for (const agentId of meeting.participantAgentIds) {
        next = updateAgent(next, agentId, (agent) => ({
          ...agent,
          publicState: agent.publicState === 'meeting' ? 'idle' : agent.publicState,
        }));
      }
      break;
    }
    case 'professor.query.started': {
      const query = event.payload.query;
      ensureNewEntity(state.professorQueriesById, query.id, 'Professor query');
      if (query.expeditionId !== state.expedition.id) {
        throw new IllegalTransitionError(
          `Professor query ${query.id} belongs to expedition ${query.expeditionId}.`,
        );
      }
      requireKnownIds(state.sourcesById, query.selectedSourceIds, 'Source');
      requireKnownIds(state.signalsById, query.selectedSignalIds, 'Signal');
      next = {
        ...state,
        professorQueriesById: {
          ...state.professorQueriesById,
          [query.id]: structuredClone(query),
        },
      };
      break;
    }
    case 'professor.response.created': {
      const response = event.payload.response;
      requireEntity(state.professorQueriesById, response.queryId, 'Professor query');
      for (const evidence of response.evidenceUsed) {
        if (evidence.type === 'source') {
          requireEntity(state.sourcesById, evidence.id, 'Source');
        } else {
          requireEntity(state.signalsById, evidence.id, 'Signal');
        }
      }
      response.selectedSignalIds?.forEach((signalId) => {
        requireEntity(state.signalsById, signalId, 'Signal');
      });
      next = {
        ...state,
        professorResponsesByQueryId: {
          ...state.professorResponsesByQueryId,
          [response.queryId]: structuredClone(response),
        },
      };
      break;
    }

    case 'belief.updated': {
      const update = event.payload.update;
      if (update.expeditionId !== state.expedition.id) {
        throw new IllegalTransitionError(
          `Belief update ${update.id} belongs to expedition ${update.expeditionId}.`,
        );
      }
      requireKnownIds(state.signalsById, update.evidenceSignalIds, 'Signal');
      next = { ...state, beliefUpdates: [...state.beliefUpdates, structuredClone(update)] };
      if (update.actor.kind === 'agent') {
        if (!update.actor.id) {
          throw new IllegalTransitionError(`Agent belief update ${update.id} has no agent ID.`);
        }
        const currentAgent = requireEntity(state.agentsById, update.actor.id, 'Agent');
        if (!sameProbabilities(update.previousProbabilities, currentAgent.belief.probabilities)) {
          throw new IllegalTransitionError(
            `Belief update ${update.id} previous probabilities do not match agent ${currentAgent.id}.`,
          );
        }
        next = updateAgent(next, update.actor.id, (agent) => ({
          ...agent,
          belief: {
            probabilities: structuredClone(update.newProbabilities),
            ...(update.uncertainty ? { uncertainty: structuredClone(update.uncertainty) } : {}),
            updatedAt: update.createdAt,
            rationale: update.rationale,
            evidenceSignalIds: [...update.evidenceSignalIds],
          },
        }));
      }
      break;
    }
    case 'forecast.committed': {
      const payload = event.payload;
      const outcomeIds = state.market.outcomes.map((outcome) => outcome.id);
      if (
        !hasExactlyKeys(payload.previousProbabilities, outcomeIds) ||
        !hasExactlyKeys(payload.newProbabilities, outcomeIds)
      ) {
        throw new IllegalTransitionError('Forecast probability keys must match market outcomes.');
      }
      if (payload.uncertainty && !hasExactlyKeys(payload.uncertainty, outcomeIds)) {
        throw new IllegalTransitionError('Forecast uncertainty keys must match market outcomes.');
      }
      const latestForecast = state.forecasts.at(-1);
      if (
        latestForecast &&
        !sameProbabilities(payload.previousProbabilities, latestForecast.newProbabilities)
      ) {
        throw new IllegalTransitionError(
          `Forecast previous probabilities do not match commit ${latestForecast.id}.`,
        );
      }
      if (payload.actor.kind === 'agent') {
        if (!payload.actor.id) {
          throw new IllegalTransitionError('Agent forecast commits require an actor ID.');
        }
        requireEntity(state.agentsById, payload.actor.id, 'Agent');
      }
      requireKnownIds(state.signalsById, payload.evidenceSignalIds, 'Signal');
      const forecast: ForecastProjection = {
        id: event.id,
        eventId: event.id,
        sequence: event.sequence,
        actor: structuredClone(payload.actor),
        previousProbabilities: structuredClone(payload.previousProbabilities),
        newProbabilities: structuredClone(payload.newProbabilities),
        rationale: payload.rationale,
        evidenceSignalIds: [...payload.evidenceSignalIds],
        assumptions: [...(payload.assumptions ?? [])],
        committedAt: event.occurredAt,
        ...(payload.uncertainty ? { uncertainty: structuredClone(payload.uncertainty) } : {}),
        ...(payload.commitType ? { commitType: payload.commitType } : {}),
        ...(payload.publicNote !== undefined ? { publicNote: payload.publicNote } : {}),
        ...(payload.privateMemo ? { privateMemo: payload.privateMemo } : {}),
        ...(payload.scoringEligible !== undefined
          ? { scoringEligible: payload.scoringEligible }
          : {}),
      };
      next = { ...state, forecasts: [...state.forecasts, forecast] };
      break;
    }
    case 'market.price_updated': {
      const outcomeIds = state.market.outcomes.map((outcome) => outcome.id);
      if (!hasExactlyKeys(event.payload.probabilities, outcomeIds)) {
        throw new IllegalTransitionError('Market price keys must match market outcomes.');
      }
      next = {
        ...state,
        market: {
          ...state.market,
          currentPublicProbabilities: structuredClone(event.payload.probabilities),
          updatedAt: event.payload.observedAt,
        },
        marketPriceHistory: [
          ...state.marketPriceHistory,
          {
            eventId: event.id,
            sequence: event.sequence,
            probabilities: structuredClone(event.payload.probabilities),
            observedAt: event.payload.observedAt,
            ...(event.payload.provider ? { provider: event.payload.provider } : {}),
          },
        ],
      };
      break;
    }
    case 'market.resolved':
      requireOutcome(state, event.payload.resolvedOutcomeId);
      next = {
        ...state,
        market: {
          ...state.market,
          status: 'resolved',
          resolvedOutcomeId: event.payload.resolvedOutcomeId,
          updatedAt: event.payload.resolvedAt,
        },
      };
      break;
    case 'score.calculated':
      if (
        event.payload.forecastCommitId &&
        !state.forecasts.some((forecast) => forecast.id === event.payload.forecastCommitId)
      ) {
        throw new IllegalTransitionError(
          `Forecast commit ${event.payload.forecastCommitId} does not exist.`,
        );
      }
      next = {
        ...state,
        scores: [
          ...state.scores,
          {
            eventId: event.id,
            sequence: event.sequence,
            brierScore: event.payload.brierScore,
            calculatedAt: event.occurredAt,
            ...(event.payload.forecastCommitId
              ? { forecastCommitId: event.payload.forecastCommitId }
              : {}),
            ...(event.payload.components
              ? { components: structuredClone(event.payload.components) }
              : {}),
          },
        ],
      };
      break;

    default:
      return assertNeverEvent(event);
  }

  return finalizeEvent(next, event);
}
