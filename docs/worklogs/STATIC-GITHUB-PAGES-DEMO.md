# STATIC-GITHUB-PAGES-DEMO - Browser-only authored showcase

## Status

In progress on `feat/static-github-pages-demo`.

## Goal

Publish the existing Signal Atlas experience as a GitHub Pages-compatible static artifact that
needs no API server, WebSocket service, SQLite database, Pref MCP, Codex executable, credential, or
external network call. The static artifact must reuse the production UI, contracts, simulation,
world content, and authored fixtures rather than becoming a copied application.

The default local application remains unchanged: its Node orchestrator and SQLite event log retain
normal authority. Static mode is an explicitly labeled, deterministic showcase with a
browser-resident demo orchestrator behind the same runtime port.

## Architecture decision

- Introduce one web runtime port for catalog, snapshots, commands, event subscription, replay,
  case-file export, fixture configuration, and safe runtime diagnostics.
- Keep the current HTTP/WebSocket implementation as `RemoteRuntime` and make it the default.
- Add `StaticDemoRuntime`, which validates commands, owns an append-only in-browser event log,
  emits schema-valid authored events, and rebuilds projections through the pure simulation reducer.
- Extract or share deterministic fixture choreography instead of importing Node/Fastify/SQLite,
  Pref, or Codex implementations into the browser bundle.
- Persist only safe authored demo events/preferences in a versioned browser namespace. Provide an
  explicit reset action and recover from malformed or incompatible browser data by returning to the
  authored genesis state.
- Use a Pages-safe Vite base and root/query navigation so refresh and deep links remain within the
  repository subpath.

This is the accepted resolution recorded in `docs/OPEN_QUESTIONS.md` as OQ-008.

## Intended files

- `apps/web/src/app-runtime/*` for the runtime port, remote adapter, React provider, and static
  adapter;
- `apps/web/src/App.tsx` and workspace consumers to depend on the runtime port rather than direct
  HTTP helpers;
- a focused browser-safe fixture runtime package if deterministic command choreography cannot stay
  small and cohesive inside the web runtime boundary;
- `apps/web/vite.config.ts`, package scripts, and navigation helpers for the Pages build base;
- static-mode status/reset UI in the existing Lobby, ribbon, and diagnostics surfaces;
- `.github/workflows/deploy-pages.yml` for official GitHub Pages artifact deployment;
- unit, contract, E2E, and screenshot coverage for complete static journeys and zero network use;
- `README.md`, this worklog, and architecture documentation for the new distribution mode.

The exact file set may narrow after extraction. No hosted authentication, cloud database,
telemetry, third-party content, real-money trading, or live Pref/Codex path is in scope.

## Acceptance criteria

### Distribution

- `pnpm build:pages` produces one self-contained artifact under `apps/web/dist` with the correct
  `/signal-atlas/` base.
- The artifact loads through a local static server at that subpath and is deployable by the checked
  in GitHub Pages Actions workflow.
- Refreshing the Lobby, a selected expedition, Archive, Professor, Forecast, and Replay never
  depends on a server route fallback.

### Runtime boundary

- Static mode makes no `/api` request, opens no WebSocket, invokes no Pref/Codex/MCP capability, and
  contains no credential or live endpoint.
- The default development/production web build still uses the existing HTTP/WebSocket runtime.
- UI code submits commands to a runtime interface; only the runtime validates commands, appends
  events, and supplies authoritative projections.
- Static events remain ordered, unique, schema-valid, fixture-owned, source-linked, and replayable.

### Complete showcase

- All three authored worlds can be created/opened from the Lobby.
- A user can prepare and confirm missions, observe deterministic travel/work, receive sourced
  signals, inspect provenance, search Archive, convene a Meeting, ask Professor Vale, commit a
  simulated forecast, resolve the authored case, export the public case file, and scrub Replay.
- Runtime/source language consistently says static authored showcase rather than implying a live
  Pref, Codex, WebSocket, or SQLite connection.
- Reset clears only the static demo workspace and restores the authored worlds deterministically.

### Local browser state

- Static demo progress survives a same-browser reload when storage is available.
- Corrupt, oversized, unknown-version, or wrong-expedition storage fails safely to genesis.
- Stored state contains authored fixture events and user demo choices only; private forecast memos
  remain excluded from public case-file export.

### Quality

- Keyboard, semantic DOM, reduced-motion, forced-colors, 720 x 450 reflow, and the five-part world
  layout remain intact.
- Unit/contract tests cover the runtime port, command/event choreography, persistence recovery,
  replay, and case-file privacy.
- Playwright completes the full static first-session story while failing the test on any HTTP API,
  WebSocket, or external request.
- Format, typecheck, lint, unit/integration, build, default E2E, static E2E, and reviewed visual
  baselines pass before completion.

## Risks and mitigations

- **Authority drift:** duplicating orchestrator behavior could diverge. Keep event construction
  deterministic and focused, share pure command validation/reducer code, and test equivalent
  fixture outcomes rather than copying service infrastructure.
- **Bundle growth:** importing Node runtime packages would pull unusable dependencies into the
  browser. Static mode may depend only on browser-safe contracts, simulation, archive, world
  content, and fixture packages; verify the bundle graph.
- **False capability claims:** the current ribbon/diagnostics assume fixture or live services.
  Add an explicit static runtime state and disable connection controls rather than presenting a
  fake connected MCP.
- **Pages routing:** absolute `/lobby` and `/api` paths currently assume a root origin. Centralize
  navigation/base handling and prove the built artifact under `/signal-atlas/`.
- **Browser persistence limits:** keep the event log bounded to the authored showcase and fail
  closed to genesis when the payload is malformed or too large.

## Planned commit boundaries

1. Record the static-showcase architecture decision and introduce the runtime port with unchanged
   remote behavior.
2. Add the browser fixture orchestrator, event persistence, and complete deterministic research
   choreography.
3. Add Pages-safe navigation, honest static-mode UX, build scripts, and deployment workflow.
4. Add complete no-network browser coverage, reviewed baselines, documentation, and final gates.

Every milestone uses an English subject and detailed English body. Unrelated local files remain
unstaged.
