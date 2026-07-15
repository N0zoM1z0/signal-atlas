# ADR 0001: Pref MCP integration boundary

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Signal Atlas implementation team
- Scope: P5-002 and P5-003

## Context

Signal Atlas must ingest external information through one controlled Pref Gateway without binding game code to provider-specific MCP names or payloads. Before choosing a transport or a first live capability, we inspected the active local Codex MCP registration, queried the connected Pref discovery helpers, and reviewed the local Preference deployment source at revision `cc3e0773ce5c`.

The inspection was read-only. Configuration output was reduced to server name, transport, authentication kind, and a query-free endpoint. No credential, authorization header, claim link, or environment value was read into project files or logs.

## Decision

### Transport and session lifecycle

The live adapter will use the official `@modelcontextprotocol/client` package over stateful Streamable HTTP at `https://pref.trade/mcp`.

- The SDK owns MCP initialization, protocol negotiation, the `MCP-Session-Id` header, reconnect, and session close.
- Signal Atlas will not implement a parallel JSON-RPC or SSE transport.
- The endpoint is server-runtime configuration. Its URL must be HTTPS, must not contain user information or a query string, and its hostname must match the configured server allow-list. The production default allow-list contains only `pref.trade`.
- Fixture mode remains the default local mode and performs no network access.
- P5-002 establishes connection and discovery. P5-003 uses the same connection to execute the first canonical information mission.

STDIO is not selected because the inspected Pref deployment is a hosted Streamable HTTP service. A future STDIO deployment requires a separate adapter and an explicit executable allow-list; it must not be inferred from arbitrary configuration.

### Authentication boundary

The Pref deployment rejects unauthenticated MCP discovery. It supports bearer credentials obtained through OAuth or agent registration.

- The current Codex OAuth session belongs to Codex and will not be extracted, copied, or reused by Signal Atlas.
- The application accepts a Pref bearer only through server-side runtime configuration. The initial implementation uses `SIGNAL_ATLAS_PREF_BEARER_TOKEN`; OAuth token acquisition can later implement the same server-only credential-provider interface.
- Tokens never enter capability maps, repository files, browser bundles, API responses, audit events, error messages, or source records.
- The frontend receives only `configured`, `missing`, or `not_required` credential state.
- Missing credentials produce an `auth_required` connection state without making a network request. Signal Atlas will not automatically register an agent or generate a claim link.

### Discovered primitives

The observed public Pref surface exposes provider capabilities through two top-level tools: `search_tools` discovers a catalog contract and `call_tool` executes a returned `tool_ref`. At inspection time the catalog reported 547 indexed capabilities. This count is diagnostic, not a pinned contract.

The advertised helper-tool surface also included:

- read-only orientation and discovery: `help`, `onboard`, `list_resources`, and `read_resource`;
- account or interaction helpers that Signal Atlas does not need: `preference_account_status`, `report_feedback`, and `open_mcpui_noaa_weather`;
- a state-changing helper that is explicitly denied: `preference_regenerate_claim_link`.

Pref currently represents resources and prompt templates through read-only helper tools even when the negotiated MCP server does not advertise native `resources` or `prompts` capabilities. Discovery therefore follows this order:

1. list native MCP tools and inspect negotiated server capabilities;
2. use native resource, resource-template, or prompt listing when advertised;
3. otherwise call the allow-listed `list_resources` and `onboard` helpers and retain only validated resource/prompt descriptors.

The observed helper-backed resources were:

- `pref://docs/overview`;
- `pref://docs/onboarding`;
- `pref://docs/troubleshooting`;
- `pref://workflows/market-analysis`;
- `pref://docs/capability-catalog`.

The observed resource template was `pref://capabilities/{tool_ref}/manual`. The observed prompt templates were `onboard`, `capability_routing`, and `market_discovery`.

Discovery snapshots contain bounded names, descriptions, URIs, and JSON Schemas only. They do not contain resource bodies, prompt expansions, provider results, account data, or raw helper responses.

### Capability map and first live capability

Provider names belong in a validated, versioned capability map rather than in gameplay code. Each canonical mapping records the discovery tool, execution tool, exact provider `tool_ref`, provider server, input projection, expected read-only annotations, and whether the mapping is enabled.

The first selected mapping is:

| Canonical capability | Discovery tool | Execution tool | Provider tool ref                | Provider server   | Input projection                      |
| -------------------- | -------------- | -------------- | -------------------------------- | ----------------- | ------------------------------------- |
| `local_conditions`   | `search_tools` | `call_tool`    | `weather.get_current_conditions` | `weather_toolkit` | semantic location label to `location` |

The exact discovered contract requires one non-empty string field, `location`. Its annotations report read-only, non-destructive, and idempotent behavior. Before execution, the loader validates the checked-in map structurally and the live connection resolves the exact `tool_ref` through `search_tools`; the returned server, input schema, and safety annotations must satisfy the mapping. A stale, missing, changed, or unknown tool fails closed.

`search.search_news_multi` was considered for `search_sources` but is not allow-listed because its discovered security metadata reports an external-write side effect and forbids task execution. It can only be reconsidered after its live contract is safe and an ADR amendment is accepted.

### Allow-lists

The initial server and tool policy is intentionally narrow:

- server host: `pref.trade`;
- direct discovery helpers: `help`, `onboard`, `search_tools`, and `list_resources`;
- execution wrapper: `call_tool`;
- provider tool refs: `weather.get_current_conditions` only;
- denied by default: every unlisted helper, provider tool ref, server, transport, and canonical capability.

`read_resource` is not required to list primitives and remains denied until a mission has a specific rights-safe resource-read mapping. Account, feedback, claim-link, UI-launching, market execution, and other write-capable tools are never part of the MVP policy.

### Content, storage, and error constraints

- All external results continue through `PrefGateway` normalization before becoming canonical sources.
- P5-002 stores only sanitized discovery metadata in process memory. It does not persist live tool results.
- P5-003 applies source rights, cache mode, byte limits, provenance hashes, versioning, and stale labels before any live result is retained.
- Raw arguments and payloads never enter diagnostics or audit logs; only stable identifiers, counts, durations, hashes, and fixed safe error codes are allowed.
- Wire operations are bounded by connection/call timeouts, response byte limits, primitive-count limits, and abort signals.
- Authentication, disconnect, timeout, policy, invalid-contract, and upstream failures are mapped to safe user-facing states. Upstream bodies, stack traces, endpoint details, and credential-shaped strings are not returned to the browser.

### Live evidence and fictional-market semantics

P5-003 executes current conditions for an explicitly configured `Cape Canaveral, Florida` provider location. This is a real-world interface-testing proxy for the fictional Galehaven Weather Tower, not a claim that those places are equivalent.

- The source keeps its real geocoded label and coordinates and carries `real-world-proxy` and `context-only` tags.
- Claims, signals, dialogue, inspector notices, and agent unknowns disclose that the result does not observe Galehaven or Helios-3.
- The signal contract is fixed to `direction=context`, `impact=unknown`, no target outcome, and no probability-point range. Context-only signals do not update belief.
- Provider publication time remains absent because the weather result does not supply one. Open-Meteo observation time, toolkit retrieval time, and Signal Atlas gateway retrieval time remain separate.
- Provider display rights are not asserted by the Pref envelope, so the canonical source is `metadata_only`; raw weather content is not persisted in the world projection.
- The gateway keeps only the latest validated canonical result per input in process memory. A fresh hit avoids another call, changed content creates a new source version, and only a retryable upstream failure can return an explicitly stale cached result.
- Fixture/live selection is a server-start mode. The browser may inspect or reconnect the selected mode but cannot supply its credential or silently change evidence semantics.

## Consequences

The application can show honest Pref availability and primitive inventory without exposing its credential boundary. Capability changes become explicit configuration drift instead of silently changing gameplay. A validated result can traverse the complete agent and world-event path without converting a real proxy observation into fictional directional evidence. The tradeoff is that live mode requires an independently supplied server credential, metadata-only storage limits source-body display, the cache is process-local, and provider catalog drift deliberately stops a mission until the mapping is reviewed.

## Verification requirements

P5-002 is complete only when tests demonstrate that:

- the official client lists tools and helper-backed resources/prompts through a representative MCP server;
- capability maps reject malformed, duplicate, unknown, non-read-only, and mismatched mappings;
- unlisted hosts, direct tools, and provider tool refs are denied before execution;
- connect, disconnect, failed connection, and reconnect transitions are visible through a sanitized endpoint and settings UI;
- seeded credential values cannot be found in diagnostics, API payloads, errors, or rendered DOM.

P5-003 is complete only when tests additionally demonstrate that:

- the verified weather envelope becomes linked source, claim, signal, dialogue, and turn records;
- the exact primitive and source hashes are inspectable while raw provider payloads and credentials remain absent;
- fresh cache, stale fallback, and changed-content supersession have distinct behavior;
- stale cache is visible in the signal/card audit path;
- proxy evidence remains non-directional and leaves the fictional market belief unchanged;
- fixture mode retains deterministic replay.
