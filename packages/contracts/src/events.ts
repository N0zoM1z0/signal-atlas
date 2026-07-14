import { z } from 'zod';

import {
  ActorSchema,
  DateTimeSchema,
  EntityIdSchema,
  ProbabilityDistributionSchema,
  ProbabilityRangeSchema,
  SCHEMA_VERSION,
  SimulationSpeedSchema,
} from './common.js';
import {
  AgentKnowledgeSchema,
  ClaimSchema,
  CorrelationRecordSchema,
  SignalSchema,
  SourceRecordSchema,
} from './information.js';
import { AgentSchema, BeliefUpdateSchema, MissionSchema } from './agents.js';
import {
  MeetingMemoSchema,
  MeetingSchema,
  ProfessorQuerySchema,
  ProfessorResponseSchema,
} from './social.js';

const eventEnvelope = {
  id: EntityIdSchema,
  expeditionId: EntityIdSchema,
  sequence: z.number().int().positive(),
  occurredAt: DateTimeSchema,
  recordedAt: DateTimeSchema,
  actor: ActorSchema,
  causationId: EntityIdSchema.optional(),
  correlationId: EntityIdSchema.optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
};

function eventVariant<const TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) {
  return z.strictObject({
    ...eventEnvelope,
    type: z.literal(type),
    payload,
  });
}

const expeditionCreated = eventVariant(
  'expedition.created',
  z.strictObject({
    marketId: EntityIdSchema,
    worldManifestId: EntityIdSchema,
    mode: z.enum(['director', 'observatory', 'analyst', 'replay']),
  }),
);
const expeditionStarted = eventVariant(
  'expedition.started',
  z.strictObject({ startedAt: DateTimeSchema }),
);
const expeditionPaused = eventVariant(
  'expedition.paused',
  z.strictObject({ reason: z.string().min(1).optional() }),
);
const expeditionSpeedChanged = eventVariant(
  'expedition.speed_changed',
  z.strictObject({ previousSpeed: SimulationSpeedSchema, newSpeed: SimulationSpeedSchema }),
);
const expeditionResolved = eventVariant(
  'expedition.resolved',
  z.strictObject({ resolvedOutcomeId: EntityIdSchema, resolvedAt: DateTimeSchema }),
);
const expeditionArchived = eventVariant(
  'expedition.archived',
  z.strictObject({ archivedAt: DateTimeSchema }),
);

const agentSpawned = eventVariant('agent.spawned', z.strictObject({ agent: AgentSchema }));
const missionQueued = eventVariant(
  'agent.mission.queued',
  z.strictObject({ mission: MissionSchema }),
);
const missionAssigned = eventVariant(
  'agent.mission.assigned',
  z.strictObject({ missionId: EntityIdSchema, agentId: EntityIdSchema }),
);
const missionReordered = eventVariant(
  'agent.mission.reordered',
  z.strictObject({ agentId: EntityIdSchema, orderedMissionIds: z.array(EntityIdSchema) }),
);
const missionCanceled = eventVariant(
  'agent.mission.canceled',
  z.strictObject({ missionId: EntityIdSchema, reason: z.string().min(1).optional() }),
);
const missionCompleted = eventVariant(
  'agent.mission.completed',
  z.strictObject({ missionId: EntityIdSchema, completedAt: DateTimeSchema }),
);
const missionFailed = eventVariant(
  'agent.mission.failed',
  z.strictObject({
    missionId: EntityIdSchema,
    code: z.string().min(1),
    message: z.string().min(1),
  }),
);
const travelStarted = eventVariant(
  'agent.travel.started',
  z.strictObject({
    agentId: EntityIdSchema,
    missionId: EntityIdSchema,
    routeId: EntityIdSchema,
    fromPlaceId: EntityIdSchema,
    toPlaceId: EntityIdSchema,
    startedAt: DateTimeSchema,
    endsAt: DateTimeSchema,
    durationMs: z.number().int().positive(),
  }),
);
const travelProgressed = eventVariant(
  'agent.travel.progressed',
  z.strictObject({
    agentId: EntityIdSchema,
    routeId: EntityIdSchema,
    progress: z.number().min(0).max(1),
  }),
);
const agentArrived = eventVariant(
  'agent.arrived',
  z.strictObject({
    agentId: EntityIdSchema,
    missionId: EntityIdSchema.optional(),
    placeId: EntityIdSchema,
  }),
);
const agentWorkStarted = eventVariant(
  'agent.work.started',
  z.strictObject({ agentId: EntityIdSchema, missionId: EntityIdSchema }),
);
const agentTurnCompleted = eventVariant(
  'agent.turn.completed',
  z.strictObject({
    agentId: EntityIdSchema,
    missionId: EntityIdSchema,
    turnId: EntityIdSchema,
    sourceIds: z.array(EntityIdSchema),
    signalIds: z.array(EntityIdSchema),
    profileId: EntityIdSchema,
    profileVersion: z.number().int().positive(),
    publicRationale: z.string().min(1).max(320),
    unknowns: z.array(z.string().min(1)).min(1).max(6),
  }),
);
const agentTurnFailed = eventVariant(
  'agent.turn.failed',
  z.strictObject({
    agentId: EntityIdSchema,
    missionId: EntityIdSchema,
    turnId: EntityIdSchema.optional(),
    code: z.string().min(1),
    message: z.string().min(1),
    recoverable: z.boolean(),
  }),
);
const agentDialogueEmitted = eventVariant(
  'agent.dialogue.emitted',
  z.strictObject({
    agentId: EntityIdSchema,
    text: z.string().min(1).max(400),
    sourceIds: z.array(EntityIdSchema),
    signalIds: z.array(EntityIdSchema),
  }),
);
const agentKnowledgeAcquired = eventVariant(
  'agent.knowledge.acquired',
  z.strictObject({ knowledge: AgentKnowledgeSchema }),
);

const prefCallStarted = eventVariant(
  'pref.call.started',
  z.strictObject({
    callId: EntityIdSchema,
    missionId: EntityIdSchema.optional(),
    agentId: EntityIdSchema.optional(),
    capability: z.string().min(1),
    argumentsHash: z.string().min(1),
  }),
);
const prefCallCompleted = eventVariant(
  'pref.call.completed',
  z.strictObject({
    callId: EntityIdSchema,
    sourceIds: z.array(EntityIdSchema),
    durationMs: z.number().int().nonnegative(),
  }),
);
const prefCallFailed = eventVariant(
  'pref.call.failed',
  z.strictObject({
    callId: EntityIdSchema,
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
);
const sourceRecorded = eventVariant(
  'source.recorded',
  z.strictObject({ source: SourceRecordSchema }),
);
const sourceSuperseded = eventVariant(
  'source.superseded',
  z.strictObject({ previousSourceId: EntityIdSchema, source: SourceRecordSchema }),
);
const claimCreated = eventVariant('claim.created', z.strictObject({ claim: ClaimSchema }));
const claimDisputed = eventVariant(
  'claim.disputed',
  z.strictObject({
    claimId: EntityIdSchema,
    reason: z.string().min(1),
    sourceIds: z.array(EntityIdSchema),
  }),
);
const signalCreated = eventVariant('signal.created', z.strictObject({ signal: SignalSchema }));
const signalUpdated = eventVariant('signal.updated', z.strictObject({ signal: SignalSchema }));
const signalShared = eventVariant(
  'signal.shared',
  z.strictObject({
    signalId: EntityIdSchema,
    fromAgentId: EntityIdSchema,
    toAgentIds: z.array(EntityIdSchema).min(1),
    meetingId: EntityIdSchema.optional(),
  }),
);
const signalMarkedStale = eventVariant(
  'signal.marked_stale',
  z.strictObject({
    signalId: EntityIdSchema,
    reason: z.string().min(1),
    newerSourceId: EntityIdSchema.optional(),
  }),
);
const correlationDetected = eventVariant(
  'correlation.detected',
  z.strictObject({ correlation: CorrelationRecordSchema }),
);

const meetingRequested = eventVariant(
  'meeting.requested',
  z.strictObject({
    meetingId: EntityIdSchema,
    placeId: EntityIdSchema,
    participantAgentIds: z.array(EntityIdSchema).min(2),
  }),
);
const meetingStarted = eventVariant('meeting.started', z.strictObject({ meeting: MeetingSchema }));
const meetingSignalShared = eventVariant(
  'meeting.signal_shared',
  z.strictObject({
    meetingId: EntityIdSchema,
    signalId: EntityIdSchema,
    fromAgentId: EntityIdSchema,
    toAgentIds: z.array(EntityIdSchema).min(1),
  }),
);
const meetingMemoCreated = eventVariant(
  'meeting.memo_created',
  z.strictObject({ meetingId: EntityIdSchema, memo: MeetingMemoSchema }),
);
const meetingEnded = eventVariant(
  'meeting.ended',
  z.strictObject({ meetingId: EntityIdSchema, endedAt: DateTimeSchema }),
);
const professorQueryStarted = eventVariant(
  'professor.query.started',
  z.strictObject({ query: ProfessorQuerySchema }),
);
const professorResponseCreated = eventVariant(
  'professor.response.created',
  z.strictObject({ response: ProfessorResponseSchema }),
);

const beliefUpdated = eventVariant(
  'belief.updated',
  z.strictObject({ update: BeliefUpdateSchema }),
);
const forecastCommitPayload = z.strictObject({
  commitId: EntityIdSchema.optional(),
  actor: z.strictObject({
    kind: z.enum(['agent', 'player', 'team']),
    id: EntityIdSchema.optional(),
  }),
  previousProbabilities: ProbabilityDistributionSchema,
  newProbabilities: ProbabilityDistributionSchema,
  uncertainty: z.record(EntityIdSchema, ProbabilityRangeSchema).optional(),
  rationale: z.string().min(1),
  evidenceSignalIds: z.array(EntityIdSchema),
  assumptions: z.array(z.string().min(1)).optional(),
  commitType: z.enum(['initial', 'revision', 'hold', 'final']).optional(),
  publicNote: z.string().max(280).optional(),
  privateMemo: z.string().min(1).optional(),
  scoringEligible: z.boolean().optional(),
});
const forecastCommitted = eventVariant('forecast.committed', forecastCommitPayload);
const marketPriceUpdated = eventVariant(
  'market.price_updated',
  z.strictObject({
    probabilities: ProbabilityDistributionSchema,
    provider: z.string().min(1).optional(),
    observedAt: DateTimeSchema,
  }),
);
const marketResolved = eventVariant(
  'market.resolved',
  z.strictObject({
    resolvedOutcomeId: EntityIdSchema,
    resolvedAt: DateTimeSchema,
    resolutionNote: z.string().min(1).optional(),
  }),
);
const scoreCalculated = eventVariant(
  'score.calculated',
  z.strictObject({
    forecastCommitId: EntityIdSchema.optional(),
    brierScore: z.number().min(0).max(2),
    components: z.record(z.string(), z.number()).optional(),
  }),
);

export const WorldEventSchema = z
  .discriminatedUnion('type', [
    expeditionCreated,
    expeditionStarted,
    expeditionPaused,
    expeditionSpeedChanged,
    expeditionResolved,
    expeditionArchived,
    agentSpawned,
    missionQueued,
    missionAssigned,
    missionReordered,
    missionCanceled,
    missionCompleted,
    missionFailed,
    travelStarted,
    travelProgressed,
    agentArrived,
    agentWorkStarted,
    agentTurnCompleted,
    agentTurnFailed,
    agentDialogueEmitted,
    agentKnowledgeAcquired,
    prefCallStarted,
    prefCallCompleted,
    prefCallFailed,
    sourceRecorded,
    sourceSuperseded,
    claimCreated,
    claimDisputed,
    signalCreated,
    signalUpdated,
    signalShared,
    signalMarkedStale,
    correlationDetected,
    meetingRequested,
    meetingStarted,
    meetingSignalShared,
    meetingMemoCreated,
    meetingEnded,
    professorQueryStarted,
    professorResponseCreated,
    beliefUpdated,
    forecastCommitted,
    marketPriceUpdated,
    marketResolved,
    scoreCalculated,
  ])
  .meta({
    id: 'https://signal-atlas.local/schemas/world-event.schema.json',
    title: 'Signal Atlas World Event',
  });

export function parseWorldEvent(input: unknown): WorldEvent {
  return WorldEventSchema.parse(input);
}

export type WorldEvent = z.infer<typeof WorldEventSchema>;
export type WorldEventType = WorldEvent['type'];
export type ForecastCommittedEvent = z.infer<typeof forecastCommitted>;
