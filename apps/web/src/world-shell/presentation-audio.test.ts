import { describe, expect, it } from 'vitest';

import { cueToneFrequency } from './presentation-audio.js';

describe('original synthesized presentation audio', () => {
  it('uses one finite local tone for every visible cue kind', () => {
    expect(Object.keys(cueToneFrequency).sort()).toEqual([
      'arrival',
      'complete',
      'error',
      'signal',
      'work',
    ]);
    expect(
      Object.values(cueToneFrequency).every((frequency) => frequency >= 220 && frequency <= 880),
    ).toBe(true);
  });
});
