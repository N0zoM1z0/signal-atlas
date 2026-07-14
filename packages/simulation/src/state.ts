import type {
  Agent,
  AgentKnowledge,
  BeliefUpdate,
  Claim,
  CorrelationRecord,
  Expedition,
  ExpeditionFixture,
  Market,
  Meeting,
  MeetingMemo,
  Mission,
  ProbabilityDistribution,
  ProbabilityRange,
  ProfessorQuery,
  ProfessorResponse,
  Signal,
  SourceRecord,
  WorldEventType,
  WorldManifest,
} from '@signal-atlas/contracts';

import { IllegalTransitionError } from './errors.js';

export const PROJECTION_SCHEMA_VERSION = 1 as const;

export interface KnowledgeEdgeProjection extends AgentKnowledge {
  eventId: string;
  sequence: number;
}

export interface ForecastProjection {
  id: string;
  commitId?: string;
  eventId: string;
  sequence: number;
  actor: BeliefUpdate['actor'];
  previousProbabilities: ProbabilityDistribution;
  newProbabilities: ProbabilityDistribution;
  uncertainty?: Record<string, ProbabilityRange>;
  rationale: string;
  evidenceSignalIds: string[];
  assumptions: string[];
  commitType?: 'initial' | 'revision' | 'hold' | 'final';
  publicNote?: string;
  privateMemo?: string;
  scoringEligible?: boolean;
  committedAt: string;
}

export interface MarketPricePoint {
  eventId: string;
  sequence: number;
  probabilities: ProbabilityDistribution;
  provider?: string;
  observedAt: string;
}

export interface ScoreProjection {
  eventId: string;
  sequence: number;
  forecastCommitId?: string;
  brierScore: number;
  components?: Record<string, number>;
  calculatedAt: string;
}

export interface DialogueProjection {
  eventId: string;
  sequence: number;
  agentId: string;
  text: string;
  sourceIds: string[];
  signalIds: string[];
  emittedAt: string;
}

export interface SignalShareProjection {
  eventId: string;
  sequence: number;
  signalId: string;
  fromAgentId: string;
  toAgentIds: string[];
  meetingId?: string;
  sharedAt: string;
}

export interface ClaimDisputeProjection {
  eventId: string;
  sequence: number;
  claimId: string;
  reason: string;
  sourceIds: string[];
  disputedAt: string;
}

export interface MeetingRequestProjection {
  eventId: string;
  sequence: number;
  meetingId: string;
  placeId: string;
  participantAgentIds: string[];
  requestedAt: string;
}

export interface MeetingMemoProjection {
  eventId: string;
  sequence: number;
  meetingId: string;
  memo: MeetingMemo;
  createdAt: string;
}

export interface PrefCallProjection {
  callId: string;
  status: 'running' | 'completed' | 'failed';
  startedEventId?: string;
  completedEventId?: string;
  missionId?: string;
  agentId?: string;
  capability?: string;
  argumentsHash?: string;
  sourceIds?: string[];
  durationMs?: number;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface AgentTurnProjection {
  eventId: string;
  sequence: number;
  turnId: string;
  agentId: string;
  missionId: string;
  status: 'completed' | 'failed';
  sourceIds: string[];
  signalIds: string[];
  profileId?: string;
  profileVersion?: number;
  publicRationale?: string;
  unknowns?: string[];
  code?: string;
  message?: string;
  recoverable?: boolean;
  recordedAt: string;
}

export interface AppliedEventSummary {
  id: string;
  sequence: number;
  type: WorldEventType;
  occurredAt: string;
}

export interface WorldProjection {
  projectionSchemaVersion: typeof PROJECTION_SCHEMA_VERSION;
  sequence: number;
  expedition: Expedition;
  market: Market;
  worldManifest: WorldManifest;
  agentsById: Record<string, Agent>;
  missionsById: Record<string, Mission>;
  sourcesById: Record<string, SourceRecord>;
  claimsById: Record<string, Claim>;
  signalsById: Record<string, Signal>;
  knowledgeByKey: Record<string, KnowledgeEdgeProjection>;
  correlationsById: Record<string, CorrelationRecord>;
  meetingsById: Record<string, Meeting>;
  meetingRequestsById: Record<string, MeetingRequestProjection>;
  meetingMemosById: Record<string, MeetingMemoProjection>;
  professorQueriesById: Record<string, ProfessorQuery>;
  professorResponsesByQueryId: Record<string, ProfessorResponse>;
  beliefUpdates: BeliefUpdate[];
  forecasts: ForecastProjection[];
  marketPriceHistory: MarketPricePoint[];
  scores: ScoreProjection[];
  dialogue: DialogueProjection[];
  signalShares: SignalShareProjection[];
  claimDisputes: ClaimDisputeProjection[];
  prefCallsById: Record<string, PrefCallProjection>;
  agentTurnsById: Record<string, AgentTurnProjection>;
  appliedEventIds: string[];
  appliedEvents: AppliedEventSummary[];
}

export interface WorldBootstrap {
  expedition: Expedition;
  market: Market;
  worldManifest: WorldManifest;
  agents: readonly Agent[];
}

function indexAgents(agents: readonly Agent[]): Record<string, Agent> {
  const indexed: Record<string, Agent> = {};
  for (const agent of agents) {
    if (indexed[agent.id]) {
      throw new IllegalTransitionError(`Duplicate bootstrap agent ID: ${agent.id}.`);
    }
    indexed[agent.id] = structuredClone(agent);
  }
  return indexed;
}

export function createInitialWorldState(bootstrap: WorldBootstrap): WorldProjection {
  if (bootstrap.expedition.marketId !== bootstrap.market.id) {
    throw new IllegalTransitionError(
      `Bootstrap expedition references market ${bootstrap.expedition.marketId}; received ${bootstrap.market.id}.`,
    );
  }
  if (bootstrap.expedition.worldManifestId !== bootstrap.worldManifest.id) {
    throw new IllegalTransitionError(
      `Bootstrap expedition references manifest ${bootstrap.expedition.worldManifestId}; received ${bootstrap.worldManifest.id}.`,
    );
  }

  const placeIds = new Set(bootstrap.worldManifest.places.map((place) => place.id));
  for (const agent of bootstrap.agents) {
    if (!placeIds.has(agent.placeId)) {
      throw new IllegalTransitionError(
        `Bootstrap agent ${agent.id} references unknown place ${agent.placeId}.`,
      );
    }
    if (agent.movement || agent.activeMissionId || agent.queuedMissionIds.length > 0) {
      throw new IllegalTransitionError(
        `Sequence-zero agent ${agent.id} cannot start with dynamic movement or mission state.`,
      );
    }
    if (
      agent.knownSourceIds.length > 0 ||
      agent.knownSignalIds.length > 0 ||
      agent.belief.evidenceSignalIds.length > 0
    ) {
      throw new IllegalTransitionError(
        `Sequence-zero agent ${agent.id} knowledge must be introduced through acquisition events.`,
      );
    }
  }

  return {
    projectionSchemaVersion: PROJECTION_SCHEMA_VERSION,
    sequence: 0,
    expedition: {
      ...structuredClone(bootstrap.expedition),
      currentSequence: 0,
    },
    market: structuredClone(bootstrap.market),
    worldManifest: structuredClone(bootstrap.worldManifest),
    agentsById: indexAgents(bootstrap.agents),
    missionsById: {},
    sourcesById: {},
    claimsById: {},
    signalsById: {},
    knowledgeByKey: {},
    correlationsById: {},
    meetingsById: {},
    meetingRequestsById: {},
    meetingMemosById: {},
    professorQueriesById: {},
    professorResponsesByQueryId: {},
    beliefUpdates: [],
    forecasts: [],
    marketPriceHistory: [],
    scores: [],
    dialogue: [],
    signalShares: [],
    claimDisputes: [],
    prefCallsById: {},
    agentTurnsById: {},
    appliedEventIds: [],
    appliedEvents: [],
  };
}

export function createInitialWorldStateFromFixture(fixture: ExpeditionFixture): WorldProjection {
  return createInitialWorldState({
    expedition: fixture.expedition,
    market: fixture.market,
    worldManifest: fixture.worldManifest,
    agents: fixture.agents,
  });
}

export function knowledgeKey(
  agentId: string,
  objectType: AgentKnowledge['objectType'],
  objectId: string,
): string {
  return `${agentId}:${objectType}:${objectId}`;
}
