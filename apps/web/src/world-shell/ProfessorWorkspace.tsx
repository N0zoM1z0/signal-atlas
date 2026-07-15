import type { ProfessorMode, ProfessorResponse, SourceRecord } from '@signal-atlas/contracts';
import type { WorldProjection } from '@signal-atlas/simulation';
import { useState, type KeyboardEvent } from 'react';

export interface ProfessorQuestionInput {
  mode: ProfessorMode;
  question: string;
  selectedSignalIds: string[];
  selectedSourceIds: string[];
}

export interface ProfessorWorkspaceProps {
  caseFileEntryIds: readonly string[];
  onAsk: (input: ProfessorQuestionInput) => Promise<ProfessorResponse>;
  onClose: () => void;
  onUseSuggestedMission: (mission: NonNullable<ProfessorResponse['suggestedMission']>) => void;
  projection: WorldProjection;
}

const modes: ReadonlyArray<{ mode: ProfessorMode; label: string; hint: string }> = [
  { mode: 'explain', label: 'Explain', hint: 'Clarify what the selected evidence actually says.' },
  {
    mode: 'challenge',
    label: 'Challenge',
    hint: 'Find the strongest scope or reliability objection.',
  },
  { mode: 'compare', label: 'Compare', hint: 'Contrast evidence roles, timing, and provenance.' },
  { mode: 'base_rate', label: 'Base rate', hint: 'Interpret historical evidence conditionally.' },
  {
    mode: 'missing_evidence',
    label: 'Missing evidence',
    hint: 'Identify the next decision-relevant gap.',
  },
  {
    mode: 'correlation_check',
    label: 'Correlation check',
    hint: 'Assess overlap without claiming measured covariance.',
  },
  {
    mode: 'forecast_impact',
    label: 'Forecast impact',
    hint: 'Read impact ranges as bounded sensitivity.',
  },
];

const defaultQuestions: Record<ProfessorMode, string> = {
  explain: 'What do the selected records actually establish?',
  challenge: 'What is the strongest challenge to this evidence?',
  compare: 'How do these selected records differ in evidentiary role?',
  base_rate: 'What base rate is justified by this selection?',
  missing_evidence: 'What important evidence is still missing?',
  correlation_check: 'Are these selected signals independent?',
  forecast_impact: 'How should these signals bound a forecast revision?',
};

function initialSignalSelection(
  projection: WorldProjection,
  caseFileEntryIds: readonly string[],
): string[] {
  const latestMeeting = Object.values(projection.meetingsById)
    .filter((meeting) => meeting.endedAt)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  if (latestMeeting?.sharedSignalIds.length) return [...latestMeeting.sharedSignalIds];
  const caseSignals = caseFileEntryIds
    .filter((id) => id.startsWith('signal:'))
    .map((id) => id.slice('signal:'.length))
    .filter((id) => projection.signalsById[id]);
  if (caseSignals.length) return [...new Set(caseSignals)];
  return Object.keys(projection.signalsById).slice(0, 2);
}

function sentenceCase(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function evidenceTitle(
  responseItem: ProfessorResponse['evidenceUsed'][number],
  projection: WorldProjection,
): string {
  return responseItem.type === 'signal'
    ? (projection.signalsById[responseItem.id]?.headline ?? responseItem.id)
    : (projection.sourcesById[responseItem.id]?.title ?? responseItem.id);
}

function sourceLabel(source: SourceRecord): string {
  return `${sentenceCase(source.sourceClass)} · v${source.version}`;
}

export function ProfessorWorkspace({
  caseFileEntryIds,
  onAsk,
  onClose,
  onUseSuggestedMission,
  projection,
}: ProfessorWorkspaceProps) {
  const [mode, setMode] = useState<ProfessorMode>('correlation_check');
  const [question, setQuestion] = useState(defaultQuestions.correlation_check);
  const [selectedSignalIds, setSelectedSignalIds] = useState(() =>
    initialSignalSelection(projection, caseFileEntryIds),
  );
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [response, setResponse] = useState<ProfessorResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const toggleSelection = (
    id: string,
    selectedIds: readonly string[],
    update: (ids: string[]) => void,
  ) =>
    update(
      selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id],
    );
  const selectMode = (nextMode: ProfessorMode) => {
    setMode(nextMode);
    setQuestion(defaultQuestions[nextMode]);
    setResponse(undefined);
    setError(undefined);
  };
  const onModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentMode: ProfessorMode) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const index = modes.findIndex((item) => item.mode === currentMode);
    const next = modes[(index + delta + modes.length) % modes.length];
    if (!next) return;
    selectMode(next.mode);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-professor-mode="${next.mode}"]`)
      ?.focus();
  };
  const ask = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResponse(
        await onAsk({
          mode,
          question: question.trim(),
          selectedSignalIds,
          selectedSourceIds,
        }),
      );
    } catch (askError: unknown) {
      setError(askError instanceof Error ? askError.message : 'Professor query failed.');
    } finally {
      setBusy(false);
    }
  };
  const selectedCount = selectedSignalIds.length + selectedSourceIds.length;

  return (
    <main className="atlas-professor-workspace" aria-label="Professor Vale's Study" tabIndex={-1}>
      <header className="atlas-professor-header">
        <div>
          <span className="atlas-kicker">The Atlas / Scholar's Hill</span>
          <h2>Professor Vale's Study</h2>
          <p>Evidence-bound consultation · fixture-scripted · no hidden sources</p>
        </div>
        <div>
          <span className="atlas-professor-boundary">
            <i aria-hidden="true" /> Uses selected evidence only
          </span>
          <button onClick={onClose} type="button">
            Return to World <kbd>Esc</kbd>
          </button>
        </div>
      </header>

      <div className="atlas-professor-scene">
        <section className="atlas-professor-study" aria-label="Scholar's Hill study scene">
          <div className="atlas-professor-room" aria-hidden="true">
            <div className="atlas-professor-window">
              <i />
            </div>
            <div className="atlas-professor-books atlas-professor-books--left" />
            <div className="atlas-professor-books atlas-professor-books--right" />
            <div className="atlas-professor-character">
              <i />
              <b />
              <span>V</span>
            </div>
          </div>
          <div className="atlas-professor-chalkboard">
            <span>Current mode / {sentenceCase(mode)}</span>
            <h3>{question || 'Ask a bounded question'}</h3>
            <div aria-hidden="true">
              <b>SELECTED EVIDENCE</b>
              <i>→</i>
              <strong>ASSUMPTIONS</strong>
              <i>→</i>
              <b>BOUNDED ANSWER</b>
            </div>
            <p>{modes.find((item) => item.mode === mode)?.hint}</p>
          </div>

          <section className="atlas-professor-selection" aria-label="Evidence selection tray">
            <header>
              <div>
                <span className="atlas-kicker">Evidence table</span>
                <h3>{selectedCount} selected records</h3>
              </div>
              <button
                disabled={selectedCount === 0}
                onClick={() => {
                  setSelectedSignalIds([]);
                  setSelectedSourceIds([]);
                  setResponse(undefined);
                }}
                type="button"
              >
                Clear
              </button>
            </header>
            <div>
              <section>
                <h4>Signals</h4>
                {Object.values(projection.signalsById).length ? (
                  <ul>
                    {Object.values(projection.signalsById).map((signal) => (
                      <li key={signal.id}>
                        <label>
                          <input
                            checked={selectedSignalIds.includes(signal.id)}
                            onChange={() => {
                              toggleSelection(signal.id, selectedSignalIds, setSelectedSignalIds);
                              setResponse(undefined);
                            }}
                            type="checkbox"
                          />
                          <span>
                            <strong>{signal.headline}</strong>
                            <small>
                              {sentenceCase(signal.direction)} ·{' '}
                              {sentenceCase(signal.reliability.label)}
                            </small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No discovered signals yet.</p>
                )}
              </section>
              <section>
                <h4>Sources</h4>
                {Object.values(projection.sourcesById).length ? (
                  <ul>
                    {Object.values(projection.sourcesById).map((source) => (
                      <li key={source.id}>
                        <label>
                          <input
                            checked={selectedSourceIds.includes(source.id)}
                            onChange={() => {
                              toggleSelection(source.id, selectedSourceIds, setSelectedSourceIds);
                              setResponse(undefined);
                            }}
                            type="checkbox"
                          />
                          <span>
                            <strong>{source.title}</strong>
                            <small>{sourceLabel(source)}</small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No discovered sources yet.</p>
                )}
              </section>
            </div>
          </section>
        </section>

        <aside className="atlas-professor-console" aria-label="Professor consultation panel">
          <div className="atlas-professor-modes" role="tablist" aria-label="Professor modes">
            {modes.map((item) => (
              <button
                aria-selected={mode === item.mode}
                data-professor-mode={item.mode}
                key={item.mode}
                onClick={() => selectMode(item.mode)}
                onKeyDown={(event) => onModeKeyDown(event, item.mode)}
                role="tab"
                tabIndex={mode === item.mode ? 0 : -1}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <form
            className="atlas-professor-question"
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <label>
              Question for Professor Vale
              <textarea
                onChange={(event) => setQuestion(event.target.value)}
                rows={2}
                value={question}
              />
            </label>
            <button disabled={busy || question.trim().length === 0} type="submit">
              {busy ? 'Reviewing selection…' : 'Ask Professor'}
            </button>
          </form>

          {error && (
            <p className="atlas-professor-error" role="alert">
              {error}
            </p>
          )}
          {response ? (
            <article
              className="atlas-professor-response"
              aria-label="Professor response"
              aria-live="polite"
            >
              <header>
                <span className="atlas-professor-seal" aria-hidden="true">
                  V
                </span>
                <div>
                  <small>Professor Vale / {sentenceCase(response.mode ?? mode)}</small>
                  <h3>
                    {response.answer.startsWith('Insufficient evidence:')
                      ? 'Evidence gap'
                      : 'Bounded assessment'}
                  </h3>
                </div>
              </header>
              <p>{response.answer}</p>
              <section>
                <h4>Evidence used · {response.evidenceUsed.length}</h4>
                {response.evidenceUsed.length ? (
                  <ul className="atlas-professor-evidence-used">
                    {response.evidenceUsed.map((item) => (
                      <li key={`${item.type}:${item.id}`}>
                        <span>{item.type}</span>
                        <strong>{evidenceTitle(item, projection)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No evidence used.</p>
                )}
              </section>
              <div className="atlas-professor-response-grid">
                <section>
                  <h4>Assumptions</h4>
                  <ul>
                    {response.assumptions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
                <section data-warning>
                  <h4>Limitations</h4>
                  <ul>
                    {response.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </div>
              {response.suggestedNextQuestion && (
                <button
                  className="atlas-professor-next-question"
                  onClick={() => {
                    setQuestion(response.suggestedNextQuestion ?? '');
                    setResponse(undefined);
                  }}
                  type="button"
                >
                  <span>Next best question</span>
                  <strong>{response.suggestedNextQuestion}</strong>
                </button>
              )}
              {response.suggestedMission && (
                <section className="atlas-professor-mission">
                  <span>Suggested mission</span>
                  <strong>{sentenceCase(response.suggestedMission.verb)}</strong>
                  <p>{response.suggestedMission.objective}</p>
                  <button
                    onClick={() => onUseSuggestedMission(response.suggestedMission!)}
                    type="button"
                  >
                    Prepare mission
                  </button>
                </section>
              )}
            </article>
          ) : (
            <div className="atlas-professor-empty-response">
              <span aria-hidden="true">∴</span>
              <strong>Professor Vale is waiting</strong>
              <p>Select evidence, choose a mode, and ask one bounded question.</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
