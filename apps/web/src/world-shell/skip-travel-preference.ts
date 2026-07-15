function storageKey(expeditionId: string): string {
  return `signal-atlas:skip-travel:v2:${encodeURIComponent(expeditionId)}`;
}

export function readSkipTravelPreference(expeditionId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(storageKey(expeditionId)) === 'true';
  } catch {
    return false;
  }
}

export function writeSkipTravelPreference(expeditionId: string, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(expeditionId), String(enabled));
  } catch {
    // This preference is non-authoritative; the in-memory toggle remains usable without storage.
  }
}
