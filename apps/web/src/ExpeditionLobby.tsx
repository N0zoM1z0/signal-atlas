import type { ExpeditionListItem, ScenarioListItem } from './world-shell/runtime-client.js';

export interface ExpeditionLobbyProps {
  busyScenarioId?: string;
  error?: string;
  expeditions: ExpeditionListItem[];
  onCreate: (scenario: ScenarioListItem) => void;
  onOpen: (expeditionId: string) => void;
  onRetry: () => void;
  scenarios: ScenarioListItem[];
}

function readableLabel(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function expeditionForScenario(
  expeditions: readonly ExpeditionListItem[],
  scenario: ScenarioListItem,
): ExpeditionListItem | undefined {
  return expeditions.find(
    (expedition) =>
      expedition.scenarioId === scenario.id && expedition.scenarioVersion === scenario.version,
  );
}

export function ExpeditionLobby({
  busyScenarioId,
  error,
  expeditions,
  onCreate,
  onOpen,
  onRetry,
  scenarios,
}: ExpeditionLobbyProps) {
  return (
    <main className="atlas-lobby" data-atlas-view="lobby" tabIndex={-1}>
      <a className="atlas-skip-link" href="#scenario-catalog">
        Skip to expedition catalog
      </a>

      <header className="atlas-lobby__header">
        <div className="atlas-lobby__identity">
          <span className="atlas-brand__mark" aria-hidden="true">
            <i />
          </span>
          <div>
            <span className="atlas-kicker">Local research workspace</span>
            <h1>Signal Atlas Expeditions</h1>
          </div>
        </div>
        <p>
          Choose an authored world. Each expedition keeps its own event history, evidence desk,
          forecasts, and replay checkpoint on this machine.
        </p>
        <dl className="atlas-lobby__summary" aria-label="Workspace summary">
          <div>
            <dt>Installed worlds</dt>
            <dd>{scenarios.length}</dd>
          </div>
          <div>
            <dt>Saved workspaces</dt>
            <dd>{expeditions.length}</dd>
          </div>
          <div>
            <dt>Data boundary</dt>
            <dd>On this device</dd>
          </div>
        </dl>
      </header>

      {error && (
        <section className="atlas-lobby__error" role="alert">
          <div>
            <strong>The local catalog could not be refreshed.</strong>
            <span>{error}</span>
          </div>
          <button onClick={onRetry} type="button">
            Retry
          </button>
        </section>
      )}

      <section
        aria-busy={busyScenarioId !== undefined}
        aria-labelledby="scenario-catalog-title"
        className="atlas-lobby__catalog"
        id="scenario-catalog"
      >
        <header>
          <div>
            <span className="atlas-kicker">World shelf</span>
            <h2 id="scenario-catalog-title">Available expeditions</h2>
          </div>
          <p>
            Complete fixture worlds work offline; live Pref capabilities enrich them when ready.
          </p>
        </header>

        <div className="atlas-lobby__cards">
          {scenarios.map((scenario) => {
            const expedition = expeditionForScenario(expeditions, scenario);
            const busy = busyScenarioId === scenario.id;
            return (
              <article className="atlas-expedition-card" key={`${scenario.id}@${scenario.version}`}>
                <div
                  aria-label={`${scenario.preview.regionLabel} world preview`}
                  className="atlas-expedition-diorama"
                  data-template={scenario.preview.template}
                  role="img"
                >
                  <span className="atlas-expedition-diorama__moon" />
                  <span className="atlas-expedition-diorama__landmark" />
                  <span className="atlas-expedition-diorama__path" />
                  <span className="atlas-expedition-diorama__signal" />
                  <b>{scenario.preview.regionLabel}</b>
                </div>

                <div className="atlas-expedition-card__body">
                  <div className="atlas-expedition-card__meta">
                    <span>{readableLabel(scenario.category)}</span>
                    <span>v{scenario.version}</span>
                    <span data-status={expedition?.status ?? 'not_started'}>
                      {expedition ? readableLabel(expedition.status) : 'Not started'}
                    </span>
                  </div>
                  <div className="atlas-expedition-card__title-row">
                    <h3>{scenario.title}</h3>
                    <button
                      aria-label={
                        expedition ? `Continue ${expedition.title}` : `Start ${scenario.title}`
                      }
                      disabled={busy || !scenario.available}
                      onClick={() => (expedition ? onOpen(expedition.id) : onCreate(scenario))}
                      type="button"
                    >
                      {busy ? 'Opening…' : expedition ? 'Continue' : 'Start'}
                    </button>
                  </div>
                  <p className="atlas-expedition-card__tagline">{scenario.preview.tagline}</p>
                  <p>{scenario.summary}</p>
                  <details className="atlas-expedition-card__capabilities">
                    <summary>Research sources · {scenario.requiredCapabilities.length}</summary>
                    <ul aria-label={`${scenario.title} research capabilities`}>
                      {scenario.requiredCapabilities.map((capability) => (
                        <li key={capability}>{readableLabel(capability)}</li>
                      ))}
                    </ul>
                  </details>
                  {expedition && (
                    <dl className="atlas-expedition-card__saved">
                      <div>
                        <dt>Market</dt>
                        <dd>{expedition.marketQuestion}</dd>
                      </div>
                      <div>
                        <dt>Workspace progress</dt>
                        <dd>{expedition.latestSequence} recorded events</dd>
                      </div>
                      <div>
                        <dt>Created</dt>
                        <dd>
                          <time dateTime={expedition.createdAt}>
                            {shortDate(expedition.createdAt)}
                          </time>
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>

                <footer>
                  <span>{scenario.availabilityReason}</span>
                </footer>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="atlas-lobby__footer">
        <span>Local-first · read-only research · source-linked claims</span>
        <span>No real trading path is enabled.</span>
      </footer>
    </main>
  );
}
