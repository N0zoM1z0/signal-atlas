# DURABLE-WORKSPACE - Persistent event history, checkpoints, and Pref capability expansion

## Status

Complete.

## Goal

Turn the deterministic vertical slice into a durable local workspace: authoritative world events and accepted-command receipts survive orchestrator restarts, replay can start from verified SQLite checkpoints instead of sequence zero, and the Pref gateway can expose additional read-only research capabilities through one declarative provider-neutral boundary.

## Intended files

- `apps/orchestrator/src/workspace-store.ts`, `workspace-migrations.ts`, and `sqlite-workspace-store.ts`: define the persistence boundary, versioned SQLite schema, append-only event/receipt transactions, checkpoint storage, integrity validation, and safe diagnostics.
- `apps/orchestrator/src/expedition-runtime.ts` and `app.ts`: restore durable state before accepting commands, persist before applying authoritative mutations, checkpoint at a bounded interval, replay from the nearest verified checkpoint, pause on persistence failure, and close the store cleanly.
- `apps/orchestrator/test`: cover migrations, restart restoration, idempotent retries across restarts, checkpoint-tail replay, corrupt-checkpoint fallback, append failures, and application lifecycle wiring.
- `packages/pref-gateway/src`, `packages/pref-gateway/config/pref-capabilities.json`, and focused tests: expand the declarative read-only capability registry and normalize source-search/source-read results without creating provider-specific services.
- `README.md`, architecture documents, and this worklog: document the local database location/configuration, recovery semantics, checkpoint policy, Pref extension mechanism, exact validation, and remaining limits.

## Acceptance criteria

- SQLite stores every authoritative event as an immutable, expedition-sequenced row and stores accepted-command idempotency receipts in the same transaction as the command's events.
- A restart restores the exact projection hash, event cursor, case-file history, and duplicate-command result without re-emitting or renumbering events.
- No in-memory authoritative mutation is applied when the corresponding SQLite transaction fails; subsequent commands are rejected with a safe persistence-boundary diagnostic.
- Versioned migrations are deterministic, reject an unsupported newer schema, enable foreign keys, and keep fixture/test execution independent of a persistent database unless explicitly configured.
- Verified checkpoints are written at a configurable positive interval and on clean shutdown. Replay and startup use the nearest valid checkpoint plus only its event tail; a malformed or hash-mismatched checkpoint is ignored in favor of older checkpoints or full replay.
- The append-only event log remains the authority: checkpoints can be deleted and rebuilt without changing the final projection hash.
- Pref exposes provider-neutral `search_sources` and `read_source` capability paths only for mapped, discovered, read-only tools; request/output validation, source identity creation, timeouts, call budgets, and secret-safe diagnostics remain enforced.
- Existing `local_conditions`, fixture mode, semantic UI state, event streaming, replay/export, and local Codex/Professor paths continue to work.
- No hosted database, telemetry, real-money trading, write-capable Pref tool, or per-provider microservice is added.

## Dependencies

- Node 22.12 or later supplies the synchronous `node:sqlite` API already covered by the repository engine constraint.
- Existing event schemas, pure reducer, projection parser/hash, Pref connection boundary, and deterministic fixtures remain authoritative.
- Live capability entries must be validated against Pref discovery before being enabled by default; credentials remain only in the ignored local environment file.

## Risks and controls

- **Database commit after memory mutation:** one runtime commit helper validates the next projection, persists the full event batch and optional command receipt transactionally, then swaps in-memory state and publishes notifications.
- **SQLite failure becoming split-brain:** the runtime latches a degraded persistence state, rejects later commands, and never advances the authoritative projection for an uncommitted event.
- **Checkpoint corruption hiding event history:** every checkpoint is schema-parsed, expedition/sequence checked, and projection-hash verified before use; the event log is never truncated by checkpoint creation.
- **Fixture upgrades colliding with an existing workspace:** the stored fixture identity/fingerprint is checked at open and a mismatch produces a clear startup error instead of mixing histories.
- **Interrupted missions on process restart:** startup recovery must be explicit and event-driven; no invisible scheduler-only state may be assumed restored.
- **Experimental built-in SQLite surface:** all use stays behind a small adapter, tests exercise migrations and restart behavior, and the limitation is documented for a future adapter swap if Node changes the API.
- **Provider output diversity:** declarative adapters normalize a small canonical contract; unmapped or schema-incompatible providers fail closed rather than growing custom services or inventing source identities.
- **Credential leakage during discovery:** network commands enable the local proxy in the same shell, load credentials from the ignored environment, and report only redacted tool/schema metadata.

## Verification

- `pnpm format:check` - passed.
- `pnpm typecheck` - passed across all 11 implementation workspaces.
- `pnpm lint` - passed with zero warnings.
- `pnpm test` - passed: 49 test files, 247 tests; packages without authored tests remain explicitly
  `--passWithNoTests`.
- `pnpm build` - passed across all 11 implementation workspaces. Vite reported only the existing
  large Phaser chunk advisory.
- `pnpm test:e2e` - passed: 32 Chromium journeys, including accessibility, mission, archive,
  Professor, forecast, replay, stream recovery, failure boundaries, and runtime diagnostics.
- `pnpm test:visual` - passed: 9 Chromium baselines at the required World, Archive, Professor,
  Forecast, Meeting, Replay, signal-inspector, component, and responsive states.
- `pnpm exec playwright test tests/e2e/runtime-diagnostics.spec.ts` - passed after the final graceful
  shutdown change.
- Live local smoke with the ignored environment and required proxy - Pref connected in `live` mode;
  `weather.get_current_conditions` validated, while the discovered GDELT search remained explicitly
  disabled. No credential or authorization header was printed.
- Durable restart smoke - before shutdown the workspace was at sequence 2 with projection hash
  `sha256:9962cf353f3b38ccdca94a1a403f53d0710840fd3d4b376ebcddb819023138ab`; after SIGINT and restart,
  the event count and hash were unchanged, one sequence-2 checkpoint existed, and diagnostics
  reported replay base sequence 2 with zero invalid checkpoints.
- Permission smoke - the default state directory is mode `0700` and the SQLite file is mode `0600`.

## Results

- Normal local runs now use a versioned SQLite workspace by default. Events and accepted-command
  receipts are append-only, transactionally coupled, and restored with exact idempotency semantics.
- Runtime mutations are validated and persisted before becoming authoritative or observable. A
  failed commit restores the last durable projection, publishes nothing, latches a degraded state,
  stops scheduler progress, and closes command controls in the semantic UI.
- Checkpoints are written every configurable event interval and during graceful SIGINT/SIGTERM or
  application shutdown. Startup verifies each candidate against its schema, event sequence, latest
  applied event, and projection hash before folding only the remaining tail.
- Active travel, work, meetings, and unanswered Professor consultations are reconstructed from
  authoritative state. Restart tests cover exact projection/cursor recovery, duplicate receipts,
  corrupt checkpoint fallback, and multiple active-workspace restarts.
- Pref capability map v2 supports multiple deterministic provider candidates, typed canonical input
  projections, bounded transforms, exact discovery/security-policy matching, and response adapters
  that normalize provider results through the single Pref Gateway.
- The live default remains honest: weather is enabled; GDELT search is present but disabled because
  its discovered task-support policy is forbidden; no unreviewed provider was enabled for
  `read_source`. Fixture mode still provides deterministic search, read, and local conditions.
- Runtime Diagnostics shows workspace mode, health, event/sequence counts, checkpoint policy,
  replay base, schema, and invalid-checkpoint count without rendering the local absolute path.
- No hosted service, telemetry, real-money trading, market order path, write-capable Pref capability,
  or provider-specific microservice was added.

## Remaining risks

- Node 22's built-in `node:sqlite` API still emits an experimental warning. The dependency is isolated
  behind `WorkspaceStore`, so another adapter can replace it without changing the runtime.
- Checkpoint projections currently retain applied event history, and startup loads the complete event
  stream for archive/stream reads even though reducer replay starts at the checkpoint. Very long
  workspaces will eventually need a compact checkpoint schema and paged history reads.
- One fixture expedition occupies the current database. Fixture fingerprint mismatch deliberately
  refuses startup; multi-expedition creation, selection, and workspace migration are later product
  work.
- A process crash between checkpoints safely replays the durable tail. Resuming an active external
  read can repeat a read-only provider call, but event identity, schema validation, and persist-before-
  publish rules prevent it from silently duplicating authoritative state.
- Live `search_sources` and `read_source` remain unavailable until discovered providers satisfy the
  exact read-only, schema, side-effect, and task-support policy. The registry can add those providers
  declaratively without a new service.
