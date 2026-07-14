import { Badge } from '@signal-atlas/ui';
import type { CSSProperties } from 'react';

type RuntimeState = 'ready' | 'loading' | 'disconnected';

export interface MarketRibbonProps {
  mode: 'director' | 'observatory';
  paused: boolean;
  runtimeState: RuntimeState;
  speed: 1 | 2 | 4;
  publicProbability: number;
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
  publicProbability,
  runtimeState,
  speed,
  teamProbability,
}: MarketRibbonProps) {
  const probabilityStyle = {
    '--atlas-public-probability': `${publicProbability}%`,
    '--atlas-team-probability': `${teamProbability}%`,
  } as CSSProperties;

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
        <button className="atlas-forecast-open" onClick={onOpenForecast} type="button">
          <span aria-hidden="true">◒</span> Commit Forecast
        </button>
        <Badge
          className="atlas-runtime-badge"
          tone={runtimeState === 'disconnected' ? 'disputed' : 'context'}
        >
          {runtimeState === 'loading'
            ? '◌ Loading fixture'
            : runtimeState === 'disconnected'
              ? '△ Pref disconnected'
              : '● Fixture ready'}
        </Badge>
        <span className="atlas-deadline">
          <small>Resolves</small>
          <strong>Sep 30</strong>
        </span>
        <button
          aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
          className="atlas-compact-control"
          onClick={onPauseChange}
          type="button"
        >
          {paused ? '▶' : 'Ⅱ'}
        </button>
        <button
          aria-label={`Simulation speed ${speed} times`}
          className="atlas-compact-control"
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
