import { Dialog } from '@signal-atlas/ui';
import type { CodexRuntimeDiagnostics, RuntimeTurnRecord } from '@signal-atlas/codex-runtime';
import { useCallback, useEffect, useState } from 'react';

import { fetchRuntimeDiagnostics } from './runtime-client.js';

export interface RuntimeDiagnosticsDialogProps {
  open: boolean;
  onClose: () => void;
}

function dateLabel(value: string | undefined): string {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function statusLabel(status: RuntimeTurnRecord['status']): string {
  return status.replace('_', ' ');
}

export function RuntimeDiagnosticsDialog({ open, onClose }: RuntimeDiagnosticsDialogProps) {
  const [diagnostics, setDiagnostics] = useState<CodexRuntimeDiagnostics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setDiagnostics(await fetchRuntimeDiagnostics());
    } catch (diagnosticError: unknown) {
      setError(
        diagnosticError instanceof Error
          ? diagnosticError.message
          : 'Runtime diagnostics could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    void fetchRuntimeDiagnostics()
      .then((nextDiagnostics) => {
        if (!active) return;
        setError(undefined);
        setDiagnostics(nextDiagnostics);
        setLoading(false);
      })
      .catch((diagnosticError: unknown) => {
        if (!active) return;
        setError(
          diagnosticError instanceof Error
            ? diagnosticError.message
            : 'Runtime diagnostics could not be loaded.',
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  return (
    <Dialog
      description="Inspect the bounded driver, scheduler capacity, and persisted turn outcomes."
      onClose={onClose}
      open={open}
      title="Codex Runtime Diagnostics"
    >
      <div className="atlas-runtime-diagnostics">
        {loading && !diagnostics ? (
          <p className="atlas-runtime-diagnostics__empty" role="status">
            Reading runtime diagnostics…
          </p>
        ) : error ? (
          <div className="atlas-runtime-diagnostics__empty" role="alert">
            <strong>Diagnostics unavailable</strong>
            <p>{error}</p>
            <button onClick={() => void refresh()} type="button">
              Retry
            </button>
          </div>
        ) : diagnostics ? (
          <>
            <section className="atlas-runtime-driver" aria-labelledby="runtime-driver-title">
              <header>
                <div>
                  <span className="atlas-kicker">Replaceable driver boundary</span>
                  <h3 id="runtime-driver-title">{diagnostics.driver.id}</h3>
                </div>
                <span data-available={diagnostics.driver.available}>
                  <i aria-hidden="true" />
                  {diagnostics.driver.available ? 'Available' : 'Unavailable'}
                </span>
              </header>
              <p>{diagnostics.driver.description}</p>
              {diagnostics.driver.activeMode === 'scripted_fallback' && (
                <p className="atlas-runtime-driver__fallback" role="status">
                  <strong>Scripted fallback active.</strong>{' '}
                  {diagnostics.driver.fallback?.reason ?? 'The local executable is unavailable.'}
                </p>
              )}
              <dl>
                <div>
                  <dt>Mode</dt>
                  <dd>
                    {(diagnostics.driver.activeMode ?? diagnostics.driver.kind).replaceAll(
                      '_',
                      ' ',
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Driver runs</dt>
                  <dd>{diagnostics.driver.runs}</dd>
                </div>
                <div>
                  <dt>Last run</dt>
                  <dd>{dateLabel(diagnostics.driver.lastRunAt)}</dd>
                </div>
                <div>
                  <dt>Process command</dt>
                  <dd>
                    {diagnostics.driver.command ? (
                      <code>{diagnostics.driver.command.display}</code>
                    ) : (
                      'None · scripted mode'
                    )}
                  </dd>
                </div>
              </dl>
              {diagnostics.driver.lastError && (
                <p className="atlas-runtime-driver__error">{diagnostics.driver.lastError}</p>
              )}
            </section>

            <section className="atlas-runtime-scheduler" aria-labelledby="runtime-scheduler-title">
              <header>
                <div>
                  <span className="atlas-kicker">Queue and concurrency</span>
                  <h3 id="runtime-scheduler-title">Agent scheduler</h3>
                </div>
                <button disabled={loading} onClick={() => void refresh()} type="button">
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </header>
              <div className="atlas-runtime-meters">
                <article>
                  <small>Concurrency</small>
                  <strong>{diagnostics.scheduler.maxConcurrency}</strong>
                  <span>configured turn slots</span>
                </article>
                <article>
                  <small>Active</small>
                  <strong>{diagnostics.scheduler.activeCount}</strong>
                  <span>running now</span>
                </article>
                <article>
                  <small>Queued</small>
                  <strong>{diagnostics.scheduler.queuedCount}</strong>
                  <span>waiting safely</span>
                </article>
                <article>
                  <small>Timeout</small>
                  <strong>{Math.round(diagnostics.scheduler.defaultTimeoutMs / 1_000)}s</strong>
                  <span>default ceiling</span>
                </article>
              </div>
            </section>

            <section className="atlas-runtime-turns" aria-labelledby="runtime-turns-title">
              <header>
                <div>
                  <span className="atlas-kicker">Persisted outcomes</span>
                  <h3 id="runtime-turns-title">Runtime turns</h3>
                </div>
                <span>
                  {diagnostics.totals.completed} complete · {diagnostics.totals.failed} failed ·{' '}
                  {diagnostics.totals.timed_out} timed out · {diagnostics.totals.canceled} canceled
                </span>
              </header>
              {diagnostics.turns.length === 0 ? (
                <p className="atlas-runtime-diagnostics__empty">
                  No runtime turn has started. Dispatch an evidence mission to create one.
                </p>
              ) : (
                <ol>
                  {diagnostics.turns.map((turn) => (
                    <li data-status={turn.status} key={turn.turnId}>
                      <i aria-hidden="true" />
                      <div>
                        <span>
                          <strong>{turn.agentId}</strong>
                          <small>{turn.missionId}</small>
                        </span>
                        <span>
                          <b>{statusLabel(turn.status)}</b>
                          <time dateTime={turn.finishedAt ?? turn.startedAt ?? turn.queuedAt}>
                            {dateLabel(turn.finishedAt ?? turn.startedAt ?? turn.queuedAt)} UTC
                          </time>
                        </span>
                      </div>
                      <p>
                        Turn <code>{turn.turnId}</code> · attempt {turn.attempt} · timeout{' '}
                        {Math.round(turn.timeoutMs / 1_000)}s
                      </p>
                      {turn.error && (
                        <p className="atlas-runtime-turns__error">
                          <strong>{turn.error.code}</strong> {turn.error.message}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <footer className="atlas-runtime-diagnostics__footer">
              <span>
                <i aria-hidden="true">◇</i> No prompt text, private reasoning, source content, or
                secrets are shown here.
              </span>
              <button onClick={onClose} type="button">
                Done
              </button>
            </footer>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
