import { Dialog } from '@signal-atlas/ui';

import type { ShellSignal } from './model.js';

export interface SourceInspectorProps {
  archived: boolean;
  pinned: boolean;
  signal: ShellSignal | undefined;
  onArchive: (signalId: string) => void;
  onClose: () => void;
  onPin: (signalId: string) => void;
}

function sentenceCase(value: string): string {
  return value
    .split('_')
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

function Timestamp({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ? <time dateTime={value}>{dateLabel(value)} UTC</time> : 'Not recorded'}</dd>
    </div>
  );
}

export function SourceInspector({
  archived,
  onArchive,
  onClose,
  onPin,
  pinned,
  signal,
}: SourceInspectorProps) {
  return (
    <Dialog
      {...(signal
        ? {
            description: `${signal.direction}; ${signal.impact} impact; ${signal.sourceCount} source${signal.sourceCount === 1 ? '' : 's'}.`,
          }
        : {})}
      onClose={onClose}
      open={Boolean(signal)}
      title={signal?.headline ?? 'Signal source inspector'}
    >
      {signal && (
        <div className="atlas-source-inspector">
          <section className="atlas-inspector-summary" aria-label="Signal assessment">
            <div>
              <span className="atlas-direction-label" data-tone={signal.tone}>
                <b aria-hidden="true">
                  {signal.tone === 'support' ? '↗' : signal.tone === 'oppose' ? '↘' : '◆'}
                </b>{' '}
                {signal.direction}
              </span>
              <span>
                {signal.impact} impact · {signal.impactRange}
              </span>
            </div>
            <div className="atlas-signal-state-labels">
              <span data-state={signal.status}>{signal.statusLabel}</span>
              <span>{signal.freshness}</span>
              {signal.correlations.length > 0 ? (
                <span data-state="correlated">Correlated</span>
              ) : signal.correlationGroupIds.length > 0 ? (
                <span data-state="unreviewed">Independence unreviewed</span>
              ) : null}
            </div>
            <p>{signal.summary}</p>
            {signal.status === 'stale' && (
              <p className="atlas-stale-evidence-notice" role="status">
                <strong>Stale evidence retained for audit.</strong> Re-check the provider before
                treating this signal as current.
              </p>
            )}
          </section>

          <div className="atlas-inspector-grid">
            <section aria-labelledby="inspector-interpretation-heading">
              <span className="atlas-kicker">Agent interpretation</span>
              <h3 id="inspector-interpretation-heading">Claims and assessment</h3>
              {signal.claims.length > 0 ? (
                <ol className="atlas-inspector-claims">
                  {signal.claims.map((claim) => (
                    <li key={claim.id}>
                      <p>{claim.text}</p>
                      <small>
                        {claim.qualifiers.length > 0
                          ? `Qualified: ${claim.qualifiers.join('; ')}`
                          : 'No additional qualifier recorded.'}
                      </small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p role="alert">No claim record is available for this signal.</p>
              )}

              <h4>Reliability · {signal.reliability}</h4>
              <ul>
                {signal.reliabilityReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>

              <h4>Who knows this?</h4>
              <div className="atlas-knowledge-chips" aria-label="Agents who know this signal">
                {signal.knownBy.length > 0 ? (
                  signal.knownBy.map((agent) => (
                    <span key={agent.id} title={`Acquired by ${sentenceCase(agent.acquisition)}`}>
                      <i className="atlas-mini-portrait" aria-hidden="true" />
                      {agent.name}
                    </span>
                  ))
                ) : (
                  <em>No agent knowledge edge recorded</em>
                )}
              </div>

              <h4>Independence and correlation</h4>
              {signal.correlations.length > 0 ? (
                signal.correlations.map((correlation) => (
                  <article className="atlas-correlation-note" key={correlation.id}>
                    <strong>{sentenceCase(correlation.relationship)}</strong>
                    <p>{correlation.reasons.join(' ')}</p>
                  </article>
                ))
              ) : (
                <p className="atlas-correlation-note">
                  Independence has not been established
                  {signal.correlationGroupIds.length > 0
                    ? `; watch ${signal.correlationGroupIds.join(', ')}.`
                    : '.'}
                </p>
              )}
            </section>

            <section aria-labelledby="inspector-sources-heading">
              <span className="atlas-kicker">Source layer</span>
              <h3 id="inspector-sources-heading">
                {signal.sourceCount} source{signal.sourceCount === 1 ? '' : 's'}
              </h3>
              {signal.sources.length > 0 ? (
                <div className="atlas-inspector-sources">
                  {signal.sources.map((source) => (
                    <article key={source.id}>
                      <header>
                        <div>
                          <strong>{source.title}</strong>
                          <small>
                            {source.publisher ?? 'Unknown publisher'} ·{' '}
                            {sentenceCase(source.sourceClass)} · v{source.version}
                          </small>
                        </div>
                        <span>
                          {source.rights?.display
                            ? sentenceCase(source.rights.display)
                            : 'Rights unknown'}
                        </span>
                      </header>
                      {source.tags.includes('real-world-proxy') && (
                        <p className="atlas-proxy-source-notice">
                          <strong>Real-world proxy · context only.</strong> This source does not
                          directly observe the scenario market or establish an outcome.
                        </p>
                      )}
                      {source.excerpt && <blockquote>{source.excerpt}</blockquote>}
                      <dl className="atlas-source-times">
                        <Timestamp label="Published" value={source.publishedAt} />
                        <Timestamp label="Observed" value={source.observedAt} />
                        <Timestamp label="Retrieved" value={source.retrievedAt} />
                        <div>
                          <dt>Location</dt>
                          <dd>
                            {source.location?.label ?? signal.sourceLocation ?? 'Not recorded'}
                          </dd>
                        </div>
                      </dl>
                      <div className="atlas-provenance-block">
                        <h4>Retrieval provenance</h4>
                        <dl>
                          <div>
                            <dt>Source record</dt>
                            <dd>
                              <code>{source.id}</code>
                            </dd>
                          </div>
                          <div>
                            <dt>Supersedes</dt>
                            <dd>
                              <code>{source.supersedesSourceId ?? 'No earlier version'}</code>
                            </dd>
                          </div>
                          <div>
                            <dt>Gateway</dt>
                            <dd>{source.provenance.serverName}</dd>
                          </div>
                          <div>
                            <dt>Transport</dt>
                            <dd>{sentenceCase(source.provenance.transport)}</dd>
                          </div>
                          <div>
                            <dt>Primitive</dt>
                            <dd>
                              {sentenceCase(source.provenance.primitive)} ·{' '}
                              {source.provenance.primitiveName}
                            </dd>
                          </div>
                          <div>
                            <dt>Call ID</dt>
                            <dd>{source.provenance.callId ?? 'Not recorded'}</dd>
                          </div>
                          <div>
                            <dt>Arguments hash</dt>
                            <dd>
                              <code>{source.provenance.argumentsHash ?? 'Not recorded'}</code>
                            </dd>
                          </div>
                          <div>
                            <dt>Response hash</dt>
                            <dd>
                              <code>{source.provenance.responseHash}</code>
                            </dd>
                          </div>
                          <div>
                            <dt>Content hash</dt>
                            <dd>
                              <code>{source.contentHash}</code>
                            </dd>
                          </div>
                          <div>
                            <dt>Source tags</dt>
                            <dd>{source.tags.length > 0 ? source.tags.join(' · ') : 'None'}</dd>
                          </div>
                        </dl>
                      </div>
                      {source.externalUri && (
                        <p className="atlas-source-uri">
                          Source identifier: <code>{source.externalUri}</code>
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p role="alert">The projection is missing this signal's source record.</p>
              )}
            </section>
          </div>

          <footer className="atlas-inspector-actions">
            <span>
              {signal.linkedBeliefUpdates.length} linked belief update
              {signal.linkedBeliefUpdates.length === 1 ? '' : 's'}
            </span>
            <div>
              <button onClick={() => onArchive(signal.id)} type="button">
                {archived ? 'Restore to New' : 'Archive signal'}
              </button>
              <button onClick={() => onPin(signal.id)} type="button">
                {pinned ? 'Unpin from case file' : 'Pin to case file'}
              </button>
              <button onClick={onClose} type="button">
                Done
              </button>
            </div>
          </footer>
        </div>
      )}
    </Dialog>
  );
}
