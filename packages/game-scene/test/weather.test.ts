import { WorldManifestSchema } from '@signal-atlas/contracts';
import { describe, expect, it } from 'vitest';

import {
  createWorldSceneDefinition,
  landmarkKindForScene,
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
    const scene = createWorldSceneDefinition(manifest, []);
    expect(scene.assetPack).toBe('test-programmatic-v1');
    expect(scene.template).toBe('test');
    expect(scene.cameraZones).toEqual([]);
    expect(landmarkKindForScene(scene)).toBe('wayfinder');
  });

  it('selects visual landmarks from asset packs and templates, never market IDs', () => {
    expect(
      landmarkKindForScene({ assetPack: 'helios3-programmatic-pilot-v1', template: 'other' }),
    ).toBe('launch_vehicle');
    expect(
      landmarkKindForScene({ assetPack: 'northlight-harbor-programmatic-v1', template: 'other' }),
    ).toBe('harbor_beacon');
    expect(landmarkKindForScene({ assetPack: 'other', template: 'ledger-civic-industrial' })).toBe(
      'civic_tower',
    );
  });

  it('keeps weather and event choreography inside finite renderer vocabularies', () => {
    expect(worldWeatherStates).toEqual(['clear', 'breezy', 'crosswind', 'rain', 'fog']);
    expect(worldPresentationCueKinds).toEqual(['arrival', 'work', 'signal', 'complete', 'error']);
  });
});
