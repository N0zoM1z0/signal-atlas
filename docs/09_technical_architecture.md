# 09. Technical Architecture

## 9.1 Architecture goals

The system should be:

- local-first;
- simulation-first;
- deterministic when using fixtures;
- observable and replayable;
- visually responsive even when agents are slow;
- resilient to MCP or Codex outages;
- strict about source provenance;
- modular enough to replace the runtime driver or data source.

## 9.2 Recommended stack

### Frontend

- React with TypeScript for application shell, overlays, forms, archive, settings, and accessibility DOM.
- Vite for local development and bundling.
- Phaser for the world scene, tilemap, sprites, camera, animation, route movement, particles, and input.
- Zustand or a small event-driven store for client view state.
- TanStack Query only for conventional request caching if needed; authoritative live state arrives through events.

### Orchestrator

- Node.js with TypeScript.
- Fastify for local HTTP endpoints and plugin boundaries.
- WebSocket channel for world events, agent streams, and connection status.
- Zod for runtime contracts.
- Pino-compatible structured logs.

### Persistence

- SQLite for local relational state and append-only event history.
- FTS5 for archive text search when appropriate.
- content-addressed files for larger source payloads and exports.
- migrations committed to the repository.

### Tooling

- pnpm workspaces;
- Vitest for unit and integration tests;
- Playwright for end-to-end and screenshot tests;
- ESLint and Prettier or an equivalent consistent formatter;
- TypeScript strict mode;
- Storybook optional after the first slice, not required before.

## 9.3 Monorepo layout

```text
signal-atlas/
  apps/
    web/                 React shell and Phaser host
    orchestrator/        HTTP, WebSocket, scheduler, persistence
  packages/
    contracts/           Zod schemas and TypeScript types
    simulation/          Pure world reducer and selectors
    world-content/       Maps, locations, missions, fixtures
    pref-gateway/        MCP discovery, mapping, normalization
    codex-runtime/       Codex drivers and session management
    ui/                  Shared DOM components and design tokens
    game-scene/          Phaser scenes, entities, effects
    archive/             Search, provenance, case files
    test-fixtures/       Deterministic data and fake drivers
  schemas/               Exported JSON Schemas
  data/                  Local development database and blobs
  docs/
  AGENTS.md
  package.json
  pnpm-workspace.yaml
```

## 9.4 Authoritative state model

The orchestrator owns authoritative world state. The frontend renders a projection.

All mutations are expressed as domain events, for example:

- `expedition.created`
- `agent.mission.assigned`
- `agent.travel.started`
- `agent.arrived`
- `pref.source.retrieved`
- `signal.created`
- `signal.shared`
- `meeting.started`
- `belief.updated`
- `forecast.committed`
- `market.resolved`
- `runtime.turn.failed`

A pure reducer folds events into current state. This enables replay, time travel, deterministic tests, and auditability.

## 9.5 Event envelope

Every event should use a common envelope:

```ts
interface WorldEvent<TType extends string, TPayload> {
  id: string;
  expeditionId: string;
  sequence: number;
  type: TType;
  occurredAt: string;
  recordedAt: string;
  actor: {
    kind: 'player' | 'agent' | 'system' | 'pref' | 'market';
    id?: string;
  };
  causationId?: string;
  correlationId?: string;
  schemaVersion: number;
  payload: TPayload;
}
```

Sequence is monotonically increasing per expedition. Event IDs are globally unique. The reducer must ignore duplicate IDs.

## 9.6 Frontend state layers

### Domain projection

A read-only projection of authoritative world state received through snapshot plus events.

### View state

Selected agent, camera position, open overlay, card expansion, filters, reduced-motion preference, and local draft commands.

### Optimistic animation state

Temporary movement interpolation and card transitions. Optimistic state never invents domain outcomes. If a mission is assigned, travel can animate immediately; evidence appears only after a source/signal event.

## 9.7 Phaser and React boundary

The Phaser scene owns:

- world rendering;
- map and routes;
- agent sprites;
- camera;
- weather and particles;
- building hit zones;
- short world callouts.

React owns:

- market ribbon;
- agent dock;
- signal rail;
- command tray;
- archive and professor panels;
- settings;
- dialogs;
- accessible mirrors of canvas controls.

Communication occurs through a typed scene bridge. Avoid allowing Phaser objects to import application services directly.

## 9.8 Core services

### ExpeditionService

Creates, loads, pauses, resolves, and exports expeditions.

### SimulationService

Applies events, validates transitions, calculates reachable locations, and schedules deterministic animation milestones.

### AgentScheduler

Queues turns and invokes the Codex Runtime.

### CodexRuntime

Starts/resumes sessions, streams events, validates output, and handles retries.

### PrefGateway

Discovers and calls MCP capabilities, normalizes sources, caches results, and emits provenance records.

### ArchiveService

Indexes source records, signals, memos, and case files.

### ForecastService

Validates probabilities, records belief updates, computes scores, and builds forecast history.

### ConnectionService

Tracks Pref, Codex, database, and optional market-feed health.

## 9.9 Local API surface

Recommended HTTP endpoints:

```text
GET  /api/health
GET  /api/config/public
GET  /api/scenarios
GET  /api/expeditions
POST /api/expeditions
GET  /api/expeditions/:id/snapshot
POST /api/expeditions/:id/commands
GET  /api/expeditions/:id/events
WS   /api/expeditions/:id/stream?after=N
GET  /api/expeditions/:id/replay?sequence=N
GET  /api/expeditions/:id/case-file
POST /api/expeditions/:id/resolve-fixture
GET  /api/archive/search
GET  /api/sources/:id
POST /api/professor/query
POST /api/forecast/commit
GET  /api/runtime/diagnostics?expeditionId=:id
POST /api/runtime/test-pref
POST /api/runtime/test-codex
```

The fixture-resolution endpoint is intentionally narrower than the ordinary command surface. It accepts no caller-selected outcome and emits only the authored fixture resolution plus deterministic scores. Replay folds the authoritative event log from the sequence-zero bootstrap and verifies its latest canonical projection hash. Public case-file serialization strips private forecast memos from summaries and event copies.

The expedition stream is a notification and recovery transport, not a second authority. A client supplies its last validated sequence, receives strict contiguous batches followed by a readiness marker, then reloads the authoritative snapshot before accepting the new cursor. Observer failures cannot interrupt committed runtime events. Temporary close codes reconnect with bounded backoff; invalid cursors, sequence gaps, unsupported client messages, and invalid client-side envelope schemas identify the failed boundary without applying partial state. Browser upgrades accept only the fixed loopback web origins used by the local shell, and browser mutation requests use the same fixed-origin policy rather than trusting the request `Host`. Native clients without an `Origin` remain supported. The stream serializes public copies of events and removes forecast private memos before egress.

WebSocket topics:

```text
world.event
world.snapshot
agent.turn.status
agent.turn.stream
connection.status
archive.index.status
runtime.diagnostic
```

Commands return an accepted command ID. Resulting changes arrive as events.

## 9.10 Persistence schema

The implemented vertical slice keeps the append-only event stream as authority and stores five
focused relations:

- `expeditions`: fixture seed/fingerprint, immutable scenario ID/version/full definition/hash, and
  the latest committed sequence/status;
- `world_events`: immutable event envelopes keyed by expedition and sequence, with globally unique
  event IDs;
- `command_receipts`: immutable idempotency keys, command hashes, and accepted result envelopes;
- `expedition_creation_receipts`: immutable process-restart-safe idempotency keys, request hashes,
  scenario identity, and created-expedition result envelopes;
- `world_checkpoints`: rebuildable projection snapshots with schema version and canonical hash.

`schema_migrations` records deterministic migrations. SQLite foreign keys, a busy
timeout, full synchronous durability, and WAL mode are enabled for file databases. Triggers reject
updates and deletes against authoritative events, command receipts, and creation receipts, and
reject changes to a
stored scenario definition after its first write. A new expedition's complete validated definition
and genesis events plus its optional creation receipt share one transaction. A command's event batch and receipt share one
transaction; scheduler-generated batches also commit atomically before becoming visible in memory
or over WebSocket.

Startup loads and validates the definition copied into the expedition rather than substituting the
currently installed catalog entry. It verifies both definition and fixture canonical hashes and
refuses unsupported newer schemas. A schema-v1 workspace may receive the exact installed Helios
definition once only when its expedition ID, seed, and fixture hash all match; a partial or
incompatible migration fails contextually without rewriting its event rows. Startup then parses the
event log for continuity and selects the newest checkpoint whose projection schema, expedition,
sequence, latest applied event, and canonical hash all agree with the log. Only the tail after that
checkpoint is reducer-folded. Invalid checkpoints are counted and skipped; deleting every
checkpoint still produces the same projection from the event authority.

The current checkpoint projection retains applied-event history so archive/case-file reads remain
simple. This avoids full reducer replay but does not yet bound checkpoint size or the startup event
history read. A future workspace compaction milestone may introduce a compact projection schema and
paged archival reads without truncating the authoritative log. Additional normalized source/search
indexes and FTS5 remain future projections, not parallel authorities.

The production server installs `SIGINT` and `SIGTERM` handlers that close Fastify exactly once.
Fastify shutdown first stops the scheduler, waits for active bounded turns, writes the current
checkpoint, closes SQLite, and disconnects Pref. A startup/listen failure also closes any opened
workspace handle before returning a failing process status.

## 9.11 Data flow: agent investigation

1. Player submits a command.
2. Orchestrator validates and emits `agent.mission.assigned`.
3. Simulation emits `agent.travel.started` and later `agent.arrived`.
4. Scheduler builds a turn packet.
5. Codex Runtime starts or resumes the agent session.
6. Agent calls Pref Gateway tools.
7. Pref Gateway stores source records and returns canonical IDs.
8. Codex returns a structured action result.
9. Runtime validates output.
10. Orchestrator emits source, claim, signal, dialogue, and belief events.
11. Frontend animates the result.
12. Archive indexes the new objects asynchronously.

## 9.12 Resilience

### Codex timeout

Emit a timeout event, keep the agent at the location, and offer retry or manual fixture result. Do not roll back travel.

### Pref timeout

Return a structured unavailable result. The agent may use cached/archive information but must label it stale.

### Database error

Pause command acceptance, keep the current frontend projection, and show a blocking persistence
warning. Never continue applying non-persisted authoritative events. The runtime latches a safe
`workspace_persistence_failed` diagnostic and performs no later scheduler advances in that process.

### Checkpoint corruption

Fall back through older verified checkpoints and then to full event replay. A checkpoint is an
optimization only and may never repair, delete, or override an authoritative event.

### WebSocket disconnect

Frontend reconnects and requests a snapshot from the last known sequence.

### Schema migration mismatch

Runtime refuses to run and shows a clear diagnostic with expected/current schema versions.

## 9.13 Testing strategy

### Unit tests

- world reducer;
- route and mission legality;
- probability validation;
- source normalization;
- schema validation;
- knowledge transfer;
- score calculations.

### Contract tests

- Pref capability mappings;
- Codex output schema;
- WebSocket event envelopes;
- archive search response;
- database migrations.

### Integration tests

- command to mission to travel;
- fixture Pref investigation;
- scripted Codex turn to signal creation;
- meeting and knowledge exchange;
- forecast commit and replay;
- disconnect/reconnect.

### End-to-end tests

- first-session tutorial;
- archive search;
- professor query;
- invalid output recovery;
- reduced-motion behavior;
- keyboard-only flow;
- screenshot regression at 1440 x 900 and 1280 x 800.

## 9.14 Performance budgets

Reference targets for a local machine:

- world rendering at 60 frames per second under normal load;
- main-thread UI tasks below 50 milliseconds;
- event application below 10 milliseconds for ordinary events;
- snapshot load below one second for the vertical slice;
- card/overlay interaction response below 100 milliseconds;
- no more than two concurrent external Pref/Codex/Professor turns across all expeditions by
  default, with at most 32 waiting calls;
- map and core UI initial assets below 8 MB before final art expansion.

Agent latency is presented honestly and does not block world interaction.

## 9.15 Packaging

Start as a local web application launched by one command. Later package as a desktop app if native process management, secure storage, and file access require it.

Development command:

```bash
pnpm dev
```

Expected behavior:

- orchestrator starts on a local port;
- web app starts and connects automatically;
- fixture mode is the default if Pref/Codex are not configured;
- normal local runs persist to `~/.local/state/signal-atlas/workspace.sqlite` unless
  `SIGNAL_ATLAS_WORKSPACE_DB=off` is set;
- `SIGNAL_ATLAS_CHECKPOINT_INTERVAL` configures the positive event interval and defaults to 50;
- `SIGNAL_ATLAS_MAX_EXTERNAL_CALLS` configures positive process-wide external-call concurrency and
  accepts 1 through 16, defaulting to 2;
- `SIGNAL_ATLAS_MAX_QUEUED_EXTERNAL_CALLS` configures the non-negative process-wide queue bound and
  accepts 0 through 256, defaulting to 32;
- test and Playwright profiles remain isolated in memory;
- diagnostics identify missing dependencies;
- no cloud account is required to view the scripted vertical slice.

## 9.16 Deployment boundary

The first release is a single-user local application. Multi-user rooms, hosted persistence, authentication, and shared market worlds are later architecture phases. Keeping the first slice local reduces privacy, latency, and operational complexity while matching the user's Codex-on-device concept.
