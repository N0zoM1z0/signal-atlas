import { z } from 'zod';

import {
  DateTimeSchema,
  EntityIdSchema,
  MissionVerbSchema,
  ProbabilityDistributionSchema,
  ProbabilityRangeSchema,
  SCHEMA_VERSION,
} from './common.js';
import { MissionSchema } from './agents.js';

export const AgentTurnInputSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    turnId: EntityIdSchema,
    expeditionId: EntityIdSchema,
    agentId: EntityIdSchema,
    mission: MissionSchema,
    effectivePlaceId: EntityIdSchema,
    attempt: z.number().int().positive(),
    knownSourceIds: z.array(EntityIdSchema),
    knownSignalIds: z.array(EntityIdSchema),
    allowedCapabilities: z.array(z.string().min(1)),
    requestedAt: DateTimeSchema,
    timeoutMs: z.number().int().positive(),
  })
  .superRefine((input, context) => {
    if (input.mission.expeditionId !== input.expeditionId) {
      context.addIssue({
        code: 'custom',
        path: ['mission', 'expeditionId'],
        message: 'Turn mission must belong to the input expedition.',
      });
    }
    if (input.mission.assignedAgentId !== input.agentId) {
      context.addIssue({
        code: 'custom',
        path: ['mission', 'assignedAgentId'],
        message: 'Turn mission must be assigned to the input agent.',
      });
    }
    if (new Set(input.knownSourceIds).size !== input.knownSourceIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['knownSourceIds'],
        message: 'Known source IDs must be unique.',
      });
    }
    if (new Set(input.knownSignalIds).size !== input.knownSignalIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['knownSignalIds'],
        message: 'Known signal IDs must be unique.',
      });
    }
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/agent-turn-input.schema.json',
    title: 'Signal Atlas Agent Turn Input',
  });

export const AgentTurnActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('wait'), reason: z.string().min(1) }),
  z.strictObject({ type: z.literal('move'), destinationPlaceId: EntityIdSchema }),
  z.strictObject({
    type: z.literal('investigate'),
    capability: z.string().min(1),
    query: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('share_signal'),
    targetAgentId: EntityIdSchema,
    signalIds: z.array(EntityIdSchema).min(1),
  }),
  z.strictObject({
    type: z.literal('request_mission'),
    verb: MissionVerbSchema,
    objective: z.string().min(1),
    destinationPlaceId: EntityIdSchema.optional(),
  }),
  z.strictObject({
    type: z.literal('update_belief'),
    probabilities: ProbabilityDistributionSchema,
    uncertainty: z.record(EntityIdSchema, ProbabilityRangeSchema).optional(),
  }),
]);

export const ProposedClaimSchema = z.strictObject({
  text: z.string().min(1),
  sourceIds: z.array(EntityIdSchema).min(1),
  qualifiers: z.array(z.string().min(1)),
});

export const ProposedSignalSchema = z.strictObject({
  headline: z.string().min(1),
  summary: z.string().min(1),
  claimIndexes: z.array(z.number().int().nonnegative()).min(1),
  sourceIds: z.array(EntityIdSchema).min(1),
  direction: z.enum(['supports_outcome', 'opposes_outcome', 'context']),
  targetOutcomeId: EntityIdSchema.optional(),
  impactLabel: z.enum(['small', 'medium', 'large', 'unknown']),
});

export const AgentTurnOutputSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    agentId: EntityIdSchema,
    missionId: EntityIdSchema,
    action: AgentTurnActionSchema,
    publicDialogue: z.string().min(1).max(400),
    sourceIdsUsed: z.array(EntityIdSchema),
    proposedClaims: z.array(ProposedClaimSchema),
    proposedSignals: z.array(ProposedSignalSchema),
    rationale: z.string().min(1).max(320),
    assumptions: z.array(z.string().min(1)),
    unknowns: z.array(z.string().min(1)).min(1).max(6),
    suggestedFollowUp: z
      .strictObject({
        verb: MissionVerbSchema,
        objective: z.string().min(1),
        destinationPlaceId: EntityIdSchema.optional(),
      })
      .optional(),
  })
  .superRefine((output, context) => {
    const declaredSourceIds = new Set(output.sourceIdsUsed);

    output.proposedClaims.forEach((claim, claimIndex) => {
      claim.sourceIds.forEach((sourceId, sourceIndex) => {
        if (!declaredSourceIds.has(sourceId)) {
          context.addIssue({
            code: 'custom',
            path: ['proposedClaims', claimIndex, 'sourceIds', sourceIndex],
            message: 'Proposed claims may only cite sources declared in sourceIdsUsed.',
          });
        }
      });
    });

    output.proposedSignals.forEach((signal, signalIndex) => {
      signal.sourceIds.forEach((sourceId, sourceIndex) => {
        if (!declaredSourceIds.has(sourceId)) {
          context.addIssue({
            code: 'custom',
            path: ['proposedSignals', signalIndex, 'sourceIds', sourceIndex],
            message: 'Proposed signals may only cite sources declared in sourceIdsUsed.',
          });
        }
      });

      signal.claimIndexes.forEach((claimIndex, index) => {
        const claim = output.proposedClaims[claimIndex];
        if (!claim) {
          context.addIssue({
            code: 'custom',
            path: ['proposedSignals', signalIndex, 'claimIndexes', index],
            message: 'Proposed signal references a claim index that does not exist in this output.',
          });
          return;
        }

        claim.sourceIds.forEach((sourceId) => {
          if (!signal.sourceIds.includes(sourceId)) {
            context.addIssue({
              code: 'custom',
              path: ['proposedSignals', signalIndex, 'sourceIds'],
              message: `Proposed signal must include source ${sourceId} used by claim ${claimIndex}.`,
            });
          }
        });
      });
      if (signal.direction !== 'context' && !signal.targetOutcomeId) {
        context.addIssue({
          code: 'custom',
          path: ['proposedSignals', signalIndex, 'targetOutcomeId'],
          message: 'Directional proposed signals must identify the target outcome.',
        });
      }
    });
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/agent-turn-output.schema.json',
    title: 'Signal Atlas Agent Turn Output',
  });

export type AgentTurnAction = z.infer<typeof AgentTurnActionSchema>;
export type AgentTurnInput = z.infer<typeof AgentTurnInputSchema>;
export type AgentTurnOutput = z.infer<typeof AgentTurnOutputSchema>;
