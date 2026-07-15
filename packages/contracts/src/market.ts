import { z } from 'zod';

import {
  DateTimeSchema,
  EntityIdSchema,
  hasExactlyKeys,
  ProbabilityDistributionSchema,
} from './common.js';

export const MarketOutcomeSchema = z.strictObject({
  id: EntityIdSchema,
  label: z.string().min(1),
  shortLabel: z.string().min(1).max(16),
  description: z.string().min(1).optional(),
});

export const MarketSchema = z
  .strictObject({
    id: EntityIdSchema,
    externalId: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    question: z.string().min(1),
    description: z.string().min(1).optional(),
    outcomes: z.array(MarketOutcomeSchema).length(2),
    resolutionRules: z.string().min(1),
    resolutionSource: z.string().min(1).optional(),
    opensAt: DateTimeSchema.optional(),
    closesAt: DateTimeSchema.optional(),
    resolvesAt: DateTimeSchema.optional(),
    status: z.enum(['draft', 'open', 'closed', 'resolved', 'void']),
    currentPublicProbabilities: ProbabilityDistributionSchema.optional(),
    resolvedOutcomeId: EntityIdSchema.optional(),
    tags: z.array(z.string().min(1)),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  })
  .superRefine((market, context) => {
    const outcomeIds = market.outcomes.map((outcome) => outcome.id);
    if (new Set(outcomeIds).size !== outcomeIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['outcomes'],
        message: 'Market outcome IDs must be unique.',
      });
    }

    if (
      market.currentPublicProbabilities &&
      !hasExactlyKeys(market.currentPublicProbabilities, outcomeIds)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['currentPublicProbabilities'],
        message: 'Public probability keys must exactly match the market outcome IDs.',
      });
    }

    if (market.resolvedOutcomeId && !outcomeIds.includes(market.resolvedOutcomeId)) {
      context.addIssue({
        code: 'custom',
        path: ['resolvedOutcomeId'],
        message: 'Resolved outcome must reference an outcome in this market.',
      });
    }
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/market.schema.json',
    title: 'Signal Atlas Market',
  });

export type MarketOutcome = z.infer<typeof MarketOutcomeSchema>;
export type Market = z.infer<typeof MarketSchema>;

export interface BinaryMarketOutcomes {
  primary: MarketOutcome;
  secondary: MarketOutcome;
}

/**
 * Returns the authored display order for the currently binary market contract.
 *
 * Outcome IDs are deliberately opaque. Callers must never assume that they are `yes` and `no`;
 * the first outcome is the primary probability displayed by the binary forecast control.
 */
export function binaryMarketOutcomes(market: Market): BinaryMarketOutcomes {
  const primary = market.outcomes[0];
  const secondary = market.outcomes[1];
  if (!primary || !secondary) {
    throw new Error(`Market ${market.id} does not contain the required binary outcome pair.`);
  }
  return { primary, secondary };
}
