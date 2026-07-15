import fixtureJson from '../../../fixtures/helios3_expedition.json' with { type: 'json' };
import northlightFixtureJson from '../../../fixtures/northlight_harbor_expedition.json' with { type: 'json' };

import { ExpeditionFixtureSchema, type ExpeditionFixture } from '@signal-atlas/contracts';

/**
 * Validated, immutable-authoring input for deterministic Signal Atlas tests and fixture mode.
 * Consumers should clone this value before simulating mutable projections.
 */
export const helios3ExpeditionFixture: ExpeditionFixture =
  ExpeditionFixtureSchema.parse(fixtureJson);

export function createHelios3ExpeditionFixture(): ExpeditionFixture {
  return structuredClone(helios3ExpeditionFixture);
}

export const northlightHarborExpeditionFixture: ExpeditionFixture =
  ExpeditionFixtureSchema.parse(northlightFixtureJson);

export function createNorthlightHarborExpeditionFixture(): ExpeditionFixture {
  return structuredClone(northlightHarborExpeditionFixture);
}
