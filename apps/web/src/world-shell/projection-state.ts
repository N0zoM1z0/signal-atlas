import type { WorldProjection } from '@signal-atlas/simulation';

/** Never let a delayed HTTP response roll the installed event projection backwards. */
export function chooseLatestProjection(
  current: WorldProjection,
  candidate: WorldProjection,
): WorldProjection {
  return candidate.sequence >= current.sequence ? candidate : current;
}
