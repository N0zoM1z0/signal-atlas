import { z } from 'zod';

import { EntityIdSchema } from './common.js';
import { ExpeditionFixtureSchema } from './fixture.js';

export const SCENARIO_DEFINITION_SCHEMA_VERSION = 1 as const;

export const ScenarioPreviewSchema = z.strictObject({
  template: z.string().min(1),
  assetPack: z.string().min(1),
  regionLabel: z.string().min(1),
  tagline: z.string().min(1).max(180),
});

export const ScenarioMetadataSchema = z.strictObject({
  id: EntityIdSchema,
  version: z.number().int().positive(),
  title: z.string().min(1),
  category: z.enum([
    'science_technology',
    'climate_infrastructure',
    'economics_policy',
    'civic_official_records',
    'other_research',
  ]),
  summary: z.string().min(1).max(600),
  mode: z.enum(['fixture', 'historical_challenge', 'live_import']),
  requiredCapabilities: z.array(EntityIdSchema),
  availabilityPolicy: z.enum(['offline_ready', 'live_optional']),
  primaryOutcomeId: EntityIdSchema,
  preview: ScenarioPreviewSchema,
});

export const ScenarioDefinitionSchema = z
  .strictObject({
    definitionSchemaVersion: z.literal(SCENARIO_DEFINITION_SCHEMA_VERSION),
    scenario: ScenarioMetadataSchema,
    fixture: ExpeditionFixtureSchema,
  })
  .superRefine((definition, context) => {
    const { fixture, scenario } = definition;
    if (new Set(scenario.requiredCapabilities).size !== scenario.requiredCapabilities.length) {
      context.addIssue({
        code: 'custom',
        path: ['scenario', 'requiredCapabilities'],
        message: 'Required canonical capabilities must be unique.',
      });
    }

    const boundCapabilities = new Set(
      fixture.worldManifest.places.flatMap((place) =>
        place.capabilityBindings.map((binding) => binding.canonicalCapability),
      ),
    );
    scenario.requiredCapabilities.forEach((capability, index) => {
      if (!boundCapabilities.has(capability)) {
        context.addIssue({
          code: 'custom',
          path: ['scenario', 'requiredCapabilities', index],
          message: `Required capability is not bound to an authored place: ${capability}.`,
        });
      }
    });

    if (scenario.preview.template !== fixture.worldManifest.template) {
      context.addIssue({
        code: 'custom',
        path: ['scenario', 'preview', 'template'],
        message: 'Scenario preview template must match the fixture world manifest.',
      });
    }
    if (scenario.preview.assetPack !== fixture.worldManifest.assetPack) {
      context.addIssue({
        code: 'custom',
        path: ['scenario', 'preview', 'assetPack'],
        message: 'Scenario preview asset pack must match the fixture world manifest.',
      });
    }

    const primaryOutcome = fixture.market.outcomes[0];
    if (scenario.primaryOutcomeId !== primaryOutcome?.id) {
      context.addIssue({
        code: 'custom',
        path: ['scenario', 'primaryOutcomeId'],
        message:
          'The scenario primary outcome must be the first authored outcome while the market contract is binary.',
      });
    }
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/scenario-definition.schema.json',
    title: 'Signal Atlas Scenario Definition',
  });

export function parseScenarioDefinition(input: unknown): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse(input);
}

export type ScenarioPreview = z.infer<typeof ScenarioPreviewSchema>;
export type ScenarioMetadata = z.infer<typeof ScenarioMetadataSchema>;
export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;
