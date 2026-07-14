You are the implementation lead for Signal Atlas.

Read, in this order:
- AGENTS.md
- README.md
- docs/01_product_vision.md
- docs/06_ui_ux_specification.md
- docs/08_pref_mcp_and_codex_architecture.md
- docs/09_technical_architecture.md
- docs/10_data_models_and_events.md
- docs/CODEX_KICKOFF_TASKBOOK.md
- design-tokens.json
- prototype/README.md

Goal:
Build a polished local-first vertical slice in phases. The product is a living pixel world for a fictional prediction market. Three agents travel among six locations, gather source-linked signals, exchange knowledge, consult the Archive and Professor, and commit a simulated forecast.

Non-negotiables:
- no real-money trading or order-placement path;
- fixture mode must work offline;
- React owns dense UI and Phaser owns world rendering;
- the orchestrator owns authoritative state;
- all authoritative mutations are append-only events;
- every active signal links to source records;
- model output never mutates state without schema and world validation;
- essential controls are keyboard accessible and respect reduced motion;
- match the supplied visual prototype rather than building a generic dashboard.

Your immediate task is P0-001 only: bootstrap the monorepo and shared tooling.

Before editing:
1. Inspect the repository and design files.
2. Create docs/worklogs/P0-001.md with intended files, constraints, acceptance criteria, and validation commands.
3. Record any blocking ambiguity in docs/OPEN_QUESTIONS.md. Do not invent product changes.

Then implement P0-001 from the taskbook. Keep the change scoped. At completion, run all applicable validation and report:
- behavior delivered;
- files changed;
- exact commands and results;
- remaining risks;
- next recommended task.

Do not begin P0-002 until P0-001 passes its acceptance criteria.
