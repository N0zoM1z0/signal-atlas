import type { MissionVerb } from '@signal-atlas/contracts';
import type { RefObject } from 'react';

import type { ShellAgent, ShellMission, ShellPlace } from './model.js';
import {
  fixtureMissionScenarios,
  type FixtureMissionScenario,
  type MissionDraft,
} from './runtime-client.js';

export interface CommandTrayProps {
  agents: readonly ShellAgent[];
  busy: boolean;
  command: string;
  draft: MissionDraft | undefined;
  error: string | undefined;
  expanded: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  missions: readonly ShellMission[];
  places: readonly ShellPlace[];
  scenario: FixtureMissionScenario;
  sequence: number;
  selectedAgent: ShellAgent;
  onCancelDraft: () => void;
  onCancelMission: (missionId: string) => void;
  onCommandChange: (value: string) => void;
  onConfirmDraft: () => void;
  onDirectDraft: () => void;
  onDispatch: () => void;
  onDraftChange: (patch: Partial<MissionDraft>) => void;
  onExpandedChange: () => void;
  onMoveMission: (missionId: string, direction: -1 | 1) => void;
  onRetryMission: (mission: ShellMission) => void;
  onScenarioChange: (scenario: FixtureMissionScenario) => void;
}

const suggestions = [
  'Check latest weather at Galehaven Weather Tower',
  'Search historical delays in Archive Quarter',
  'Ask Professor Vale to check correlation',
  'Call a meeting at Lantern Square',
] as const;

const scenarioLabels: Record<FixtureMissionScenario, string> = {
  success: 'Success',
  no_result: 'No result',
  timeout: 'Timeout',
  invalid_result: 'Invalid result',
};

function sentenceCase(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function CommandTray({
  agents,
  busy,
  command,
  draft,
  error,
  expanded,
  inputRef,
  missions,
  onCancelDraft,
  onCancelMission,
  onCommandChange,
  onConfirmDraft,
  onDirectDraft,
  onDispatch,
  onDraftChange,
  onExpandedChange,
  onMoveMission,
  onRetryMission,
  onScenarioChange,
  places,
  scenario,
  sequence,
  selectedAgent,
}: CommandTrayProps) {
  const selectedPlace = draft?.destinationPlaceId
    ? places.find((place) => place.id === draft.destinationPlaceId)
    : undefined;
  const supportedVerbs = selectedPlace?.missionVerbs ?? [];
  const draftReady = Boolean(
    draft?.assignedAgentId &&
    draft.destinationPlaceId &&
    draft.verb &&
    draft.objective.trim() &&
    supportedVerbs.includes(draft.verb),
  );

  return (
    <footer className="atlas-command-tray" aria-label="Agent command desk">
      <div className="atlas-command-agent">
        <span
          className="atlas-portrait atlas-portrait--small"
          data-agent={selectedAgent.id}
          aria-hidden="true"
        >
          <i />
        </span>
        <span>
          <small>Commanding</small>
          <strong>{selectedAgent.name}</strong>
        </span>
      </div>

      <form
        className="atlas-command-form"
        onSubmit={(event) => {
          event.preventDefault();
          onDispatch();
        }}
      >
        <label className="atlas-visually-hidden" htmlFor="atlas-command-input">
          Command {selectedAgent.name}
        </label>
        <span aria-hidden="true">›</span>
        <input
          autoComplete="off"
          id="atlas-command-input"
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder={`Give ${selectedAgent.name} a research objective…`}
          ref={inputRef}
          value={command}
        />
        <button disabled={busy || command.trim().length === 0} type="submit">
          {busy ? 'Reading…' : 'Dispatch'} <kbd>↵</kbd>
        </button>
      </form>

      <div className="atlas-command-suggestions" aria-label="Suggested commands">
        <small>Suggested</small>
        {suggestions.map((suggestion) => (
          <button key={suggestion} onClick={() => onCommandChange(suggestion)} type="button">
            {suggestion}
          </button>
        ))}
      </div>

      <button
        aria-expanded={expanded}
        className="atlas-tray-expand"
        onClick={onExpandedChange}
        type="button"
      >
        {expanded
          ? 'Close queue'
          : `Mission queue${missions.length ? ` · ${missions.length}` : ''}`}{' '}
        <span aria-hidden="true">{expanded ? '⌄' : '⌃'}</span>
      </button>

      <div className="atlas-command-status">
        <i aria-hidden="true" />
        <small>World live</small>
        <strong>SEQ {String(sequence).padStart(2, '0')}</strong>
      </div>

      {expanded && (
        <section className="atlas-command-queue" aria-labelledby="queue-heading">
          <div className="atlas-command-draft">
            <header>
              <div>
                <span className="atlas-kicker">Player confirmation</span>
                <h2 id="queue-heading">{draft ? 'Mission draft' : 'Mission queue'}</h2>
              </div>
              {!draft && (
                <button className="atlas-secondary-action" onClick={onDirectDraft} type="button">
                  Build mission
                </button>
              )}
            </header>

            {draft ? (
              <form
                className="atlas-draft-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draftReady) onConfirmDraft();
                }}
              >
                <label>
                  Agent
                  <select
                    aria-label="Mission agent"
                    onChange={(event) =>
                      onDraftChange({ assignedAgentId: event.target.value || undefined })
                    }
                    value={draft.assignedAgentId ?? ''}
                  >
                    <option value="">Choose an agent</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} · {agent.role}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Destination
                  <select
                    aria-label="Mission destination"
                    onChange={(event) => {
                      const place = places.find((candidate) => candidate.id === event.target.value);
                      const nextVerb = place?.missionVerbs.includes(draft.verb as MissionVerb)
                        ? draft.verb
                        : undefined;
                      onDraftChange({
                        destinationPlaceId: event.target.value || undefined,
                        verb: nextVerb,
                      });
                    }}
                    value={draft.destinationPlaceId ?? ''}
                  >
                    <option value="">Choose a place</option>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mission type
                  <select
                    aria-label="Mission type"
                    disabled={!selectedPlace}
                    onChange={(event) =>
                      onDraftChange({ verb: (event.target.value || undefined) as MissionVerb })
                    }
                    value={draft.verb ?? ''}
                  >
                    <option value="">Choose an action</option>
                    {supportedVerbs.map((verb) => (
                      <option key={verb} value={verb}>
                        {sentenceCase(verb)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="atlas-draft-objective">
                  Objective
                  <input
                    aria-label="Mission objective"
                    onChange={(event) => onDraftChange({ objective: event.target.value })}
                    value={draft.objective}
                  />
                </label>
                <p data-ready={draftReady} role="status">
                  {draftReady
                    ? 'Ready to append validated mission events.'
                    : draft.explanation ||
                      'Resolve the highlighted mission fields before confirming.'}
                </p>
                {error && <p className="atlas-command-error">{error}</p>}
                <div className="atlas-draft-actions">
                  <button onClick={onCancelDraft} type="button">
                    Keep editing later
                  </button>
                  <button disabled={!draftReady || busy} type="submit">
                    {busy ? 'Submitting…' : 'Confirm mission'}
                  </button>
                </div>
              </form>
            ) : (
              <p>
                Interpret a command or use the direct builder. Only confirmed, schema-valid missions
                enter the authoritative event log.
              </p>
            )}
          </div>

          <div className="atlas-queue-list">
            <header>
              <div>
                <span className="atlas-kicker">Authoritative projection</span>
                <strong>
                  {missions.filter((mission) => mission.status !== 'failed').length} active
                </strong>
              </div>
              <label className="atlas-scenario-control">
                Offline result
                <select
                  aria-label="Offline mission result"
                  disabled={busy}
                  onChange={(event) =>
                    onScenarioChange(event.target.value as FixtureMissionScenario)
                  }
                  value={scenario}
                >
                  {fixtureMissionScenarios.map((value) => (
                    <option key={value} value={value}>
                      {scenarioLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="atlas-secondary-action" onClick={onExpandedChange} type="button">
                Close mission queue
              </button>
            </header>
            {missions.length === 0 ? (
              <p className="atlas-empty-queue">No queued missions. Your team is ready.</p>
            ) : (
              <ol>
                {missions.map((mission, index) => {
                  const agentMissions = missions.filter(
                    (candidate) =>
                      candidate.agentId === mission.agentId && candidate.status === 'queued',
                  );
                  const agentIndex = agentMissions.findIndex(
                    (candidate) => candidate.id === mission.id,
                  );
                  return (
                    <li key={mission.id}>
                      <span>{index + 1}</span>
                      <span>
                        <strong>{sentenceCase(mission.verb)}</strong>
                        <small>
                          {mission.agentName} → {mission.destinationName} · {mission.status}
                        </small>
                        {mission.failureMessage && <small>{mission.failureMessage}</small>}
                      </span>
                      <span className="atlas-queue-actions">
                        <button
                          aria-label={`Move ${mission.objective} earlier`}
                          disabled={busy || mission.status !== 'queued' || agentIndex <= 0}
                          onClick={() => onMoveMission(mission.id, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Move ${mission.objective} later`}
                          disabled={
                            busy ||
                            mission.status !== 'queued' ||
                            agentIndex === agentMissions.length - 1
                          }
                          onClick={() => onMoveMission(mission.id, 1)}
                          type="button"
                        >
                          ↓
                        </button>
                        {mission.status === 'failed' && mission.failedTurnId ? (
                          <button
                            aria-label={`Retry ${mission.objective}`}
                            disabled={busy}
                            onClick={() => onRetryMission(mission)}
                            type="button"
                          >
                            Retry
                          </button>
                        ) : (
                          <button
                            aria-label={`Cancel ${mission.objective}`}
                            disabled={busy}
                            onClick={() => onCancelMission(mission.id)}
                            type="button"
                          >
                            Cancel
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      )}
    </footer>
  );
}
