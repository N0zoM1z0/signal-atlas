# LIVE-PROFESSOR - Bounded local Professor agent

## Status

Complete.

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

- Contract generation/typecheck/tests passed with 22 committed JSON Schemas, including the strict
  Professor transport schema.
- Orchestrator typecheck and all 80 orchestrator tests passed, including evidence-subset validation,
  one repair, fresh-session isolation, unavailable/timeout fallback, async event ordering, and reset
  cancellation.
- Web typecheck and all 19 web tests passed.
- Focused Chromium Professor and runtime-diagnostics journeys passed; the 1440 × 900 Professor
  baseline was regenerated and manually inspected with the new Scripted fixture badge.
- Combined live smoke passed using the ignored `0600` `.env` and the required local proxy. Pref MCP
  negotiated protocol `2025-11-25`, exposed 31 tools, and validated
  `weather.get_current_conditions`; the live mission completed with one canonical sensor source and
  one context signal.
- The first real Professor consultation committed only `professor.query.started` initially, then a
  validated `professor.response.created` after 16.7 seconds. A UI-driven second consultation took
  22.0 seconds. Both used fresh non-resumed attempts, cited exactly the selected live Pref source and
  signal, required zero repairs, and recorded `local_exec` with zero fallbacks.
- Runtime/process log review found no application exception or failed turn. The only error-level
  lines were benign Vite WebSocket `EPIPE` messages after the headless inspection browser closed;
  Node also repeated its known `NO_COLOR`/`FORCE_COLOR` warning.

- `pnpm typecheck` passed across all typed workspaces.
- `pnpm lint` passed with zero warnings.
- `pnpm test` passed: 47 test files and 229 tests; `world-content` intentionally has no tests.
- `pnpm build` passed and regenerated 22 schemas. Vite emitted only the existing Phaser chunk-size advisory.
- `pnpm format:check` passed.
- `pnpm test:e2e` passed all 31 non-visual Chromium journeys in 2.9 minutes.
- `pnpm test:visual` passed all 9 Chromium visual baselines in 55 seconds.

## Results

- Local Professor questions now execute a real, separately bounded Codex process instead of the
  deterministic response template.
- The authoritative event stream makes asynchronous execution visible and accepts only validated,
  selected-evidence citations.
- Offline fixture behavior remains deterministic, while every local failure path is an explicitly
  labeled authored fallback.
- The study and Runtime Diagnostics both expose runtime truth without revealing prompts,
  transcripts, credentials, or private reasoning.
- The live demonstration was restored on localhost after all isolated browser gates, with one live
  Pref source/signal and a successful 11.4-second local Professor turn ready in diagnostics.

## Remaining risks

- Live smoke coverage exercises the approved weather mapping only; broader Pref providers and a
  long-running live soak remain future work.
- Each Professor question intentionally pays fresh Codex process/session startup latency (11–22
  seconds in this smoke) to prevent cross-query evidence leakage.
- Runtime state remains process-local, so restarting the demonstration clears events and requires a
  new live retrieval.
- No real trading, order placement, hosted authentication, or external write path was added.
