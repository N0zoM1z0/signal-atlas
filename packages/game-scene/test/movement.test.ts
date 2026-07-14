import { describe, expect, it } from 'vitest';

import { pointAlongWaypoints } from '../src/movement.js';

describe('route waypoint interpolation', () => {
  it('interpolates by traveled distance rather than waypoint index', () => {
    const waypoints = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
    ];

    expect(pointAlongWaypoints(waypoints, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlongWaypoints(waypoints, 0.5)).toEqual({ x: 2, y: 0 });
    expect(pointAlongWaypoints(waypoints, 0.875)).toEqual({ x: 3, y: 0.5 });
    expect(pointAlongWaypoints(waypoints, 1)).toEqual({ x: 3, y: 1 });
  });

  it('clamps progress and handles empty or degenerate paths', () => {
    expect(pointAlongWaypoints([], 0.5)).toBeUndefined();
    expect(pointAlongWaypoints([{ x: 2, y: 4 }], 0.5)).toEqual({ x: 2, y: 4 });
    expect(
      pointAlongWaypoints(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        4,
      ),
    ).toEqual({ x: 1, y: 1 });
  });
});
