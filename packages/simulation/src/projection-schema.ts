import {
  AgentKnowledgeSchema,
  AgentSchema,
  BeliefUpdateSchema,
  ClaimSchema,
  ContentHashSchema,
  CorrelationRecordSchema,
  DateTimeSchema,
  EntityIdSchema,
  ExpeditionSchema,
  MarketSchema,
  MeetingMemoSchema,
  MeetingSchema,
  MissionSchema,
  ProbabilityDistributionSchema,
  ProbabilityRangeSchema,
  ProfessorQuerySchema,
  ProfessorResponseSchema,
  SignalSchema,
  SourceRecordSchema,
  WorldEventSchema,
  WorldManifestSchema,
  type WorldEventType,
} from '@signal-atlas/contracts';
import { z } from 'zod';

import { PROJECTION_SCHEMA_VERSION, type WorldProjection } from './state.js';

const SequenceSchema = z.number().int().nonnegative();
const KnowledgeKeySchema = z
  .string()
  .min(1)
  .max(480)
  .refine(
    (key) => !Object.hasOwn(Object.prototype, key),
    'Expected a prototype-safe knowledge key.',
  )
  .refine(
    (key) => /^.+:(?:source|signal|claim|memo):.+$/u.test(key),
    'Expected an agent, object type, and object ID composite knowledge key.',
  );
const SafeRecordSchema = <T extends z.ZodType>(key: z.ZodType<string>, value: T) =>
  z
    .unknown()
    .superRefine((candidate, context) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return;
      for (const recordKey of Object.keys(candidate)) {
        if (!key.safeParse(recordKey).success) {
          context.addIssue({
            code: 'custom',
            path: [recordKey],
            message: 'Record key does not satisfy its runtime boundary.',
          });
        }
      }
    })
    .pipe(z.record(key, value));
const EntityIndexSchema = <T extends z.ZodType>(value: T) =>
  SafeRecordSchema(EntityIdSchema, value);
const WorldEventTypeSchema = z.enum(
  WorldEventSchema.options.map((option) => option.shape.type.value) as [
    WorldEventType,
    ...WorldEventType[],
  ],
);

const KnowledgeEdgeProjectionSchema = AgentKnowledgeSchema.safeExtend({
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
});

const ForecastProjectionSchema = z.strictObject({
  id: EntityIdSchema,
  commitId: EntityIdSchema.optional(),
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
  actor: z.strictObject({
    kind: z.enum(['agent', 'player', 'team']),
    id: EntityIdSchema.optional(),
  }),
  previousProbabilities: ProbabilityDistributionSchema,
  newProbabilities: ProbabilityDistributionSchema,
  uncertainty: z.record(EntityIdSchema, ProbabilityRangeSchema).optional(),
  rationale: z.string().min(1),
  evidenceSignalIds: z.array(EntityIdSchema),
  assumptions: z.array(z.string().min(1)),
  commitType: z.enum(['initial', 'revision', 'hold', 'final']).optional(),
  publicNote: z.string().min(1).optional(),
  privateMemo: z.string().min(1).optional(),
  scoringEligible: z.boolean().optional(),
  committedAt: DateTimeSchema,
});

const MarketPricePointSchema = z.strictObject({
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
  probabilities: ProbabilityDistributionSchema,
  provider: z.string().min(1).optional(),
  observedAt: DateTimeSchema,
});

const ScoreProjectionSchema = z.strictObject({
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
  forecastCommitId: EntityIdSchema.optional(),
  brierScore: z.number().nonnegative(),
  components: z.record(EntityIdSchema, z.number().nonnegative()).optional(),
  calculatedAt: DateTimeSchema,
});

const DialogueProjectionSchema = z.strictObject({
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
  agentId: EntityIdSchema,
  text: z.string().min(1),
  sourceIds: z.array(EntityIdSchema),
  signalIds: z.array(EntityIdSchema),
  emittedAt: DateTimeSchema,
});

const SignalShareProjectionSchema = z.strictObject({
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
  signalId: EntityIdSchema,
  fromAgentId: EntityIdSchema,
  toAgentIds: z.array(EntityIdSchema),
  meetingId: EntityIdSchema.optional(),
  sharedAt: DateTimeSchema,
});

const ClaimDisputeProjectionSchema = z.strictObject({
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
  claimId: EntityIdSchema,
  reason: z.string().min(1),
  sourceIds: z.array(EntityIdSchema),
  disputedAt: DateTimeSchema,
});

const MeetingRequestProjectionSchema = z.strictObject({
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
  meetingId: EntityIdSchema,
  placeId: EntityIdSchema,
  participantAgentIds: z.array(EntityIdSchema),
  requestedAt: DateTimeSchema,
});

const MeetingMemoProjectionSchema = z.strictObject({
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
  meetingId: EntityIdSchema,
  memo: MeetingMemoSchema,
  createdAt: DateTimeSchema,
});

const PrefCallProjectionSchema = z.strictObject({
  callId: EntityIdSchema,
  status: z.enum(['running', 'completed', 'failed']),
  startedEventId: EntityIdSchema.optional(),
  completedEventId: EntityIdSchema.optional(),
  missionId: EntityIdSchema.optional(),
  agentId: EntityIdSchema.optional(),
  capability: z.string().min(1).optional(),
  argumentsHash: ContentHashSchema.optional(),
  sourceIds: z.array(EntityIdSchema).optional(),
  durationMs: z.number().nonnegative().optional(),
  error: z
    .strictObject({
      code: z.string().min(1),
      message: z.string().min(1),
      retryable: z.boolean(),
    })
    .optional(),
});

const AgentTurnProjectionSchema = z.strictObject({
  eventId: EntityIdSchema,
  sequence: SequenceSchema,
  turnId: EntityIdSchema,
  agentId: EntityIdSchema,
  missionId: EntityIdSchema,
  status: z.enum(['completed', 'failed']),
  sourceIds: z.array(EntityIdSchema),
  signalIds: z.array(EntityIdSchema),
  profileId: EntityIdSchema.optional(),
  profileVersion: z.number().int().positive().optional(),
  publicRationale: z.string().min(1).optional(),
  unknowns: z.array(z.string().min(1)).optional(),
  code: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  recoverable: z.boolean().optional(),
  recordedAt: DateTimeSchema,
});

const AppliedEventSummarySchema = z.strictObject({
  id: EntityIdSchema,
  sequence: SequenceSchema,
  type: WorldEventTypeSchema,
  occurredAt: DateTimeSchema,
});

export const WorldProjectionSchema = z
  .strictObject({
    projectionSchemaVersion: z.literal(PROJECTION_SCHEMA_VERSION),
    sequence: SequenceSchema,
    expedition: ExpeditionSchema,
    market: MarketSchema,
    worldManifest: WorldManifestSchema,
    agentsById: EntityIndexSchema(AgentSchema),
    missionsById: EntityIndexSchema(MissionSchema),
    sourcesById: EntityIndexSchema(SourceRecordSchema),
    claimsById: EntityIndexSchema(ClaimSchema),
    signalsById: EntityIndexSchema(SignalSchema),
    knowledgeByKey: SafeRecordSchema(KnowledgeKeySchema, KnowledgeEdgeProjectionSchema),
    correlationsById: EntityIndexSchema(CorrelationRecordSchema),
    meetingsById: EntityIndexSchema(MeetingSchema),
    meetingRequestsById: EntityIndexSchema(MeetingRequestProjectionSchema),
    meetingMemosById: EntityIndexSchema(MeetingMemoProjectionSchema),
    professorQueriesById: EntityIndexSchema(ProfessorQuerySchema),
    professorResponsesByQueryId: EntityIndexSchema(ProfessorResponseSchema),
    beliefUpdates: z.array(BeliefUpdateSchema),
    forecasts: z.array(ForecastProjectionSchema),
    marketPriceHistory: z.array(MarketPricePointSchema),
    scores: z.array(ScoreProjectionSchema),
    dialogue: z.array(DialogueProjectionSchema),
    signalShares: z.array(SignalShareProjectionSchema),
    claimDisputes: z.array(ClaimDisputeProjectionSchema),
    prefCallsById: EntityIndexSchema(PrefCallProjectionSchema),
    agentTurnsById: EntityIndexSchema(AgentTurnProjectionSchema),
    appliedEventIds: z.array(EntityIdSchema),
    appliedEvents: z.array(AppliedEventSummarySchema),
  })
  .superRefine((projection, context) => {
    if (projection.expedition.currentSequence !== projection.sequence) {
      context.addIssue({
        code: 'custom',
        path: ['expedition', 'currentSequence'],
        message: 'Expedition and projection sequences must match.',
      });
    }
    const latestApplied = projection.appliedEvents.at(-1)?.sequence ?? 0;
    if (latestApplied !== projection.sequence) {
      context.addIssue({
        code: 'custom',
        path: ['appliedEvents'],
        message: 'Applied event history must end at the projection sequence.',
      });
    }
  });

export function parseWorldProjection(input: unknown): WorldProjection {
  return WorldProjectionSchema.parse(input) as WorldProjection;
}
