import { z } from 'zod';

import {
  DateTimeSchema,
  EntityIdSchema,
  hasExactlyKeys,
  MissionVerbSchema,
  ProbabilityDistributionSchema,
  ProbabilityRangeSchema,
  SimulationSpeedSchema,
} from './common.js';

export const AgentBeliefSchema = z
  .strictObject({
    probabilities: ProbabilityDistributionSchema,
    uncertainty: z.record(EntityIdSchema, ProbabilityRangeSchema).optional(),
    updatedAt: DateTimeSchema,
    rationale: z.string().min(1),
    evidenceSignalIds: z.array(EntityIdSchema),
  })
  .superRefine((belief, context) => {
    if (
      belief.uncertainty &&
      !hasExactlyKeys(belief.uncertainty, Object.keys(belief.probabilities))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['uncertainty'],
        message: 'Uncertainty keys must exactly match belief probability keys.',
      });
    }
  });

export const AgentMovementSchema = z.strictObject({
  routeId: EntityIdSchema,
  fromPlaceId: EntityIdSchema,
  toPlaceId: EntityIdSchema,
  startedAt: DateTimeSchema,
  endsAt: DateTimeSchema,
  progress: z.number().min(0).max(1),
});

export const AgentSchema = z
  .strictObject({
    id: EntityIdSchema,
    displayName: z.string().min(1),
    role: z.enum(['scout', 'archivist', 'analyst', 'skeptic', 'liaison']),
    profileVersion: z.number().int().positive(),
    placeId: EntityIdSchema,
    movement: AgentMovementSchema.optional(),
    activeMissionId: EntityIdSchema.optional(),
    queuedMissionIds: z.array(EntityIdSchema),
    knownSourceIds: z.array(EntityIdSchema),
    knownSignalIds: z.array(EntityIdSchema),
    belief: AgentBeliefSchema,
    publicState: z.enum(['idle', 'traveling', 'working', 'meeting', 'error']),
    codexSessionId: z.string().min(1).optional(),
    lastTurnAt: DateTimeSchema.optional(),
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/agent-state.schema.json',
    title: 'Signal Atlas Agent State',
  });

export const MissionSchema = z
  .strictObject({
    id: EntityIdSchema,
    expeditionId: EntityIdSchema,
    assignedAgentId: EntityIdSchema,
    verb: MissionVerbSchema,
    objective: z.string().min(1),
    destinationPlaceId: EntityIdSchema.optional(),
    targetAgentIds: z.array(EntityIdSchema).optional(),
    sourceIds: z.array(EntityIdSchema).optional(),
    signalIds: z.array(EntityIdSchema).optional(),
    budget: z.strictObject({
      maxToolCalls: z.number().int().nonnegative(),
      timeoutMs: z.number().int().positive(),
    }),
    status: z.enum(['draft', 'queued', 'traveling', 'running', 'completed', 'failed', 'canceled']),
    createdBy: z.strictObject({
      kind: z.enum(['player', 'agent', 'system']),
      id: EntityIdSchema.optional(),
    }),
    createdAt: DateTimeSchema,
    startedAt: DateTimeSchema.optional(),
    completedAt: DateTimeSchema.optional(),
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/mission.schema.json',
    title: 'Signal Atlas Mission',
  });

export const ExpeditionSettingsSchema = z.strictObject({
  fixtureMode: z.boolean(),
  reducedMotion: z.boolean(),
  autoCamera: z.boolean(),
  autonomy: z.enum(['manual', 'suggest', 'bounded_auto', 'theater']),
});

export const ExpeditionSchema = z
  .strictObject({
    id: EntityIdSchema,
    marketId: EntityIdSchema,
    worldManifestId: EntityIdSchema,
    title: z.string().min(1),
    mode: z.enum(['director', 'observatory', 'analyst', 'replay']),
    status: z.enum(['setup', 'active', 'paused', 'resolved', 'archived']),
    simulationSpeed: SimulationSpeedSchema,
    currentSequence: z.number().int().nonnegative(),
    startedAt: DateTimeSchema.optional(),
    endedAt: DateTimeSchema.optional(),
    settings: ExpeditionSettingsSchema,
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/expedition.schema.json',
    title: 'Signal Atlas Expedition',
  });

export const BeliefUpdateSchema = z
  .strictObject({
    id: EntityIdSchema,
    expeditionId: EntityIdSchema,
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
    createdAt: DateTimeSchema,
  })
  .superRefine((update, context) => {
    const outcomeIds = Object.keys(update.newProbabilities);
    if (!hasExactlyKeys(update.previousProbabilities, outcomeIds)) {
      context.addIssue({
        code: 'custom',
        path: ['previousProbabilities'],
        message: 'Previous and new probability keys must match exactly.',
      });
    }
    if (update.uncertainty && !hasExactlyKeys(update.uncertainty, outcomeIds)) {
      context.addIssue({
        code: 'custom',
        path: ['uncertainty'],
        message: 'Uncertainty keys must exactly match new probability keys.',
      });
    }
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/belief-update.schema.json',
    title: 'Signal Atlas Belief Update',
  });

export const ForecastCommitSchema = BeliefUpdateSchema.safeExtend({
  commitType: z.enum(['initial', 'revision', 'hold', 'final']),
  publicNote: z.string().trim().min(1).max(280),
  privateMemo: z.string().min(1).optional(),
  scoringEligible: z.boolean(),
}).meta({
  id: 'https://signal-atlas.local/schemas/forecast-commit.schema.json',
  title: 'Signal Atlas Forecast Commit',
});

export type AgentBelief = z.infer<typeof AgentBeliefSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type Expedition = z.infer<typeof ExpeditionSchema>;
export type BeliefUpdate = z.infer<typeof BeliefUpdateSchema>;
export type ForecastCommit = z.infer<typeof ForecastCommitSchema>;
