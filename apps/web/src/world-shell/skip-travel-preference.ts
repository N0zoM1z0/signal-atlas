const storageKey = 'signal-atlas:skip-travel';

export function readSkipTravelPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

export function writeSkipTravelPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, String(enabled));
  } catch {
    // This preference is non-authoritative; the in-memory toggle remains usable without storage.
  }
}
