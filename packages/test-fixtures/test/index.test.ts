import { describe, expect, it } from 'vitest';

import {
  createHelios3ExpeditionFixture,
  createNorthlightHarborExpeditionFixture,
  helios3ExpeditionFixture,
  northlightHarborExpeditionFixture,
} from '../src/index.js';

describe('typed expedition fixture loaders', () => {
  it('exports validated fixture data and returns isolated mutable clones', () => {
    const first = createHelios3ExpeditionFixture();
    const second = createHelios3ExpeditionFixture();

    expect(first).toEqual(helios3ExpeditionFixture);
    expect(first).not.toBe(helios3ExpeditionFixture);
    expect(first).not.toBe(second);

    first.expedition.simulationSpeed = 4;
    expect(second.expedition.simulationSpeed).toBe(1);
    expect(helios3ExpeditionFixture.expedition.simulationSpeed).toBe(1);
  });

  it('exposes an isolated Northlight Harbor clone with opaque outcome IDs', () => {
    const clone = createNorthlightHarborExpeditionFixture();

    expect(clone).not.toBe(northlightHarborExpeditionFixture);
    expect(clone.market.outcomes.map(({ id }) => id)).toEqual(['suspended', 'operating']);
    expect(clone.worldManifest.template).toBe('coastal-harbor');
    clone.market.question = 'mutated';
    expect(northlightHarborExpeditionFixture.market.question).not.toBe('mutated');
  });
});
