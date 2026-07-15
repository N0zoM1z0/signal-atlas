# MULTI-EXPEDITION-WORLDS - Durable scenario catalog and varied research worlds

## Status

In progress.

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
the implementation progresses.
