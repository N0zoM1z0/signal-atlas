Continue Signal Atlas implementation through the foundation milestone.

Read AGENTS.md and the P0 tasks in docs/CODEX_KICKOFF_TASKBOOK.md. Inspect the current repository and existing worklogs.

Complete the next incomplete tasks in order:
- P0-001 Bootstrap monorepo
- P0-002 Design tokens and UI primitives
- P0-003 Domain contracts and fixture
- P0-004 Pure simulation and replay core

Rules:
- work on one task at a time;
- create/update docs/worklogs/<TASK_ID>.md before each task;
- run that task's acceptance tests before continuing;
- do not add Phaser scene behavior beyond a minimal host yet;
- do not add Codex child-process or MCP integration yet;
- contracts and simulation must remain independent of UI and infrastructure;
- preserve fixture data exactly unless validation reveals a documented defect.

At the end, run the repository-wide foundation gate: typecheck, lint, unit tests, build, fixture validation, and deterministic replay hash test.

Return a concise milestone report with exact commands/results, key file paths, unresolved questions, and whether the repository is ready for P1-001.
