import { WorldManifestSchema } from '@signal-atlas/contracts';
import { describe, expect, it } from 'vitest';

import {
  createWorldSceneDefinition,
  weatherFromAmbientLayers,
  worldPresentationCueKinds,
  worldWeatherStates,
} from '../src/index.js';

describe('world presentation vocabulary', () => {
  it('maps the authored windy layer to the bounded initial weather state', () => {
    const manifest = WorldManifestSchema.parse({
      id: 'world-weather-test',
      version: 1,
      template: 'test',
      logicalWidth: 48,
      logicalHeight: 30,
      tileSize: 16,
      places: [
        {
          id: 'observatory',
          name: 'Test Observatory',
          archetype: 'observatory',
          position: { x: 12, y: 12 },
          entranceNodeId: 'observatory-door',
          description: 'A bounded test place.',
          missionVerbs: [],
          capabilityBindings: [],
          tags: ['test'],
        },
      ],
      routes: [],
      ambientLayers: [{ id: 'clouds', type: 'particles', state: 'windy' }],
      cameraZones: [],
      defaultSpawnPlaceId: 'observatory',
      assetPack: 'test-programmatic-v1',
    });
    expect(weatherFromAmbientLayers(manifest)).toEqual({
      intensity: 0.42,
      label: 'Breezy night',
      state: 'breezy',
    });
    expect(createWorldSceneDefinition(manifest, []).weather.state).toBe('breezy');
  });

  it('keeps weather and event choreography inside finite renderer vocabularies', () => {
    expect(worldWeatherStates).toEqual(['clear', 'breezy', 'crosswind', 'rain', 'fog']);
    expect(worldPresentationCueKinds).toEqual(['arrival', 'work', 'signal', 'complete', 'error']);
  });
});
