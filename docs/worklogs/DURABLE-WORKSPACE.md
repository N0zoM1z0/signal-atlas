# DURABLE-WORKSPACE - Persistent event history, checkpoints, and Pref capability expansion

## Status

In progress.

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

Pending implementation.

## Results

Pending implementation.

## Remaining risks

Pending implementation.
