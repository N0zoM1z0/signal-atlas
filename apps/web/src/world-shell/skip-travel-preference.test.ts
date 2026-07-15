import { afterEach, describe, expect, it, vi } from 'vitest';

import { readSkipTravelPreference, writeSkipTravelPreference } from './skip-travel-preference.js';

describe('skip-travel preference storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to disabled when storage reads are unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new DOMException('Storage denied', 'SecurityError');
        },
      },
    });

    expect(readSkipTravelPreference()).toBe(false);
  });

  it('does not throw when an in-memory change cannot be persisted', () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new DOMException('Storage denied', 'SecurityError');
        },
      },
    });

    expect(() => writeSkipTravelPreference(true)).not.toThrow();
  });
});
