export interface EvidencePreferences {
  pinnedSignalIds: string[];
  archivedSignalIds: string[];
  seenSignalIds: string[];
}

const storageKey = 'signal-atlas:evidence-preferences:v1';

export const emptyEvidencePreferences: EvidencePreferences = {
  pinnedSignalIds: [],
  archivedSignalIds: [],
  seenSignalIds: [],
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : [];
}

export function readEvidencePreferences(): EvidencePreferences {
  if (typeof window === 'undefined') return structuredClone(emptyEvidencePreferences);
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return structuredClone(emptyEvidencePreferences);
    const parsed = JSON.parse(stored) as Partial<Record<keyof EvidencePreferences, unknown>>;
    return {
      pinnedSignalIds: stringArray(parsed.pinnedSignalIds),
      archivedSignalIds: stringArray(parsed.archivedSignalIds),
      seenSignalIds: stringArray(parsed.seenSignalIds),
    };
  } catch {
    return structuredClone(emptyEvidencePreferences);
  }
}

export function writeEvidencePreferences(preferences: EvidencePreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // Preferences are non-authoritative; an unavailable storage area must not block evidence use.
  }
}

export function toggleSignalId(ids: readonly string[], signalId: string): string[] {
  return ids.includes(signalId) ? ids.filter((id) => id !== signalId) : [...ids, signalId];
}

export function appendSignalId(ids: readonly string[], signalId: string): string[] {
  return ids.includes(signalId) ? [...ids] : [...ids, signalId];
}
