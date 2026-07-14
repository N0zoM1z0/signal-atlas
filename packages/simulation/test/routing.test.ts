import { describe, expect, it } from 'vitest';

import { selectRoutePlan } from '../src/routing.js';
import { fixture } from './helpers.js';

describe('deterministic route selection', () => {
  it('chooses the minimum-duration authored path across multiple legs', () => {
    const plan = selectRoutePlan(fixture.worldManifest, 'observatory', 'weather-tower');

    expect(plan).toMatchObject({
      durationMs: 12_500,
      legs: [
        {
          routeId: 'r-observatory-square',
          fromPlaceId: 'observatory',
          toPlaceId: 'square',
        },
        {
          routeId: 'r-square-weather',
          fromPlaceId: 'square',
          toPlaceId: 'weather-tower',
        },
      ],
    });
  });

  it('reverses bidirectional waypoints and handles no-op and unreachable destinations', () => {
    const reverse = selectRoutePlan(fixture.worldManifest, 'square', 'observatory');
    const authored = fixture.worldManifest.routes.find(
      (route) => route.id === 'r-observatory-square',
    );

    expect(reverse?.legs[0]?.waypoints).toEqual([...authored!.waypoints].reverse());
    expect(selectRoutePlan(fixture.worldManifest, 'square', 'square')).toEqual({
      fromPlaceId: 'square',
      toPlaceId: 'square',
      durationMs: 0,
      legs: [],
    });
    expect(selectRoutePlan(fixture.worldManifest, 'square', 'missing')).toBeUndefined();
  });
});
