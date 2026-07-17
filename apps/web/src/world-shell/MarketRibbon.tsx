import { Badge } from '@signal-atlas/ui';
import type { CSSProperties } from 'react';

import type { EventStreamStatus } from './event-stream-client.js';

type RuntimeState = 'ready' | 'loading' | 'disconnected';

export interface MarketRibbonProps {
  deadlineLabel: string;
  expeditionName: string;
  marketKindLabel: string;
  mode: 'director' | 'observatory';
  paused: boolean;
  prefConnected: boolean;
  prefConnectionState: string;
  prefMode: 'fixture' | 'live' | 'unknown';
  replaySequence?: number;
  runtimeKind: 'remote' | 'static-demo';
  runtimeState: RuntimeState;
  streamStatus: EventStreamStatus;
  speed: 1 | 2 | 4;
  publicProbability: number;
  primaryOutcomeLabel: string;
  question: string;
  resolvedOutcomeLabel?: string;
  secondaryOutcomeLabel: string;
  teamProbability: number;
  onModeChange: () => void;
  onOpenLobby?: () => void;
  onOpenForecast: () => void;
  onPauseChange: () => void;
  onSpeedChange: () => void;
}

export function MarketRibbon({
  deadlineLabel,
  expeditionName,
  marketKindLabel,
  mode,
  onModeChange,
  onOpenLobby,
  onOpenForecast,
  onPauseChange,
  onSpeedChange,
  paused,
  prefConnected,
  prefConnectionState,
  prefMode,
  publicProbability,
  primaryOutcomeLabel,
  question,
  replaySequence,
  resolvedOutcomeLabel,
  runtimeKind,
  runtimeState,
  secondaryOutcomeLabel,
  speed,
  streamStatus,
  teamProbability,
}: MarketRibbonProps) {
  const resolved = resolvedOutcomeLabel !== undefined;
  const replaying = replaySequence !== undefined;
  const probabilityStyle = {
    '--atlas-public-probability': `${publicProbability}%`,
    '--atlas-team-probability': `${teamProbability}%`,
  } as CSSProperties;
  const streamUnavailable = ['reconnecting', 'schema_error', 'boundary_error'].includes(
    streamStatus.phase,
  );
  const runtimeLabel = replaying
    ? `◇ Replay · sequence ${replaySequence}`
    : runtimeKind === 'static-demo'
      ? '◆ Static authored runtime'
      : runtimeState === 'loading'
        ? '◌ Loading expedition'
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
                    ? prefMode === 'live' && prefConnectionState === 'auth_required'
                      ? '△ Live Pref auth required'
                      : prefMode === 'unknown'
                        ? '△ Pref status unavailable'
                        : `△ ${prefMode === 'live' ? 'Live Pref' : 'Fixture Pref'} disconnected`
                    : prefMode === 'live'
                      ? '● Live sources connected'
                      : '● Offline sources ready';

  return (
    <header className="atlas-market-ribbon" aria-label="Market overview">
      {onOpenLobby ? (
        <button
          aria-label="Open Expedition Lobby"
          className="atlas-brand atlas-brand--button"
          onClick={onOpenLobby}
          type="button"
        >
          <span className="atlas-brand__mark" aria-hidden="true">
            <i />
          </span>
          <span className="atlas-brand__copy">
            <strong>Signal Atlas</strong>
            <small>Expeditions · {expeditionName}</small>
          </span>
        </button>
      ) : (
        <div className="atlas-brand">
          <span className="atlas-brand__mark" aria-hidden="true">
            <i />
          </span>
          <span className="atlas-brand__copy">
            <strong>Signal Atlas</strong>
            <small>{expeditionName}</small>
          </span>
        </div>
      )}

      <div className="atlas-market-question">
        <span className="atlas-kicker">
          <i className="atlas-live-dot" aria-hidden="true" /> {marketKindLabel}
        </span>
        <h1>{question}</h1>
        <span className="atlas-market-summary">
          Public {publicProbability}% · Team {teamProbability}% · {resolved ? 'Resolved' : 'Due'}{' '}
          {resolvedOutcomeLabel ?? deadlineLabel} ·{' '}
          {replaying
            ? `Replay sequence ${replaySequence}`
            : runtimeKind === 'static-demo'
              ? 'Static authored sources'
              : prefMode === 'live' && prefConnected
                ? 'Live sources'
                : 'Offline sources'}
        </span>
      </div>

      <div
        className="atlas-probability"
        aria-label={`Public forecast: ${publicProbability} percent ${primaryOutcomeLabel}; team forecast: ${teamProbability} percent ${primaryOutcomeLabel}`}
        style={probabilityStyle}
      >
        <span className="atlas-probability__value atlas-probability__value--public">
          <small>Public market</small>
          <strong>{publicProbability}%</strong>
        </span>
        <span className="atlas-worldline" aria-hidden="true">
          <i className="atlas-worldline__track">
            <b className="atlas-worldline__public" />
            <b className="atlas-worldline__team" />
          </i>
          <span>
            <b>{secondaryOutcomeLabel}</b>
            <b>{primaryOutcomeLabel}</b>
          </span>
        </span>
        <span className="atlas-probability__value atlas-probability__value--team">
          <small>Team forecast</small>
          <strong>{teamProbability}%</strong>
        </span>
      </div>

      <div className="atlas-ribbon-actions">
        <button
          className="atlas-forecast-open"
          disabled={resolved || replaying}
          onClick={onOpenForecast}
          type="button"
        >
          <span aria-hidden="true">◒</span>{' '}
          {replaying ? 'Replay read-only' : resolved ? 'Forecast closed' : 'Commit Forecast'}
        </button>
        <Badge
          className="atlas-runtime-badge"
          title={streamStatus.message}
          tone={
            !replaying &&
            runtimeKind !== 'static-demo' &&
            (runtimeState === 'disconnected' || streamUnavailable || !prefConnected)
              ? 'disputed'
              : 'context'
          }
        >
          {runtimeLabel}
        </Badge>
        <span className="atlas-deadline">
          <small>{resolved ? 'Resolved' : 'Resolves'}</small>
          <strong>{resolvedOutcomeLabel ?? deadlineLabel}</strong>
        </span>
        <button
          aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
          className="atlas-compact-control"
          disabled={resolved || replaying}
          onClick={onPauseChange}
          type="button"
        >
          {paused ? '▶' : 'Ⅱ'}
        </button>
        <button
          aria-label={`Simulation speed ${speed} times`}
          className="atlas-compact-control"
          disabled={resolved || replaying}
          onClick={onSpeedChange}
          type="button"
        >
          {speed}×
        </button>
        <button
          aria-label={`Experience mode: ${mode}`}
          className="atlas-mode-control"
          disabled={replaying}
          onClick={onModeChange}
          type="button"
        >
          <i aria-hidden="true" /> {mode}
        </button>
      </div>
    </header>
  );
}
