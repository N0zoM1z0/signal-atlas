# 08. Pref MCP and Codex Architecture

## 8.1 Architectural principle

The runtime separates three concerns:

- **Pref Gateway:** retrieves and normalizes external information.
- **Codex Runtime:** produces bounded agent decisions and public explanations.
- **World Orchestrator:** validates actions and owns authoritative game state.

Neither Pref nor Codex directly mutates the world. All changes pass through validated world events.

## 8.2 Why MCP fits the concept

MCP servers can expose tools, resources, and prompts. Tools are model-invoked functions; resources provide context or data; prompts provide reusable interaction templates.[1] This maps naturally onto Signal Atlas:

- Pref tools retrieve or compute information;
- Pref resources expose archives, documents, or structured datasets;
- Pref prompts can provide curated research workflows;
- the game converts these capabilities into location affordances and missions.

The game should discover capabilities at startup and build a mapping table rather than hard-coding assumptions about the exact Pref server.

## 8.3 Pref Gateway responsibilities

The Pref Gateway is a local service or package that:

- connects to one or more Pref MCP servers over STDIO or Streamable HTTP;
- lists available tools/resources/prompts;
- applies a configured capability map;
- validates request arguments;
- adds rate limits and timeouts;
- strips secrets from logs;
- records provenance and hashes;
- normalizes results into `SourceRecord` objects;
- caches safe, immutable responses;
- emits connection and freshness events;
- exposes a deterministic fixture mode.

## 8.4 Capability map

Because Pref's exact tools may differ, use a declarative mapping file. One canonical capability may
have several provider candidates; deterministic priority chooses the first enabled mapping whose
discovered contract passes every boundary check.

Example:

```json
{
  "mappingId": "provider-article-search-v1",
  "canonicalName": "search_sources",
  "enabled": false,
  "priority": 100,
  "toolRef": "provider.search_articles",
  "providerServer": "provider_catalog",
  "executionMode": "synchronous",
  "inputProjection": {
    "query": { "selector": "query", "requiredFromCanonical": true, "transform": "identity" },
    "limit": { "selector": "limit", "requiredFromCanonical": false, "transform": "identity" }
  },
  "expectedInput": { "query": "string", "limit": "number" },
  "responseAdapter": "article_search_v1",
  "requiredAnnotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true
  },
  "requiredSecurityHints": { "sideEffect": "read_only" }
}
```

The registry schema is versioned. Each provider-required argument must have a required canonical
projection or a validated fixed argument, projected types must exactly match discovery, and the
selected response adapter must match the provider output schema. Canonical requests may be stricter
than optional provider fields. Fixed values are recursively checked against the discovered property
schema and may not override a projected argument. Unknown transforms, unmapped provider-required
fields, incompatible schemas, write-capable annotations, side effects, or task-support policies fail
closed. A synchronous mapping accepts `task_support: forbidden` or `optional`; `required`, missing,
and unknown values are rejected because Signal Atlas does not implement the MCP Tasks lifecycle.

The implemented v3 registry enables `weather.get_current_conditions` for `local_conditions`,
`gdelt.context.search_context` for `search_sources`, and
`resolution.search_historical_resolutions` for `search_resolution_history`. GDELT passed exact
catalog discovery and a bounded synchronous live smoke; the generic article adapter retains stable
URL identity and metadata, exposes only the bounded matched sentence as transient untrusted turn
evidence, and discards the larger context field under a metadata-only source policy. Resolution
history passed exact discovery plus a bounded hosted call and normalizes at most 50 comparable
resolved markets with one aggregate base-rate evidence record. No provider is enabled for
`read_source` until one passes the same contract and policy checks.

The same registry defines provider-neutral request contracts for `search_markets`,
`search_resolution_history`, `search_economic_series`, and `read_economic_series`. The Resolution
mapping is enabled after its live gate. Polymarket discovery remains disabled because its hosted
output schema permits unknown root and row fields, even though its bounded response adapter is
implemented. Hosted FRED still requires an undeclared provider key, so both FRED mappings remain
disabled despite strict compatible catalog contracts and implemented adapters. FRED discovery
defaults to 20 results and caps at 50. Full-series reads always project descending order plus a
canonical limit that defaults to 250 and cannot exceed 500, so a provider default of 100,000
observations is never the normal path. Revisions create a new canonical source version linked by
`supersedesSourceId`; missing FRED values normalize to `null` rather than zero.

## 8.5 Dual access pattern

Use two paths to Pref:

### Orchestrator path

The orchestrator calls Pref directly for deterministic world metadata, scheduled refreshes, caching, and source ingestion. This path is authoritative for provenance.

### Agent path

The orchestrator exposes a read-only, audited Pref proxy for mission-specific research. The first
runtime implementation resolves one explicitly authored canonical capability from the agent's
effective place, mission verb, turn allow-list, and the gateway's validated live allow-list. The
orchestrator invokes Pref before Codex, records the call, and supplies the agent only a bounded
current-turn evidence packet. The model never receives a Pref credential, provider tool reference,
or permission to invoke MCP directly.

Non-weather place bindings must opt in with `configuration.missionVerbs`. Query capabilities must
also provide an authored query or declare `queryMode: "mission_objective"`; limits and time windows
remain bounded by the canonical request schema. `local_conditions` retains the explicit
`context_only` real-world proxy mapping used by the Helios fixture. An unconfigured binding falls
back to fixture behavior rather than silently enabling a newly discovered provider.

The current-turn packet contains the canonical capability, Pref call ID, argument hash, retrieval
time, duration, cache status, canonical `SourceRecord` objects, and bounded evidence facts linked to
those source IDs. Rights-filtered metadata enters the durable source record; transient adapter facts
such as a GDELT matched sentence enter only the untrusted prompt packet. Raw provider response
shapes never enter the model prompt. If local Codex is unavailable or its one repair fails, the
orchestrator records the retrieved canonical sources but accepts no model-derived claim or signal.

This dual pattern preserves agent autonomy while ensuring the game knows exactly which sources entered the world.

## 8.6 Codex integration choices

Current Codex CLI documentation supports two useful runtime patterns.

### Pattern A: non-interactive turns with `codex exec`

`codex exec` can emit newline-delimited JSON events with `--json`, write the final message to a file, validate the final response against a JSON Schema with `--output-schema`, and resume a previous non-interactive session.[2]

Recommended for:

- simple deployment;
- one turn at a time;
- strong output-schema enforcement;
- easy process isolation;
- MVP implementation.

Illustrative invocation:

```bash
codex exec \
  --sandbox read-only \
  --json \
  --output-schema ./schemas/agent-turn-output.schema.json \
  -o ./runtime/turn-output.json \
  - < ./runtime/turn-prompt.md
```

For follow-up turns, use a recorded session ID and the documented resume mechanism.[2]

### Pattern B: persistent Codex MCP server

Codex can run as `codex mcp-server`. The server exposes tools to start a Codex session and continue it using a thread ID, with explicit approval and sandbox settings.[3]

Recommended for:

- long-lived multi-agent orchestration;
- lower process-start overhead;
- explicit session continuation;
- richer future workflows.

The first implementation can abstract both behind a `CodexDriver` interface and ship Pattern A first.

## 8.7 Registering Pref with Codex

Codex can register MCP servers from the CLI using a STDIO command or Streamable HTTP URL, and stores configuration in user- or project-scoped `config.toml`.[4]

Illustrative STDIO setup:

```bash
codex mcp add pref -- /path/to/pref-mcp-server --read-only
```

Illustrative HTTP setup:

```bash
codex mcp add pref --url https://127.0.0.1:PORT/mcp
```

The actual command and authentication method depend on the user's Pref deployment. Runtime agents should use a project-scoped configuration with only the necessary read-only server.

## 8.8 Logical agent sessions

Each game agent stores:

- `agentId`;
- Codex session/thread ID;
- isolated working directory;
- role instructions;
- current task state;
- allowed MCP capability profile;
- last output schema version;
- last successful turn timestamp.

The runtime starts or resumes the session when a mission turn is scheduled. It does not require a permanently running CLI process for every visible character.

Professor Vale uses a deliberately different session boundary. Every consultation starts a fresh
local Codex session so a later question cannot inherit evidence that is no longer selected. Only a
single repair attempt may resume that consultation's temporary session. Professor turns receive no
Pref credential or MCP registration: the authoritative orchestrator first materializes canonical
Pref sources/signals, then sends only the player's selected records to the consultation driver.

## 8.9 Agent prompt packet

Each turn receives a compact packet:

```text
ROLE
You are Mira, the Field Scout in Signal Atlas.

PUBLIC BEHAVIOR
Be concise, curious, and evidence-linked. Never claim facts without source IDs.

MARKET
Question, outcomes, resolution rules, horizon, public probability.

WORLD STATE
Current location, nearby agents, reachable locations, active events.

MISSION
Objective, destination, deadline, allowed actions, search budget.

KNOWN INFORMATION
Source IDs, signal summaries, bounded current-turn evidence facts, unresolved questions, current belief.

TOOLS
Only the listed Pref capabilities are allowed.

OUTPUT
Return one object conforming to agent-turn-output.schema.json.
```

Do not request hidden chain-of-thought. Ask for a brief public rationale, assumptions, and evidence references.

## 8.10 Output validation

The expected output includes:

- chosen action;
- destination or target;
- public dialogue line;
- source IDs used;
- new claims/signals proposed;
- belief update, if any;
- suggested follow-up mission;
- explicit unknowns;
- confidence in the action result.

Validation layers:

1. JSON Schema validation by Codex output mode.
2. Runtime Zod validation.
3. Evidence-reference validation against known/retrieved IDs.
4. World-rule validation.
5. Policy validation.
6. Idempotency check.

One repair turn may receive only the validation errors and original output. A second failure becomes a safe wait event.

For a Pref-backed current-turn packet, every cited source, proposed claim source, and proposed signal
source must belong to that packet. Accepted claims and signals receive deterministic orchestrator
IDs and are materialized only after schema and world validation. A model may select the qualitative
impact label, but it cannot assign a deterministic probability-point range or mutate belief
directly; those remain orchestrator-owned decisions.

Professor output uses the separate strict
`professor-response.codex.schema.json` transport contract. In addition to Zod validation, the
orchestrator requires the query ID, mode, and selected-signal set to match; rejects duplicate or
unselected evidence references; and permits suggested destinations only from the current world
manifest. Local failure, timeout, or a second invalid result returns the authored evidence-bounded
answer with `scripted_fallback` runtime metadata. The UI never presents that fallback as a local
model result.

## 8.11 Sandbox and permissions

The runtime should use least privilege.

- gameplay agent workspace is read-only or narrowly writable;
- network is disabled except through approved MCP tools;
- Pref MCP tools are read-only for the MVP;
- no real-market order tool is configured;
- no repository-editing mission occurs in the same runtime profile;
- secrets remain in process environment or local secure storage, never prompts;
- tool arguments and results are logged with secret redaction;
- external MCP servers enforce their own authorization and guardrails.

OpenAI's Codex architecture notes that user-provided MCP tools are outside the Codex shell sandbox and must enforce their own guardrails.[5] The Pref Gateway is therefore a security boundary, not merely an adapter.

## 8.12 Agent scheduler

The scheduler is event-driven.

Triggers include:

- player command;
- arrival at destination;
- new relevant signal;
- meeting start;
- scheduled refresh;
- forecast review interval;
- explicit retry.

Fairness and budget rules:

- one active turn per agent;
- configurable process-wide external-call concurrency, default two across all expeditions;
- per-mission timeout;
- per-agent and per-expedition token/call budget;
- exponential backoff on connection failure;
- no automatic infinite retry;
- priority for player-requested turns.

Each expedition owns its deterministic mission scheduler, but non-scripted driver execution must
also acquire the orchestrator's shared FIFO admission gate. This prevents opening additional
expeditions from multiplying Pref, local Codex, or Professor process concurrency. Waiting calls
observe their existing abort signal, the queue has a finite configured capacity, and overload fails
closed as a recoverable runtime error. Scripted fixture turns bypass the gate and remain synchronous.

## 8.13 Observability

Record for every turn:

- turn ID and agent ID;
- session/thread ID;
- schema and prompt version;
- mission input hash;
- MCP calls with redacted arguments;
- source IDs returned;
- Codex event stream;
- final validated output;
- latency and resource usage;
- retries and validation errors;
- world events produced.

The debug inspector can replay a turn without exposing sensitive credentials or private model reasoning.

## 8.14 Fixture mode

Fixture mode is mandatory. It provides:

- deterministic Pref responses;
- deterministic Codex outputs or a scripted driver;
- simulated latency;
- injected errors;
- source versions and stale data;
- repeatable end-to-end tests.

The game must remain fully demonstrable without a live network connection.

## 8.15 Future multi-agent options

Current Codex releases support subagent workflows and custom agents, but parallel write-heavy work requires coordination.[6] For Signal Atlas runtime characters, independent logical sessions are preferable because the game needs explicit knowledge boundaries and per-character history. Codex subagents are more useful for development tasks, content generation, test analysis, and batch world authoring than for directly representing every in-world character.

## References

See `../SOURCES.md` for official URLs and access dates.
