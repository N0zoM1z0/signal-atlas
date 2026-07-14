import { useId, useState, type KeyboardEvent } from 'react';

import type { ShellSignal } from './model.js';

const tabs = ['new', 'pinned', 'disputed', 'all'] as const;
type SignalTab = (typeof tabs)[number];

export interface SignalRailProps {
  collapsed: boolean;
  mobileOpen: boolean;
  signals: readonly ShellSignal[];
  onToggleCollapsed: () => void;
}

function tabLabel(tab: SignalTab, signalCount: number): string {
  if (tab === 'new') return `New ${signalCount}`;
  if (tab === 'pinned') return 'Pinned 0';
  if (tab === 'disputed') return 'Disputed 0';
  return `All ${signalCount}`;
}

export function SignalRail({ collapsed, mobileOpen, onToggleCollapsed, signals }: SignalRailProps) {
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

  const visibleSignals = selectedTab === 'pinned' || selectedTab === 'disputed' ? [] : signals;

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
            {tabLabel(tab, signals.length)}
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
        <p className="atlas-preview-note">Fixture preview · staged until mission events</p>
        {visibleSignals.length === 0 ? (
          <div className="atlas-empty-rail">
            <span aria-hidden="true">◇</span>
            <strong>No {selectedTab} signals</strong>
            <p>Evidence will remain source-linked when it arrives.</p>
          </div>
        ) : (
          visibleSignals.map((signal) => (
            <article className="atlas-signal-card" data-tone={signal.tone} key={signal.id}>
              <header>
                <span>{signal.direction}</span>
                <small>{signal.freshness}</small>
              </header>
              <h3>{signal.headline}</h3>
              <p>{signal.summary}</p>
              <dl>
                <div>
                  <dt>Source</dt>
                  <dd>{signal.sourceClass}</dd>
                </div>
                <div>
                  <dt>Impact</dt>
                  <dd>{signal.impact}</dd>
                </div>
              </dl>
              <footer>
                <span>
                  <i className="atlas-mini-portrait" aria-hidden="true" /> {signal.discovererName}
                </span>
                <span>{signal.reliability}</span>
                <button aria-label={`Inspect ${signal.headline}`} type="button">
                  →
                </button>
              </footer>
            </article>
          ))
        )}
      </div>

      <button className="atlas-evidence-board" type="button">
        <span aria-hidden="true">⌁</span>
        <span>
          <strong>Open evidence board</strong>
          <small>0 pinned · team at 55%</small>
        </span>
        <b aria-hidden="true">→</b>
      </button>
    </aside>
  );
}
