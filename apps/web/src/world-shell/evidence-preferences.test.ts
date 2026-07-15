import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  emptyEvidencePreferences,
  readEvidencePreferences,
  writeEvidencePreferences,
} from './evidence-preferences.js';

afterEach(() => vi.unstubAllGlobals());

describe('expedition evidence preferences', () => {
  it('persists selected evidence only inside its expedition namespace', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const alpha = {
      ...structuredClone(emptyEvidencePreferences),
      pinnedSignalIds: ['signal-alpha'],
      caseFileEntryIds: ['signal:signal-alpha'],
    };

    writeEvidencePreferences('exp-alpha', alpha);

    expect(readEvidencePreferences('exp-alpha')).toEqual(alpha);
    expect(readEvidencePreferences('exp-beta')).toEqual(emptyEvidencePreferences);
    expect([...values.keys()]).toEqual(['signal-atlas:evidence-preferences:v2:exp-alpha']);
  });

  it('fails open with empty non-authoritative preferences when storage is unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new DOMException('Storage denied', 'SecurityError');
        },
      },
    });

    expect(readEvidencePreferences('exp-unavailable')).toEqual(emptyEvidencePreferences);
  });
});
