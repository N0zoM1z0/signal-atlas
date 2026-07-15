import { Badge } from '@signal-atlas/ui';
import type { CSSProperties } from 'react';

import type { EventStreamStatus } from './event-stream-client.js';

type RuntimeState = 'ready' | 'loading' | 'disconnected';

export interface MarketRibbonProps {
  mode: 'director' | 'observatory';
  paused: boolean;
  prefConnected: boolean;
  runtimeState: RuntimeState;
  streamStatus: EventStreamStatus;
  speed: 1 | 2 | 4;
  publicProbability: number;
  resolvedOutcomeLabel?: string;
  teamProbability: number;
  onModeChange: () => void;
  onOpenForecast: () => void;
  onPauseChange: () => void;
  onSpeedChange: () => void;
}

export function MarketRibbon({
  mode,
  onModeChange,
  onOpenForecast,
  onPauseChange,
  onSpeedChange,
  paused,
  prefConnected,
  publicProbability,
  resolvedOutcomeLabel,
  runtimeState,
  speed,
  streamStatus,
  teamProbability,
}: MarketRibbonProps) {
  const resolved = resolvedOutcomeLabel !== undefined;
  const probabilityStyle = {
    '--atlas-public-probability': `${publicProbability}%`,
    '--atlas-team-probability': `${teamProbability}%`,
  } as CSSProperties;
  const streamUnavailable = ['reconnecting', 'schema_error', 'boundary_error'].includes(
    streamStatus.phase,
  );
  const runtimeLabel =
    runtimeState === 'loading'
      ? '◌ Loading fixture'
      : runtimeState === 'disconnected'
        ? '△ Orchestrator offline'
        : streamStatus.phase === 'schema_error'
          ? `△ Stream schema error · seq ${streamStatus.cursor}`
          : streamStatus.phase === 'boundary_error'
            ? `△ Stream boundary error · seq ${streamStatus.cursor}`
            : streamStatus.phase === 'reconnecting'
              ? `◌ Reconnecting · seq ${streamStatus.cursor}`
              : streamStatus.phase === 'connecting'
                ? `◌ Connecting · seq ${streamStatus.cursor}`
                : !prefConnected
                  ? '△ Pref disconnected'
                  : '● Fixture ready';

  return (
    <header className="atlas-market-ribbon" aria-label="Market overview">
      <div className="atlas-brand">
        <span className="atlas-brand__mark" aria-hidden="true">
          <i />
        </span>
        <span className="atlas-brand__copy">
          <strong>Signal Atlas</strong>
          <small>Helios-3 Expedition</small>
        </span>
      </div>

      <div className="atlas-market-question">
        <span className="atlas-kicker">
          <i className="atlas-live-dot" aria-hidden="true" /> Fictional sandbox market
        </span>
        <h1>Will the Helios-3 mission launch before September 30?</h1>
      </div>

      <div
        className="atlas-probability"
        aria-label={`Public ${publicProbability} percent; team ${teamProbability} percent`}
        style={probabilityStyle}
      >
        <span className="atlas-probability__value atlas-probability__value--public">
          <small>Public</small>
          <strong>{publicProbability}%</strong>
        </span>
        <span className="atlas-worldline" aria-hidden="true">
          <i className="atlas-worldline__track">
            <b className="atlas-worldline__public" />
            <b className="atlas-worldline__team" />
          </i>
          <span>
            <b>No</b>
            <b>Yes</b>
          </span>
        </span>
        <span className="atlas-probability__value atlas-probability__value--team">
          <small>Team</small>
          <strong>{teamProbability}%</strong>
        </span>
      </div>

      <div className="atlas-ribbon-actions">
        <button
          className="atlas-forecast-open"
          disabled={resolved}
          onClick={onOpenForecast}
          type="button"
        >
          <span aria-hidden="true">◒</span> {resolved ? 'Forecast closed' : 'Commit Forecast'}
        </button>
        <Badge
          className="atlas-runtime-badge"
          title={streamStatus.message}
          tone={
            runtimeState === 'disconnected' || streamUnavailable || !prefConnected
              ? 'disputed'
              : 'context'
          }
        >
          {runtimeLabel}
        </Badge>
        <span className="atlas-deadline">
          <small>{resolved ? 'Resolved' : 'Resolves'}</small>
          <strong>{resolvedOutcomeLabel ?? 'Sep 30'}</strong>
        </span>
        <button
          aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
          className="atlas-compact-control"
          disabled={resolved}
          onClick={onPauseChange}
          type="button"
        >
          {paused ? '▶' : 'Ⅱ'}
        </button>
        <button
          aria-label={`Simulation speed ${speed} times`}
          className="atlas-compact-control"
          disabled={resolved}
          onClick={onSpeedChange}
          type="button"
        >
          {speed}×
        </button>
        <button className="atlas-mode-control" onClick={onModeChange} type="button">
          <i aria-hidden="true" /> {mode}
        </button>
      </div>
    </header>
  );
}
