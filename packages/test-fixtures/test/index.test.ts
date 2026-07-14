import { describe, expect, it } from 'vitest';

import { createHelios3ExpeditionFixture, helios3ExpeditionFixture } from '../src/index.js';

describe('Helios-3 typed fixture loader', () => {
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
});
