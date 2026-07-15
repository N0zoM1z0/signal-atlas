import { z } from 'zod';

import {
  DateTimeSchema,
  EntityIdSchema,
  MissionVerbSchema,
  ProbabilityDistributionSchema,
  ProbabilityRangeSchema,
  SCHEMA_VERSION,
} from './common.js';
import { MAX_MISSION_OBJECTIVE_LENGTH, MAX_MISSION_TIMEOUT_MS, MissionSchema } from './agents.js';
import { SourceRecordSchema } from './information.js';

export const AgentTurnEvidenceAttributeSchema = z.union([
  z.string().trim().min(1).max(1_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const AgentTurnEvidenceRoleSchema = z.enum(['direct', 'reference_class', 'context_only']);

export const AgentTurnEvidenceFactSchema = z
  .strictObject({
    kind: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/u),
    sourceIds: z.array(EntityIdSchema).min(1).max(20),
    statement: z.string().trim().min(1).max(1_200),
    attributes: z.record(z.string().trim().min(1).max(80), AgentTurnEvidenceAttributeSchema),
  })
  .superRefine((fact, context) => {
    if (new Set(fact.sourceIds).size !== fact.sourceIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['sourceIds'],
        message: 'Current-turn evidence fact source IDs must be unique.',
      });
    }
    if (Object.keys(fact.attributes).length > 24) {
      context.addIssue({
        code: 'custom',
        path: ['attributes'],
        message: 'Current-turn evidence facts may expose at most 24 bounded attributes.',
      });
    }
  });

export const AgentTurnEvidencePacketSchema = z
  .strictObject({
    capability: z.string().trim().min(1).max(120),
    evidenceRole: AgentTurnEvidenceRoleSchema,
    scopeNote: z.string().trim().min(1).max(500).optional(),
    callId: EntityIdSchema,
    argumentsHash: z.string().regex(/^[a-f0-9]{64}$/u),
    retrievedAt: DateTimeSchema,
    durationMs: z.number().int().nonnegative().max(MAX_MISSION_TIMEOUT_MS),
    cacheStatus: z.enum(['miss', 'fresh', 'stale']),
    sources: z.array(SourceRecordSchema).max(20),
    facts: z.array(AgentTurnEvidenceFactSchema).max(20),
  })
  .superRefine((packet, context) => {
    if (packet.evidenceRole === 'context_only' && !packet.scopeNote) {
      context.addIssue({
        code: 'custom',
        path: ['scopeNote'],
        message: 'Context-only current-turn evidence requires an explicit scope note.',
      });
    }
    const sourceIds = packet.sources.map((source) => source.id);
    const sourceIdSet = new Set(sourceIds);
    if (sourceIdSet.size !== sourceIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'Current-turn evidence source IDs must be unique.',
      });
    }
    packet.sources.forEach((source, index) => {
      if (source.structuredData !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['sources', index, 'structuredData'],
          message: 'Current-turn evidence packets must use bounded facts instead of nested data.',
        });
      }
      if (source.excerpt && source.excerpt.length > 1_200) {
        context.addIssue({
          code: 'custom',
          path: ['sources', index, 'excerpt'],
          message: 'Current-turn source excerpts may not exceed 1200 characters.',
        });
      }
      if (
        source.excerpt &&
        (!source.rights || !['full', 'excerpt'].includes(source.rights.display))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['sources', index, 'excerpt'],
          message: 'Current-turn source excerpts require explicit full or excerpt display rights.',
        });
      }
    });
    packet.facts.forEach((fact, factIndex) => {
      fact.sourceIds.forEach((sourceId, sourceIndex) => {
        if (!sourceIdSet.has(sourceId)) {
          context.addIssue({
            code: 'custom',
            path: ['facts', factIndex, 'sourceIds', sourceIndex],
            message: 'Current-turn evidence facts may cite only packet source IDs.',
          });
        }
      });
    });
    try {
      if (new TextEncoder().encode(JSON.stringify(packet)).byteLength > 128_000) {
        context.addIssue({
          code: 'custom',
          message: 'Current-turn evidence packet exceeds the 128000-byte boundary.',
        });
      }
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Current-turn evidence packet must be JSON serializable.',
      });
    }
  });

export const AgentTurnInputSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    turnId: EntityIdSchema,
    expeditionId: EntityIdSchema,
    agentId: EntityIdSchema,
    mission: MissionSchema,
    effectivePlaceId: EntityIdSchema,
    attempt: z.number().int().positive(),
    knownSourceIds: z.array(EntityIdSchema).max(256),
    knownSignalIds: z.array(EntityIdSchema).max(256),
    allowedCapabilities: z.array(z.string().min(1).max(120)).max(32),
    currentTurnEvidence: AgentTurnEvidencePacketSchema.optional(),
    requestedAt: DateTimeSchema,
    timeoutMs: z.number().int().positive().max(MAX_MISSION_TIMEOUT_MS),
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
    if (
      input.currentTurnEvidence &&
      !input.allowedCapabilities.includes(input.currentTurnEvidence.capability)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['currentTurnEvidence', 'capability'],
        message: 'Current-turn evidence capability must be allowed at the effective place.',
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
    objective: z.string().min(1).max(MAX_MISSION_OBJECTIVE_LENGTH),
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
        objective: z.string().min(1).max(MAX_MISSION_OBJECTIVE_LENGTH),
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
export type AgentTurnEvidenceAttribute = z.infer<typeof AgentTurnEvidenceAttributeSchema>;
export type AgentTurnEvidenceFact = z.infer<typeof AgentTurnEvidenceFactSchema>;
export type AgentTurnEvidencePacket = z.infer<typeof AgentTurnEvidencePacketSchema>;
export type AgentTurnEvidenceRole = z.infer<typeof AgentTurnEvidenceRoleSchema>;
export type AgentTurnInput = z.infer<typeof AgentTurnInputSchema>;
export type AgentTurnOutput = z.infer<typeof AgentTurnOutputSchema>;
