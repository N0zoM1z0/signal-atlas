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

    expect(readSkipTravelPreference('exp-storage-denied')).toBe(false);
  });

  it('does not throw when an in-memory change cannot be persisted', () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new DOMException('Storage denied', 'SecurityError');
        },
      },
    });

    expect(() => writeSkipTravelPreference('exp-storage-denied', true)).not.toThrow();
  });

  it('keeps the same preference independent across expeditions', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    writeSkipTravelPreference('exp-alpha', true);
    expect(readSkipTravelPreference('exp-alpha')).toBe(true);
    expect(readSkipTravelPreference('exp-beta')).toBe(false);
  });
});
