import type { WorldManifest } from '@signal-atlas/contracts';

export interface RouteLeg {
  routeId: string;
  fromPlaceId: string;
  toPlaceId: string;
  durationMs: number;
  waypoints: Array<{ x: number; y: number }>;
}

export interface RoutePlan {
  fromPlaceId: string;
  toPlaceId: string;
  durationMs: number;
  legs: RouteLeg[];
}

interface CandidatePath {
  placeId: string;
  durationMs: number;
  key: string;
  legs: RouteLeg[];
}

function comparePaths(left: CandidatePath, right: CandidatePath): number {
  return left.durationMs - right.durationMs || left.key.localeCompare(right.key);
}

/** Select the deterministic minimum-duration path, using route IDs to break equal-cost ties. */
export function selectRoutePlan(
  manifest: WorldManifest,
  fromPlaceId: string,
  toPlaceId: string,
): RoutePlan | undefined {
  const placeIds = new Set(manifest.places.map((place) => place.id));
  if (!placeIds.has(fromPlaceId) || !placeIds.has(toPlaceId)) return undefined;
  if (fromPlaceId === toPlaceId) {
    return { fromPlaceId, toPlaceId, durationMs: 0, legs: [] };
  }

  const frontier: CandidatePath[] = [{ placeId: fromPlaceId, durationMs: 0, key: '', legs: [] }];
  const bestByPlace = new Map<string, Pick<CandidatePath, 'durationMs' | 'key'>>();

  while (frontier.length > 0) {
    frontier.sort(comparePaths);
    const current = frontier.shift();
    if (!current) break;
    const known = bestByPlace.get(current.placeId);
    if (
      known &&
      (known.durationMs < current.durationMs ||
        (known.durationMs === current.durationMs && known.key <= current.key))
    ) {
      continue;
    }
    bestByPlace.set(current.placeId, { durationMs: current.durationMs, key: current.key });
    if (current.placeId === toPlaceId) {
      return {
        fromPlaceId,
        toPlaceId,
        durationMs: current.durationMs,
        legs: current.legs,
      };
    }

    const edges: RouteLeg[] = [];
    for (const route of manifest.routes) {
      if (route.fromPlaceId === current.placeId) {
        edges.push({
          routeId: route.id,
          fromPlaceId: route.fromPlaceId,
          toPlaceId: route.toPlaceId,
          durationMs: route.baseDurationMs,
          waypoints: route.waypoints.map((point) => ({ ...point })),
        });
      }
      if (route.bidirectional && route.toPlaceId === current.placeId) {
        edges.push({
          routeId: route.id,
          fromPlaceId: route.toPlaceId,
          toPlaceId: route.fromPlaceId,
          durationMs: route.baseDurationMs,
          waypoints: [...route.waypoints].reverse().map((point) => ({ ...point })),
        });
      }
    }

    edges.sort((left, right) => left.routeId.localeCompare(right.routeId));
    for (const edge of edges) {
      const key = current.key ? `${current.key}>${edge.routeId}` : edge.routeId;
      const candidate: CandidatePath = {
        placeId: edge.toPlaceId,
        durationMs: current.durationMs + edge.durationMs,
        key,
        legs: [...current.legs, edge],
      };
      const best = bestByPlace.get(edge.toPlaceId);
      if (
        !best ||
        candidate.durationMs < best.durationMs ||
        (candidate.durationMs === best.durationMs && candidate.key < best.key)
      ) {
        frontier.push(candidate);
      }
    }
  }

  return undefined;
}
