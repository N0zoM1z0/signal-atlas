import { Dialog } from '@signal-atlas/ui';
import type { RuntimeTurnRecord } from '@signal-atlas/codex-runtime';
import type { PrefMcpConnectionDiagnostics } from '@signal-atlas/pref-gateway';
import { useCallback, useEffect, useState } from 'react';

import {
  disconnectPrefConnection,
  fetchPrefDiagnostics,
  fetchRuntimeDiagnostics,
  testPrefConnection,
  type SignalAtlasRuntimeDiagnostics,
} from './runtime-client.js';

export interface RuntimeDiagnosticsDialogProps {
  open: boolean;
  onClose: () => void;
  onPrefConnectionChange?: (connected: boolean) => void;
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

function connectionLabel(state: PrefMcpConnectionDiagnostics['state']): string {
  return state.replaceAll('_', ' ');
}

function primitiveNames(diagnostics: PrefMcpConnectionDiagnostics): string[] {
  return [
    ...diagnostics.inventory.tools.map((primitive) => primitive.name),
    ...diagnostics.inventory.resources.map((primitive) => primitive.name),
    ...diagnostics.inventory.resourceTemplates.map((primitive) => primitive.name),
    ...diagnostics.inventory.prompts.map((primitive) => primitive.name),
  ];
}

export function RuntimeDiagnosticsDialog({
  open,
  onClose,
  onPrefConnectionChange,
}: RuntimeDiagnosticsDialogProps) {
  const [diagnostics, setDiagnostics] = useState<SignalAtlasRuntimeDiagnostics>();
  const [prefDiagnostics, setPrefDiagnostics] = useState<PrefMcpConnectionDiagnostics>();
  const [loading, setLoading] = useState(true);
  const [prefBusy, setPrefBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [prefError, setPrefError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setPrefError(undefined);
    const [runtimeResult, prefResult] = await Promise.allSettled([
      fetchRuntimeDiagnostics(),
      fetchPrefDiagnostics(),
    ]);
    if (runtimeResult.status === 'fulfilled') {
      setDiagnostics(runtimeResult.value);
    } else {
      setError(
        runtimeResult.reason instanceof Error
          ? runtimeResult.reason.message
          : 'Runtime diagnostics could not be loaded.',
      );
    }
    if (prefResult.status === 'fulfilled') {
      setPrefDiagnostics(prefResult.value);
      onPrefConnectionChange?.(prefResult.value.connected);
    } else {
      setPrefError(
        prefResult.reason instanceof Error
          ? prefResult.reason.message
          : 'Pref connection diagnostics could not be loaded.',
      );
    }
    setLoading(false);
  }, [onPrefConnectionChange]);

  const changePrefConnection = useCallback(
    async (action: 'test' | 'disconnect') => {
      setPrefBusy(true);
      setPrefError(undefined);
      try {
        const next =
          action === 'test' ? await testPrefConnection() : await disconnectPrefConnection();
        setPrefDiagnostics(next);
        onPrefConnectionChange?.(next.connected);
      } catch (connectionError: unknown) {
        setPrefError(
          connectionError instanceof Error
            ? connectionError.message
            : 'The Pref connection action could not be completed.',
        );
      } finally {
        setPrefBusy(false);
      }
    },
    [onPrefConnectionChange],
  );

  useEffect(() => {
    if (!open) return undefined;
    const refreshTimer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(refreshTimer);
  }, [open, refresh]);

  return (
    <Dialog
      description="Inspect the bounded agent driver, Pref source gateway, scheduler, and persisted outcomes."
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
                  {diagnostics.driver.activeMode === 'scripted_fallback'
                    ? 'Fallback available'
                    : diagnostics.driver.available
                      ? 'Available'
                      : 'Unavailable'}
                </span>
              </header>
              <p>{diagnostics.driver.description}</p>
              {diagnostics.driver.activeMode === 'scripted_fallback' && (
                <p className="atlas-runtime-driver__fallback" role="status">
                  <strong>Local Codex unavailable · scripted fixture fallback active.</strong>{' '}
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

            <section className="atlas-runtime-driver" aria-labelledby="runtime-professor-title">
              <header>
                <div>
                  <span className="atlas-kicker">Evidence-bound consultation agent</span>
                  <h3 id="runtime-professor-title">Professor · {diagnostics.professor.id}</h3>
                </div>
                <span data-available={diagnostics.professor.available}>
                  <i aria-hidden="true" />
                  {diagnostics.professor.activeMode === 'scripted_fallback'
                    ? 'Fallback used'
                    : diagnostics.professor.available
                      ? 'Available'
                      : 'Unavailable'}
                </span>
              </header>
              <p>{diagnostics.professor.description}</p>
              {diagnostics.professor.activeMode === 'scripted_fallback' && (
                <p className="atlas-runtime-driver__fallback" role="status">
                  <strong>Last Professor answer used the authored fallback.</strong>{' '}
                  {diagnostics.professor.lastError ??
                    'The local response was not accepted by the bounded runtime.'}
                </p>
              )}
              <dl>
                <div>
                  <dt>Configured</dt>
                  <dd>{diagnostics.professor.configuredMode}</dd>
                </div>
                <div>
                  <dt>Last answer</dt>
                  <dd>{diagnostics.professor.activeMode.replaceAll('_', ' ')}</dd>
                </div>
                <div>
                  <dt>Runs / repairs</dt>
                  <dd>
                    {diagnostics.professor.runs} / {diagnostics.professor.repairCount}
                  </dd>
                </div>
                <div>
                  <dt>Fallbacks</dt>
                  <dd>{diagnostics.professor.fallbackCount}</dd>
                </div>
                <div>
                  <dt>Last run</dt>
                  <dd>{dateLabel(diagnostics.professor.lastRunAt)}</dd>
                </div>
                <div>
                  <dt>Process command</dt>
                  <dd>
                    {diagnostics.professor.command ? (
                      <code>{diagnostics.professor.command.display}</code>
                    ) : (
                      'None · scripted mode'
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="atlas-runtime-driver" aria-labelledby="runtime-workspace-title">
              <header>
                <div>
                  <span className="atlas-kicker">Local authoritative history</span>
                  <h3 id="runtime-workspace-title">Workspace persistence</h3>
                </div>
                <span data-available={diagnostics.workspace.state === 'ready'}>
                  <i aria-hidden="true" />
                  {diagnostics.workspace.state}
                </span>
              </header>
              <p>
                {diagnostics.workspace.mode === 'sqlite'
                  ? 'Append-only events and command receipts are stored in the local SQLite workspace.'
                  : 'This runtime is intentionally ephemeral; authoritative history remains in memory.'}
              </p>
              {diagnostics.workspace.issue && (
                <p className="atlas-runtime-driver__error" role="alert">
                  <strong>Persistence paused.</strong> {diagnostics.workspace.issue.message}
                </p>
              )}
              <dl>
                <div>
                  <dt>Mode</dt>
                  <dd>{diagnostics.workspace.mode}</dd>
                </div>
                <div>
                  <dt>Events / latest</dt>
                  <dd>
                    {diagnostics.workspace.eventCount} / {diagnostics.workspace.latestSequence}
                  </dd>
                </div>
                <div>
                  <dt>Replay base</dt>
                  <dd>SEQ {diagnostics.workspace.replayBaseSequence}</dd>
                </div>
                <div>
                  <dt>Checkpoint interval</dt>
                  <dd>{diagnostics.workspace.checkpointInterval} events</dd>
                </div>
                <div>
                  <dt>Checkpoints / latest</dt>
                  <dd>
                    {diagnostics.workspace.store?.checkpointCount ?? 0} / SEQ{' '}
                    {diagnostics.workspace.store?.latestCheckpointSequence ?? 0}
                  </dd>
                </div>
                <div>
                  <dt>Schema / invalid</dt>
                  <dd>
                    v{diagnostics.workspace.store?.schemaVersion ?? 'memory'} /{' '}
                    {diagnostics.workspace.invalidCheckpointCount}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="atlas-pref-connection" aria-labelledby="pref-connection-title">
              <header>
                <div>
                  <span className="atlas-kicker">Read-only source gateway</span>
                  <h3 id="pref-connection-title">Pref MCP connection</h3>
                </div>
                {prefDiagnostics && (
                  <span data-state={prefDiagnostics.state}>
                    <i aria-hidden="true" />
                    {connectionLabel(prefDiagnostics.state)}
                  </span>
                )}
              </header>
              {prefError ? (
                <p className="atlas-pref-connection__error" role="alert">
                  {prefError}
                </p>
              ) : prefDiagnostics ? (
                <>
                  <p>
                    {prefDiagnostics.mode === 'fixture'
                      ? 'Deterministic recorded data; no network or credential is used.'
                      : 'Hosted Streamable HTTP; credentials remain in the orchestrator process.'}
                  </p>
                  <p className="atlas-pref-connection__mode-note">
                    <strong>Server-side mode lock.</strong>{' '}
                    {prefDiagnostics.mode === 'fixture'
                      ? 'Restart with SIGNAL_ATLAS_PREF_MODE=live to enable the approved live agent proxy.'
                      : 'Live mode is enabled for this process; restart in fixture mode for deterministic offline play.'}
                  </p>
                  <dl>
                    <div>
                      <dt>Mode</dt>
                      <dd>{prefDiagnostics.mode}</dd>
                    </div>
                    <div>
                      <dt>Credential</dt>
                      <dd>{prefDiagnostics.credentialState.replaceAll('_', ' ')}</dd>
                    </div>
                    <div>
                      <dt>Server</dt>
                      <dd>{prefDiagnostics.endpointHost ?? prefDiagnostics.serverName}</dd>
                    </div>
                    <div>
                      <dt>Last check</dt>
                      <dd>{dateLabel(prefDiagnostics.lastCheckedAt)}</dd>
                    </div>
                  </dl>
                  {prefDiagnostics.lastError && (
                    <p className="atlas-pref-connection__error" role="status">
                      <strong>{prefDiagnostics.lastError.code}</strong>{' '}
                      {prefDiagnostics.lastError.message}
                    </p>
                  )}
                  <div className="atlas-pref-inventory">
                    <article>
                      <span>
                        <small>Discovered primitives</small>
                        <strong>{primitiveNames(prefDiagnostics).length}</strong>
                      </span>
                      {primitiveNames(prefDiagnostics).length > 0 ? (
                        <ul>
                          {primitiveNames(prefDiagnostics)
                            .slice(0, 8)
                            .map((name) => (
                              <li key={name}>
                                <code>{name}</code>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p>No primitives have been discovered.</p>
                      )}
                    </article>
                    <article>
                      <span>
                        <small>Capability mappings</small>
                        <strong>
                          {
                            prefDiagnostics.mappings.filter((mapping) => mapping.status === 'valid')
                              .length
                          }
                          /{prefDiagnostics.mappings.length}
                        </strong>
                      </span>
                      {prefDiagnostics.mappings.length > 0 ? (
                        <ul>
                          {prefDiagnostics.mappings.map((mapping) => (
                            <li data-status={mapping.status} key={mapping.canonicalName}>
                              <div>
                                <code>{mapping.canonicalName}</code>
                                <small>{mapping.toolRef}</small>
                              </div>
                              <span>{mapping.status}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No approved capability mapping is available.</p>
                      )}
                    </article>
                  </div>
                  <div className="atlas-pref-connection__actions">
                    <button
                      disabled={prefBusy}
                      onClick={() => void changePrefConnection('test')}
                      type="button"
                    >
                      {prefBusy ? 'Checking…' : 'Test / reconnect'}
                    </button>
                    <button
                      disabled={prefBusy || !prefDiagnostics.connected}
                      onClick={() => void changePrefConnection('disconnect')}
                      type="button"
                    >
                      Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <p role="status">Reading Pref connection diagnostics…</p>
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
                <i aria-hidden="true">◇</i> No credential, prompt text, private reasoning, raw
                source content, or secret is shown here.
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
