# MULTI-EXPEDITION-CONTENT-AUDIT - Market variety and content-system strategy

## Status

Complete. This was a read-only product, architecture, and integration audit followed by documentation
only; no runtime behavior changed.

## Goal

Determine how Signal Atlas should grow from the single Helios-3 vertical slice into a durable set of
distinct prediction-market worlds, identify which parts of the implementation are already reusable,
separate true multi-expedition support from a superficial fixture reskin, and select the first content
pack that exercises substantially more of Preference without weakening fixture mode or provenance.

## Intended files

- `docs/worklogs/MULTI-EXPEDITION-CONTENT-AUDIT.md`: record the product decision, implementation
  boundary, scenario ranking, staged roadmap, acceptance criteria, and audit evidence.
- `docs/PREF_CAPABILITY_FEEDBACK.md`: record the separate Preference capability inventory, live
  read-only probe results, Signal Atlas integration corrections, and actionable Preference feedback.

No application, contract, fixture, database, environment, or Preference source file is in scope for
this audit.

## Acceptance criteria

- Distinguish the generic domain/event core from the Helios-specific startup, runtime, presentation,
  authored dialogue, and renderer assumptions with concrete repository evidence.
- Decide whether multiple markets belong in one world projection or in separately selected
  expeditions.
- Preserve the current design boundary that the next content expansion remains binary; true
  multi-outcome interaction is a later independent milestone.
- Define a versioned content-pack shape that keeps authored worlds deterministic and replayable while
  allowing one canonical capability to have several provider mappings.
- Rank materially different market/event archetypes by visual value, evidence value, Preference fit,
  replay/resolution value, and implementation cost.
- Recommend a small first content pack and a staged implementation sequence rather than adding a
  broad set of partially working fixtures.
- Verify Preference claims against the local source/catalog and a small number of bounded live
  read-only calls, without recording credentials, authorization material, raw provider payloads, or
  copyrighted source bodies.
- Record concrete follow-ups for both Signal Atlas and Preference, and confirm that no trading path is
  proposed or added.

## Decision

The next product milestone should be **a multi-expedition content system**, not a multi-market
dashboard and not a pile of alternate JSON files selected by an environment variable.

One expedition remains the authoritative container for exactly one market, one world manifest, one
event sequence, and one replayable research history. An Expedition Lobby lists a small scenario
catalog and opens one full five-part world at a time. This preserves the product's spatial thesis and
matches the existing `Expedition.marketId` plus `worldManifestId` boundary.

The first expansion remains binary, but it must not assume that outcome IDs are literally `yes` and
`no`. Multi-outcome markets require the separately designed probability-garden editor, dynamic Codex
output schema, and additional visual/replay coverage; the product specification explicitly defers
that work until the binary interaction is polished.

## What is already reusable

- `Market`, `Expedition`, `WorldManifest`, places, routes, and capability bindings are separate typed
  records. A manifest can already declare a topic template, asset pack, field sites, ambient layers,
  and provider-neutral capability bindings.
- The pure simulation bootstrap accepts any valid expedition, market, manifest, and agent set. Events
  validate expedition, market, outcome, place, source, claim, and signal references without checking
  for the Helios market ID.
- Probability distributions, belief redistribution, event envelopes, replay, canonical hashes, and
  Brier scoring are keyed by outcome ID. The market contract is deliberately binary, but most of the
  reducer and scoring core is not tied to `yes`.
- The SQLite relations are partitioned by expedition ID, and command receipts, events, and
  checkpoints already use expedition-local sequences.
- The Pref Gateway already has the right provider-neutral shape: canonical capability, declarative
  provider mapping, strict discovery contract, bounded response adapter, canonical source records,
  and one audited connection.

This means new event subject matter usually belongs in content, configuration, source adapters, and
presentation. It does not require a provider service or a new domain-event variant for every topic.

## Where the running product is still Helios-specific

### Startup and workspace ownership

- `apps/orchestrator/src/app.ts` always constructs `createHelios3ExpeditionFixture()` and one
  `ExpeditionRuntime`; every expedition route compares its parameter to that singleton runtime ID.
- `packages/test-fixtures/src/index.ts` exports only the Helios fixture.
- The SQLite schema is expedition-partitioned, but a store handle opens one caller-supplied fixture
  identity. It does not retain the complete immutable scenario definition needed to reopen an old
  expedition after a packaged content revision.
- The documented `GET /api/expeditions`, `POST /api/expeditions`, and Expedition Lobby do not yet
  exist.

### Web projection and binary presentation

- `apps/web/src/world-shell/model.ts` imports and replays the Helios fixture at module load, uses its
  agent order, and reads the primary probability from the literal `yes` key.
- `MarketRibbon.tsx` hard-codes the expedition name, question, YES/NO labels, and September 30
  deadline instead of receiving them from the projection.
- `ForecastWorkspace.tsx`, `MeetingWorkspace.tsx`, archive/replay labels, and command materialization
  construct or read `yes` and `no` directly.
- `WorldShell.tsx` defaults to Helios agent/place IDs and contains authored references to Mira,
  Kestrel, Galehaven, Lantern Square, and the observatory.
- Evidence UI preferences currently use a global browser key rather than an expedition namespace,
  so a future world switch could leak pinned signal IDs across expeditions.

### World rendering and authored behavior

- `WorldManifest.template`, `assetPack`, and `visualState` are not meaningfully consumed by the
  renderer. Phaser always draws the same coastal terrain and launch vehicle.
- The semantic world toolbar and loading copy always say Meridian Coast and present weather as the
  global ambient status.
- The mission interpreter owns a Helios-specific alias table for weather, launch notices, the
  archive, the professor, and Lantern Square.
- The meeting runtime and fixture Professor still contain launch, crosswind, YES, and named-place
  prose. The live Professor prompt is substantially more generic and demonstrates the intended
  direction.
- The live Pref agent proxy intercepts only `observe_conditions`, looks up the literal
  `weather-tower` place, and materializes a Helios/Galehaven-specific context signal. Enabling a new
  capability map entry alone therefore does not make an agent use it.

The practical test for content neutrality is not whether a second fixture parses. It is whether a
non-space world can complete mission, meeting, Professor, forecast, resolution, persistence, and
replay flows without any Helios names, YES key assumptions, launch art, or weather-specific prose.

## Proposed content-pack model

Each packaged scenario should have four explicit layers.

1. **Catalog metadata**
   - stable scenario ID and version;
   - title, category, summary, mode (`fixture`, `historical_challenge`, or `live_import`);
   - required canonical capabilities and availability policy;
   - preview/diorama metadata and creation eligibility.
2. **Immutable expedition definition**
   - market and resolution rules;
   - world manifest and agents;
   - deterministic fixture sources, claims, signals, missions, Professor response, and sealed
     resolution;
   - canonical definition hash.
3. **World presentation kit**
   - terrain/topology template;
   - landmark and building asset pack;
   - ambient vocabulary, status channels, and topic-specific field sites;
   - semantic labels equivalent to every canvas-only cue.
4. **Evidence choreography**
   - at least one fresh primary observation or official record;
   - one historical/base-rate item;
   - one credible contradictory item;
   - one duplicate or correlation trap;
   - one stale/superseded transition;
   - one explicit official resolution source.

Creating an expedition must copy the complete immutable definition into the local workspace. The
event log remains authoritative for all later mutations; the installed scenario catalog is only an
authoring source for new expeditions. This prevents a package update from making an accumulated
workspace unreplayable.

## Ranked market/event archetypes

| Rank | Archetype                                  | World/evidence value                                                                                                | Preference fit today                                                                     | Cost after neutralization | Recommended template                            |
| ---: | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------- |
|    1 | Weather/logistics deadline or threshold    | Strong environmental state, official notice, sensor freshness, base rates, and supersession                         | Strong: live weather works; NOAA and weather families are cataloged                      | Low to medium             | Reuse coastal topology with a harbor asset pack |
|    2 | Central-bank or macro policy decision      | Distinct institutions, scheduled releases, numeric series, news, market probabilities, and resolution               | Mixed: GDELT, market discovery, and resolution work; FRED is cataloged but live-broken   | Medium to high            | New ledger/industrial district                  |
|    3 | Legislative, court, or regulatory deadline | Excellent official-record provenance, document versions, position changes, contradictions, and roll-call resolution | Blocked: Congress and several official-record packages are not publicly callable         | Medium to high            | New civic-capital district                      |
|    4 | Product, clinical, or research milestone   | Good lab/factory visuals, filings, literature, milestone supersession, and deadline resolution                      | Partial: ArXiv is strong; safe general URL read and official filing paths are incomplete | Medium                    | Science/industrial template                     |
|    5 | Flood, storm, or disaster threshold        | Excellent spatial/sensor presentation, alerts, forecast revisions, and settlement evidence                          | Partial: weather/NOAA are strong; natural-disaster package is catalog-deferred           | Medium                    | River basin or emergency-coast template         |
|    6 | Sports match, tournament, or qualification | Visually distinctive, clear resolution, injury/news contradictions, and time-bounded replay                         | Blocked: sports implementation exists but is not in the public capability snapshot       | High for first arena      | Arena district                                  |
|    7 | Election result or turnout threshold       | Strong civic spectacle, source disagreement, temporal updates, and resolution                                       | Weak: no verified official result/counting capability; OpenFEC is not a results source   | High                      | Reuse civic-capital after official data support |

## Recommended first content ladder

### 1. Preserve Helios-3 as the golden regression world

Helios remains the deterministic smoke baseline. Content neutralization must leave its projection
hash, fixture journey, screenshots, offline operation, and resolution behavior unchanged.

### 2. Northlight Harbor Watch

Example question: **Will Northlight Harbor suspend outbound traffic before 18:00 UTC?**

This is the cheapest proof that a world template and asset pack are real rather than decorative
fields. It can reuse the coastal route topology while replacing the rocket with cranes, a
breakwater, traffic lamps, a harbor authority, and a field site. Its authored evidence should include
weather conditions, an authority notice, a traffic observation, historical closures, a derivative
news report, and a later bulletin that supersedes an earlier signal.

### 3. Northbridge Monetary Council

Example question: **Will the Northbridge Monetary Council cut its policy rate at the June
meeting?**

This is the first Preference-rich non-weather world: a central bank, statistics office, newsroom,
ledger hall, archive, professor, and public square. GDELT can provide news search now; prediction-
market discovery and the historical resolution registry both execute through the hosted MCP today.
FRED should supply official series and release context after its hosted provider secret/availability
metadata is repaired. Until then the scenario remains fully authored in fixture mode and labels live
sources as context.

### 4. Alder Assembly Final Vote

Example question: **Will the Alder Assembly pass the Northline bill before adjournment?**

This becomes the acceptance scenario for `search_official_records` and source supersession across
bill/amendment versions. It should remain fixture-first until Congress or another official-record
provider is publicly cataloged, live-smoked, and normalized. It is more valuable than an early sports
world because it stress-tests source identity, official resolution, contradictions, and document
versioning rather than only adding new art.

## Implementation sequence

1. **Content neutralization**
   - derive names, roles, primary outcome, home/social/professor places, quick commands, meeting
     prose, and onboarding from typed scenario presentation rather than Helios constants;
   - pass manifest template/asset pack/presentation state through the scene boundary;
   - retain zero-diff Helios behavior and screenshots.
2. **Versioned scenario catalog and immutable definition storage**
   - move authored content ownership into `packages/world-content`;
   - add a SQLite migration for scenario ID/version, definition hash, and complete definition JSON;
   - replay existing expeditions from their stored definition, not the latest installed fixture.
3. **Multi-expedition runtime registry and API**
   - list/create/open expeditions and route each request/stream to the correct runtime;
   - retain one global scheduler/concurrency budget so opening several workspaces cannot multiply
     Codex or Pref concurrency silently.
4. **Expedition Lobby and client workspace switching**
   - load a snapshot before constructing the shell;
   - deep-link by expedition ID, tear down the old stream on switch, and namespace local preferences;
   - keep the selected world as the primary visual experience.
5. **Northlight Harbor content and coastal presentation kit**
   - prove topology reuse, landmark replacement, topic-neutral dialogue, stale/superseded evidence,
     independent persistence, and replay.
6. **Provider-neutral research expansion and Northbridge world**
   - correct synchronous Pref task-support matching;
   - add canonical market, resolution-history, economic-series, and research-source adapters;
   - route missions to canonical capabilities before Codex synthesis, without provider services.
7. **Civic template and Alder Assembly**
   - add only after an official-record provider passes the same catalog, execution, provenance,
     rights, and fixture-fallback boundaries.
8. **True multi-outcome milestone**
   - separately change the binary market constraint, generate an outcome-aware Codex schema, add a
     probability-garden editor, and test three-outcome forecast/replay/scoring behavior.

## Acceptance tests for the implementation milestones

- A second binary fixture uses outcome IDs other than `yes`/`no`, different agent and place IDs, and
  a non-space template; it passes contracts, simulation, API, persistence, archive, Professor,
  forecast, resolution, replay, and case-file tests.
- Two expeditions keep independent events, command receipts, checkpoints, replay hashes, streams,
  source IDs, selected signals, and local preferences across restart and switching.
- No non-Helios semantic DOM, event memo, dialogue, Professor response, mission suggestion, or canvas
  landmark contains Helios, Galehaven, launch, Meridian Coast, or Lantern Square copy unless the
  authored scenario explicitly chooses it.
- Each distinct world template has a 1440 x 900 baseline, while archive, Professor, forecast, and
  replay remain visually coherent and keyboard accessible.
- Every content pack is fully playable with Pref and Codex offline. Live provider gaps are shown as
  bounded capability status, never replaced by invented source identities.
- No write-capable provider, real-money order control, market execution tool, or automatic trading
  path is exposed.

## Dependencies and risks

- Multi-expedition persistence changes the workspace ownership model and needs a migration before a
  lobby can truthfully reopen accumulated histories.
- Scenario definitions must be immutable after creation. Editing installed content may create a new
  scenario version but may not mutate a stored expedition's bootstrap.
- A provider capability can be cataloged yet unavailable in the hosted deployment. New live content
  requires both exact discovery and one harmless execution smoke.
- Calculation tools such as probability, statistical, causal, and temporal primitives produce
  analysis derived from cited inputs. They should not be normalized as external `SourceRecord`
  identities; a future typed analysis-result boundary should reference the input source IDs.
- Content breadth can overwhelm the world and signal rail. Add one coherent evidence choreography at
  a time rather than importing every available provider tool.

## Verification performed

- Read the required product, UI/UX, Pref/Codex, technical architecture, and data/event specifications,
  plus the world-system, game-loop, archive, roadmap, and open-question documents.
- Inspected contracts, simulation, persistence, orchestrator, web projection/UI, scene renderer,
  fixtures, Pref gateway, focused tests, and the local Preference source/catalog.
- Verified the Signal Atlas demo remained live with SQLite ready, local Professor available, and the
  Pref connection authenticated; no state-changing product command was submitted.
- Performed bounded, read-only hosted Preference probes through `search_tools` and `call_tool`; only
  contract fields and aggregate success/failure facts were retained. Exact results are recorded in
  `docs/PREF_CAPABILITY_FEEDBACK.md`.
- Confirmed the Signal Atlas worktree contained only the pre-existing unrelated untracked
  `droid.resume.txt` before documentation edits. It was not read, modified, staged, or committed.

## Result

The architecture does not need a rewrite to support richer markets. It needs to promote content and
expedition ownership into first-class boundaries, remove Helios assumptions above the pure reducer,
store immutable scenario definitions with durable histories, and then connect a deliberately small
set of canonical evidence capabilities. The highest-value next implementation is content
neutralization plus Northlight Harbor, followed by the Preference task-policy correction and the
Northbridge macro world.

No real trading path was added or proposed.
