import { useRef, type CSSProperties, type ReactNode } from 'react';

import type { WorldSceneDefinition, WorldWeatherPresentation } from '@signal-atlas/game-scene';

import type { ShellAgent, ShellPlace } from './model.js';
import type { ShellPresentationCue } from './presentation-cues.js';
import { WorldCanvas, type CameraFollowRequest, type WorldCanvasHandle } from './WorldCanvas.js';

interface RouteModel {
  baseDurationMs: number;
  bidirectional: boolean;
  fromPlaceId: string;
  id: string;
  toPlaceId: string;
  transitType: string;
  waypoints: Array<{ x: number; y: number }>;
}

export interface WorldStageHostProps {
  activeCue: ShellPresentationCue | undefined;
  agentsDrawerOpen: boolean;
  agents: readonly ShellAgent[];
  autoCamera: boolean;
  captureMode: boolean;
  followRequest: CameraFollowRequest | undefined;
  guide: ReactNode;
  loading: boolean;
  meetingPlaceName: string | undefined;
  places: readonly ShellPlace[];
  reducedMotion: boolean;
  routes: readonly RouteModel[];
  sceneDefinition: WorldSceneDefinition;
  selectedAgentId: string;
  selectedAgentName: string;
  selectedPlaceId: string | undefined;
  skipTravel: boolean;
  signalsDrawerOpen: boolean;
  meetingBusy: boolean;
  meetingDisabled: boolean;
  onConveneMeeting: () => void;
  onOpenPanel: (
    panel: 'agents' | 'signals' | 'archive' | 'professor' | 'forecast' | 'replay',
  ) => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPlace: (placeId: string) => void;
  onSkipTravelChange: (enabled: boolean) => void;
  onSoundToggle: () => void;
  soundEnabled: boolean;
  weather: WorldWeatherPresentation;
  worldName: string;
}

function placeStyle(place: ShellPlace): CSSProperties {
  return {
    '--atlas-place-x': `${place.x}%`,
    '--atlas-place-y': `${place.y}%`,
  } as CSSProperties;
}

export function WorldStageHost({
  activeCue,
  agentsDrawerOpen,
  agents,
  autoCamera,
  captureMode,
  followRequest,
  guide,
  loading,
  meetingPlaceName,
  meetingBusy,
  meetingDisabled,
  onConveneMeeting,
  onOpenPanel,
  onSelectAgent,
  onSelectPlace,
  onSkipTravelChange,
  onSoundToggle,
  places,
  reducedMotion,
  routes,
  sceneDefinition,
  selectedAgentId,
  selectedAgentName,
  selectedPlaceId,
  skipTravel,
  signalsDrawerOpen,
  soundEnabled,
  weather,
  worldName,
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
      <section aria-label="World state text view" className="atlas-visually-hidden">
        <h2>World state text view</h2>
        <h3>Agents and movement</h3>
        <ul>
          {agents.map((agent) => (
            <li key={agent.id}>
              <strong>{agent.name}</strong> · {agent.status} · {agent.placeName} · {agent.mission}
              {agent.movement
                ? ` Route ${agent.movement.routeId}, ${Math.round(agent.movement.progress * 100)} percent complete toward ${agent.movement.destinationName}.`
                : ' Not traveling.'}
            </li>
          ))}
        </ul>
        <h3>Places and available missions</h3>
        <ul>
          {places.map((place) => (
            <li key={place.id}>
              <strong>{place.name}</strong> · {place.label} ·{' '}
              {place.missionVerbs.length > 0
                ? `Available missions: ${place.missionVerbs.join(', ')}.`
                : 'No mission action available.'}
            </li>
          ))}
        </ul>
        <h3>Routes</h3>
        <ul>
          {routes.map((route) => {
            const from = places.find((place) => place.id === route.fromPlaceId);
            const to = places.find((place) => place.id === route.toPlaceId);
            return (
              <li key={route.id}>
                {from?.name ?? route.fromPlaceId} to {to?.name ?? route.toPlaceId} by{' '}
                {route.transitType}; {Math.round(route.baseDurationMs / 1_000)} seconds
                {route.bidirectional ? ', bidirectional.' : ', one way.'}
              </li>
            );
          })}
        </ul>
        <p>
          Select places with the labeled map buttons. Select and follow agents from the Agents
          region. Pause, speed, forecast, archive, professor, replay, meeting, and camera controls
          are available as standard buttons outside the canvas.
        </p>
      </section>
      <nav aria-label="World views" className="atlas-world-toolbar">
        <span className="atlas-world-crumb">
          <small>The Atlas</small>
          <i aria-hidden="true">/</i>
          <strong>{worldName}</strong>
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
          <span className="atlas-weather-chip" title={weather.sourceTitle}>
            <i aria-hidden="true" />
            <span>
              <small>Weather</small>
              <strong>{weather.label}</strong>
            </span>
          </span>
          <button aria-current="page" type="button">
            World
          </button>
          <button
            data-workspace-target="archive"
            onClick={() => onOpenPanel('archive')}
            type="button"
          >
            Archive
          </button>
          <button
            data-workspace-target="professor"
            onClick={() => onOpenPanel('professor')}
            type="button"
          >
            Professor
          </button>
          <button onClick={() => onOpenPanel('forecast')} type="button">
            Forecast
          </button>
          <button
            data-workspace-target="replay"
            onClick={() => onOpenPanel('replay')}
            type="button"
          >
            Replay
          </button>
          <button
            aria-label={soundEnabled ? 'Mute presentation sound' : 'Enable presentation sound'}
            aria-pressed={soundEnabled}
            onClick={onSoundToggle}
            type="button"
          >
            {soundEnabled ? 'Sound on' : 'Sound off'}
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

      <div className="atlas-world-guide-slot">{guide}</div>

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

          {agents.map((agent, index) => (
            <span
              className="atlas-world-agent"
              data-agent-index={index}
              key={agent.id}
              style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
            >
              <i />
              <b>{agent.name}</b>
            </span>
          ))}
        </div>

        <WorldCanvas
          autoCamera={autoCamera}
          captureMode={captureMode}
          followRequest={followRequest}
          model={sceneDefinition}
          onAgentSelect={onSelectAgent}
          onPlaceSelect={onSelectPlace}
          reducedMotion={reducedMotion}
          ref={canvasRef}
          selectedAgentId={selectedAgentId}
          selectedPlaceId={selectedPlaceId}
          {...(activeCue ? { presentationCue: activeCue } : {})}
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
            <strong>Charting {worldName}</strong>
            <p>Loading the authoritative expedition projection and authored world manifest.</p>
          </div>
        )}
      </section>

      <footer className="atlas-world-footer">
        <span
          className="atlas-event-ticker"
          data-cue-kind={activeCue?.kind ?? 'selection'}
          role="status"
        >
          <i aria-hidden="true" />{' '}
          <strong>
            {activeCue
              ? new Date(activeCue.occurredAt).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'UTC',
                })
              : 'Ready'}
          </strong>{' '}
          {activeCue?.text ?? `${selectedAgentName} selected.`}
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
          <button
            data-workspace-target="meeting"
            disabled={meetingBusy || meetingDisabled}
            onClick={onConveneMeeting}
            title={
              meetingDisabled
                ? 'Finish active and queued missions before convening the team.'
                : undefined
            }
            type="button"
          >
            <i aria-hidden="true" />{' '}
            {meetingBusy
              ? 'Calling the team…'
              : meetingPlaceName
                ? `Convene at ${meetingPlaceName}`
                : 'Convene the team'}
          </button>
        </span>
      </footer>
    </main>
  );
}
