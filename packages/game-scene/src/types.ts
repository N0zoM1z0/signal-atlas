import type { Agent, Place, Route, WorldManifest } from '@signal-atlas/contracts';

export type ScenePlace = Pick<Place, 'archetype' | 'id' | 'name' | 'position' | 'visualState'>;

export type SceneRoute = Pick<Route, 'id' | 'waypoints'>;

export type SceneAgent = Pick<Agent, 'displayName' | 'id' | 'placeId' | 'publicState'>;

export interface WorldSceneDefinition {
  agents: SceneAgent[];
  ambientLayers: WorldManifest['ambientLayers'];
  defaultSpawnPlaceId: string;
  logicalHeight: number;
  logicalWidth: number;
  places: ScenePlace[];
  routes: SceneRoute[];
  tileSize: number;
}

export type WorldSceneCommand =
  | { type: 'camera.home' }
  | { type: 'camera.pan'; deltaX: number; deltaY: number }
  | { type: 'camera.zoom'; delta: -1 | 1 }
  | { type: 'camera.follow-agent'; agentId: string }
  | { type: 'place.center'; placeId: string }
  | { type: 'place.select'; placeId: string }
  | { type: 'motion.set-reduced'; reduced: boolean };

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
  | {
      type: 'camera.changed';
      centerX: number;
      centerY: number;
      followingAgentId: string | null;
      pixelScale: number;
      zoomStep: number;
    }
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
): WorldSceneDefinition {
  return {
    agents: agents.map(({ displayName, id, placeId, publicState }) => ({
      displayName,
      id,
      placeId,
      publicState,
    })),
    ambientLayers: structuredClone(manifest.ambientLayers),
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
    routes: manifest.routes.map(({ id, waypoints }) => ({
      id,
      waypoints: waypoints.map((point) => ({ ...point })),
    })),
    tileSize: manifest.tileSize,
  };
}
