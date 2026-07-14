import type { Agent, AgentKnowledge, Place, Signal } from '@signal-atlas/contracts';

import type { ForecastProjection, WorldProjection } from './state.js';

export interface AgentKnowledgeSummary {
  agent: Agent;
  sourceIds: string[];
  signalIds: string[];
  claimIds: string[];
  memoIds: string[];
}

export function selectAgents(state: WorldProjection): Agent[] {
  return Object.values(state.agentsById).sort((left, right) => left.id.localeCompare(right.id));
}

export function selectAgent(state: WorldProjection, agentId: string): Agent | undefined {
  return state.agentsById[agentId];
}

export function selectPlaces(state: WorldProjection): Place[] {
  return [...state.worldManifest.places];
}

export function selectPlace(state: WorldProjection, placeId: string): Place | undefined {
  return state.worldManifest.places.find((place) => place.id === placeId);
}

export function selectActiveSignals(state: WorldProjection): Signal[] {
  return Object.values(state.signalsById)
    .filter((signal) => signal.status === 'active')
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
    );
}

export function selectKnowledgeDistribution(state: WorldProjection): AgentKnowledgeSummary[] {
  const edges = Object.values(state.knowledgeByKey);
  return selectAgents(state).map((agent) => {
    const agentEdges = edges.filter((edge) => edge.agentId === agent.id);
    const idsFor = (objectType: AgentKnowledge['objectType']) =>
      agentEdges
        .filter((edge) => edge.objectType === objectType)
        .map((edge) => edge.objectId)
        .sort();

    return {
      agent,
      sourceIds: idsFor('source'),
      signalIds: idsFor('signal'),
      claimIds: idsFor('claim'),
      memoIds: idsFor('memo'),
    };
  });
}

export function selectAgentsKnowing(
  state: WorldProjection,
  objectType: AgentKnowledge['objectType'],
  objectId: string,
): Agent[] {
  return selectAgents(state).filter(
    (agent) => state.knowledgeByKey[`${agent.id}:${objectType}:${objectId}`] !== undefined,
  );
}

export function selectForecastHistory(state: WorldProjection): ForecastProjection[] {
  return [...state.forecasts];
}

export function selectLatestForecast(state: WorldProjection): ForecastProjection | undefined {
  return state.forecasts.at(-1);
}

export function selectProjectionAtSequenceSummary(state: WorldProjection): {
  expeditionId: string;
  sequence: number;
  appliedEventCount: number;
} {
  return {
    expeditionId: state.expedition.id,
    sequence: state.sequence,
    appliedEventCount: state.appliedEventIds.length,
  };
}
