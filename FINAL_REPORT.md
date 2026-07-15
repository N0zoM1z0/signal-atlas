# Signal Atlas vertical-slice final report

Date: 15 July 2026 (Asia/Singapore)  
Reviewed commit: `ee335e9` plus this report commit  
Verdict: **Engineering definition of done met for the deterministic Helios-3 vertical slice, with two explicit external-validation gaps: no standalone live Pref application bearer and no novice-user comprehension study.**

## Delivered slice

The repository now ships a local-first, fictional forecasting expedition with a Phaser world as the primary surface; three bounded agents; explicit source, claim, signal, knowledge, belief, and forecast layers; searchable Archive, evidence-bound Professor, team meeting, Forecast Commit, immutable replay, public case-file export, offline fixture integrations, optional local Codex, and an allow-listed Pref weather proxy. Authoritative changes pass through validated commands and immutable events. There is no real-money or external-write product path.

Independent product/visual, provenance/security, and accessibility/resilience reviews were completed before this report. Their release blockers were fixed: capture could previously become ready with an empty renderer, long-session gates could inherit the wrong runtime, a valid-looking local Codex `wait` could discard authored current-turn evidence, and a fresh clone could start web while orchestrator crashed on missing package builds.

## Exact release evidence

### Install, static gates, tests, and build

| Command                                                       | Result                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `source ~/clash.sh; proxy_on; pnpm install --frozen-lockfile` | Passed; all 12 workspaces, lockfile current.                                                  |
| `pnpm typecheck`                                              | Passed across all typed packages.                                                             |
| `pnpm lint`                                                   | Passed with zero warnings.                                                                    |
| `pnpm test`                                                   | Passed: 45 files, 220 tests. `world-content` intentionally has no tests.                      |
| `pnpm build`                                                  | Passed; 21 JSON Schemas regenerated. Vite's only warning was the known Phaser chunk advisory. |
| `pnpm format:check`                                           | Passed.                                                                                       |
| `pnpm test:e2e`                                               | Passed on the final HEAD: 31 Chromium journeys in 3.2 minutes.                                |
| `pnpm test:visual`                                            | Passed: 9 Chromium visual tests in 1.2 minutes.                                               |
| Focused final replay test                                     | Passed and recorded both authoritative and privacy-redacted public hashes.                    |

The 31 journeys include the complete offline mission route, all authored agent missions, Archive, Professor, meeting, Forecast Commit, replay/export, keyboard-only use, DOM canvas equivalents, automated accessibility checks, 200% zoom, reduced motion, forced colors, Codex and Pref outage recovery, invalid-output fail-closed behavior, event-stream resume, and the active-work performance budget.

### Thirty-minute session

Command:

```bash
SIGNAL_ATLAS_RUN_SOAK=1 pnpm exec playwright test tests/e2e/long-session.spec.ts
```

Passed in 30.3 minutes with:

- requested duration: 1,800,000 ms;
- completed authored missions: 3, dispatched at 0, 10, and 20 minutes;
- final authoritative sequence: 62;
- FPS p10 minimum: 33;
- measured interactions: 344;
- interaction-latency p95: 146.604616 ms;
- JavaScript heap delta: -9,200,000 bytes;
- uncaught page errors: 0;
- canvas count: 1 throughout the asserted gate.

A separate 30-second harness check after the final runtime-preflight change also passed all three missions at sequence 62 with FPS p10 40, p95 159.810964 ms, and zero page errors. It is not treated as a substitute for the full soak.

### Replay hashes and public boundary

The final focused browser journey printed:

- authoritative world replay: `sha256:abf324ebc6e201fb60657cccafa6e1417f403bb00dfaf4a9df938360a9aa48a9`;
- redacted public export replay: `sha256:ac9e0036f8d2e75357101f1b41af0a0f094ad917e4e189a9c8d55f9deca64999`.

Both are full SHA-256 values verified against their own event projections. They intentionally differ: the authoritative local projection contains the private forecast memo, while public export excludes every private memo before replaying and hashing its public event stream. The browser test now asserts this privacy boundary explicitly. Hashes may differ between independently created expeditions because committed timestamps are event data; deterministic means replaying the same event stream yields the same projection and hash.

### Local Codex

`codex-cli 0.144.1` was exercised through the real bounded process driver with a fresh runtime root and the required proxy shell. The first run used `codex exec`; a second process used `codex exec resume`. Both completed Mira's weather mission, accepted `src-weather-bulletin-1` and `sig-crosswind`, reported `activeMode=local_exec`, and used no scripted fallback. The JSONL session registry was mode `0600`.

The final adapter also rejects an ordinary `wait` when an authored fixture turn explicitly supplies current-turn evidence. It provides one schema/source-set repair and then fails closed to an evidence-free safe wait if repair remains invalid.

### Pref

The real Pref connector read for `weather.get_current_conditions` at Cape Canaveral completed during P5 without an external write. The strict structured envelope was then exercised through the actual gateway, agent proxy, scheduler, reducer, HTTP API, inspector, and audit path using a recorded provider response. Unknown tools, credential echoes, malformed envelopes, stale cache, and unavailable-provider behavior have automated coverage.

`SIGNAL_ATLAS_PREF_BEARER_TOKEN` was missing in the final owner shell. Therefore the final hosted Signal Atlas live-bearer handshake was **skipped**, not claimed as passed. Fixture mode is the default and the required demo remains fully offline.

### Fresh clone and startup

The first clean-clone audit exposed and reproduced an orchestrator startup failure caused by missing `codex-runtime/dist`. Commit `ee335e9` fixed `predev` to build every package workspace topologically.

The repeated clean-clone check at `/tmp/signal-atlas-fresh-fixed-awTCbE/repo` then:

1. cloned the current committed repository;
2. enabled `source ~/clash.sh; proxy_on`;
3. installed 323 packages with `pnpm install --frozen-lockfile`;
4. regenerated 21 schemas and built all nine library packages through `pnpm dev`'s prehook;
5. served web at `127.0.0.1:4173` and orchestrator at `127.0.0.1:4317`;
6. returned diagnostics for `fixture-scripted-codex` with an idle bounded scheduler;
7. shut down both localhost ports cleanly.

## Visual review and screenshot paths

The required 1440 × 900 and 1280 × 800 screens were manually inspected after the 9-test visual gate. The world remains visually dominant, integer-scaled geometry is crisp, and no clipped text, overlapping controls, accidental page scrollbar, or missing provenance/runtime status was observed. Archive, Professor, Forecast, Replay, and source inspection were also inspected at original resolution.

- `tests/visual/world-shell-1440x900.png`
- `tests/visual/world-shell-1280x800.png`
- `tests/visual/world-canvas-1440x900.png`
- `tests/visual/archive-quarter-1440x900.png`
- `tests/visual/professor-study-1440x900.png`
- `tests/visual/forecast-commit-1440x900.png`
- `tests/visual/lantern-square-meeting-1440x900.png`
- `tests/visual/case-file-replay-1440x900.png`
- `tests/visual/signal-source-inspector-1440x900.png`
- `tests/visual/component-demo-1440x900.png`

Runtime/capture art is programmatic CSS, SVG, canvas, or Phaser geometry, and sound is locally synthesized after opt-in. No external media URL, downloaded font, or third-party runtime art/audio asset is present. Preview and visual PNGs are repository-authored review artifacts.

## Definition-of-done audit

### Product

- **Met — design/task behavior:** acceptance criteria are implemented and exercised by the offline journeys and worklogs.
- **Met — world primary:** both reference viewports retain the world as the dominant surface; specialist workspaces return to it.
- **Met with validation caveat — understand change and cause:** mission cues, event ticker, signal/source inspector, belief explanations, forecast history, onboarding, and replay state what changed and why. Automated comprehension affordances pass; no external novice study was run.
- **Met — no real-money action:** repository and UI review found no trade, order, betting, wallet, payment, or payout implementation.

### Domain correctness

- **Met — event authority:** state-changing commands produce immutable world events; presentation never owns authority.
- **Met — replay hash:** authoritative and public projections replay to their respective exact hashes.
- **Met — validation/idempotency:** command schemas, invariants, prototype-shaped keys, duplicate command IDs, and idempotency keys are tested.
- **Met — explicit knowledge:** agent/source/signal knowledge edges and archive grants are explicit and bounded.
- **Met — distinct layers:** sources, claims, signals, beliefs, forecasts, resolutions, and scores remain separate contracts and UI layers.

### Agent runtime

- **Met — schema output:** local and scripted outputs use the generated strict JSON Schema.
- **Met — source validation:** unknown sources, missing current-turn sources, and incompatible claim/signal source sets are rejected.
- **Met — illegal mutation prevention:** action/profile allow-lists and event authority reject illegal actions before state mutation.
- **Met — recovery:** timeout, invalid output, cancellation, unavailable executable, one-repair failure, and fallback states are explicit and recoverable.
- **Met — fixture driver:** scripted fixture mode is the offline default and passed all three authored missions plus the 30-minute session.

### Pref integration

- **Met — gateway boundary:** the app calls only through the Pref Gateway and agent proxy.
- **Met — unknown-tool denial:** discovery and invocation are allow-listed; unknown tools fail closed.
- **Met — provenance:** exact primitive, retrieval/observation times, response/content/argument hashes, source version, predecessor, reliability, and cache state are stored or shown where applicable.
- **Met — stale/unavailable visibility:** stale-cache signals and unavailable-provider UI have automated coverage.
- **Met — secret handling:** bearer values remain server-only; tracked-file and response/log sentinel scans passed.

### UI and visual quality

- **Met — reference polish:** both required desktop viewports passed visual regression and manual inspection.
- **Met — required screens reviewed:** world, Archive, Professor, Forecast, Replay, meeting, and source inspector were inspected.
- **Met — layout integrity:** no observed clipping, overlap, accidental scrolling, or blurry world scaling.
- **Met — loading/errors:** truthful startup, operation-specific working, disconnected, invalid-output, Pref, Codex, and stream-recovery states exist.
- **Met — reduced motion:** decorative choreography collapses while text/status information remains; covered at 200% zoom.

### Accessibility

- **Met — keyboard flow:** the complete required journey passes using keyboard input.
- **Met — focus:** focus visibility, tab order, drawer/dialog entry, Escape return, and shortcut isolation are tested.
- **Met — canvas equivalents:** every place, agent movement, route, and world action has a semantic DOM mirror/control.
- **Met — non-color state:** labels, icons, captions, status text, and forced-colors tests cover selected and failure states.
- **Met — 200% zoom:** core controls reflow and remain operable in the zoom-equivalent browser gate.

### Validation

- **Met:** typecheck, lint, unit, integration, build, full Playwright journeys, visual baselines, and intentional screenshot review all passed. Exact counts and commands are recorded above.

### Documentation

- **Met — contracts/schemas:** build regenerated all 21 schemas without diff.
- **Met — configuration:** `.env.example`, README runtime/capture/controls guidance, and fixture/live toggles are current.
- **Met — architecture decisions:** design docs and `docs/adr/0001-pref-mcp-integration-boundary.md` record the authoritative and integration boundaries.
- **Met — worklogs:** P0 through P6 worklogs record implementation, verification, and risks; P6-003 is complete.

### Operational

- **Met — dev startup:** proven from a clean clone after fixing the missing predev builds.
- **Met — offline operation:** Pref fixture and scripted Codex require no network or owner credential.
- **Met — dependency diagnostics:** driver kind, availability, fallback, scheduler, Pref transport/mode, and connection state are visible without credential content.
- **Met — localhost binding:** Vite and Fastify default to `127.0.0.1`; origin, Host, WebSocket, framing, and rebinding guards are tested.

## Known limitations

1. No external novice-user session was conducted. The interface has strong automated accessibility/onboarding evidence, but first-time human comprehension and six-minute demo pacing remain unvalidated.
2. No standalone app Pref bearer was available for the final live handshake. Real connector data plus the recorded strict-envelope app path provide integration evidence, not a hosted end-to-end credential test.
3. Codex agent sessions persist by expedition, agent, and profile, while the vertical-slice world is process-local. After a restart, an ordinary resumed conversation can retain context not reconstructed into the new world. Durable deployment must restore the event log or bind sessions to a world/access revision.
4. Events, idempotency records, Pref cache, audit history, and most runtime state are process-local. `recordedAt` currently follows the client-issued command time rather than an independent server audit clock.
5. Pref credential-echo defense scans bounded recent credential substrings and response structures; it cannot prove detection of every encoded, transformed, or bidirectional variant. Public Pref call completion also does not expose every internal cache/hash audit field.
6. Codex uses read-only sandbox configuration and disables shell, apps, web search, plugins, and multi-agent tools, but this is not OS-level isolation from all same-user files. Only a small environment allow-list is forwarded.
7. The threat model is one trusted local OS user. Native originless clients are allowed at the localhost API after Host validation; this is not a multi-tenant service boundary.
8. The main world snapshot has strict runtime validation; several secondary browser responses still rely on TypeScript assertions after HTTP status checks.
9. Phaser's production chunk is 1.198 MB minified and 319 KB gzip. It is lazy-separated, but further code splitting or preload work would improve cold startup.
10. The 30-minute gate infers cleanup health from a single canvas, bounded heap, stable interaction/FPS, event continuity, and dedicated cleanup tests; it does not directly count every registered listener or timer.

## Next-phase recommendations

1. Run five to eight novice sessions against `docs/DEMO_SCRIPT.md`, measure completion without coaching, and revise only observed comprehension bottlenecks.
2. Add durable event storage, authoritative server timestamps, cache/audit rotation, and a world/access revision in the Codex session key before multi-process or long-lived deployment.
3. Repeat the live Pref application handshake with an owner-provided bearer, add response-hash/cache-status fields to the public audit event where policy permits, and threat-test transformed credential echoes.
4. Add OS/container isolation for local model execution if the app moves beyond a single trusted local user.
5. Profile cold Phaser load on target demo hardware, then consider smaller scene imports or an intentional preload screen without weakening the existing truthful readiness sentinel.

The short offline walkthrough is in `docs/DEMO_SCRIPT.md`.
