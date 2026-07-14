import { z } from 'zod';

import {
  ContentHashSchema,
  DateTimeSchema,
  EntityIdSchema,
  ProbabilityPointRangeSchema,
} from './common.js';

export const GeoSemanticLocationSchema = z.strictObject({
  placeId: EntityIdSchema.optional(),
  label: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const SourceRightsSchema = z.strictObject({
  display: z.enum(['full', 'excerpt', 'metadata_only', 'link_only']),
  license: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export const PrefProvenanceSchema = z.strictObject({
  serverName: z.string().min(1),
  transport: z.enum(['stdio', 'streamable_http', 'fixture']),
  primitive: z.enum(['tool', 'resource', 'prompt', 'fixture']),
  primitiveName: z.string().min(1),
  argumentsHash: ContentHashSchema.optional(),
  responseHash: ContentHashSchema,
  callId: EntityIdSchema.optional(),
});

export const SourceRecordSchema = z
  .strictObject({
    id: EntityIdSchema,
    version: z.number().int().positive(),
    externalUri: z.string().min(1).optional(),
    title: z.string().min(1),
    publisher: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    sourceClass: z.enum([
      'official_primary',
      'primary',
      'secondary',
      'commentary',
      'sensor',
      'market',
      'archive',
      'user_supplied',
    ]),
    publishedAt: DateTimeSchema.optional(),
    observedAt: DateTimeSchema.nullable().optional(),
    retrievedAt: DateTimeSchema,
    location: GeoSemanticLocationSchema.optional(),
    mediaType: z.string().min(1).optional(),
    excerpt: z.string().min(1).optional(),
    structuredData: z.unknown().optional(),
    contentHash: ContentHashSchema,
    provenance: PrefProvenanceSchema,
    rights: SourceRightsSchema.optional(),
    supersedesSourceId: EntityIdSchema.optional(),
    tags: z.array(z.string().min(1)),
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/source-record.schema.json',
    title: 'Signal Atlas Source Record',
  });

export const ClaimSchema = z
  .strictObject({
    id: EntityIdSchema,
    text: z.string().min(1),
    sourceIds: z.array(EntityIdSchema).min(1),
    extractor: z.strictObject({
      kind: z.enum(['agent', 'system', 'player']),
      id: EntityIdSchema.optional(),
    }),
    qualifiers: z.array(z.string().min(1)),
    temporalScope: z
      .strictObject({
        startsAt: DateTimeSchema.optional(),
        endsAt: DateTimeSchema.optional(),
      })
      .optional(),
    status: z.enum(['active', 'disputed', 'superseded', 'retracted']),
    createdAt: DateTimeSchema,
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/claim.schema.json',
    title: 'Signal Atlas Claim',
  });

export const ReliabilityAssessmentSchema = z.strictObject({
  label: z.enum([
    'verified_primary',
    'primary_unconfirmed',
    'corroborated_secondary',
    'single_secondary',
    'derived',
    'unverified',
    'disputed',
  ]),
  reasons: z.array(z.string().min(1)).min(1),
  assessedBy: z.strictObject({
    kind: z.enum(['system', 'agent', 'player']),
    id: EntityIdSchema.optional(),
  }),
});

export const FreshnessAssessmentSchema = z.strictObject({
  referenceTime: DateTimeSchema,
  usefulUntil: DateTimeSchema.optional(),
  label: z.enum(['fresh', 'aging', 'stale', 'timeless', 'unknown']),
  newerSourceId: EntityIdSchema.optional(),
});

export const SignalSchema = z
  .strictObject({
    id: EntityIdSchema,
    marketId: EntityIdSchema,
    claimIds: z.array(EntityIdSchema).min(1),
    sourceIds: z.array(EntityIdSchema).min(1),
    headline: z.string().min(1),
    summary: z.string().min(1),
    direction: z.enum(['supports_outcome', 'opposes_outcome', 'context']),
    targetOutcomeId: EntityIdSchema.optional(),
    impact: z.strictObject({
      label: z.enum(['small', 'medium', 'large', 'unknown']),
      probabilityPointRange: ProbabilityPointRangeSchema.optional(),
    }),
    reliability: ReliabilityAssessmentSchema,
    freshness: FreshnessAssessmentSchema,
    correlationGroupIds: z.array(EntityIdSchema),
    discoveredByAgentId: EntityIdSchema.optional(),
    createdAt: DateTimeSchema,
    status: z.enum(['active', 'stale', 'disputed', 'superseded', 'irrelevant']),
  })
  .superRefine((signal, context) => {
    if (signal.direction !== 'context' && !signal.targetOutcomeId) {
      context.addIssue({
        code: 'custom',
        path: ['targetOutcomeId'],
        message: 'Directional signals must identify the target outcome.',
      });
    }
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/signal.schema.json',
    title: 'Signal Atlas Signal',
  });

export const AgentKnowledgeSchema = z
  .strictObject({
    agentId: EntityIdSchema,
    objectType: z.enum(['source', 'signal', 'claim', 'memo']),
    objectId: EntityIdSchema,
    acquiredAt: DateTimeSchema,
    acquisition: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('retrieved'), missionId: EntityIdSchema }),
      z.strictObject({
        kind: z.literal('shared'),
        fromAgentId: EntityIdSchema,
        meetingId: EntityIdSchema.optional(),
      }),
      z.strictObject({ kind: z.literal('archive'), placeId: EntityIdSchema }),
      z.strictObject({ kind: z.literal('system'), reason: z.string().min(1) }),
    ]),
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/agent-knowledge.schema.json',
    title: 'Signal Atlas Agent Knowledge Edge',
  });

export const CorrelationRecordSchema = z.strictObject({
  id: EntityIdSchema,
  signalIds: z.array(EntityIdSchema).min(2),
  relationship: z.enum(['duplicate', 'derivative', 'same_event', 'possibly_correlated']),
  reasons: z.array(z.string().min(1)).min(1),
  assessedAt: DateTimeSchema,
});

export type GeoSemanticLocation = z.infer<typeof GeoSemanticLocationSchema>;
export type SourceRecord = z.infer<typeof SourceRecordSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type AgentKnowledge = z.infer<typeof AgentKnowledgeSchema>;
export type CorrelationRecord = z.infer<typeof CorrelationRecordSchema>;
