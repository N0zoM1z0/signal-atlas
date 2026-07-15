import type { ShellAgent, ShellPlace } from './model.js';
import { missionSuggestionsForPlaces } from './mission-suggestions.js';

export interface AgentDockProps {
  agents: readonly ShellAgent[];
  collapsed: boolean;
  mobileOpen: boolean;
  places: readonly ShellPlace[];
  prefConnectionLabel: string;
  prefWarning: boolean;
  selectedAgentId: string;
  onFollowAgent: (agentId: string) => void;
  onOpenRuntimeDiagnostics: () => void;
  onPrepareMission: (objective?: string) => void;
  onSkipTravel: (agentId: string, missionId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onToggleCollapsed: () => void;
}

export function AgentDock({
  agents,
  collapsed,
  mobileOpen,
  onFollowAgent,
  onOpenRuntimeDiagnostics,
  onPrepareMission,
  onSkipTravel,
  onSelectAgent,
  onToggleCollapsed,
  places,
  prefConnectionLabel,
  prefWarning,
  selectedAgentId,
}: AgentDockProps) {
  const quickMissions = missionSuggestionsForPlaces(places).slice(0, 2);
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
              <li className="atlas-agent-entry" data-selected={selected} key={agent.id}>
                <button
                  aria-pressed={selected}
                  className="atlas-agent-card"
                  data-agent={agent.id}
                  data-state={agent.status.toLowerCase()}
                  onClick={() => onSelectAgent(agent.id)}
                  title={`${agent.name}, ${agent.role}`}
                  type="button"
                >
                  <span
                    className="atlas-portrait"
                    data-agent={agent.id}
                    data-role={agent.roleKey}
                    aria-hidden="true"
                  >
                    <i />
                  </span>
                  <span className="atlas-agent-card__copy">
                    <span className="atlas-agent-card__name">
                      <strong>{agent.name}</strong>
                      <em>{agent.forecast}%</em>
                    </span>
                    <small className="atlas-role-badge" data-role={agent.roleKey}>
                      {agent.role}
                    </small>
                    <span className="atlas-agent-card__status">
                      <i aria-hidden="true" /> {agent.status}
                    </span>
                  </span>
                  <span className="atlas-agent-card__meta">
                    <b>{agent.knowledgeCount}</b>
                    <kbd>{index + 1}</kbd>
                  </span>
                  <span className="atlas-agent-card__details">
                    <span className="atlas-agent-card__location" title={agent.placeName}>
                      <i aria-hidden="true">⌖</i> {agent.placeName}
                    </span>
                    <span className="atlas-agent-card__mission">{agent.mission}</span>
                    {agent.movement && (
                      <span
                        aria-label={`${agent.name} travel progress ${Math.round(agent.movement.progress * 100)} percent`}
                        className="atlas-agent-travel-progress"
                        role="progressbar"
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={Math.round(agent.movement.progress * 100)}
                      >
                        <i style={{ inlineSize: `${agent.movement.progress * 100}%` }} />
                      </span>
                    )}
                  </span>
                </button>
                {selected && (
                  <span className="atlas-agent-actions">
                    <button
                      className="atlas-agent-follow"
                      onClick={() => onFollowAgent(agent.id)}
                      type="button"
                    >
                      <span aria-hidden="true">◎</span> Follow {agent.name}
                    </button>
                    {agent.movement?.missionId && (
                      <button
                        className="atlas-agent-skip"
                        onClick={() => onSkipTravel(agent.id, agent.movement!.missionId!)}
                        type="button"
                      >
                        Skip travel
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <section className="atlas-mission-board" aria-labelledby="mission-board-title">
          <header>
            <h3 id="mission-board-title">Mission board</h3>
            <button aria-label="Add mission draft" onClick={() => onPrepareMission()} type="button">
              +
            </button>
          </header>
          {quickMissions.map((mission, index) => (
            <button
              key={mission.objective}
              onClick={() => onPrepareMission(mission.objective)}
              type="button"
            >
              <span aria-hidden="true">{index === 0 ? '↗' : '▤'}</span>
              <span>
                <strong>{mission.title}</strong>
                <small>{mission.placeName}</small>
              </span>
            </button>
          ))}
        </section>
      </div>

      <section className="atlas-connections" aria-label="Runtime connections">
        <span>
          <i className={prefWarning ? 'is-warning' : ''} aria-hidden="true" /> Pref Gateway
          <b>{prefConnectionLabel}</b>
        </span>
        <button onClick={onOpenRuntimeDiagnostics} type="button">
          <i aria-hidden="true" /> Codex Runtime <b>Inspect</b>
        </button>
      </section>
    </aside>
  );
}
