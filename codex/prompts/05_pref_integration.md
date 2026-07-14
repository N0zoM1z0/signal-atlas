Integrate the user's Pref MCP through a strict local gateway.

First inspect the actual Pref MCP configuration and discover its tools, resources, and prompts. Do not assume the example capability names in the design docs are real.

Read:
- docs/05_information_archive_professor.md
- docs/08_pref_mcp_and_codex_architecture.md
- docs/11_trust_safety_accessibility.md
- P5 tasks in docs/CODEX_KICKOFF_TASKBOOK.md
- schemas/source-record.schema.json
- schemas/signal.schema.json

Implement in order:
- P5-001 Pref Gateway fixture and interface
- P5-002 MCP discovery and connection diagnostics
- P5-003 First live Pref mission

Before P5-002, write an ADR documenting:
- Pref transport;
- authentication boundary;
- discovered primitives;
- selected first capability;
- allow-list policy;
- content/storage constraints.

Requirements:
- all external information enters through PrefGateway;
- support the actual transport used by Pref;
- discover and display primitives without exposing secrets;
- map selected Pref responses into canonical SourceRecord objects;
- record server, primitive, timestamps, argument hash, response hash, and external identifier;
- deny unknown tools by default;
- enforce read-only behavior, call budgets, timeouts, and response-size limits;
- distinguish publication/observation/retrieval time;
- preserve fixture mode and contract parity;
- display stale cache and disconnected states;
- do not configure any external write or market-order tool.

Demonstration target:
One real Pref mission produces a source record, claim, signal card, agent dialogue line, and inspectable provenance in the game.

Add contract tests using recorded, rights-safe response fixtures rather than depending on a live server in CI.
