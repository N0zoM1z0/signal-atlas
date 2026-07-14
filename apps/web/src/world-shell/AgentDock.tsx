import type { ShellAgent } from './model.js';

export interface AgentDockProps {
  agents: readonly ShellAgent[];
  collapsed: boolean;
  disconnected: boolean;
  mobileOpen: boolean;
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onToggleCollapsed: () => void;
}

export function AgentDock({
  agents,
  collapsed,
  disconnected,
  mobileOpen,
  onSelectAgent,
  onToggleCollapsed,
  selectedAgentId,
}: AgentDockProps) {
  return (
    <aside
      aria-label="Agents"
      className="atlas-agent-dock"
      data-collapsed={collapsed}
      data-mobile-open={mobileOpen}
    >
      <header className="atlas-panel-heading">
        <div className="atlas-panel-heading__copy">
          <span className="atlas-kicker">Field team</span>
          <h2>Agents</h2>
        </div>
        <button
          aria-label={collapsed ? 'Expand agent dock' : 'Collapse agent dock'}
          className="atlas-panel-toggle"
          onClick={onToggleCollapsed}
          type="button"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </header>

      <div className="atlas-panel-scroll">
        <ul className="atlas-agent-list">
          {agents.map((agent, index) => {
            const selected = agent.id === selectedAgentId;
            return (
              <li key={agent.id}>
                <button
                  aria-pressed={selected}
                  className="atlas-agent-card"
                  data-agent={agent.id}
                  onClick={() => onSelectAgent(agent.id)}
                  title={`${agent.name}, ${agent.role}`}
                  type="button"
                >
                  <span className="atlas-portrait" data-agent={agent.id} aria-hidden="true">
                    <i />
                  </span>
                  <span className="atlas-agent-card__copy">
                    <span className="atlas-agent-card__name">
                      <strong>{agent.name}</strong>
                      <em>{agent.forecast}%</em>
                    </span>
                    <small>{agent.role}</small>
                    <span className="atlas-agent-card__status">
                      <i aria-hidden="true" /> {agent.status}
                    </span>
                  </span>
                  <span className="atlas-agent-card__meta">
                    <b>{agent.knowledgeCount}</b>
                    <kbd>{index + 1}</kbd>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <section className="atlas-mission-board" aria-labelledby="mission-board-title">
          <header>
            <h3 id="mission-board-title">Mission board</h3>
            <button aria-label="Add mission draft" type="button">
              +
            </button>
          </header>
          <button type="button">
            <span aria-hidden="true">↗</span>
            <span>
              <strong>Check latest weather</strong>
              <small>Galehaven Weather Tower</small>
            </span>
          </button>
          <button type="button">
            <span aria-hidden="true">▤</span>
            <span>
              <strong>Search historical delays</strong>
              <small>Archive Quarter</small>
            </span>
          </button>
        </section>
      </div>

      <section className="atlas-connections" aria-label="Runtime connections">
        <span>
          <i className={disconnected ? 'is-warning' : ''} aria-hidden="true" /> Pref Gateway
          <b>{disconnected ? 'Offline' : 'Fixture'}</b>
        </span>
        <span>
          <i aria-hidden="true" /> Codex Runtime <b>Local</b>
        </span>
      </section>
    </aside>
  );
}
