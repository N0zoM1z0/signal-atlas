import { useId, useState, type KeyboardEvent } from 'react';

import type { MissionSuggestion } from './mission-suggestions.js';
import type { ShellSignal } from './model.js';

const tabs = ['new', 'pinned', 'disputed', 'all'] as const;
type SignalTab = (typeof tabs)[number];

export interface SignalRailProps {
  archivedSignalIds: readonly string[];
  collapsed: boolean;
  mobileOpen: boolean;
  pinnedSignalIds: readonly string[];
  seenSignalIds: readonly string[];
  signals: readonly ShellSignal[];
  emptyMissionSuggestion: MissionSuggestion | undefined;
  onPrepareMission: (suggestion: MissionSuggestion) => void;
  onInspect: (signalId: string) => void;
  onPin: (signalId: string) => void;
  onToggleCollapsed: () => void;
}

function tabLabel(tab: SignalTab, counts: Record<SignalTab, number>): string {
  return `${tab.slice(0, 1).toUpperCase()}${tab.slice(1)} ${counts[tab]}`;
}

export function SignalRail({
  archivedSignalIds,
  collapsed,
  emptyMissionSuggestion,
  mobileOpen,
  onInspect,
  onPin,
  onPrepareMission,
  onToggleCollapsed,
  pinnedSignalIds,
  seenSignalIds,
  signals,
}: SignalRailProps) {
  const [selectedTab, setSelectedTab] = useState<SignalTab>('new');
  const tabsId = useId();

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: SignalTab) => {
    const index = tabs.indexOf(tab);
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const nextTab = tabs[(index + delta + tabs.length) % tabs.length];
    if (!nextTab) return;
    setSelectedTab(nextTab);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-signal-tab="${nextTab}"]`)
      ?.focus();
  };

  const signalSets: Record<SignalTab, readonly ShellSignal[]> = {
    new: signals.filter(
      (signal) => !seenSignalIds.includes(signal.id) && !archivedSignalIds.includes(signal.id),
    ),
    pinned: signals.filter((signal) => pinnedSignalIds.includes(signal.id)),
    disputed: signals.filter((signal) => signal.status === 'disputed'),
    all: signals,
  };
  const counts = Object.fromEntries(tabs.map((tab) => [tab, signalSets[tab].length])) as Record<
    SignalTab,
    number
  >;
  const visibleSignals = signalSets[selectedTab];
  const emptyState =
    selectedTab === 'new' && signals.length > 0
      ? {
          title: "You're caught up",
          copy: 'Every discovered signal has been reviewed. New evidence will appear here.',
          action: 'View all signals',
        }
      : selectedTab === 'pinned'
        ? {
            title: 'No pinned signals',
            copy: 'Pin the evidence you want to compare, ask about, or use in a forecast.',
          }
        : selectedTab === 'disputed'
          ? {
              title: 'No disputed signals',
              copy: 'Signals with explicit evidence conflicts will collect here.',
            }
          : {
              title: 'No signals yet',
              copy: 'Send an agent to gather the first source-linked piece of evidence.',
              action: emptyMissionSuggestion ? 'Prepare first mission' : undefined,
            };

  return (
    <aside
      aria-label="Signals"
      className="atlas-signal-rail"
      data-collapsed={collapsed}
      data-mobile-open={mobileOpen}
    >
      <header className="atlas-panel-heading">
        <div className="atlas-panel-heading__copy">
          <span className="atlas-kicker">Evidence stream</span>
          <h2>Signals</h2>
        </div>
        <button
          aria-label={collapsed ? 'Expand signal rail' : 'Collapse signal rail'}
          className="atlas-panel-toggle"
          onClick={onToggleCollapsed}
          type="button"
        >
          {collapsed ? '‹' : '›'}
        </button>
      </header>

      <div aria-label="Signal categories" className="atlas-signal-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls={`${tabsId}-${tab}-panel`}
            aria-selected={tab === selectedTab}
            data-signal-tab={tab}
            id={`${tabsId}-${tab}-tab`}
            key={tab}
            onClick={() => setSelectedTab(tab)}
            onKeyDown={(event) => onTabKeyDown(event, tab)}
            role="tab"
            tabIndex={tab === selectedTab ? 0 : -1}
            type="button"
          >
            {tabLabel(tab, counts)}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`${tabsId}-${selectedTab}-tab`}
        className="atlas-signal-stack"
        id={`${tabsId}-${selectedTab}-panel`}
        role="tabpanel"
        tabIndex={0}
      >
        {visibleSignals.length === 0 ? (
          <div className="atlas-empty-rail">
            <span aria-hidden="true">◇</span>
            <strong>{emptyState.title}</strong>
            <p>{emptyState.copy}</p>
            {emptyState.action && (
              <button
                onClick={() => {
                  if (selectedTab === 'new' && signals.length > 0) {
                    setSelectedTab('all');
                  } else if (emptyMissionSuggestion) {
                    onPrepareMission(emptyMissionSuggestion);
                  }
                }}
                type="button"
              >
                {emptyState.action}
              </button>
            )}
          </div>
        ) : (
          visibleSignals.map((signal) => {
            const pinned = pinnedSignalIds.includes(signal.id);
            const archived = archivedSignalIds.includes(signal.id);
            return (
              <article
                className="atlas-signal-card"
                data-archived={archived}
                data-status={signal.status}
                data-tone={signal.tone}
                key={signal.id}
              >
                <header>
                  <span>
                    <b aria-hidden="true">
                      {signal.tone === 'support' ? '↗' : signal.tone === 'oppose' ? '↘' : '◆'}
                    </b>{' '}
                    {signal.direction}
                  </span>
                  <small>{signal.freshness}</small>
                </header>
                <h3>{signal.headline}</h3>
                <p>{signal.summary}</p>
                <div className="atlas-signal-state-labels">
                  <span data-state={signal.status}>{signal.statusLabel}</span>
                  {signal.correlations.length > 0 ? (
                    <span data-state="correlated">Correlated</span>
                  ) : signal.correlationGroupIds.length > 0 ? (
                    <span data-state="unreviewed">Independence unreviewed</span>
                  ) : null}
                  {archived && <span data-state="archived">Archived</span>}
                </div>
                <dl>
                  <div>
                    <dt>Sources</dt>
                    <dd>
                      {signal.sourceCount} · {signal.sourceClass}
                    </dd>
                  </div>
                  <div>
                    <dt>Impact</dt>
                    <dd>
                      {signal.impact} · {signal.impactRange}
                    </dd>
                  </div>
                </dl>
                <div className="atlas-knowledge-chips" aria-label="Known by">
                  {signal.knownBy.map((agent) => (
                    <span key={agent.id}>
                      <i className="atlas-mini-portrait" aria-hidden="true" /> {agent.name}
                    </span>
                  ))}
                </div>
                <footer>
                  <span>
                    <i className="atlas-mini-portrait" aria-hidden="true" /> {signal.discovererName}
                  </span>
                  <span>{signal.reliability}</span>
                  <span className="atlas-signal-actions">
                    <button
                      aria-label={`${pinned ? 'Unpin' : 'Pin'} ${signal.headline}`}
                      aria-pressed={pinned}
                      onClick={() => onPin(signal.id)}
                      type="button"
                    >
                      {pinned ? '★' : '☆'}
                    </button>
                    <button
                      aria-label={`Inspect sources for ${signal.headline}`}
                      onClick={() => onInspect(signal.id)}
                      type="button"
                    >
                      →
                    </button>
                  </span>
                </footer>
              </article>
            );
          })
        )}
      </div>

      <button
        className="atlas-evidence-board"
        onClick={() => setSelectedTab('pinned')}
        type="button"
      >
        <span aria-hidden="true">⌁</span>
        <span>
          <strong>Open evidence board</strong>
          <small>{pinnedSignalIds.length} pinned · source-linked case file</small>
        </span>
        <b aria-hidden="true">→</b>
      </button>
    </aside>
  );
}
