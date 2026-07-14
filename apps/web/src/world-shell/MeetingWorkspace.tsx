import type { WorldEvent } from '@signal-atlas/contracts';
import type { WorldProjection } from '@signal-atlas/simulation';
import { useMemo, useState } from 'react';

export interface MeetingWorkspaceProps {
  busy: boolean;
  events: readonly WorldEvent[];
  loading: boolean;
  meetingId: string;
  onClose: () => void;
  onSkipArrivals: () => void;
  projection: WorldProjection;
}

type MeetingStartedEvent = Extract<WorldEvent, { type: 'meeting.started' }>;
type MeetingShareEvent = Extract<WorldEvent, { type: 'meeting.signal_shared' }>;
type BeliefEvent = Extract<WorldEvent, { type: 'belief.updated' }>;

const disagreementCopy = {
  evidence: {
    label: 'Evidence disagreement',
    description: 'They arrived holding different signal sets and source vantage points.',
  },
  model: {
    label: 'Model disagreement',
    description: 'They weight fresh conditions and historical cases differently.',
  },
  prior: {
    label: 'Prior disagreement',
    description: 'Their starting YES estimates differed before any exchange.',
  },
} as const;

function percent(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

function sentenceCase(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('en-US');
}

export function MeetingWorkspace({
  busy,
  events,
  loading,
  meetingId,
  onClose,
  onSkipArrivals,
  projection,
}: MeetingWorkspaceProps) {
  const [showMemo, setShowMemo] = useState(false);
  const request = projection.meetingRequestsById[meetingId];
  const meeting = projection.meetingsById[meetingId];
  const participantAgentIds = useMemo(
    () => meeting?.participantAgentIds ?? request?.participantAgentIds ?? [],
    [meeting, request],
  );
  const meetingEvents = useMemo(
    () => events.filter((event) => event.correlationId === meetingId),
    [events, meetingId],
  );
  const startedEvent = meetingEvents.find(
    (event): event is MeetingStartedEvent => event.type === 'meeting.started',
  );
  const shareEvents = meetingEvents.filter(
    (event): event is MeetingShareEvent => event.type === 'meeting.signal_shared',
  );
  const beliefEvents = meetingEvents.filter(
    (event): event is BeliefEvent => event.type === 'belief.updated',
  );
  const startedSequence = startedEvent?.sequence ?? Number.POSITIVE_INFINITY;
  const beforeSignalsByAgentId = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const agentId of participantAgentIds) {
      const spawned = events.find(
        (event) => event.type === 'agent.spawned' && event.payload.agent.id === agentId,
      );
      const initial = spawned?.type === 'agent.spawned' ? spawned.payload.agent.knownSignalIds : [];
      const acquired = events.flatMap((event) => {
        if (
          event.sequence >= startedSequence ||
          event.type !== 'agent.knowledge.acquired' ||
          event.payload.knowledge.agentId !== agentId ||
          event.payload.knowledge.objectType !== 'signal'
        ) {
          return [];
        }
        return [event.payload.knowledge.objectId];
      });
      result[agentId] = [...new Set([...initial, ...acquired])].sort();
    }
    return result;
  }, [events, participantAgentIds, startedSequence]);
  const sharedSignalIds = meeting?.sharedSignalIds ?? [
    ...new Set(Object.values(beforeSignalsByAgentId).flat()),
  ];
  const arrivedCount = participantAgentIds.filter(
    (agentId) => projection.agentsById[agentId]?.placeId === (request?.placeId ?? 'square'),
  ).length;
  const totalEventCount = meetingEvents.length;

  return (
    <main
      className="atlas-meeting-workspace"
      aria-busy={loading}
      aria-label="Lantern Square meeting"
    >
      <header className="atlas-meeting-header">
        <div>
          <span className="atlas-kicker">The Atlas / Lantern Square</span>
          <h2>Lantern Square Meeting</h2>
          <p>Knowledge moves only through explicit shares. Different priors remain visible.</p>
        </div>
        <div className="atlas-meeting-header__actions">
          <span className="atlas-meeting-event-proof">
            <b>{totalEventCount}</b> immutable meeting events
          </span>
          <button onClick={onClose} type="button">
            Return to World <kbd>Esc</kbd>
          </button>
        </div>
      </header>

      <section className="atlas-meeting-arrivals" aria-label="Arrival coordination">
        <header>
          <div>
            <span className="atlas-kicker">Arrival coordination</span>
            <h3>
              {meeting
                ? 'Exchange recorded'
                : `${arrivedCount} of ${participantAgentIds.length} arrived`}
            </h3>
          </div>
          {!meeting && (
            <button
              disabled={busy || arrivedCount === participantAgentIds.length}
              onClick={onSkipArrivals}
              type="button"
            >
              {busy ? 'Preserving arrivals…' : 'Skip arrivals'}
            </button>
          )}
        </header>
        <div
          aria-label={`${arrivedCount} of ${participantAgentIds.length} participants at Lantern Square`}
          aria-valuemax={participantAgentIds.length}
          aria-valuemin={0}
          aria-valuenow={arrivedCount}
          className="atlas-meeting-arrival-track"
          role="progressbar"
        >
          <span
            style={{
              width: `${participantAgentIds.length ? (arrivedCount / participantAgentIds.length) * 100 : 0}%`,
            }}
          />
        </div>
        <p>
          Skipping emits the remaining route progress and arrival events before the meeting begins;
          no exchange is discarded.
        </p>
      </section>

      <div className="atlas-meeting-scene">
        <section className="atlas-meeting-table" aria-label="Participant knowledge table">
          <div className="atlas-meeting-lantern" aria-hidden="true">
            <i />
            <b />
          </div>
          <div className="atlas-meeting-tabletop" aria-hidden="true" />
          <ol className="atlas-meeting-participants">
            {participantAgentIds.map((agentId) => {
              const agent = projection.agentsById[agentId];
              if (!agent) return null;
              const beforeSignalIds = beforeSignalsByAgentId[agentId] ?? [];
              const belief = beliefEvents.find((event) => event.payload.update.actor.id === agentId)
                ?.payload.update;
              const arrived = agent.placeId === (request?.placeId ?? meeting?.placeId);
              return (
                <li data-agent={agentId} key={agentId}>
                  <header>
                    <span className="atlas-meeting-portrait" aria-hidden="true">
                      {initials(agent.displayName)}
                    </span>
                    <span>
                      <strong>{agent.displayName}</strong>
                      <small>{sentenceCase(agent.role)}</small>
                    </span>
                    <em data-arrived={arrived}>{arrived ? 'At table' : 'En route'}</em>
                  </header>
                  <div className="atlas-meeting-knowledge-split">
                    <section>
                      <h4>Before meeting</h4>
                      {beforeSignalIds.length > 0 ? (
                        <ul>
                          {beforeSignalIds.map((signalId) => (
                            <li key={signalId}>
                              {projection.signalsById[signalId]?.headline ?? signalId}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No mission signals</p>
                      )}
                    </section>
                    <section>
                      <h4>After sharing</h4>
                      {agent.knownSignalIds.length > 0 ? (
                        <ul>
                          {agent.knownSignalIds.map((signalId) => (
                            <li key={signalId}>
                              {projection.signalsById[signalId]?.headline ?? signalId}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Waiting for exchange</p>
                      )}
                    </section>
                  </div>
                  <footer>
                    <span>YES belief</span>
                    <b>
                      {percent(
                        belief?.previousProbabilities['yes'] ?? agent.belief.probabilities['yes'],
                      )}
                    </b>
                    <i aria-hidden="true">→</i>
                    <strong>
                      {percent(
                        belief?.newProbabilities['yes'] ?? agent.belief.probabilities['yes'],
                      )}
                    </strong>
                  </footer>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="atlas-meeting-shares" aria-label="Shared signals">
          <header>
            <span className="atlas-kicker">Center table / shared evidence</span>
            <h3>{sharedSignalIds.length} signals in common</h3>
          </header>
          {sharedSignalIds.length > 0 ? (
            <ol>
              {sharedSignalIds.map((signalId) => {
                const signal = projection.signalsById[signalId];
                const share = shareEvents.find((event) => event.payload.signalId === signalId);
                const fromName = share
                  ? projection.agentsById[share.payload.fromAgentId]?.displayName
                  : signal?.discoveredByAgentId
                    ? projection.agentsById[signal.discoveredByAgentId]?.displayName
                    : undefined;
                const recipientNames = share?.payload.toAgentIds.map(
                  (id) => projection.agentsById[id]?.displayName ?? id,
                );
                return (
                  <li key={signalId}>
                    <span>
                      {sentenceCase(signal?.direction ?? 'context')} ·{' '}
                      {sentenceCase(signal?.impact.label ?? 'unknown')} impact
                    </span>
                    <strong>{signal?.headline ?? signalId}</strong>
                    <p>{signal?.summary ?? 'Signal details are still loading.'}</p>
                    <small>
                      {share
                        ? `${fromName ?? share.payload.fromAgentId} shared to ${recipientNames?.join(', ')}`
                        : `Held in common before the meeting${fromName ? ` · first found by ${fromName}` : ''}`}
                    </small>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="atlas-meeting-empty">
              <strong>Waiting for participants</strong>
              <p>Shared cards appear only after the corresponding event is recorded.</p>
            </div>
          )}
        </section>

        <aside className="atlas-meeting-disagreements" aria-label="Disagreement analysis">
          <header>
            <span className="atlas-kicker">Why they disagree</span>
            <h3>Disagreement map</h3>
          </header>
          {meeting?.disagreementTypes.length ? (
            <ul>
              {meeting.disagreementTypes.map((type) => (
                <li key={type}>
                  <span>{type.slice(0, 1).toLocaleUpperCase('en-US')}</span>
                  <div>
                    <strong>{disagreementCopy[type].label}</strong>
                    <p>{disagreementCopy[type].description}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>Labels appear after everyone reaches the square.</p>
          )}
          {meeting?.memo && !showMemo && (
            <div className="atlas-meeting-reveal">
              <p>The complete memo is already in the event log.</p>
              <button onClick={() => setShowMemo(true)} type="button">
                Continue to memo
              </button>
              <button onClick={() => setShowMemo(true)} type="button">
                Skip discussion
              </button>
            </div>
          )}
        </aside>
      </div>

      {meeting?.memo && showMemo && (
        <section className="atlas-meeting-memo" aria-label="Meeting memo">
          <header>
            <div>
              <span className="atlas-kicker">Filed in Archive Quarter</span>
              <h3>Concise meeting memo</h3>
            </div>
            <span>SEQ {projection.meetingMemosById[meetingId]?.sequence ?? '—'}</span>
          </header>
          <p>{meeting.memo.summary}</p>
          <div>
            <section>
              <h4>Agreements</h4>
              <ul>
                {meeting.memo.agreements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4>Disagreements</h4>
              <ul>
                {meeting.memo.disagreements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4>Proposed next mission</h4>
              {meeting.memo.followUpMissionProposals.map((proposal) => (
                <article key={`${proposal.agentId}:${proposal.objective}`}>
                  <strong>{sentenceCase(proposal.verb)}</strong>
                  <p>{proposal.objective}</p>
                  <small>
                    {proposal.agentId
                      ? (projection.agentsById[proposal.agentId]?.displayName ?? proposal.agentId)
                      : 'Any agent'}{' '}
                    · {proposal.destinationPlaceId ?? 'No destination'}
                  </small>
                </article>
              ))}
            </section>
          </div>
        </section>
      )}
    </main>
  );
}
