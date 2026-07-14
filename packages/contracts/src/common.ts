import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;
export const PROBABILITY_EPSILON = 1e-9;

export const EntityIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, 'Expected a stable identifier.');

export const DateTimeSchema = z.iso.datetime({ offset: true });
export const ContentHashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hash encoded as 64 hexadecimal characters.');

export const ProbabilitySchema = z.number().min(0).max(1);

export const ProbabilityDistributionSchema = z
  .record(EntityIdSchema, ProbabilitySchema)
  .superRefine((distribution, context) => {
    const entries = Object.entries(distribution);
    if (entries.length < 2) {
      context.addIssue({
        code: 'custom',
        message: 'A probability distribution requires at least two outcomes.',
      });
      return;
    }

    const sum = entries.reduce((total, [, probability]) => total + probability, 0);
    if (Math.abs(sum - 1) > PROBABILITY_EPSILON) {
      context.addIssue({
        code: 'custom',
        message: `Outcome probabilities must sum to 1; received ${sum}.`,
      });
    }
  });

export const ProbabilityRangeSchema = z
  .strictObject({
    low: ProbabilitySchema,
    high: ProbabilitySchema,
  })
  .superRefine((range, context) => {
    if (range.low > range.high) {
      context.addIssue({
        code: 'custom',
        path: ['low'],
        message: 'Range low value must be less than or equal to the high value.',
      });
    }
  });

export const ProbabilityPointRangeSchema = z
  .strictObject({
    low: z.number().min(-1).max(1),
    high: z.number().min(-1).max(1),
  })
  .superRefine((range, context) => {
    if (range.low > range.high) {
      context.addIssue({
        code: 'custom',
        path: ['low'],
        message: 'Impact range low value must be less than or equal to the high value.',
      });
    }
  });

export const SimulationSpeedSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(4),
]);

export const MissionVerbSchema = z.enum([
  'investigate',
  'verify',
  'search_history',
  'find_contradiction',
  'compare_sources',
  'observe_conditions',
  'meet_agent',
  'deliver_signal',
  'reassess_forecast',
  'consult_professor',
]);

export const ProfessorModeSchema = z.enum([
  'explain',
  'challenge',
  'compare',
  'base_rate',
  'missing_evidence',
  'correlation_check',
  'forecast_impact',
]);

export const ActorSchema = z.strictObject({
  kind: z.enum(['player', 'agent', 'system', 'pref', 'market']),
  id: EntityIdSchema.optional(),
});

export const UnknownRecordSchema = z.record(z.string(), z.unknown());

export function hasExactlyKeys(record: Record<string, unknown>, expectedKeys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export type ProbabilityDistribution = z.infer<typeof ProbabilityDistributionSchema>;
export type ProbabilityRange = z.infer<typeof ProbabilityRangeSchema>;
export type MissionVerb = z.infer<typeof MissionVerbSchema>;
export type ProfessorMode = z.infer<typeof ProfessorModeSchema>;
export type Actor = z.infer<typeof ActorSchema>;
