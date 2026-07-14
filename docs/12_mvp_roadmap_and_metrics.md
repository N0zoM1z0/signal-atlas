# 12. MVP Roadmap and Success Metrics

## 12.1 Product strategy

The fastest route to a compelling product is not broad data integration. It is a polished vertical slice that demonstrates the spatial research loop with deterministic content, then replaces one data path at a time with Pref MCP and Codex.

The roadmap is organized around risk retirement:

1. Prove the world is visually magnetic.
2. Prove movement and signal cards explain research.
3. Prove a bounded Codex turn can drive a character safely.
4. Prove Pref MCP results can become trustworthy source objects.
5. Prove the full loop remains legible with live latency and errors.

## 12.2 Phase 0: Product and technical foundation

**Objective:** create a repository that can support rapid visual iteration without architecture debt.

Deliverables:

- monorepo scaffold;
- design tokens;
- shared contracts package;
- pure event reducer;
- fictional Helios-3 fixture;
- basic React shell and Phaser host;
- test and lint commands;
- `AGENTS.md` and architectural decision records.

Exit criteria:

- one command starts frontend and orchestrator;
- fixture expedition loads from JSON;
- a world snapshot renders;
- events can be appended and replayed;
- CI or local validation runs typecheck, tests, and build.

## 12.3 Phase 1: Visual vertical slice

**Objective:** make the concept understandable and attractive without any model or live data dependency.

Deliverables:

- finished main layout;
- handcrafted map with six locations;
- three moving agents;
- mission assignment and waypoint travel;
- signal rail with fixture cards;
- Archive and Professor scenes;
- meeting scene;
- forecast commit dialog;
- simple resolution/replay sequence;
- sound placeholders and reduced-motion support.

Exit criteria:

- a first-time user can complete the tutorial without explanation;
- the world remains the visual focus;
- screenshots meet the art direction;
- all key actions work with keyboard;
- deterministic Playwright flow passes.

## 12.4 Phase 2: Orchestrator and agent runtime

**Objective:** replace scripted agent results with schema-validated local Codex turns.

Deliverables:

- `CodexDriver` interface;
- scripted driver and `codex exec` driver;
- agent session registry;
- turn scheduler and concurrency limits;
- agent turn prompt builder;
- JSON Schema output validation;
- retry and safe-wait fallback;
- runtime diagnostics panel;
- turn event stream and logs.

Exit criteria:

- each agent can complete a bounded mission;
- invalid output never mutates state;
- a session can be resumed;
- the app continues in scripted mode when Codex is unavailable;
- a turn can be replayed from recorded inputs and fixture outputs.

## 12.5 Phase 3: Pref MCP integration

**Objective:** ingest live or local Pref data through a controlled, auditable gateway.

Deliverables:

- MCP client and capability discovery;
- configurable capability map;
- canonical source normalization;
- Pref call audit log;
- source cache and versioning;
- live connection diagnostics;
- read-only agent proxy;
- one fully working live mission, such as local weather or source search.

Exit criteria:

- a live Pref result becomes a source record and signal card;
- provenance is visible in the UI;
- failure and stale-cache behavior are clear;
- fixture and live outputs share the same contracts;
- unknown MCP tools are denied by default.

## 12.6 Phase 4: Evidence intelligence

**Objective:** make information comparison and forecast explanation genuinely useful.

Deliverables:

- duplicate and correlation detection;
- source comparison;
- reliability/freshness workflow;
- agent knowledge graph;
- structured meetings;
- professor modes;
- forecast-change attribution;
- case-file export.

Exit criteria:

- a user can trace a forecast commit to sources;
- duplicate evidence is visibly clustered;
- agents demonstrably possess different knowledge before meeting;
- professor responses cite selected items and state limitations.

## 12.7 Phase 5: Polish and pilot

**Objective:** create a streamable, demo-ready pilot.

Deliverables:

- final pixel assets for the first world;
- audio pass;
- onboarding refinement;
- performance and accessibility audit;
- crash and recovery paths;
- historical challenge scenario;
- optional read-only live market price adapter;
- installer or one-command local launcher.

Exit criteria:

- stable 30-minute session;
- no blocking error on temporary Pref/Codex outage;
- polished first screenshot and trailer capture;
- pilot users understand provenance and forecast changes;
- no user confuses forecast commit with real trading.

## 12.8 Recommended build order within the vertical slice

1. Static application shell matching the prototype.
2. World map and camera.
3. Agent sprites and waypoint movement.
4. Event reducer and fixture playback.
5. Signal rail and inspector.
6. Command builder and mission queue.
7. Archive.
8. Forecast commit.
9. Meeting.
10. Professor.
11. Codex scripted driver.
12. Real Codex driver.
13. Pref fixture gateway.
14. Live Pref capability.
15. Resolution and replay.
16. Accessibility and polish.

This order protects the visual thesis while keeping integration behind stable contracts.

## 12.9 Product metrics

### Comprehension

- percentage of first-time users who correctly identify the market question, public probability, and team forecast;
- percentage who can explain what an agent is doing;
- percentage who can identify the source behind a signal;
- percentage who understand why a forecast changed.

### Engagement

- time to first agent dispatch;
- percentage of sessions with a signal inspection;
- percentage with an archive visit;
- percentage with a professor query;
- percentage with a forecast commit;
- average meaningful actions per session;
- replay or case-file open rate.

### Trust

- percentage of forecast commits linked to evidence;
- source-open rate from signals;
- stale/disputed label comprehension;
- number of invalid agent outputs applied to state, target zero;
- user-reported confusion between simulation and real trading, target zero.

### System quality

- successful Codex turn rate;
- schema-repair rate;
- Pref call success and latency;
- reconnection recovery rate;
- deterministic replay match rate;
- frontend frame time;
- accessibility test pass rate.

### Forecast quality

For resolved scenarios:

- Brier score;
- calibration by confidence band;
- forecast revision timing;
- evidence diversity;
- correlation-adjusted signal count.

Forecast quality is a learning metric, not the only product metric. A delightful but dishonest product fails; an accurate but unreadable product also fails.

## 12.10 Pilot test plan

### Test A: Silent first impression

Show the main screen for ten seconds with no explanation. Ask what the product is, what is being predicted, and what the characters are doing.

### Test B: First mission

Ask the user to find information about weather without explaining controls. Measure time and errors.

### Test C: Provenance

Ask, "Where did this signal come from?" Measure whether the user can reach the source in two interactions.

### Test D: Disagreement

Show two agents with different forecasts. Ask why they disagree and whether they share the same evidence.

### Test E: Commit

Ask the user to update the forecast. Confirm they understand this is a simulated forecast, not a trade.

### Test F: Outage

Disconnect Pref or Codex. Confirm the user understands what failed and what remains usable.

## 12.11 Scope control

Features to defer unless they directly unblock the vertical slice:

- multiplayer;
- mobile app;
- real-money execution;
- custom world editor;
- procedural tilemap generation;
- more than one market provider;
- multi-outcome markets;
- voice;
- agent marketplace;
- cosmetic progression economy;
- social feed;
- hosted cloud sync.

## 12.12 Launch narrative

The first public demonstration should be framed as:

"Watch a team of local AI agents explore a living world, gather evidence through Pref, and explain a forecast as it changes."

The demo should begin in the world, not in settings or a terminal. Codex and MCP are the engine beneath the experience, while the player's first impression is movement, weather, characters, and evidence.
