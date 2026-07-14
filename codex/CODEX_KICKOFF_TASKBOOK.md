# Codex Kickoff Taskbook

## 1. Mission for Codex

Build a polished vertical slice of Signal Atlas: a local-first, pixel-world research game for a fictional prediction market. Three visible agents travel among meaningful locations, retrieve or receive sourced signals, meet, consult an archive and professor, and update a simulated forecast.

The first implementation must be beautiful in fixture mode before live Pref or Codex runtime integration becomes a dependency.

## 2. Target vertical slice

### Fictional market

**Will the Helios-3 mission launch before September 30?**

Outcomes: YES / NO.  
Starting public probability: 61%.  
Starting team forecast: 55%.

### World

- Meridian Observatory
- Galehaven Weather Tower
- Ledger Bay Newsroom
- Archive Quarter
- Scholar's Hill
- Lantern Square

### Agents

- Mira, Field Scout
- Orin, Archivist
- Kestrel, Skeptical Analyst

### Required journey

1. The user dispatches Mira to the Weather Tower.
2. Mira returns a sourced weather signal.
3. The user sends Orin to the Archive.
4. Orin retrieves a historical base-rate signal.
5. The agents meet at Lantern Square and exchange knowledge.
6. The user asks Professor Vale whether the signals are independent.
7. The user commits a revised forecast.
8. The user can replay the expedition from the event log.

## 3. Non-negotiable constraints

- No real-money trading.
- No order-placement API or MCP tool.
- Fixture mode is the default and fully playable offline.
- React owns dense UI; Phaser owns world rendering.
- The orchestrator owns authoritative state.
- State changes are append-only events.
- Every active signal links to at least one source record.
- Every Codex output is schema-validated.
- Essential controls work with keyboard and reduced motion.
- The visual target is the supplied prototype and design tokens, not a generic admin dashboard.

## 4. Working method

Use one main Codex thread as implementation lead. Delegate independent read-heavy work to subagents when useful, but keep overlapping code edits serialized.

For each task:

1. Read the relevant design sections.
2. Inspect current code.
3. Write `docs/worklogs/<TASK_ID>.md` with plan and acceptance criteria.
4. Implement the smallest coherent change.
5. Run focused tests.
6. Run the task's completion gate.
7. Update docs and report exact results.

## 5. Phase map

| Phase | Goal | Primary risk retired |
|---|---|---|
| P0 | Repository and contracts | Architecture drift |
| P1 | Static visual shell | Product is not attractive or legible |
| P2 | World simulation | Movement is decorative rather than meaningful |
| P3 | Evidence experiences | Information becomes unreadable |
| P4 | Local agent runtime | Model output is unstable or unsafe |
| P5 | Pref MCP integration | External data lacks provenance or reliability |
| P6 | Replay, accessibility, polish | Demo is fragile or hard to understand |

## 6. Task backlog

### P0-001 - Bootstrap monorepo

**Goal:** create the workspace and shared tooling.

**Deliverables:**

- pnpm workspace;
- `apps/web` React/Vite/TypeScript app;
- `apps/orchestrator` Fastify/TypeScript app;
- packages listed in `AGENTS.md`;
- strict TypeScript configs;
- lint, format, test, typecheck, build scripts;
- root `AGENTS.md` copied from this package;
- `.gitignore` covering secrets, databases, auth, caches, and build output.

**Acceptance:**

- `pnpm install` succeeds;
- `pnpm dev` starts both apps;
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass;
- web app displays a branded Signal Atlas loading shell;
- orchestrator `/api/health` returns typed JSON.

**Dependencies:** none.

### P0-002 - Design tokens and UI primitives

**Goal:** establish the visual system before building screens.

**Deliverables:**

- token package generated from `design-tokens.json`;
- typography roles, spacing, radii, borders, shadows, and motion variables;
- Button, IconButton, Panel, Badge, Tooltip, Dialog, Tabs, Progress, and Card primitives;
- reduced-motion and high-contrast CSS foundations;
- component demo route.

**Acceptance:**

- no raw palette values outside token files except documented asset colors;
- keyboard focus is visible;
- primitives pass basic accessibility checks;
- screenshot matches the package palette and surface style.

**Dependencies:** P0-001.

### P0-003 - Domain contracts and fixture

**Goal:** create the stable data boundary.

**Deliverables:**

- Zod schemas/types for market, world manifest, agent, mission, source, claim, signal, belief, and world event;
- JSON Schemas generated or synchronized with `schemas/`;
- Helios-3 fixture imported from `fixtures/helios3_expedition.json`;
- event-envelope and command-envelope definitions;
- schema tests and invalid-fixture tests.

**Acceptance:**

- fixture validates;
- invalid probability and missing-source cases fail clearly;
- contracts have no React, Phaser, Fastify, Codex, or MCP dependency.

**Dependencies:** P0-001.

### P0-004 - Pure simulation and replay core

**Goal:** make event sourcing real before UI behavior proliferates.

**Deliverables:**

- initial world state builder;
- exhaustive event reducer;
- selectors for agents, places, active signals, knowledge distribution, and forecasts;
- command validation skeleton;
- deterministic projection hash;
- replay test over fixture event sequence.

**Acceptance:**

- replaying the same events yields the same hash;
- duplicate event IDs do not double-apply;
- unknown event versions fail explicitly;
- reducer performs no I/O or date reads.

**Dependencies:** P0-003.

### P1-001 - Main application frame

**Goal:** reproduce the five-part desktop layout.

**Deliverables:**

- market ribbon;
- agent dock;
- world-stage host;
- signal rail;
- command tray;
- responsive drawer behavior;
- loading, disconnected, and fixture badges.

**Acceptance:**

- matches reference at 1440 x 900 and remains usable at 1280 x 800;
- no accidental body scrolling;
- panels can collapse;
- tab order is logical;
- screenshot regression added.

**Dependencies:** P0-002, P0-003.

### P1-002 - Phaser world scene

**Goal:** create the living pixel-diorama stage.

**Deliverables:**

- logical 48 x 30 map;
- six building silhouettes and labels;
- roads/waypoints;
- ambient sky, clouds, windows, and weather layer;
- camera pan/zoom/follow;
- place hit zones;
- React/Phaser typed bridge;
- DOM mirror of places.

**Acceptance:**

- integer pixel scaling is crisp;
- all places are keyboard selectable through DOM mirror;
- camera controls work and respect reduced motion;
- scene reaches target frame rate on a normal local machine.

**Dependencies:** P1-001.

### P1-003 - Agent dock and sprites

**Goal:** make agents readable as characters.

**Deliverables:**

- three sprites with idle, walk, read/work, and share states;
- portraits and role badges;
- dock status cards;
- selection synchronization between React and Phaser;
- follow-camera action;
- accessible agent list.

**Acceptance:**

- selecting an agent in either layer updates both;
- status, location, mission, and forecast are visible;
- sprite animation pauses in reduced-motion mode;
- agents are visually distinct at a glance.

**Dependencies:** P1-002.

### P2-001 - Mission commands and queue

**Goal:** turn player intent into validated missions.

**Deliverables:**

- direct mission builder;
- natural-language command field with fixture parser;
- mission draft confirmation;
- queue and cancel/reorder controls;
- command endpoint;
- idempotency keys;
- mission domain events.

**Acceptance:**

- user can dispatch Mira to the Weather Tower in under three interactions;
- ambiguous commands remain drafts;
- duplicate command submission does not duplicate missions;
- keyboard-only flow works.

**Dependencies:** P0-004, P1-003.

### P2-002 - Travel and arrival simulation

**Goal:** make movement meaningful and event-driven.

**Deliverables:**

- route selection;
- `travel.started`, progress, and `arrived` events;
- Phaser waypoint interpolation;
- speed controls and pause;
- skip-travel preference;
- arrival camera hint and location work animation.

**Acceptance:**

- travel state survives refresh and resumes from projection;
- speed changes do not alter authoritative event order;
- player can pause and skip;
- arrival triggers the correct next mission phase.

**Dependencies:** P2-001.

### P2-003 - Scripted fixture driver

**Goal:** complete the entire journey without Codex or Pref.

**Deliverables:**

- deterministic mission-result scripts;
- simulated latency and failure injection;
- scripted dialogue;
- source, claim, signal, knowledge, and belief events;
- configuration switch for success, no-result, timeout, and invalid-result scenarios.

**Acceptance:**

- Helios-3 journey is fully playable offline;
- repeated runs with same seed produce same event sequence;
- failure scenarios are recoverable;
- no UI code contains fixture-specific branches beyond adapters.

**Dependencies:** P2-002, P0-004.

### P3-001 - Signal rail and source inspector

**Goal:** make evidence immediate and trustworthy.

**Deliverables:**

- signal cards with direction, impact, freshness, reliability, source count, discoverer, and knowledge chips;
- tabs for New, Pinned, Disputed, All;
- expanded source inspector;
- source provenance and timestamps;
- stale/correlated/disputed states;
- pin and archive actions.

**Acceptance:**

- every active signal opens to a source;
- direction does not rely on color alone;
- source is reachable in two interactions;
- card list remains legible at five active items;
- screenshot regression added.

**Dependencies:** P2-003.

### P3-002 - Archive Quarter

**Goal:** provide durable memory and comparison.

**Deliverables:**

- archive scene/overlay;
- search by text, date, place, source class, and agent;
- source/signal/memo tabs;
- side-by-side compare;
- case-file tray;
- replay-to-entry action;
- local index over fixture content.

**Acceptance:**

- Orin can retrieve a historical signal through the archive mission;
- user can find a specified item in under one minute;
- stale and superseded versions remain inspectable;
- archive is keyboard navigable.

**Dependencies:** P3-001.

### P3-003 - Meetings and knowledge transfer

**Goal:** make agent interaction reflect real information asymmetry.

**Deliverables:**

- meeting request and arrival coordination;
- Lantern Square meeting scene;
- explicit signal sharing events;
- disagreement type labels;
- concise meeting memo;
- post-meeting belief updates or mission proposals.

**Acceptance:**

- before meeting, agents have different known-signal sets;
- after sharing, knowledge edges update explicitly;
- meeting can be skipped without losing events;
- user can explain the disagreement from the UI.

**Dependencies:** P2-003, P3-001.

### P3-004 - Professor's Study

**Goal:** provide bounded evidence synthesis.

**Deliverables:**

- Scholar's Hill scene;
- evidence selection tray;
- modes: Explain, Challenge, Compare, Base rate, Missing evidence, Correlation check, Forecast impact;
- scripted professor driver first;
- response sections for answer, evidence, assumptions, limitations, and next question;
- suggested mission handoff.

**Acceptance:**

- the correlation-check step in the required journey works;
- response cites only selected/allowed evidence;
- insufficient evidence is stated clearly;
- scene has a conventional accessible text panel;
- screenshot regression added.

**Dependencies:** P3-002, P3-003.

### P3-005 - Forecast commit and score

**Goal:** make forecast change deliberate and explainable.

**Deliverables:**

- probability dial and numeric input;
- public, team, prior-player comparison;
- optional uncertainty band;
- evidence chips;
- public note and private memo;
- commit events and history;
- Brier-score support for resolved fixture.

**Acceptance:**

- probabilities validate and sum correctly;
- commit links to evidence and records previous/new values;
- UI says Commit Forecast and contains no trading action;
- forecast history updates from events;
- screenshot regression added.

**Dependencies:** P3-001.

### P4-001 - Codex runtime interface and scripted implementation

**Goal:** define a replaceable runtime boundary.

**Deliverables:**

- `CodexDriver` interface;
- scripted driver implementing it;
- turn input/output contracts;
- scheduler, queue, concurrency, timeout, cancellation;
- runtime turn persistence;
- diagnostics API and UI.

**Acceptance:**

- scripted behavior flows only through `CodexDriver`;
- no game service imports child-process code directly;
- two turns can run concurrently by configuration;
- cancellation and timeout create explicit events.

**Dependencies:** P2-003.

### P4-002 - Local `codex exec` driver

**Goal:** run one real schema-constrained agent turn locally.

**Deliverables:**

- child-process wrapper without shell interpolation;
- prompt packet builder;
- `--json` event parser;
- `--output-schema` and final-output file handling;
- session ID capture/resume;
- read-only sandbox configuration;
- stdout/stderr redaction;
- one repair attempt;
- safe wait fallback.

**Acceptance:**

- Mira completes a bounded fixture mission through Codex;
- invalid JSON or unknown source IDs do not mutate state;
- timeout kills the process cleanly;
- app falls back to scripted mode when Codex is absent;
- exact runtime command is shown in diagnostics without secrets.

**Dependencies:** P4-001, P0-003.

### P4-003 - Agent profiles and knowledge packets

**Goal:** give each agent a distinct but safe behavior.

**Deliverables:**

- versioned role profiles;
- compact context-packet builder;
- known-source/signal filtering;
- public rationale and unknowns;
- profile tests that prevent unsupported actions;
- session registry per agent.

**Acceptance:**

- agents cannot see signals outside their knowledge set unless the mission grants archive access;
- public dialogue stays concise;
- profile style differs without changing source truth;
- sessions resume correctly after restart.

**Dependencies:** P4-002, P3-003.

### P5-001 - Pref Gateway fixture and interface

**Goal:** establish a canonical external-information boundary.

**Deliverables:**

- `PrefGateway` interface;
- fixture implementation;
- canonical capability request/response types;
- source normalization;
- provenance hashing;
- call budgets, timeouts, and response-size limits;
- audit events.

**Acceptance:**

- fixture sources enter through the same gateway interface as future live data;
- every source has Pref provenance;
- unknown capability fails closed;
- secrets are absent from logs.

**Dependencies:** P0-003.

### P5-002 - MCP discovery and connection diagnostics

**Goal:** connect to the user's Pref MCP without hard-coded tool names.

**Deliverables:**

- STDIO and/or Streamable HTTP connection path chosen from actual Pref deployment;
- tools/resources/prompts discovery;
- capability-map loader;
- connection test endpoint and settings UI;
- server/tool allow-list;
- safe error display.

**Acceptance:**

- app can list available primitives;
- capability mappings validate before use;
- unknown tools are denied;
- disconnect and reconnect are visible;
- credentials are never returned to frontend.

**Dependencies:** P5-001 and owner-provided Pref details.

### P5-003 - First live Pref mission

**Goal:** turn one real Pref result into a world signal.

**Deliverables:**

- one chosen capability, preferably weather or source search;
- live source normalization;
- version/cache behavior;
- agent proxy path;
- provenance display;
- fixture/live toggle.

**Acceptance:**

- live result produces source, claim, and signal objects;
- publication/observation/retrieval times are distinct where available;
- stale cached result is labeled;
- fixture mode remains deterministic;
- user can inspect the exact Pref primitive used.

**Dependencies:** P5-002, P4-003.

### P6-001 - Resolution and replay

**Goal:** turn the expedition into a learnable case file.

**Deliverables:**

- resolved market fixture;
- resolution event and score;
- forecast timeline;
- turning-point markers;
- sequence scrubber;
- world projection at selected sequence;
- case-file export.

**Acceptance:**

- replay from event zero matches final projection hash;
- user can jump to when a source entered the world;
- score calculation is tested;
- export distinguishes source, claim, signal, and rationale.

**Dependencies:** P3-005, P0-004.

### P6-002 - Accessibility and resilience audit

**Goal:** ensure the demo works for more users and survives outages.

**Deliverables:**

- full keyboard journey;
- focus audit;
- canvas DOM mirrors;
- 200% zoom pass;
- reduced-motion and high-contrast pass;
- Codex unavailable, Pref unavailable, WebSocket reconnect, and invalid-schema flows;
- automated accessibility checks where practical.

**Acceptance:**

- required journey is keyboard completable;
- no essential state is canvas-only;
- temporary service outage does not corrupt the expedition;
- reconnect restores from last sequence;
- failure messages identify the failed boundary.

**Dependencies:** all prior vertical-slice tasks.

### P6-003 - Final visual and performance pass

**Goal:** make the first public demo feel finished.

**Deliverables:**

- polished original pixel assets or finalized placeholders;
- event choreography;
- weather transitions;
- sound pass;
- loading states;
- screenshot baselines;
- performance profiling;
- first-run tutorial refinement;
- demo script and capture mode.

**Acceptance:**

- stable 30-minute session;
- reference screen has no visible defects;
- normal world interaction remains responsive during agent calls;
- first-time test users understand the product without verbal explanation;
- screenshots and video capture show no debug UI or copyrighted third-party assets.

**Dependencies:** P6-002.

## 7. Suggested milestone checkpoints

### Checkpoint A - Beautiful shell

Tasks through P1-003. Review a screenshot before building deep runtime behavior.

### Checkpoint B - Complete offline journey

Tasks through P3-005 with scripted drivers. This is the first internally demoable product.

### Checkpoint C - One real Codex agent

Tasks through P4-003. Compare scripted and live behavior for reliability.

### Checkpoint D - One live Pref signal

Tasks through P5-003. Audit provenance and failure states.

### Checkpoint E - Pilot build

Tasks through P6-003.

## 8. Master completion gate

The vertical slice is ready when:

- `pnpm dev` launches it locally;
- the full required journey works in fixture mode;
- one agent mission works with local Codex;
- one information mission works with Pref MCP;
- every signal is source-linked;
- the expedition replays deterministically;
- keyboard and reduced-motion flows work;
- the visual design matches the supplied prototype direction;
- no real trade or external write action exists.
