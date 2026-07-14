import type { CSSProperties } from 'react';

import type { ShellPlace } from './model.js';

interface RouteModel {
  id: string;
  waypoints: Array<{ x: number; y: number }>;
}

export interface WorldStageHostProps {
  agentsDrawerOpen: boolean;
  loading: boolean;
  places: readonly ShellPlace[];
  routes: readonly RouteModel[];
  selectedAgentName: string;
  selectedPlaceId: string | undefined;
  signalsDrawerOpen: boolean;
  onOpenPanel: (panel: 'agents' | 'signals' | 'archive' | 'professor') => void;
  onSelectPlace: (placeId: string) => void;
}

function placeStyle(place: ShellPlace): CSSProperties {
  return {
    '--atlas-place-x': `${place.x}%`,
    '--atlas-place-y': `${place.y}%`,
  } as CSSProperties;
}

export function WorldStageHost({
  agentsDrawerOpen,
  loading,
  onOpenPanel,
  onSelectPlace,
  places,
  routes,
  selectedAgentName,
  selectedPlaceId,
  signalsDrawerOpen,
}: WorldStageHostProps) {
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
          <button aria-label="Center map" type="button">
            ◎
          </button>
          <button aria-label="Zoom out" type="button">
            −
          </button>
          <button aria-label="Zoom in" type="button">
            +
          </button>
        </span>
      </nav>

      <section aria-label="World map" className="atlas-world-stage">
        <div className="atlas-sky-stars" aria-hidden="true" />
        <div className="atlas-moon" aria-hidden="true" />
        <div className="atlas-cloud atlas-cloud--one" aria-hidden="true" />
        <div className="atlas-cloud atlas-cloud--two" aria-hidden="true" />
        <div className="atlas-horizon" aria-hidden="true" />
        <div className="atlas-terrain" aria-hidden="true" />
        <div className="atlas-water" aria-hidden="true" />

        <svg
          aria-hidden="true"
          className="atlas-route-map"
          preserveAspectRatio="none"
          viewBox="0 0 48 30"
        >
          {routes.map((route) => (
            <polyline
              key={route.id}
              points={route.waypoints.map((point) => `${point.x},${point.y}`).join(' ')}
            />
          ))}
        </svg>

        {places.map((place) => (
          <button
            aria-label={`${place.name}. ${place.label}. Available missions: ${place.missionVerbs.join(', ')}.`}
            aria-pressed={place.id === selectedPlaceId}
            className="atlas-place"
            data-archetype={place.archetype}
            key={place.id}
            onClick={() => onSelectPlace(place.id)}
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

        <span className="atlas-world-agent atlas-world-agent--mira" aria-hidden="true">
          <i />
          <b>Mira</b>
        </span>
        <span className="atlas-world-agent atlas-world-agent--orin" aria-hidden="true">
          <i />
          <b>Orin</b>
        </span>
        <span className="atlas-world-agent atlas-world-agent--kestrel" aria-hidden="true">
          <i />
          <b>Kestrel</b>
        </span>

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
        <button type="button">
          <i aria-hidden="true" /> Convene at Lantern Square
        </button>
      </footer>
    </main>
  );
}
