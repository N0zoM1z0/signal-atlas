import {
  createArchiveIndex,
  searchArchive,
  type ArchiveEntry,
  type ArchiveEntryKind,
  type ArchiveSearchQuery,
} from '@signal-atlas/archive';
import type { SourceRecord, WorldEvent } from '@signal-atlas/contracts';
import type { WorldProjection } from '@signal-atlas/simulation';
import { useMemo, useState, type KeyboardEvent } from 'react';

export interface ArchiveWorkspaceProps {
  caseFileEntryIds: readonly string[];
  events: readonly WorldEvent[];
  loading: boolean;
  projection: WorldProjection;
  onClose: () => void;
  onOpenReplay: (sequence: number) => void;
  onToggleCaseFile: (archiveId: string) => void;
}

const tabs: readonly ArchiveEntryKind[] = ['source', 'signal', 'memo'];
type ArchiveQueryPatch = {
  [Key in keyof Omit<ArchiveSearchQuery, 'kind'>]?: ArchiveSearchQuery[Key] | undefined;
};

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

function entryKindLabel(kind: ArchiveEntryKind): string {
  return kind === 'memo' ? 'Memo' : sentenceCase(kind);
}

function EntryDetail({ entry }: { entry: ArchiveEntry }) {
  if (entry.kind === 'source') {
    return (
      <div className="atlas-archive-detail-copy">
        <p>{entry.source.excerpt ?? entry.summary}</p>
        <dl>
          <div>
            <dt>Publisher</dt>
            <dd>{entry.source.publisher ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt>Class</dt>
            <dd>{sentenceCase(entry.source.sourceClass)}</dd>
          </div>
          <div>
            <dt>Retrieved</dt>
            <dd>{dateLabel(entry.source.retrievedAt)} UTC</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{entry.source.version}</dd>
          </div>
          <div>
            <dt>Content hash</dt>
            <dd>
              <code>{entry.source.contentHash}</code>
            </dd>
          </div>
          <div>
            <dt>Gateway</dt>
            <dd>{entry.source.provenance.serverName}</dd>
          </div>
        </dl>
        {entry.supersededBySourceId && (
          <p className="atlas-archive-warning">
            Superseded by source <code>{entry.supersededBySourceId}</code>. This version remains
            inspectable.
          </p>
        )}
      </div>
    );
  }
  if (entry.kind === 'signal') {
    return (
      <div className="atlas-archive-detail-copy">
        <p>{entry.signal.summary}</p>
        <dl>
          <div>
            <dt>Direction</dt>
            <dd>{sentenceCase(entry.signal.direction)}</dd>
          </div>
          <div>
            <dt>Impact</dt>
            <dd>{sentenceCase(entry.signal.impact.label)}</dd>
          </div>
          <div>
            <dt>Reliability</dt>
            <dd>{sentenceCase(entry.signal.reliability.label)}</dd>
          </div>
          <div>
            <dt>Freshness</dt>
            <dd>{sentenceCase(entry.signal.freshness.label)}</dd>
          </div>
        </dl>
        <h4>Linked sources</h4>
        <ul>
          {entry.sources.map((source) => (
            <li key={source.id}>{source.title}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="atlas-archive-detail-copy">
      <p>{entry.memo.summary}</p>
      <h4>Agreements</h4>
      <ul>
        {entry.memo.agreements.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h4>Disagreements</h4>
      <ul>
        {entry.memo.disagreements.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonCard({ entry }: { entry: ArchiveEntry }) {
  return (
    <article>
      <span>
        {entryKindLabel(entry.kind)} · {sentenceCase(entry.status)}
      </span>
      <h4>{entry.title}</h4>
      <p>{entry.summary}</p>
      <small>{dateLabel(entry.entryDate)} UTC</small>
    </article>
  );
}

export function ArchiveWorkspace({
  caseFileEntryIds,
  events,
  loading,
  onClose,
  onOpenReplay,
  onToggleCaseFile,
  projection,
}: ArchiveWorkspaceProps) {
  const [tab, setTab] = useState<ArchiveEntryKind>('source');
  const [query, setQuery] = useState<Omit<ArchiveSearchQuery, 'kind'>>({});
  const [selectedArchiveId, setSelectedArchiveId] = useState<string>();
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const index = useMemo(() => createArchiveIndex(projection, events), [events, projection]);
  const results = useMemo(() => searchArchive(index, { ...query, kind: tab }), [index, query, tab]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        tabs.map((kind) => [kind, searchArchive(index, { ...query, kind }).length]),
      ) as Record<ArchiveEntryKind, number>,
    [index, query],
  );
  const selected = results.find((entry) => entry.archiveId === selectedArchiveId) ?? results[0];
  const comparisonEntries = comparisonIds.flatMap((id) => {
    const entry = index.entries.find((candidate) => candidate.archiveId === id);
    return entry ? [entry] : [];
  });
  const caseFileEntries = caseFileEntryIds.flatMap((id) => {
    const entry = index.entries.find((candidate) => candidate.archiveId === id);
    return entry ? [entry] : [];
  });

  const updateQuery = (patch: ArchiveQueryPatch) =>
    setQuery((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete next[key as keyof typeof next];
        else Object.assign(next, { [key]: value });
      }
      return next;
    });
  const toggleComparison = (archiveId: string) => {
    setComparisonIds((current) => {
      if (current.includes(archiveId)) return current.filter((id) => id !== archiveId);
      return [...current.slice(-1), archiveId];
    });
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: ArchiveEntryKind) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const index = tabs.indexOf(current);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (!next) return;
    setTab(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-archive-tab="${next}"]`)
      ?.focus();
  };

  return (
    <main className="atlas-archive-workspace" aria-label="Archive Quarter" aria-busy={loading}>
      <header className="atlas-archive-header">
        <div>
          <span className="atlas-kicker">The Atlas / Archive Quarter</span>
          <h2>Archive Quarter</h2>
          <p>Search the expedition record without collapsing source, signal, and memo layers.</p>
        </div>
        <button onClick={onClose} type="button">
          Return to World <kbd>Esc</kbd>
        </button>
      </header>

      <form className="atlas-archive-search" onSubmit={(event) => event.preventDefault()}>
        <label className="atlas-archive-query">
          Search archive
          <input
            autoComplete="off"
            onChange={(event) => updateQuery({ text: event.target.value || undefined })}
            placeholder="Search text, tags, publisher, place, or agent…"
            type="search"
            value={query.text ?? ''}
          />
        </label>
        <label>
          From
          <input
            onChange={(event) => updateQuery({ dateFrom: event.target.value || undefined })}
            type="date"
            value={query.dateFrom ?? ''}
          />
        </label>
        <label>
          To
          <input
            onChange={(event) => updateQuery({ dateTo: event.target.value || undefined })}
            type="date"
            value={query.dateTo ?? ''}
          />
        </label>
        <label>
          Place
          <select
            aria-label="Place"
            onChange={(event) => updateQuery({ placeId: event.target.value || undefined })}
            value={query.placeId ?? ''}
          >
            <option value="">All places</option>
            {index.placeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source class
          <select
            aria-label="Source class"
            onChange={(event) =>
              updateQuery({
                sourceClass: (event.target.value || undefined) as
                  SourceRecord['sourceClass'] | undefined,
              })
            }
            value={query.sourceClass ?? ''}
          >
            <option value="">All classes</option>
            {index.sourceClassOptions.map((value) => (
              <option key={value} value={value}>
                {sentenceCase(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Agent
          <select
            aria-label="Agent"
            onChange={(event) => updateQuery({ agentId: event.target.value || undefined })}
            value={query.agentId ?? ''}
          >
            <option value="">All agents</option>
            {index.agentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setQuery({})} type="button">
          Clear filters
        </button>
      </form>

      <div className="atlas-archive-body">
        <section className="atlas-archive-shelves" aria-label="Archive results">
          <div className="atlas-archive-tabs" role="tablist" aria-label="Archive record types">
            {tabs.map((kind) => (
              <button
                aria-selected={tab === kind}
                data-archive-tab={kind}
                key={kind}
                onClick={() => setTab(kind)}
                onKeyDown={(event) => onTabKeyDown(event, kind)}
                role="tab"
                tabIndex={tab === kind ? 0 : -1}
                type="button"
              >
                {entryKindLabel(kind)}s {counts[kind]}
              </button>
            ))}
          </div>
          <p className="atlas-archive-result-count" role="status">
            {results.length} matching {entryKindLabel(tab).toLocaleLowerCase('en-US')} record
            {results.length === 1 ? '' : 's'}
          </p>
          {results.length === 0 ? (
            <div className="atlas-archive-empty">
              <span aria-hidden="true">▥</span>
              <strong>No records match these filters</strong>
              <p>Clear a filter or complete another evidence mission.</p>
            </div>
          ) : (
            <ul className="atlas-archive-results">
              {results.map((entry) => (
                <li key={entry.archiveId}>
                  <button
                    aria-pressed={selected?.archiveId === entry.archiveId}
                    onClick={() => setSelectedArchiveId(entry.archiveId)}
                    type="button"
                  >
                    <span>
                      {entryKindLabel(entry.kind)} · {sentenceCase(entry.status)}
                    </span>
                    <strong>{entry.title}</strong>
                    <small>{dateLabel(entry.entryDate)} UTC</small>
                    <p>{entry.summary}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="atlas-archive-inspector" aria-label="Selected archive record">
          {selected ? (
            <>
              <header>
                <span>
                  {entryKindLabel(selected.kind)} · {sentenceCase(selected.status)}
                </span>
                <h3>{selected.title}</h3>
                <small>
                  {selected.enteredAt
                    ? `Entered expedition ${dateLabel(selected.enteredAt)} UTC`
                    : `Record date ${dateLabel(selected.entryDate)} UTC`}
                </small>
              </header>
              <EntryDetail entry={selected} />
              <div className="atlas-archive-entry-actions">
                <button onClick={() => onToggleCaseFile(selected.archiveId)} type="button">
                  {caseFileEntryIds.includes(selected.archiveId)
                    ? 'Remove from case file'
                    : 'Add to case file'}
                </button>
                <button
                  aria-pressed={comparisonIds.includes(selected.archiveId)}
                  onClick={() => toggleComparison(selected.archiveId)}
                  type="button"
                >
                  {comparisonIds.includes(selected.archiveId)
                    ? 'Remove comparison'
                    : 'Compare record'}
                </button>
                <button
                  disabled={!selected.entrySequence}
                  onClick={() => {
                    if (selected.entrySequence) onOpenReplay(selected.entrySequence);
                  }}
                  type="button"
                >
                  Replay to entry
                </button>
              </div>
              {comparisonEntries.length === 1 && (
                <p className="atlas-archive-compare-hint" role="status">
                  One record staged. Select another source, signal, or memo to compare it.
                </p>
              )}
            </>
          ) : (
            <p>Select a record to inspect it.</p>
          )}
        </aside>
      </div>

      {comparisonEntries.length === 2 && (
        <section className="atlas-archive-comparison" aria-label="Side-by-side comparison">
          <header>
            <div>
              <span className="atlas-kicker">Comparison table</span>
              <h3>Side-by-side evidence</h3>
            </div>
            <button onClick={() => setComparisonIds([])} type="button">
              Clear comparison
            </button>
          </header>
          <div>
            {comparisonEntries.map((entry) => (
              <ComparisonCard entry={entry} key={entry.archiveId} />
            ))}
          </div>
        </section>
      )}

      <footer className="atlas-case-file-tray">
        <span>
          <b aria-hidden="true">⌁</b>
          <strong>Case-file tray</strong>
          <small>{caseFileEntries.length} selected</small>
        </span>
        <div>
          {caseFileEntries.length > 0 ? (
            caseFileEntries.map((entry) => (
              <button
                aria-label={`Remove ${entry.title} from case file`}
                key={entry.archiveId}
                onClick={() => onToggleCaseFile(entry.archiveId)}
                type="button"
              >
                {entry.title} ×
              </button>
            ))
          ) : (
            <em>Pin a signal or add an archive record to compare later.</em>
          )}
        </div>
      </footer>
    </main>
  );
}
