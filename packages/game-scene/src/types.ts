import type { Agent, Place, Route, WorldManifest } from '@signal-atlas/contracts';

import type { AgentSpriteState } from './agent-sprites.js';

export type ScenePlace = Pick<Place, 'archetype' | 'id' | 'name' | 'position' | 'visualState'>;

export type SceneRoute = Pick<Route, 'fromPlaceId' | 'id' | 'toPlaceId' | 'waypoints'>;

export type SceneAgent = Pick<
  Agent,
  'displayName' | 'id' | 'movement' | 'placeId' | 'publicState' | 'role'
>;

export const worldWeatherStates = ['clear', 'breezy', 'crosswind', 'rain', 'fog'] as const;
export type WorldWeatherState = (typeof worldWeatherStates)[number];

export interface WorldWeatherPresentation {
  intensity: number;
  label: string;
  observedAt?: string;
  sourceTitle?: string;
  state: WorldWeatherState;
}

export const worldPresentationCueKinds = [
  'arrival',
  'work',
  'signal',
  'complete',
  'error',
] as const;
export type WorldPresentationCueKind = (typeof worldPresentationCueKinds)[number];

export interface WorldPresentationCue {
  agentId?: string;
  id: string;
  kind: WorldPresentationCueKind;
  label: string;
  placeId?: string;
}

export interface WorldSceneDefinition {
  agents: SceneAgent[];
  ambientLayers: WorldManifest['ambientLayers'];
  assetPack: string;
  cameraZones: WorldManifest['cameraZones'];
  defaultSpawnPlaceId: string;
  logicalHeight: number;
  logicalWidth: number;
  places: ScenePlace[];
  routes: SceneRoute[];
  template: string;
  tileSize: number;
  weather: WorldWeatherPresentation;
}

export type WorldSceneCommand =
  | { type: 'camera.home' }
  | { type: 'camera.pan'; deltaX: number; deltaY: number }
  | { type: 'camera.zoom'; delta: -1 | 1 }
  | { type: 'camera.follow-agent'; agentId: string }
  | { type: 'agent.select'; agentId: string }
  | { type: 'agent.project'; agent: SceneAgent }
  | { type: 'agent.set-animation'; agentId: string; state: AgentSpriteState }
  | { type: 'place.center'; placeId: string }
  | { type: 'place.select'; placeId: string }
  | { type: 'motion.set-reduced'; reduced: boolean }
  | { type: 'presentation.play'; cue: WorldPresentationCue }
  | { type: 'weather.set'; weather: WorldWeatherPresentation };

export type WorldSceneEvent =
  | {
      type: 'scene.ready';
      canvasHeight: number;
      canvasWidth: number;
      pixelScale: number;
    }
  | {
      type: 'scene.resized';
      canvasHeight: number;
      canvasWidth: number;
      pixelScale: number;
    }
  | { type: 'place.selected'; placeId: string; source: 'canvas' }
  | { type: 'agent.selected'; agentId: string; source: 'canvas' }
  | { type: 'agent.selection-rendered'; agentId: string }
  | {
      type: 'agent.projection-rendered';
      agentId: string;
      progress: number | null;
      state: AgentSpriteState;
      x: number;
      y: number;
    }
  | {
      type: 'camera.changed';
      centerX: number;
      centerY: number;
      followingAgentId: string | null;
      pixelScale: number;
      zoomStep: number;
    }
  | { type: 'motion.changed'; agentAnimationsPaused: boolean; reduced: boolean }
  | {
      type: 'presentation.rendered';
      cueId: string;
      kind: WorldPresentationCueKind;
    }
  | { type: 'weather.changed'; state: WorldWeatherState; transitionMs: number }
  | { type: 'performance.sample'; framesPerSecond: number };

export interface MountedWorldScene {
  destroy: () => void;
}

export interface MountWorldSceneOptions {
  bridge: WorldSceneBridge;
  initialSelectedAgentId: string;
  initialSelectedPlaceId: string | undefined;
  model: WorldSceneDefinition;
  parent: HTMLElement;
  reducedMotion: boolean;
  signal?: AbortSignal;
}

export interface WorldSceneBridge {
  connect: (handler: (command: WorldSceneCommand) => void) => () => void;
  emit: (event: WorldSceneEvent) => void;
  send: (command: WorldSceneCommand) => void;
  subscribe: (handler: (event: WorldSceneEvent) => void) => () => void;
}

export function createWorldSceneDefinition(
  manifest: WorldManifest,
  agents: readonly Agent[],
  weather: WorldWeatherPresentation = weatherFromAmbientLayers(manifest),
): WorldSceneDefinition {
  return {
    agents: agents.map(({ displayName, id, movement, placeId, publicState, role }) => ({
      displayName,
      id,
      placeId,
      publicState,
      role,
      ...(movement ? { movement: structuredClone(movement) } : {}),
    })),
    ambientLayers: structuredClone(manifest.ambientLayers),
    assetPack: manifest.assetPack,
    cameraZones: structuredClone(manifest.cameraZones),
    defaultSpawnPlaceId: manifest.defaultSpawnPlaceId,
    logicalHeight: manifest.logicalHeight,
    logicalWidth: manifest.logicalWidth,
    places: manifest.places.map(({ archetype, id, name, position, visualState }) => ({
      archetype,
      id,
      name,
      position: { ...position },
      ...(visualState ? { visualState: structuredClone(visualState) } : {}),
    })),
    routes: manifest.routes.map(({ fromPlaceId, id, toPlaceId, waypoints }) => ({
      fromPlaceId,
      id,
      toPlaceId,
      waypoints: waypoints.map((point) => ({ ...point })),
    })),
    template: manifest.template,
    tileSize: manifest.tileSize,
    weather: structuredClone(weather),
  };
}

export function weatherFromAmbientLayers(manifest: WorldManifest): WorldWeatherPresentation {
  const state = manifest.ambientLayers
    .map((layer) => layer.state.toLowerCase())
    .find((candidate) => candidate.includes('wind'));
  return state
    ? { intensity: 0.42, label: 'Breezy night', state: 'breezy' }
    : { intensity: 0, label: 'Clear night', state: 'clear' };
}
