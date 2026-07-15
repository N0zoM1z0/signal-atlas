import { describe, expect, it } from 'vitest';

import { missionSuggestionForPlace } from './mission-suggestions.js';

describe('authored mission suggestions', () => {
  it('preserves an explicit destination and supported mission type', () => {
    expect(
      missionSuggestionForPlace({
        id: 'weather-tower',
        missionVerbs: ['verify', 'observe_conditions'],
        name: 'Galehaven Weather Tower',
      }),
    ).toEqual({
      destinationPlaceId: 'weather-tower',
      objective: 'Check current conditions at Galehaven Weather Tower',
      placeName: 'Galehaven Weather Tower',
      title: 'Check current conditions',
      verb: 'observe_conditions',
    });
  });

  it('returns no draft for a place without an authored action', () => {
    expect(
      missionSuggestionForPlace({ id: 'quiet-square', missionVerbs: [], name: 'Quiet Square' }),
    ).toBeUndefined();
  });
});
