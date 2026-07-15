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

Because Pref's exact tools may differ, use a declarative mapping file.

Example:

```yaml
server: pref
transport: stdio
capabilities:
  search_sources:
    tool: pref.search
    input:
      query: $.query
      location: $.location
      since: $.since
    output:
      items: $.results
  read_source:
    tool: pref.read
    input:
      id: $.sourceId
    output:
      content: $.content
  local_conditions:
    tool: pref.weather
    input:
      place: $.location
      at: $.time
    output:
      observation: $.current
```

The actual file should be generated after inspecting the user's Pref MCP tool list.

## 8.5 Dual access pattern

Use two paths to Pref:

### Orchestrator path

The orchestrator calls Pref directly for deterministic world metadata, scheduled refreshes, caching, and source ingestion. This path is authoritative for provenance.

### Agent path

Codex agents call a read-only, audited Pref proxy for mission-specific research. The proxy returns canonical source IDs and logs every call. The agent cannot bypass it.

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
Source IDs, signal summaries, unresolved questions, current belief.

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
- configurable global concurrency, default two;
- per-mission timeout;
- per-agent and per-expedition token/call budget;
- exponential backoff on connection failure;
- no automatic infinite retry;
- priority for player-requested turns.

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
