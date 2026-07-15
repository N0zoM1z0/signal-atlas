# MULTI-EXPEDITION-WORLDS - Durable scenario catalog and varied research worlds

## Status

In progress.

## Progress log

- `4ee4c59` made binary outcome IDs opaque across contracts, simulation, archive, Codex transport,
  and runtime synthesis; local runtime artifacts are expedition-namespaced.
- `56942fc` removed the production fixture import from the web bootstrap and made the shell,
  onboarding, missions, meetings, forecasts, agent presentation, and Phaser landmark selection
  derive from authoritative expedition data and authored visual metadata.
- `3e93dad` added the versioned `ScenarioDefinition` contract, safe installed catalog metadata,
  SQLite schema v2 full-definition storage, canonical definition verification, immutable identity
  triggers, and exact schema-v1 Helios backfill coverage.
- The current registry milestone adds SQLite schema v3 durable status and append-only expedition
  creation receipts, one shared multi-expedition store, lazy runtime restoration, strict
  idempotent `POST /api/expeditions`, registry-routed HTTP/WebSocket endpoints, and restart coverage
  proving that changing one expedition does not change another.
- `8021bcb` committed the durable registry boundary. The immediate follow-up adds the shared,
  cancelable, queue-bounded external-call gate so Pref, local Codex, and Professor capacity cannot
  multiply as expeditions are opened.
- `1dfc3df` committed the process-wide external-call boundary. The current Lobby milestone adds a
  1440 x 900 world shelf, stable expedition deep links, explicit shell teardown on return, scoped
  runtime diagnostics, and expedition-namespaced evidence and travel preferences.
- `64c11f7` committed the Lobby and switching boundary. The current Pref policy milestone makes
  synchronous execution explicit in capability-map v3, treats `task_support: forbidden` and
  `optional` as compatible, rejects task-required or ambiguous contracts, and gives each fake
  catalog lookup an exact provider-specific response before any second live mapping is enabled.
- `f38b46b` committed the synchronous task-policy correction. A proxy-enabled live gate then
  validated the exact hosted GDELT contract. The first deliberately tight 10-second invocation
  failed safely with `pref_timeout`; a single 30-second retry completed in about 19 seconds with one
  unique metadata-only source, no retained excerpt, and exact GDELT provenance. The mapping is now
  enabled as canonical `search_sources` with the same bounded normalization and rights policy.
- `e3698f4` committed bounded GDELT source search. The current adapter-foundation change adds strict
  canonical requests for market discovery, resolution history, economic-series discovery, and
  bounded series reads; recursively validated fixed arguments; provider-optional/canonical-required
  projection semantics; and disabled mappings for every candidate that has not passed its own live
  gate. FRED full reads default to 250 observations and cap at 500 instead of inheriting the
  provider's 100,000-observation ceiling.
- `f36fb83` committed the canonical capability contracts and disabled provider candidates. The
  current adapter milestone implements bounded normalization for article matches, market summaries,
  resolution history, economic-series discovery, and full-series revisions. Exact catalog tests
  distinguish strict Resolution/FRED schemas from Polymarket's open output. A proxy-enabled hosted
  Resolution call then passed in about 10.2 seconds with three unique metadata-only sources and a
  50-sample aggregate, so only `search_resolution_history` advances to enabled status.
- `c5b06d4` committed the provider-neutral result adapters, enabled the live-gated Resolution
  candidate, deduplicated canonical capability diagnostics, and recorded the remaining provider
  deployment/contract gaps. The current agent-routing milestone adds an optional bounded
  current-turn evidence packet, explicit place/verb route policy, canonical evidence-fact
  projection, real local-Codex synthesis, deterministic claim/signal materialization, and an honest
  retrieval-only fallback when no validated agent interpretation cites the retrieved sources.
- Focused validation after the first two commits: contracts 18/18, simulation 34/34, codex-runtime
  25/25, game-scene 13/13, archive 4/4, web 19/19, orchestrator 95/95, and repository lint with zero
  warnings. Persistence milestone validation currently passes contracts 19/19, world-content 2/2,
  and orchestrator 98/98. Registry validation currently passes contracts 19/19 and orchestrator
  102/102, plus full-workspace typecheck, schema artifact verification, and repository lint with
  zero warnings. Shared-gate focused validation passes three admission, cancellation, and overload
  tests; the complete orchestrator suite currently passes 105/105. Lobby validation currently
  passes web 25/25 and two focused Playwright flows including WCAG serious/critical scanning and a
  new 1440 x 900 baseline. Pref policy validation currently passes typecheck and 43/43 gateway
  tests, including both synchronous-compatible task policies and fail-closed task-policy drift.
  GDELT enablement keeps the complete gateway suite green; the canonical adapter foundation
  currently passes 54 focused gateway tests, orchestrator 106/106, full-workspace typecheck, and
  repository lint with zero warnings. Current-turn evidence routing passes 20 contract tests, 27
  Codex-runtime tests, 16 focused orchestrator routing/local-agent tests, and the orchestrator
  typecheck after rebuilding its workspace dependencies.
- A bounded live end-to-end smoke used the ignored local credential through the already
  proxy-enabled demo process. The authoritative mission completed with one fresh metadata-only
  `local_conditions` source, one real resumed `scout.v1` Codex turn, one accepted deterministic
  claim/signal pair, and no runtime failure or belief/forecast mutation. Public audit events retained
  only the canonical capability; the provider primitive remained confined to source provenance.
- Scenario authoring exposed that a disclosed real-world proxy still needed a machine-enforced
  relevance boundary. The current follow-up adds `direct`, `reference_class`, and `context_only`
  evidence roles to the turn contract and prompt. Non-weather live routes must opt in explicitly;
  context-only output is rejected unless every signal remains non-directional, outcome-neutral, and
  unknown-impact.
- A second bounded live weather-to-Codex smoke passed with the new scope gate. The accepted signal
  was `context`, had no target outcome, retained `unknown` impact, and caused zero belief or forecast
  events after the mission began.
- The Northlight Harbor milestone installs a second complete scenario with opaque `suspended` and
  `operating` outcome IDs, a coastal-harbor presentation, Tern/Cora/Brin, seven domain-specific
  places, eight source-linked claims and signals, and seven authored mission results. Its evidence
  journey covers official sea state, an authority notice, vessel movement, conditional history, a
  derivative wire report with overlapping correlation groups, a pilot contradiction, and a newer
  marker notice that supersedes the first notice and marks its signal stale.
- Northlight focused validation passes world-content 3/3, test-fixtures 2/2, web 26/26, and
  orchestrator 112/112. Three focused Chromium journeys pass, including registry creation,
  teardown-safe switching, serious/critical WCAG scanning, no viewport overflow, and the updated
  Lobby plus new `tests/visual/northlight-harbor-world-1440x900.png` baselines.

## Goal

Turn the Helios-3 vertical slice into a durable multi-expedition workspace. A local catalog must be
able to create independently replayable worlds from versioned immutable definitions, the
orchestrator must own multiple isolated runtimes, and the web application must open those worlds
through an Expedition Lobby without reducing the product to a dashboard.

The first delivered content expansion is Northlight Harbor. Northbridge follows as the first
non-weather, Preference-rich world. Civic/official-record integration and true multi-outcome markets
remain explicit independent boundaries rather than being smuggled into the binary content work.

## Intended files

The work is deliberately split into coherent milestones. The exact set may narrow as tests expose
smaller boundaries, but changes remain within these areas:

- `packages/contracts`: versioned scenario/catalog/presentation contracts and generated JSON
  schemas; no UI, persistence, Fastify, Codex, or Pref imports.
- `packages/world-content`: validated installed scenario catalog, immutable definition hashing, and
  presentation kits for Helios, Northlight Harbor, and Northbridge.
- `packages/test-fixtures` and `fixtures`: deterministic authored evidence, missions, Professor
  answers, supersession, and resolution content for each scenario.
- `packages/game-scene`: consume typed world template, asset pack, ambient presentation, and landmark
  definitions without checking market or expedition IDs.
- `packages/pref-gateway`: correct synchronous `task_support` compatibility and add bounded,
  provider-neutral adapters for article search, market discovery, resolution history, and economic
  series.
- `apps/orchestrator`: SQLite definition/catalog migration, multi-expedition store ownership,
  runtime registry, list/create/open routes, isolated event streams, and canonical capability
  mission routing.
- `apps/web`: server-sourced shell projection, Expedition Lobby/deep links, workspace switching,
  expedition-namespaced local preferences, outcome-neutral forecast/meeting/replay presentation,
  and semantic mirrors for every scene action.
- `tests/e2e`, `tests/visual`, and focused package/application tests: multi-expedition persistence,
  switching, provenance, accessibility, replay, and 1440 x 900 visual baselines.
- architecture/user documentation and this worklog when contracts, routes, storage, or operator
  behavior change.

No Preference source file, credential file, local SQLite database, generated connection URL, hosted
authentication system, telemetry path, or real-money trading capability is in scope.

## Acceptance criteria

### Content neutrality

- Helios keeps its deterministic fixture behavior and remains the golden regression world.
- A second binary fixture uses outcome IDs other than `yes` and `no`, different agents and places,
  and a non-space presentation without leaking Helios, Galehaven, launch, Meridian Coast, or Lantern
  Square copy or art.
- Market question, outcome labels, deadline, primary outcome, agent labels, place labels, quick
  commands, meeting prose, Professor context, and onboarding derive from typed scenario/projection
  data rather than client fixture imports or identifier literals.
- Phaser consumes the manifest presentation boundary. Template and asset-pack changes replace the
  primary landmark and environmental vocabulary without market-ID branches.

### Catalog and immutable persistence

- The installed scenario catalog has stable scenario IDs, positive versions, mode, summary,
  capability requirements, preview metadata, a complete validated definition, and a deterministic
  definition hash.
- Creating an expedition copies the complete definition and presentation metadata into SQLite.
  Updating an installed scenario may create a new version but can never mutate an existing
  expedition's bootstrap definition.
- Existing schema-version-1 workspaces migrate deterministically, keep their event log and
  checkpoints, and are assigned the exact compatible Helios definition or fail with a contextual
  recovery error.
- Startup and replay use the stored definition, not whichever fixture version happens to be
  installed later.

### Runtime registry and Lobby

- `GET /api/scenarios` lists installed content eligibility without exposing private local paths.
- `GET /api/expeditions` lists locally created expeditions and their durable cursors/status.
- `POST /api/expeditions` validates a scenario/version request, creates one immutable expedition,
  and is idempotent for a caller-provided key.
- Snapshot, command, replay, export, diagnostics, Professor, Pref, and WebSocket routes resolve the
  requested expedition through a registry rather than comparing against one singleton ID.
- Two expeditions keep independent events, receipts, checkpoints, streams, replay hashes, selected
  signals, and browser preferences through restart and switching.
- One global scheduler and Pref/Codex concurrency policy remains authoritative across runtimes.
- The Lobby lists a small set of diorama-like scenario/expedition cards and opens one complete
  five-part world at a time. Keyboard navigation, focus, reduced motion, high contrast, and semantic
  status remain available.

### Preference expansion

- Synchronous mappings accept read-only `task_support: forbidden` and `optional`; mappings that
  require MCP Tasks fail closed until a task-capable transport exists.
- Read-only, non-destructive annotations, `side_effect`, exact provider/schema matching, strict
  input projection, output validation, response-size limits, timeouts, call budgets, rights policy,
  and canonical source identity remain mandatory.
- GDELT context search is enabled as `search_sources` after exact discovery and a bounded live smoke.
- Market discovery, resolution history, and economic series use canonical capabilities and bounded
  adapters, not provider-specific microservices. Unavailable FRED deployment is surfaced honestly
  and fixture mode remains complete.
- Agents receive only orchestrator-selected canonical evidence records and may cite only their IDs.
  Model output never invents source identities or mutates the world directly.

### Delivered worlds and deferred boundaries

- Northlight Harbor is fully playable offline and exercises a harbor presentation kit, fresh
  conditions, an authority notice, traffic observation, historical base rate, derivative report,
  contradictory evidence, correlation trap, source supersession/staleness, and official resolution.
- Northbridge is fully playable offline and exercises a materially different ledger/civic-industrial
  presentation plus news, market context, historical resolution, economic-series fixture context,
  contradictions, and a sealed policy-decision resolution.
- Official-record/civic support is represented by a closed canonical capability contract and remains
  fixture-first until a cataloged provider passes live, provenance, rights, and fallback gates.
- True multi-outcome remains a separate milestone: the binary schema is not silently widened, and
  no incomplete probability editor or dynamic Codex schema is presented as finished.
- No real trading, order placement, wallet, relayer, portfolio mutation, or write-capable Pref tool
  is exposed.

## Milestone sequence and commit boundaries

1. Content-neutral contracts, projections, renderer, and a non-`yes/no` acceptance fixture.
2. Versioned world-content catalog plus immutable SQLite definition migration.
3. Multi-expedition runtime/store registry and HTTP/WebSocket API.
4. Expedition Lobby, deep-link selection, teardown-safe switching, and preference isolation.
5. Synchronous Pref task-policy correction, live GDELT, and provider-neutral adapter family.
6. Northlight Harbor content, presentation kit, journeys, and screenshots.
7. Northbridge content/adapters plus explicit civic and multi-outcome boundary tests/docs.
8. Full validation, restart/live smoke, accessibility review, visual baselines, and completion audit.

Every coherent milestone receives its own English commit subject and detailed English body. Unrelated
user files remain unstaged.

## Dependencies

- Existing strict contracts, pure reducer, append-only event log, checkpoint verification, and
  fixture/Codex fallbacks remain authoritative.
- Node 22.12+ and the current `node:sqlite` adapter remain the local persistence baseline.
- Pref network discovery or execution uses the ignored local key through the required local proxy;
  offline tests never require that proxy.
- Installed visual assets and generated schema/test artifacts must be reproducible from committed
  source.

## Risks and controls

- **Definition drift:** persist validated definition JSON and its canonical hash in the same durable
  expedition record; never reopen from mutable package state.
- **Cross-expedition leakage:** key every runtime, stream, receipt, checkpoint, local preference, and
  in-flight request by expedition ID; add restart and concurrent-stream tests.
- **Scheduler multiplication:** share one bounded scheduler/service set across the registry rather
  than creating unbounded external-call capacity per runtime.
- **Superficial reskins:** acceptance scans semantic DOM, authored messages, and rendered landmark
  definitions for forbidden Helios vocabulary in non-Helios worlds.
- **Provider advertised but unavailable:** distinguish catalog compatibility from deployment health;
  fail closed and preserve complete fixture choreography.
- **Untrusted source content:** normalize bounded data as content, never instructions; retain source
  IDs, rights, freshness, and retrieval provenance.
- **Migration failure:** migrate transactionally, reject newer schemas, test a real version-1
  database, and never rewrite append-only event rows.
- **Visual scope growth:** reuse topology through explicit kits, then add one genuinely different
  Northbridge template; preserve integer scaling, semantic mirrors, and reduced motion.

## Required validation

- Focused unit and contract tests at every milestone.
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- focused multi-expedition and Pref integration tests
- `pnpm test:e2e`
- `pnpm test:visual`
- local restart smoke using a disposable SQLite workspace
- bounded read-only live Pref smoke through the configured local proxy
- final requirement-by-requirement completion audit

Exact commands, counts, screenshots, live limitations, and remaining risks will be recorded here as
the implementation progresses. For the Northlight milestone the focused commands were:

```bash
pnpm --filter @signal-atlas/world-content build
pnpm --filter @signal-atlas/test-fixtures build
pnpm --filter @signal-atlas/world-content test
pnpm --filter @signal-atlas/test-fixtures test
pnpm --filter @signal-atlas/orchestrator test -- app.test.ts northlight-expedition.test.ts
pnpm --filter @signal-atlas/web test -- App.test.tsx
pnpm --filter @signal-atlas/web typecheck
pnpm exec playwright test tests/e2e/expedition-lobby.spec.ts tests/e2e/northlight-harbor.spec.ts --update-snapshots
```
