import { describe, expect, it } from 'vitest';

import { calculateBrierScore, IllegalTransitionError } from '../src/index.js';
import { fixture } from './helpers.js';

describe('Brier scoring', () => {
  it('scores a forecast against the authored resolved fixture outcome', () => {
    const result = calculateBrierScore(
      { yes: 0.48, no: 0.52 },
      fixture.resolutionFixture.resolvedOutcomeId,
    );

    expect(result).toEqual({
      brierScore: 0.4608,
      components: { yes: 0.2304, no: 0.2304 },
    });
  });

  it('rejects a resolution outcome missing from the forecast distribution', () => {
    expect(() => calculateBrierScore({ yes: 0.48, no: 0.52 }, 'canceled')).toThrow(
      IllegalTransitionError,
    );
  });
});
