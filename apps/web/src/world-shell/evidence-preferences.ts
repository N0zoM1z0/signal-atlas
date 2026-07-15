export interface EvidencePreferences {
  pinnedSignalIds: string[];
  caseFileEntryIds: string[];
  archivedSignalIds: string[];
  seenSignalIds: string[];
}

function storageKey(expeditionId: string): string {
  return `signal-atlas:evidence-preferences:v2:${encodeURIComponent(expeditionId)}`;
}

export const emptyEvidencePreferences: EvidencePreferences = {
  pinnedSignalIds: [],
  caseFileEntryIds: [],
  archivedSignalIds: [],
  seenSignalIds: [],
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : [];
}

export function readEvidencePreferences(expeditionId: string): EvidencePreferences {
  if (typeof window === 'undefined') return structuredClone(emptyEvidencePreferences);
  try {
    const stored = window.localStorage.getItem(storageKey(expeditionId));
    if (!stored) return structuredClone(emptyEvidencePreferences);
    const parsed = JSON.parse(stored) as Partial<Record<keyof EvidencePreferences, unknown>>;
    return {
      pinnedSignalIds: stringArray(parsed.pinnedSignalIds),
      caseFileEntryIds: stringArray(parsed.caseFileEntryIds),
      archivedSignalIds: stringArray(parsed.archivedSignalIds),
      seenSignalIds: stringArray(parsed.seenSignalIds),
    };
  } catch {
    return structuredClone(emptyEvidencePreferences);
  }
}

export function writeEvidencePreferences(
  expeditionId: string,
  preferences: EvidencePreferences,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(expeditionId), JSON.stringify(preferences));
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
