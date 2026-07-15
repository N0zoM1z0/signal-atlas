import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { replayFixture } from '@signal-atlas/simulation';
import { describe, expect, it } from 'vitest';

import { chooseLatestProjection } from './projection-state.js';

describe('authoritative projection installation', () => {
  it('rejects a delayed snapshot after the event stream has installed a newer sequence', () => {
    const fixture = createHelios3ExpeditionFixture();
    const older = replayFixture(fixture, 1).projection;
    const newer = replayFixture(fixture).projection;

    expect(chooseLatestProjection(newer, older)).toBe(newer);
    expect(chooseLatestProjection(older, newer)).toBe(newer);
  });
});
