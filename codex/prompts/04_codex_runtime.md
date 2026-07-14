Integrate local Codex as a bounded in-world agent runtime without weakening fixture mode or world authority.

Read:
- docs/08_pref_mcp_and_codex_architecture.md
- docs/10_data_models_and_events.md
- docs/11_trust_safety_accessibility.md
- P4 tasks in docs/CODEX_KICKOFF_TASKBOOK.md
- schemas/agent-turn-output.schema.json

Implement in order:
- P4-001 Codex runtime interface and scripted implementation
- P4-002 Local codex exec driver
- P4-003 Agent profiles and knowledge packets

Requirements:
- all game services depend on a CodexDriver interface, not child_process directly;
- invoke Codex without shell interpolation;
- use a read-only sandbox for gameplay turns;
- parse JSONL events when enabled;
- validate final output against the supplied JSON Schema and runtime Zod schema;
- capture/resume a session ID when supported by the installed CLI;
- validate all source/signal references against the agent knowledge packet and current-turn retrieved IDs;
- permit one constrained repair attempt, then emit a safe wait/failure event;
- enforce timeout, cancellation, global concurrency, and per-mission budget;
- redact secrets and do not store private chain-of-thought;
- preserve scripted fallback when Codex is missing or disabled.

Demonstration target:
Run Mira's weather-tower mission through real local Codex using fixture source records. The resulting action must be schema-valid, evidence-linked, and applied only after world validation.

Add tests for:
- valid output;
- invalid JSON;
- schema-valid but unknown source ID;
- illegal action;
- timeout;
- canceled turn;
- repair succeeds;
- repair fails and safe fallback occurs;
- session resume.

Report the exact runtime command shape used, but do not expose credentials or auth file paths beyond generic configuration.
