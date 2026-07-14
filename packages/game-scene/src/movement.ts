export interface ScenePoint {
  x: number;
  y: number;
}

export function pointAlongWaypoints(
  waypoints: readonly ScenePoint[],
  progress: number,
): ScenePoint | undefined {
  if (waypoints.length === 0) return undefined;
  if (waypoints.length === 1) return { ...waypoints[0]! };
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const segments = waypoints.slice(0, -1).map((start, index) => {
    const end = waypoints[index + 1]!;
    return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength === 0) return { ...waypoints[0]! };
  let remaining = totalLength * clampedProgress;
  for (const segment of segments) {
    if (remaining <= segment.length || segment === segments.at(-1)) {
      const ratio = segment.length === 0 ? 0 : Math.min(1, remaining / segment.length);
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remaining -= segment.length;
  }
  return { ...waypoints.at(-1)! };
}
