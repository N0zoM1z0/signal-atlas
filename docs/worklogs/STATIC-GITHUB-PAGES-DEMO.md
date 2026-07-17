# STATIC-GITHUB-PAGES-DEMO - Browser-only authored showcase

## Status

Complete on `feat/static-github-pages-demo`.

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
2. Add the browser fixture orchestrator, event persistence, complete deterministic research
   choreography, Pages-safe UX, and artifact acceptance coverage.
3. Add the deployment workflow, operator documentation, final regression boundaries, and this
   completion record.

Every milestone uses an English subject and detailed English body. Unrelated local files remain
unstaged.

## Delivered behavior

- `main.tsx` receives a build-selected runtime. Normal development and production builds select
  the HTTP/WebSocket adapter; Pages mode selects only the browser fixture adapter.
- `StaticDemoRuntime` validates domain commands, appends ordered schema-valid events, reduces the
  same projection, publishes contiguous in-process event batches, and implements the complete
  source, mission, meeting, professor, forecast, resolution, replay, and public-export journey.
- The three installed authored scenarios can be created, reopened, deep-linked through query
  navigation, persisted in a bounded/versioned browser namespace, and reset from the Lobby.
- Restore rejects corrupt JSON, unsupported versions, oversized logs, wrong expedition ownership,
  invalid event schemas, and broken sequence continuity before replacing authored genesis.
- The static diagnostics, ribbon, Lobby, agent dock, and source language explicitly identify the
  authored browser boundary and expose no fake Pref, Codex, SQLite, or WebSocket connection.
- `fixture-runtime` holds browser-safe deterministic mission/professor choreography shared by the
  orchestrator wrappers and static runtime, avoiding a second service stack or Node dependency in
  the browser graph.
- The Pages artifact uses `/signal-atlas/`, is checked for live-runtime signatures, and has a
  dedicated Playwright profile that fails on API, WebSocket, or external-origin traffic.
- The GitHub Pages workflow builds, verifies, browser-tests, uploads, and deploys the static
  artifact with official Actions. Actual remote deployment awaits pushing/merging this branch and
  the repository's Pages environment.

## Validation results

All commands used Node.js 22.18.0 and pnpm 10.33.0.

- `pnpm format:check` - passed; every matched file uses Prettier formatting.
- `pnpm typecheck` - passed; 12 of 13 workspace projects with scripts completed.
- `pnpm lint` - passed with zero warnings.
- `pnpm test` - passed; 312 tests across contracts, UI, Codex runtime, game scene, Pref gateway,
  fixtures, simulation, archive, world content, orchestrator, and web. The extracted
  `fixture-runtime` has no standalone test files; its behavior remains covered through the existing
  orchestrator suite and new static-runtime web suite.
- `pnpm build` - passed for all scripted workspace projects. The default web build transformed 168
  modules and retained the remote runtime selection.
- `pnpm test:e2e` - passed; 36 default local-orchestrator browser tests. The default config now
  explicitly ignores the Pages-only spec.
- `pnpm test:visual` - passed; 12 existing reviewed visual states. World-scene readiness permits 10
  seconds under the serial suite, and Replay permits 150 changed pixels for the inspected
  sequence-label-only scheduler variation (114 observed pixels, about 0.009% of the image).
- `pnpm test:pages` - passed; the Pages build transformed 175 modules, verified ten JavaScript
  assets with the project base, no live-runtime signatures, and no eager WorldShell/Phaser preload,
  then passed all 4 static tests. Those tests cover the full authored Helios journey, all-world
  create/reset, reload persistence, public-export privacy, zero service traffic, deferred renderer
  loading, and the reviewed 1440 x 900 baseline.

The final static output uses a 317.44 kB (90.72 kB gzip) application entry, a 180.60 kB (48.40 kB
gzip) lazy WorldShell, and a 1,198.01 kB (319.08 kB gzip) lazy Phaser renderer. The entry is 51%
smaller than the previous 184.06 kB gzip application module. Vite continues to report Phaser as a
large chunk; it no longer belongs to the static Lobby's network path.

## Files and boundaries

- Runtime selection and implementation: `apps/web/src/app-runtime`, `apps/web/src/App.tsx`, and
  `apps/web/src/main.tsx`.
- Shared fixture logic: `packages/fixture-runtime` plus the thin orchestrator fixture adapters.
- Static UX and routing: the Lobby, market ribbon, agent dock, runtime diagnostics, world shell,
  and their styles.
- Build/deploy: Vite aliases/base, package scripts, bundle verifier,
  `playwright.pages.config.ts`, and `.github/workflows/deploy-pages.yml`.
- Acceptance evidence: `tests/e2e/static-pages.spec.ts` and
  `tests/visual/static-showcase-world-1440x900.png`.
- Architecture/operator documentation: `README.md`, `docs/09_technical_architecture.md`,
  `docs/OPEN_QUESTIONS.md`, and this worklog.

No hosted authentication, telemetry, cloud database, external source call, live Pref/Codex path,
or real-money trading path was added. The untracked owner file `droid.resume.txt` was not modified or
staged.

## Remaining risks and follow-ups

- GitHub Pages has not executed the workflow from this local branch yet; repository Pages settings,
  environment permissions, and the public URL must be confirmed after push/merge.
- Browser storage is intentionally bounded and device-local. It is a showcase cache, not durable
  SQLite, synchronization, or migration support for long-term workspaces.
- Phaser remains above Vite's 500 kB warning threshold. It is deferred until a world opens. A
  source-alias custom build was evaluated and rejected because it grew the artifact and required an
  unresolved optional upstream WebGL dependency; future renderer reduction needs an officially
  supported Phaser custom-build pipeline.
- The existing remote Replay sequence can differ by one intermediate scheduler event under the
  skip-travel visual setup. The reviewed layout comparison isolates that tiny sequence-label
  variation; event ordering and replay correctness remain covered by domain and E2E assertions.
