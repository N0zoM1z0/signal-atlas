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
GET  /api/runtime/diagnostics
POST /api/runtime/test-pref
POST /api/runtime/test-codex
```

The fixture-resolution endpoint is intentionally narrower than the ordinary command surface. It accepts no caller-selected outcome and emits only the authored fixture resolution plus deterministic scores. Replay folds the authoritative event log from the sequence-zero bootstrap and verifies its latest canonical projection hash. Public case-file serialization strips private forecast memos from summaries and event copies.

The expedition stream is a notification and recovery transport, not a second authority. A client supplies its last validated sequence, receives strict contiguous batches followed by a readiness marker, then reloads the authoritative snapshot before accepting the new cursor. Observer failures cannot interrupt committed runtime events. Temporary close codes reconnect with bounded backoff; invalid cursors, sequence gaps, unsupported client messages, and invalid client-side envelope schemas identify the failed boundary without applying partial state.

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

Core tables:

- `expeditions`
- `markets`
- `world_manifests`
- `agents`
- `missions`
- `events`
- `sources`
- `source_versions`
- `claims`
- `signals`
- `signal_sources`
- `agent_knowledge`
- `beliefs`
- `forecast_commits`
- `meetings`
- `agent_sessions`
- `runtime_turns`
- `exports`

Use normalized relational tables for identity and relationships. Store versioned payloads in JSON columns where flexibility is needed.

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

Pause command acceptance, keep the current frontend projection, and show a blocking persistence warning. Never continue applying non-persisted authoritative events.

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
- no more than two concurrent Codex turns by default;
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
- diagnostics identify missing dependencies;
- no cloud account is required to view the scripted vertical slice.

## 9.16 Deployment boundary

The first release is a single-user local application. Multi-user rooms, hosted persistence, authentication, and shared market worlds are later architecture phases. Keeping the first slice local reduces privacy, latency, and operational complexity while matching the user's Codex-on-device concept.
