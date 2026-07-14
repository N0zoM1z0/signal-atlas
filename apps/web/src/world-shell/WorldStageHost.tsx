import { useRef, type CSSProperties } from 'react';

import type { WorldSceneDefinition } from '@signal-atlas/game-scene';

import type { ShellPlace } from './model.js';
import { WorldCanvas, type CameraFollowRequest, type WorldCanvasHandle } from './WorldCanvas.js';

interface RouteModel {
  id: string;
  waypoints: Array<{ x: number; y: number }>;
}

export interface WorldStageHostProps {
  agentsDrawerOpen: boolean;
  autoCamera: boolean;
  followRequest: CameraFollowRequest | undefined;
  loading: boolean;
  places: readonly ShellPlace[];
  reducedMotion: boolean;
  routes: readonly RouteModel[];
  sceneDefinition: WorldSceneDefinition;
  selectedAgentId: string;
  selectedAgentName: string;
  selectedPlaceId: string | undefined;
  skipTravel: boolean;
  signalsDrawerOpen: boolean;
  onOpenPanel: (panel: 'agents' | 'signals' | 'archive' | 'professor') => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPlace: (placeId: string) => void;
  onSkipTravelChange: (enabled: boolean) => void;
}

function placeStyle(place: ShellPlace): CSSProperties {
  return {
    '--atlas-place-x': `${place.x}%`,
    '--atlas-place-y': `${place.y}%`,
  } as CSSProperties;
}

export function WorldStageHost({
  agentsDrawerOpen,
  autoCamera,
  followRequest,
  loading,
  onOpenPanel,
  onSelectAgent,
  onSelectPlace,
  onSkipTravelChange,
  places,
  reducedMotion,
  routes,
  sceneDefinition,
  selectedAgentId,
  selectedAgentName,
  selectedPlaceId,
  skipTravel,
  signalsDrawerOpen,
}: WorldStageHostProps) {
  const canvasRef = useRef<WorldCanvasHandle>(null);

  return (
    <main
      aria-busy={loading}
      aria-label="Interactive world stage"
      className="atlas-world-panel"
      id="world-stage"
      tabIndex={-1}
    >
      <nav aria-label="World views" className="atlas-world-toolbar">
        <span className="atlas-world-crumb">
          <small>The Atlas</small>
          <i aria-hidden="true">/</i>
          <strong>Meridian Coast</strong>
        </span>
        <span className="atlas-mobile-drawers">
          <button
            aria-expanded={agentsDrawerOpen}
            aria-label="Open agents drawer"
            onClick={() => onOpenPanel('agents')}
            type="button"
          >
            Agents
          </button>
          <button
            aria-expanded={signalsDrawerOpen}
            aria-label="Open signals drawer"
            onClick={() => onOpenPanel('signals')}
            type="button"
          >
            Signals
          </button>
        </span>
        <span className="atlas-world-tools">
          <button aria-current="page" type="button">
            World
          </button>
          <button onClick={() => onOpenPanel('archive')} type="button">
            Archive
          </button>
          <button onClick={() => onOpenPanel('professor')} type="button">
            Professor
          </button>
          <button
            aria-label="Center map"
            onClick={() => canvasRef.current?.send({ type: 'camera.home' })}
            type="button"
          >
            ◎
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => canvasRef.current?.send({ type: 'camera.zoom', delta: -1 })}
            type="button"
          >
            −
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => canvasRef.current?.send({ type: 'camera.zoom', delta: 1 })}
            type="button"
          >
            +
          </button>
        </span>
      </nav>

      <section aria-label="World map" className="atlas-world-stage">
        <div className="atlas-react-world-layer" aria-hidden="true">
          <div className="atlas-sky-stars" />
          <div className="atlas-moon" />
          <div className="atlas-cloud atlas-cloud--one" />
          <div className="atlas-cloud atlas-cloud--two" />
          <div className="atlas-horizon" />
          <div className="atlas-terrain" />
          <div className="atlas-water" />

          <svg className="atlas-route-map" preserveAspectRatio="none" viewBox="0 0 48 30">
            {routes.map((route) => (
              <polyline
                key={route.id}
                points={route.waypoints.map((point) => `${point.x},${point.y}`).join(' ')}
              />
            ))}
          </svg>

          <span className="atlas-world-agent atlas-world-agent--mira">
            <i />
            <b>Mira</b>
          </span>
          <span className="atlas-world-agent atlas-world-agent--orin">
            <i />
            <b>Orin</b>
          </span>
          <span className="atlas-world-agent atlas-world-agent--kestrel">
            <i />
            <b>Kestrel</b>
          </span>
        </div>

        <WorldCanvas
          autoCamera={autoCamera}
          followRequest={followRequest}
          model={sceneDefinition}
          onAgentSelect={onSelectAgent}
          onPlaceSelect={onSelectPlace}
          reducedMotion={reducedMotion}
          ref={canvasRef}
          selectedAgentId={selectedAgentId}
          selectedPlaceId={selectedPlaceId}
        >
          {places.map((place) => (
            <button
              aria-label={`${place.name}. ${place.label}. Available missions: ${place.missionVerbs.join(', ')}.`}
              aria-pressed={place.id === selectedPlaceId}
              className="atlas-place"
              data-archetype={place.archetype}
              key={place.id}
              onClick={() => {
                onSelectPlace(place.id);
                canvasRef.current?.send({ type: 'place.select', placeId: place.id });
              }}
              onDoubleClick={() =>
                canvasRef.current?.send({ type: 'place.center', placeId: place.id })
              }
              style={placeStyle(place)}
              type="button"
            >
              <span className="atlas-place__building" aria-hidden="true">
                <i />
                <b />
                <b />
              </span>
              <span className="atlas-place__label">
                <small>{place.label}</small>
                <strong>{place.name}</strong>
              </span>
            </button>
          ))}
        </WorldCanvas>

        {loading && (
          <div className="atlas-world-loading" role="status">
            <span aria-hidden="true">✦</span>
            <strong>Charting Meridian Coast</strong>
            <p>Loading the fixture projection and authored world manifest.</p>
          </div>
        )}
      </section>

      <footer className="atlas-world-footer">
        <span className="atlas-event-ticker" role="status">
          <i aria-hidden="true" /> <strong>18:32</strong> {selectedAgentName} selected.
        </span>
        <span className="atlas-world-footer__actions">
          <label className="atlas-travel-preference">
            <input
              checked={skipTravel}
              onChange={(event) => onSkipTravelChange(event.target.checked)}
              type="checkbox"
            />
            Skip travel
          </label>
          <button type="button">
            <i aria-hidden="true" /> Convene at Lantern Square
          </button>
        </span>
      </footer>
    </main>
  );
}
