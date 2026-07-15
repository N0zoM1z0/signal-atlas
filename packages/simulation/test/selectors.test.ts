import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { signalDirectionRelativeToOutcome } from '../src/selectors.js';

describe('outcome-relative signal direction', () => {
  it('interprets support and opposition to either opaque binary outcome', () => {
    const fixture = createHelios3ExpeditionFixture();
    fixture.market.outcomes = [
      { id: 'suspended', label: 'Suspended', shortLabel: 'SUSPENDED' },
      { id: 'operating', label: 'Operating', shortLabel: 'OPERATING' },
    ];
    const signal = structuredClone(fixture.signals[0]);
    if (!signal) throw new Error('Expected one fixture signal.');

    signal.direction = 'supports_outcome';
    signal.targetOutcomeId = 'operating';
    expect(signalDirectionRelativeToOutcome(signal, 'suspended', fixture.market)).toBe('opposes');

    signal.direction = 'opposes_outcome';
    expect(signalDirectionRelativeToOutcome(signal, 'suspended', fixture.market)).toBe('supports');
    expect(signalDirectionRelativeToOutcome(signal, 'operating', fixture.market)).toBe('opposes');
  });
});
