import type { MissionVerb } from '@signal-atlas/contracts';
import { useEffect, useId, useRef, type RefObject } from 'react';

import type { ShellAgent, ShellMission, ShellPlace } from './model.js';
import { missionSuggestionsForPlaces, type MissionSuggestion } from './mission-suggestions.js';
import {
  fixtureMissionScenarios,
  type FixtureMissionScenario,
  type MissionDraft,
} from './runtime-client.js';

export interface CommandTrayProps {
  agents: readonly ShellAgent[];
  busy: boolean;
  command: string;
  disabledReason?: string;
  draft: MissionDraft | undefined;
  error: string | undefined;
  expanded: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  missions: readonly ShellMission[];
  places: readonly ShellPlace[];
  scenario: FixtureMissionScenario;
  sequence: number;
  selectedAgent: ShellAgent;
  showFixtureControls: boolean;
  onCancelDraft: () => void;
  onCancelMission: (missionId: string) => void;
  onCommandChange: (value: string) => void;
  onConfirmDraft: () => void;
  onDirectDraft: () => void;
  onDispatch: () => void;
  onDraftChange: (patch: Partial<MissionDraft>) => void;
  onExpandedChange: () => void;
  onMoveMission: (missionId: string, direction: -1 | 1) => void;
  onPrepareSuggestedMission: (suggestion: MissionSuggestion) => void;
  onRetryMission: (mission: ShellMission) => void;
  onScenarioChange: (scenario: FixtureMissionScenario) => void;
}

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
  disabledReason,
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
  onPrepareSuggestedMission,
  onRetryMission,
  onScenarioChange,
  places,
  scenario,
  sequence,
  selectedAgent,
  showFixtureControls,
}: CommandTrayProps) {
  const suggestions = missionSuggestionsForPlaces(places).slice(0, 4);
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
  const draftStatusId = useId();
  const agentSelectRef = useRef<HTMLSelectElement>(null);
  const destinationSelectRef = useRef<HTMLSelectElement>(null);
  const verbSelectRef = useRef<HTMLSelectElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const draftSubmissionId = draft?.submissionId;
  const firstMissingField = draft?.missing[0];
  const missingKey = draft?.missing.join(',') ?? '';

  useEffect(() => {
    if (!expanded || busy || !draftSubmissionId) return;
    const target = draftReady
      ? confirmRef.current
      : firstMissingField === 'agent'
        ? agentSelectRef.current
        : firstMissingField === 'destination'
          ? destinationSelectRef.current
          : verbSelectRef.current;
    const frame = window.requestAnimationFrame(() => target?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [busy, draftReady, draftSubmissionId, expanded, firstMissingField, missingKey]);

  return (
    <footer className="atlas-command-tray" aria-label="Agent command desk">
      <div className="atlas-command-agent">
        <span
          className="atlas-portrait atlas-portrait--small"
          data-agent={selectedAgent.id}
          data-role={selectedAgent.roleKey}
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
          disabled={Boolean(disabledReason)}
          id="atlas-command-input"
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder={`Give ${selectedAgent.name} a research objective…`}
          ref={inputRef}
          value={command}
        />
        <button
          disabled={Boolean(disabledReason) || busy || command.trim().length === 0}
          type="submit"
        >
          {busy ? 'Interpreting…' : 'Review mission'} <kbd>↵</kbd>
        </button>
      </form>

      <div className="atlas-command-suggestions" aria-label="Suggested commands">
        <small>Suggested</small>
        {suggestions.map((suggestion) => (
          <button
            disabled={Boolean(disabledReason)}
            key={suggestion.objective}
            onClick={() => onPrepareSuggestedMission(suggestion)}
            type="button"
          >
            {suggestion.objective}
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
        <small>{disabledReason ?? 'World live'}</small>
        <strong>SEQ {String(sequence).padStart(2, '0')}</strong>
      </div>

      {expanded && (
        <section className="atlas-command-queue" aria-labelledby="queue-heading">
          <div className="atlas-command-draft">
            <header>
              <div>
                <span className="atlas-kicker">Review before sending</span>
                <h2 id="queue-heading">{draft ? 'Mission draft' : 'Mission queue'}</h2>
              </div>
              {!draft && (
                <button
                  className="atlas-secondary-action"
                  disabled={Boolean(disabledReason)}
                  onClick={onDirectDraft}
                  type="button"
                >
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
                <fieldset aria-describedby={draftStatusId} disabled={Boolean(disabledReason)}>
                  <label>
                    Agent
                    <select
                      aria-label="Mission agent"
                      onChange={(event) =>
                        onDraftChange({ assignedAgentId: event.target.value || undefined })
                      }
                      ref={agentSelectRef}
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
                        const place = places.find(
                          (candidate) => candidate.id === event.target.value,
                        );
                        const nextVerb = place?.missionVerbs.includes(draft.verb as MissionVerb)
                          ? draft.verb
                          : undefined;
                        onDraftChange({
                          destinationPlaceId: event.target.value || undefined,
                          verb: nextVerb,
                        });
                      }}
                      ref={destinationSelectRef}
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
                      ref={verbSelectRef}
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
                  <p data-ready={draftReady} id={draftStatusId} role="status">
                    {draftReady
                      ? 'Ready to send. Nothing enters the world until you confirm.'
                      : draft.explanation || 'Choose the missing mission field before continuing.'}
                  </p>
                  {error && <p className="atlas-command-error">{error}</p>}
                  <div className="atlas-draft-actions">
                    <button onClick={onCancelDraft} type="button">
                      Cancel draft
                    </button>
                    <button
                      aria-label={
                        draftReady
                          ? `Confirm mission: send ${agents.find((agent) => agent.id === draft.assignedAgentId)?.name ?? 'agent'} to ${selectedPlace?.name ?? 'destination'}`
                          : 'Confirm mission'
                      }
                      disabled={!draftReady || busy}
                      ref={confirmRef}
                      type="submit"
                    >
                      {busy
                        ? 'Sending…'
                        : draftReady
                          ? `Send ${agents.find((agent) => agent.id === draft.assignedAgentId)?.name ?? 'agent'}`
                          : 'Send mission'}
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <p>
                Write a research objective or use the direct builder. Review the route before the
                mission enters your workspace.
              </p>
            )}
          </div>

          <div className="atlas-queue-list">
            <header>
              <div>
                <span className="atlas-kicker">Team schedule</span>
                <strong>
                  {missions.filter((mission) => mission.status !== 'failed').length} active
                </strong>
              </div>
              {showFixtureControls && (
                <label className="atlas-scenario-control">
                  Debug fixture result
                  <select
                    aria-label="Offline mission result"
                    disabled={Boolean(disabledReason) || busy}
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
              )}
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
                          disabled={
                            Boolean(disabledReason) ||
                            busy ||
                            mission.status !== 'queued' ||
                            agentIndex <= 0
                          }
                          onClick={() => onMoveMission(mission.id, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Move ${mission.objective} later`}
                          disabled={
                            Boolean(disabledReason) ||
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
                            disabled={Boolean(disabledReason) || busy}
                            onClick={() => onRetryMission(mission)}
                            type="button"
                          >
                            Retry
                          </button>
                        ) : (
                          <button
                            aria-label={`Cancel ${mission.objective}`}
                            disabled={Boolean(disabledReason) || busy}
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
