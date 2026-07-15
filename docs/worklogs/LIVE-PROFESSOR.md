# LIVE-PROFESSOR - Bounded local Professor agent

## Status

In progress.

## Goal

Replace Professor Vale's local-mode deterministic answer with a real, evidence-bounded Codex turn while retaining the authored scripted response as an offline and fail-closed fallback.

## Intended files

- `packages/contracts` and `schemas`: add bounded Professor response contracts and a strict Codex transport schema.
- `apps/orchestrator/src`: add a dedicated Professor driver, validate selected-evidence provenance, schedule the local turn asynchronously, and expose safe diagnostics.
- `apps/web/src/world-shell` and styles: wait for asynchronous responses and state the actual local, scripted, or fallback runtime mode.
- focused contract, orchestrator, and browser tests: cover validation, one repair, fallback, cancellation, async projection, and visible runtime truth.
- architecture/demo documentation: record the operational boundary and real local smoke result.

## Acceptance criteria

- In local mode, each Professor query starts a fresh Codex session with tools, apps, shell, and web search disabled.
- The prompt contains only the current market summary, exact question, and explicitly selected sources/signals; source content is marked untrusted data.
- Strict structured output plus domain validation rejects mismatched query/mode/selection, duplicate or unselected evidence, and unknown mission destinations.
- One bounded repair is allowed. Unavailable, timed-out, or repeatedly invalid Codex output returns the deterministic scripted answer with a visible safe fallback reason.
- `professor.query.started` is committed immediately; the correlation and response events are appended only after the asynchronous turn completes.
- Fixture/scripted mode remains deterministic and synchronous for offline tests.
- The UI stays busy while the agent works and labels every response as Local Codex, Scripted fixture, or Scripted fallback.
- Reset cancels pending Professor work, public diagnostics contain no prompt/transcript/credential data, and no private chain-of-thought is requested or exposed.

## Risks and controls

- **Prompt injection through evidence:** evidence excerpts are delimited as untrusted records and all runtime tools are disabled.
- **Unselected evidence leakage:** every query uses a new session and output IDs must be a subset of the selected packet.
- **Late writes after reset:** each scheduled turn is abortable and generation-scoped before events are appended.
- **Misleading fallback:** fallback answers carry explicit runtime metadata rendered by the UI.
- **Credential exposure:** the Codex child receives an allow-listed environment that excludes Pref credentials; diagnostics retain only safe process metadata.
- **Non-deterministic fixture tests:** scripted mode keeps the existing immediate event sequence and requires no external service.

## Verification

Pending implementation.
