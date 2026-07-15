import type { CaseFileForecastRationale, SignalAtlasCaseFile } from '@signal-atlas/archive';
import { binaryMarketOutcomes, type ProbabilityDistribution } from '@signal-atlas/contracts';
import type { WorldProjection } from '@signal-atlas/simulation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchCaseFile,
  fetchReplayProjection,
  resolveFixtureCase,
  type ReplayProjectionResponse,
} from './runtime-client.js';

export interface ReplayWorkspaceProps {
  expeditionId: string;
  initialSequence?: number;
  onAuthoritativeProjectionChange: (projection: WorldProjection) => void;
  onClose: () => void;
}

function sentenceCase(value: string): string {
  return value
    .split(/[._]/u)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function primaryProbability(
  probabilities: ProbabilityDistribution,
  caseFile: SignalAtlasCaseFile,
): number {
  const { primary } = binaryMarketOutcomes(caseFile.market);
  return probabilities[primary.id] ?? 0;
}

function forecastLabel(forecast: CaseFileForecastRationale, caseFile: SignalAtlasCaseFile): string {
  const { primary } = binaryMarketOutcomes(caseFile.market);
  return `${Math.round(primaryProbability(forecast.newProbabilities, caseFile) * 100)}% ${primary.shortLabel}`;
}

export function ReplayWorkspace({
  expeditionId,
  initialSequence,
  onAuthoritativeProjectionChange,
  onClose,
}: ReplayWorkspaceProps) {
  const [replay, setReplay] = useState<ReplayProjectionResponse>();
  const [caseFile, setCaseFile] = useState<SignalAtlasCaseFile>();
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState('Loading the authoritative event stream.');
  const requestIdRef = useRef(0);

  const selectSequence = useCallback(
    async (sequence: number) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(undefined);
      try {
        const nextReplay = await fetchReplayProjection(expeditionId, sequence);
        if (requestId !== requestIdRef.current) return;
        setReplay(nextReplay);
        setStatus(`World projection moved to sequence ${sequence}.`);
      } catch (caught: unknown) {
        if (requestId !== requestIdRef.current) return;
        const message = caught instanceof Error ? caught.message : 'Sequence replay failed.';
        setError(message);
        setStatus(`Sequence replay failed: ${message}`);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [expeditionId],
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let active = true;
    void Promise.all([
      fetchReplayProjection(expeditionId, initialSequence),
      fetchCaseFile(expeditionId),
    ])
      .then(([nextReplay, nextCaseFile]) => {
        if (!active || requestId !== requestIdRef.current) return;
        setReplay(nextReplay);
        setCaseFile(nextCaseFile);
        setStatus(
          `Replay loaded at sequence ${nextReplay.sequence} of ${nextReplay.latestSequence}.`,
        );
      })
      .catch((caught: unknown) => {
        if (!active || requestId !== requestIdRef.current) return;
        const message =
          caught instanceof Error ? caught.message : 'Replay workspace failed to load.';
        setError(message);
        setStatus(`Replay loading failed: ${message}`);
      })
      .finally(() => {
        if (active && requestId === requestIdRef.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [expeditionId, initialSequence]);

  const resolveCase = async () => {
    setResolving(true);
    setError(undefined);
    try {
      const resolution = await resolveFixtureCase(expeditionId);
      const [nextReplay, nextCaseFile] = await Promise.all([
        fetchReplayProjection(expeditionId),
        fetchCaseFile(expeditionId),
      ]);
      setReplay(nextReplay);
      setCaseFile(nextCaseFile);
      onAuthoritativeProjectionChange(nextReplay.projection);
      setStatus(
        resolution.duplicate
          ? 'The fixture case was already resolved; final replay restored.'
          : `Fixture resolution recorded through sequence ${resolution.sequence}.`,
      );
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : 'Fixture resolution failed.';
      setError(message);
      setStatus(`Fixture resolution failed: ${message}`);
    } finally {
      setResolving(false);
    }
  };

  const exportCaseFile = async () => {
    setExporting(true);
    setError(undefined);
    try {
      const exported = await fetchCaseFile(expeditionId);
      setCaseFile(exported);
      const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `signal-atlas-${exported.expedition.id}-case-file.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus(
        `Public case file exported with ${exported.sources.length} sources, ${exported.claims.length} claims, ${exported.signals.length} signals, and ${exported.forecastRationales.length} forecast rationales.`,
      );
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : 'Case-file export failed.';
      setError(message);
      setStatus(`Case-file export failed: ${message}`);
    } finally {
      setExporting(false);
    }
  };

  const selectedProjection = replay?.projection;
  const selectedSequence = replay?.sequence ?? 0;
  const latestSequence = replay?.latestSequence ?? 0;
  const finalResolution = caseFile?.resolution;
  const resolvedOutcome = finalResolution
    ? caseFile?.market.outcomes.find((outcome) => outcome.id === finalResolution.outcomeId)
    : undefined;

  return (
    <main
      aria-busy={loading || resolving}
      aria-label="Expedition replay case file"
      className="atlas-replay-workspace"
      tabIndex={-1}
    >
      <header className="atlas-replay-header">
        <div>
          <span className="atlas-kicker">The Atlas / Case-file replay</span>
          <h2>{caseFile ? `${caseFile.expedition.title} record` : 'Expedition record'}</h2>
          <p>Scrub the immutable event stream and inspect exactly what the world knew.</p>
        </div>
        <div>
          <button
            disabled={!caseFile || exporting}
            onClick={() => void exportCaseFile()}
            type="button"
          >
            {exporting ? 'Preparing JSON…' : 'Export public JSON'}
          </button>
          <button onClick={onClose} type="button">
            Return to World <kbd>Esc</kbd>
          </button>
        </div>
      </header>

      <section className="atlas-replay-controls" aria-label="Sequence controls">
        <div className="atlas-replay-resolution" data-resolved={Boolean(finalResolution)}>
          <span aria-hidden="true">{finalResolution ? '◆' : '◇'}</span>
          <div>
            <small>{finalResolution ? 'Fixture case resolved' : 'Fixture case open'}</small>
            <strong>
              {finalResolution
                ? `${resolvedOutcome?.label ?? finalResolution.outcomeId} · ${dateLabel(finalResolution.resolvedAt)} UTC`
                : 'Authored outcome is sealed on the orchestrator'}
            </strong>
            <p>
              {finalResolution?.note ??
                'Resolve only after active missions finish. The browser cannot choose the outcome.'}
            </p>
          </div>
          {!finalResolution && (
            <button disabled={resolving} onClick={() => void resolveCase()} type="button">
              {resolving ? 'Recording resolution…' : 'Resolve fixture case'}
            </button>
          )}
        </div>

        <div className="atlas-replay-scrubber">
          <label htmlFor="atlas-replay-sequence">
            <span>
              Event sequence
              <output htmlFor="atlas-replay-sequence">
                {selectedSequence} / {latestSequence}
              </output>
            </span>
            <input
              aria-label="Replay sequence"
              disabled={!replay || loading}
              id="atlas-replay-sequence"
              max={latestSequence}
              min={0}
              onChange={(event) => void selectSequence(Number(event.target.value))}
              step={1}
              type="range"
              value={selectedSequence}
            />
          </label>
          <div>
            <button
              aria-label="Previous replay sequence"
              disabled={loading || selectedSequence === 0}
              onClick={() => void selectSequence(selectedSequence - 1)}
              type="button"
            >
              ← Previous
            </button>
            <button
              aria-label="Latest replay sequence"
              disabled={loading || selectedSequence === latestSequence}
              onClick={() => void selectSequence(latestSequence)}
              type="button"
            >
              Latest
            </button>
            <button
              aria-label="Next replay sequence"
              disabled={loading || selectedSequence === latestSequence}
              onClick={() => void selectSequence(selectedSequence + 1)}
              type="button"
            >
              Next →
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p className="atlas-replay-error" role="alert">
          <strong>Replay boundary error.</strong> {error}
        </p>
      )}

      <div className="atlas-replay-body">
        <section className="atlas-replay-markers" aria-label="Turning points">
          <header>
            <span className="atlas-kicker">Turning points</span>
            <h3>Event landmarks</h3>
            <p>Jump to the exact sequence where evidence or judgment entered the world.</p>
          </header>
          {caseFile?.turningPoints.length ? (
            <ol>
              {caseFile.turningPoints.map((marker) => (
                <li key={marker.eventId}>
                  <button
                    aria-current={selectedSequence === marker.sequence ? 'step' : undefined}
                    data-kind={marker.kind}
                    onClick={() => void selectSequence(marker.sequence)}
                    type="button"
                  >
                    <span>SEQ {marker.sequence}</span>
                    <strong>{marker.label}</strong>
                    <small>{sentenceCase(marker.eventType)}</small>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="atlas-replay-empty">No evidence turning points have been recorded yet.</p>
          )}
        </section>

        <section className="atlas-replay-projection" aria-label="Selected world projection">
          <header>
            <div>
              <span className="atlas-kicker">World at sequence {selectedSequence}</span>
              <h3>
                {replay?.selectedEvent ? sentenceCase(replay.selectedEvent.type) : 'Genesis state'}
              </h3>
            </div>
            <span data-status={selectedProjection?.market.status ?? 'loading'}>
              {sentenceCase(selectedProjection?.market.status ?? 'loading')}
            </span>
          </header>

          {selectedProjection ? (
            <>
              <div className="atlas-replay-event-card">
                <small>
                  {replay?.selectedEvent ? `Event ${replay.selectedEvent.id}` : 'Before event 1'}
                </small>
                <strong>
                  {replay?.selectedEvent
                    ? `${dateLabel(replay.selectedEvent.occurredAt)} UTC`
                    : 'Sequence-zero fixture bootstrap'}
                </strong>
                <p>
                  {replay?.selectedEvent
                    ? `Applied ${replay.selectedEvent.type} as ${replay.selectedEvent.actor.kind}. No later event is present in this projection.`
                    : 'Only the authored market, world manifest, and uninitialized expedition team exist here.'}
                </p>
              </div>

              <dl className="atlas-replay-metrics">
                <div>
                  <dt>Sources</dt>
                  <dd>{Object.keys(selectedProjection.sourcesById).length}</dd>
                </div>
                <div>
                  <dt>Claims</dt>
                  <dd>{Object.keys(selectedProjection.claimsById).length}</dd>
                </div>
                <div>
                  <dt>Signals</dt>
                  <dd>{Object.keys(selectedProjection.signalsById).length}</dd>
                </div>
                <div>
                  <dt>Forecasts</dt>
                  <dd>{selectedProjection.forecasts.length}</dd>
                </div>
                <div>
                  <dt>Scores</dt>
                  <dd>{selectedProjection.scores.length}</dd>
                </div>
                <div>
                  <dt>Agents</dt>
                  <dd>{Object.keys(selectedProjection.agentsById).length}</dd>
                </div>
              </dl>

              <section
                className="atlas-replay-market-state"
                aria-label="Market at selected sequence"
              >
                <span>
                  <small>Selected market state</small>
                  <strong>{sentenceCase(selectedProjection.market.status)}</strong>
                </span>
                <div>
                  {selectedProjection.market.outcomes.map((outcome) => {
                    const probability =
                      selectedProjection.forecasts.at(-1)?.newProbabilities[outcome.id] ??
                      selectedProjection.market.currentPublicProbabilities?.[outcome.id];
                    return (
                      <span key={outcome.id}>
                        <small>{outcome.shortLabel}</small>
                        <strong>
                          {selectedProjection.market.resolvedOutcomeId
                            ? selectedProjection.market.resolvedOutcomeId === outcome.id
                              ? 'WIN'
                              : '—'
                            : probability === undefined
                              ? '—'
                              : `${Math.round(probability * 100)}%`}
                        </strong>
                      </span>
                    );
                  })}
                </div>
              </section>

              <section className="atlas-replay-hash" aria-label="Projection integrity">
                <span aria-hidden="true">⌗</span>
                <div>
                  <small>
                    {selectedSequence === latestSequence
                      ? 'Final projection hash · verified'
                      : 'Selected projection hash'}
                  </small>
                  <code>{replay?.hash}</code>
                </div>
              </section>
            </>
          ) : (
            <p className="atlas-replay-empty">Reconstructing projection…</p>
          )}
        </section>

        <section className="atlas-replay-forecast-path" aria-label="Forecast and score timeline">
          <header>
            <span className="atlas-kicker">Forecast path</span>
            <h3>Judgment over time</h3>
            <p>Rationales stay separate from the evidence records they cite.</p>
          </header>
          {caseFile?.forecastRationales.length ? (
            <ol>
              {caseFile.forecastRationales.map((forecast) => (
                <li data-future={forecast.sequence > selectedSequence} key={forecast.forecastId}>
                  <button onClick={() => void selectSequence(forecast.sequence)} type="button">
                    <span>
                      <b>{forecastLabel(forecast, caseFile)}</b>
                      <small>SEQ {forecast.sequence}</small>
                    </span>
                    <strong>{forecast.publicNote ?? forecast.rationale}</strong>
                    <small>
                      {forecast.evidenceSignalIds.length} linked signal
                      {forecast.evidenceSignalIds.length === 1 ? '' : 's'}
                    </small>
                    {forecast.score && <em>{forecast.score.brierScore.toFixed(4)} Brier score</em>}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="atlas-replay-empty">No forecast has entered the event stream.</p>
          )}

          <aside className="atlas-replay-export-note">
            <strong>Public export boundary</strong>
            <p>
              {caseFile?.sources.length ?? 0} sources · {caseFile?.claims.length ?? 0} claims ·{' '}
              {caseFile?.signals.length ?? 0} signals · {caseFile?.forecastRationales.length ?? 0}{' '}
              rationales
            </p>
            <small>
              Private forecast memos are excluded from every exported section and event.
            </small>
          </aside>
        </section>
      </div>

      <p aria-live="polite" className="atlas-visually-hidden" role="status">
        {status}
      </p>
    </main>
  );
}
