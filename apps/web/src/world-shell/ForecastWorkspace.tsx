import { Dialog } from '@signal-atlas/ui';
import type { ForecastProjection, WorldProjection } from '@signal-atlas/simulation';
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';

export interface ForecastCommitInput {
  yesProbability: number;
  evidenceSignalIds: string[];
  publicNote: string;
  privateMemo?: string;
  uncertainty?: {
    yes: { low: number; high: number };
    no: { low: number; high: number };
  };
}

export interface ForecastWorkspaceProps {
  open: boolean;
  preferredSignalIds: readonly string[];
  projection: WorldProjection;
  onClose: () => void;
  onCommit: (input: ForecastCommitInput) => Promise<void>;
}

function percent(probability: number | undefined): number {
  return Math.round((probability ?? 0) * 100);
}

function latestForActor(
  forecasts: readonly ForecastProjection[],
  kind: ForecastProjection['actor']['kind'],
): ForecastProjection | undefined {
  return [...forecasts].reverse().find((forecast) => forecast.actor.kind === kind);
}

function initialEvidence(
  projection: WorldProjection,
  preferredSignalIds: readonly string[],
): string[] {
  const available = new Set(Object.keys(projection.signalsById));
  const latestMeeting = Object.values(projection.meetingsById)
    .filter((meeting) => meeting.endedAt)
    .sort((left, right) => (right.endedAt ?? '').localeCompare(left.endedAt ?? ''))[0];
  const candidates = [
    ...(latestMeeting?.sharedSignalIds ?? []),
    ...preferredSignalIds,
    ...Object.values(projection.signalsById)
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .map((signal) => signal.id),
  ];
  return [...new Set(candidates)].filter((id) => available.has(id)).slice(0, 3);
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function actorLabel(forecast: ForecastProjection): string {
  if (forecast.actor.kind === 'player') return 'Player';
  if (forecast.actor.kind === 'team') return 'Team';
  if (forecast.actor.kind === 'agent' && forecast.actor.id) return forecast.actor.id;
  return forecast.actor.kind;
}

function probabilityDelta(forecast: ForecastProjection): string {
  const previous = percent(forecast.previousProbabilities['yes']);
  const next = percent(forecast.newProbabilities['yes']);
  const delta = next - previous;
  if (delta > 0) return `+${delta} points`;
  if (delta < 0) return `−${Math.abs(delta)} points`;
  return 'Held steady';
}

export function ForecastWorkspace({
  onClose,
  onCommit,
  open,
  preferredSignalIds,
  projection,
}: ForecastWorkspaceProps) {
  const currentForecast = projection.forecasts.at(-1);
  const teamForecast = latestForActor(projection.forecasts, 'team');
  const playerForecast = latestForActor(projection.forecasts, 'player');
  const baseline = percent(
    currentForecast?.newProbabilities['yes'] ??
      projection.market.currentPublicProbabilities?.['yes'] ??
      0.5,
  );
  const [yesProbability, setYesProbability] = useState(baseline);
  const [selectedSignalIds, setSelectedSignalIds] = useState(() =>
    initialEvidence(projection, preferredSignalIds),
  );
  const [publicNote, setPublicNote] = useState('');
  const [privateMemo, setPrivateMemo] = useState('');
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [uncertaintyLow, setUncertaintyLow] = useState(Math.max(0, baseline - 4));
  const [uncertaintyHigh, setUncertaintyHigh] = useState(Math.min(100, baseline + 4));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const signals = useMemo(
    () =>
      Object.values(projection.signalsById).sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
      ),
    [projection.signalsById],
  );
  const selectedSignals = selectedSignalIds
    .map((id) => projection.signalsById[id])
    .filter((signal) => signal !== undefined);
  const remainingSignals = signals.filter((signal) => !selectedSignalIds.includes(signal.id));
  const isHold = yesProbability === baseline;
  const validationErrors = [
    ...(yesProbability < 0 || yesProbability > 100
      ? ['Probability must be between 0 and 100.']
      : []),
    ...(!isHold && selectedSignalIds.length === 0
      ? ['A revised forecast requires at least one linked signal.']
      : []),
    ...(publicNote.trim().length === 0 ? ['Add a public note explaining the forecast.'] : []),
    ...(publicNote.length > 280 ? ['Public note must be 280 characters or fewer.'] : []),
    ...(showUncertainty &&
    (uncertaintyLow < 0 ||
      uncertaintyHigh > 100 ||
      uncertaintyLow > yesProbability ||
      uncertaintyHigh < yesProbability)
      ? ['The uncertainty band must contain the committed probability.']
      : []),
  ];

  const setProbability = (value: number) => {
    const bounded = Math.min(100, Math.max(0, Math.round(value)));
    setYesProbability(bounded);
    setSuccess(undefined);
  };

  const moveEvidence = (signalId: string, direction: -1 | 1) => {
    setSelectedSignalIds((current) => {
      const index = current.indexOf(signalId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target] as string, next[index] as string];
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (validationErrors.length > 0 || busy) return;
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const trimmedMemo = privateMemo.trim();
      await onCommit({
        yesProbability: yesProbability / 100,
        evidenceSignalIds: selectedSignalIds,
        publicNote: publicNote.trim(),
        ...(trimmedMemo ? { privateMemo: trimmedMemo } : {}),
        ...(showUncertainty
          ? {
              uncertainty: {
                yes: { low: uncertaintyLow / 100, high: uncertaintyHigh / 100 },
                no: {
                  low: (100 - uncertaintyHigh) / 100,
                  high: (100 - uncertaintyLow) / 100,
                },
              },
            }
          : {}),
      });
      setSuccess(
        `${isHold ? 'Hold' : 'Revision'} committed at ${yesProbability}%. The event is now in forecast history.`,
      );
      setPrivateMemo('');
    } catch (commitError: unknown) {
      setError(commitError instanceof Error ? commitError.message : 'Forecast commit failed.');
    } finally {
      setBusy(false);
    }
  };

  const publicProbability = percent(projection.market.currentPublicProbabilities?.['yes']);
  const teamProbability = percent(teamForecast?.newProbabilities['yes']);
  const playerProbability = playerForecast
    ? percent(playerForecast.newProbabilities['yes'])
    : undefined;
  const dialStyle = {
    '--atlas-forecast-value': `${yesProbability}%`,
  } as CSSProperties;

  return (
    <Dialog
      description="Record a simulated probability update with an explicit rationale and evidence trail."
      onClose={onClose}
      open={open}
      title="Commit Forecast"
    >
      <div className="atlas-forecast-dialog">
        <div className="atlas-forecast-heading">
          <div>
            <span className="atlas-kicker">Meridian Observatory / Forecast desk</span>
            <p>{projection.market.question}</p>
          </div>
          <span className="atlas-forecast-safety">
            <i aria-hidden="true">◇</i>
            Simulated research record
          </span>
        </div>

        <form className="atlas-forecast-form" onSubmit={(event) => void submit(event)}>
          <section className="atlas-forecast-control" aria-labelledby="forecast-probability-title">
            <div className="atlas-forecast-section-heading">
              <div>
                <span className="atlas-kicker">Probability</span>
                <h3 id="forecast-probability-title">Set the YES forecast</h3>
              </div>
              <span className="atlas-forecast-commit-kind" data-kind={isHold ? 'hold' : 'revision'}>
                {isHold ? 'Hold' : 'Revision'} · {yesProbability - baseline >= 0 ? '+' : '−'}
                {Math.abs(yesProbability - baseline)} pts
              </span>
            </div>

            <div className="atlas-forecast-dial" style={dialStyle}>
              <div className="atlas-forecast-dial__number">
                <label htmlFor="forecast-number">YES probability</label>
                <span>
                  <input
                    aria-describedby="forecast-sum"
                    id="forecast-number"
                    inputMode="numeric"
                    max={100}
                    min={0}
                    onChange={(event) => setProbability(Number(event.currentTarget.value))}
                    step={1}
                    type="number"
                    value={yesProbability}
                  />
                  <b>%</b>
                </span>
              </div>
              <input
                aria-label={`YES probability ${yesProbability} percent`}
                className="atlas-forecast-range"
                max={100}
                min={0}
                onChange={(event) => setProbability(Number(event.currentTarget.value))}
                step={1}
                type="range"
                value={yesProbability}
              />
              <div className="atlas-forecast-axis" aria-hidden="true">
                <span>0 · impossible</span>
                <span>50 · even</span>
                <span>100 · certain</span>
              </div>
              <p id="forecast-sum">
                <strong>YES {yesProbability}%</strong>
                <span>+</span>
                <strong>NO {100 - yesProbability}%</strong>
                <span>= 100%</span>
              </p>
            </div>

            <div
              className="atlas-forecast-comparison"
              aria-label="Forecast comparison"
              role="region"
            >
              <article data-tone="public">
                <small>Public market</small>
                <strong>{publicProbability}%</strong>
                <span>Observed fixture price</span>
              </article>
              <article data-tone="team">
                <small>Team forecast</small>
                <strong>{teamProbability}%</strong>
                <span>Latest team commit</span>
              </article>
              <article data-tone="player">
                <small>Prior player</small>
                <strong>{playerProbability === undefined ? '—' : `${playerProbability}%`}</strong>
                <span>{playerForecast ? 'Latest player commit' : 'No prior commit'}</span>
              </article>
            </div>

            <fieldset className="atlas-forecast-uncertainty">
              <legend>Uncertainty band</legend>
              <label className="atlas-switch-row">
                <input
                  checked={showUncertainty}
                  onChange={(event) => setShowUncertainty(event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Add a range</strong>
                  <small>Show the plausible interval around this point estimate.</small>
                </span>
              </label>
              {showUncertainty && (
                <div className="atlas-forecast-band-fields">
                  <label>
                    Lower bound
                    <span>
                      <input
                        max={yesProbability}
                        min={0}
                        onChange={(event) => setUncertaintyLow(Number(event.currentTarget.value))}
                        type="number"
                        value={uncertaintyLow}
                      />
                      %
                    </span>
                  </label>
                  <i aria-hidden="true">to</i>
                  <label>
                    Upper bound
                    <span>
                      <input
                        max={100}
                        min={yesProbability}
                        onChange={(event) => setUncertaintyHigh(Number(event.currentTarget.value))}
                        type="number"
                        value={uncertaintyHigh}
                      />
                      %
                    </span>
                  </label>
                </div>
              )}
            </fieldset>
          </section>

          <section className="atlas-forecast-evidence" aria-labelledby="forecast-evidence-title">
            <div className="atlas-forecast-section-heading">
              <div>
                <span className="atlas-kicker">Evidence trail</span>
                <h3 id="forecast-evidence-title">Linked signal chips</h3>
              </div>
              <span>{selectedSignalIds.length} selected</span>
            </div>

            {selectedSignals.length > 0 ? (
              <ol className="atlas-forecast-chips">
                {selectedSignals.map((signal, index) => (
                  <li key={signal.id}>
                    <span aria-hidden="true">{index + 1}</span>
                    <div>
                      <strong>{signal.headline}</strong>
                      <small>{signal.direction.replaceAll('_', ' ')} · linked signal</small>
                    </div>
                    <span className="atlas-forecast-chip-actions">
                      <button
                        aria-label={`Move ${signal.headline} earlier`}
                        disabled={index === 0}
                        onClick={() => moveEvidence(signal.id, -1)}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${signal.headline} later`}
                        disabled={index === selectedSignals.length - 1}
                        onClick={() => moveEvidence(signal.id, 1)}
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        aria-label={`Remove ${signal.headline}`}
                        onClick={() =>
                          setSelectedSignalIds((current) =>
                            current.filter((id) => id !== signal.id),
                          )
                        }
                        type="button"
                      >
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="atlas-forecast-empty">
                No linked evidence. This is allowed only when holding the current probability.
              </p>
            )}

            {remainingSignals.length > 0 && (
              <details className="atlas-forecast-available">
                <summary>Add discovered evidence ({remainingSignals.length})</summary>
                <ul>
                  {remainingSignals.map((signal) => (
                    <li key={signal.id}>
                      <span>
                        <strong>{signal.headline}</strong>
                        <small>{signal.summary}</small>
                      </span>
                      <button
                        onClick={() => setSelectedSignalIds((current) => [...current, signal.id])}
                        type="button"
                      >
                        + Add
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="atlas-forecast-notes">
              <label>
                <span>
                  <strong>Public note</strong>
                  <small>{publicNote.length}/280</small>
                </span>
                <textarea
                  maxLength={280}
                  onChange={(event) => {
                    setPublicNote(event.currentTarget.value);
                    setSuccess(undefined);
                  }}
                  placeholder="What changed, and which evidence moved you?"
                  required
                  rows={3}
                  value={publicNote}
                />
              </label>
              <label>
                <span>
                  <strong>Private memo</strong>
                  <small>Optional · stored locally</small>
                </span>
                <textarea
                  onChange={(event) => setPrivateMemo(event.currentTarget.value)}
                  placeholder="Assumptions or a reminder for your future review…"
                  rows={3}
                  value={privateMemo}
                />
              </label>
            </div>

            <aside className="atlas-forecast-score-rule" aria-label="Forecast scoring rule">
              <span aria-hidden="true">◎</span>
              <div>
                <strong>Brier scoring after resolution</strong>
                <p>
                  Squared error across both outcomes: 0 is perfect and 2 is the maximum error. The
                  score measures calibration, never money.
                </p>
              </div>
            </aside>

            {validationErrors.length > 0 && (
              <div className="atlas-forecast-validation" role="alert">
                <strong>Before committing</strong>
                <ul>
                  {validationErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <p className="atlas-forecast-message" data-tone="error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="atlas-forecast-message" data-tone="success" role="status">
                {success}
              </p>
            )}

            <div className="atlas-forecast-actions">
              <button onClick={onClose} type="button">
                Cancel
              </button>
              <button disabled={busy || validationErrors.length > 0} type="submit">
                {busy ? 'Recording forecast…' : `Commit Forecast · ${yesProbability}%`}
              </button>
            </div>
          </section>
        </form>

        <section className="atlas-forecast-history" aria-labelledby="forecast-history-title">
          <div className="atlas-forecast-section-heading">
            <div>
              <span className="atlas-kicker">Authoritative event history</span>
              <h3 id="forecast-history-title">Forecast path</h3>
            </div>
            <span>{projection.forecasts.length} commits</span>
          </div>
          <ol>
            {[...projection.forecasts].reverse().map((forecast) => {
              const score = projection.scores.find(
                (candidate) => candidate.forecastCommitId === forecast.id,
              );
              return (
                <li key={forecast.id}>
                  <i aria-hidden="true" />
                  <div className="atlas-forecast-history__summary">
                    <span>
                      <strong>{percent(forecast.newProbabilities['yes'])}% YES</strong>
                      <small>{probabilityDelta(forecast)}</small>
                    </span>
                    <span>
                      <b>{actorLabel(forecast)}</b>
                      <time dateTime={forecast.committedAt}>
                        {dateLabel(forecast.committedAt)} UTC
                      </time>
                    </span>
                  </div>
                  <p>{forecast.publicNote ?? forecast.rationale}</p>
                  <div className="atlas-forecast-history__evidence">
                    {forecast.evidenceSignalIds.length > 0 ? (
                      forecast.evidenceSignalIds.map((id) => (
                        <span key={id}>{projection.signalsById[id]?.headline ?? id}</span>
                      ))
                    ) : (
                      <span>No new evidence · prior</span>
                    )}
                    {score && <strong>Brier {score.brierScore.toFixed(3)}</strong>}
                  </div>
                  {forecast.privateMemo && (
                    <details>
                      <summary>Private memo</summary>
                      <p>{forecast.privateMemo}</p>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </Dialog>
  );
}
