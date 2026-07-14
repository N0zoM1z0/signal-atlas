# Codex Runbook

This runbook describes a practical way to start the implementation with local Codex CLI. Confirm commands against the installed CLI with `codex --help` and `codex mcp --help`, because local configuration and Pref transport differ.

## 1. Prepare the implementation repository

```bash
mkdir signal-atlas
cd signal-atlas
git init
```

Copy into the repository:

- this package's `codex/AGENTS.md` as root `AGENTS.md`;
- the complete `docs/` directory;
- `design-tokens.json`;
- `fixtures/`;
- `schemas/`;
- `prototype/` and `previews/` as visual reference files;
- `codex/CODEX_KICKOFF_TASKBOOK.md` into `docs/`.

Commit the design baseline before implementation:

```bash
git add .
git commit -m "docs: add Signal Atlas design baseline"
```

Codex non-interactive runs normally expect a Git repository, which is also desirable for reviewable implementation work.

## 2. Confirm Codex installation and authentication

```bash
codex --help
codex login
```

Use the authentication method appropriate for the local environment. Do not commit Codex authentication files or expose them to the game repository.

## 3. Start interactively

From the repository root:

```bash
codex
```

Paste the content of `codex/prompts/00_master_kickoff.md`.

For each subsequent milestone, paste the relevant prompt file. Keep one main implementation thread so decisions and repository context remain coherent. Use subagents only for independent exploration, testing, or visual review.

## 4. Optional non-interactive task invocation

Codex supports non-interactive execution. A task prompt can be piped on standard input:

```bash
codex exec - < codex/prompts/01_bootstrap.md
```

For automation-friendly event output:

```bash
codex exec --json - < codex/prompts/01_bootstrap.md
```

For a task that must return structured metadata, provide a JSON Schema and an output file:

```bash
codex exec \
  --output-schema ./schemas/task-result.schema.json \
  -o ./runtime/task-result.json \
  - < ./codex/prompts/task.md
```

The application runtime's in-world agents should use their own output schema and sandbox profile rather than the repository-development profile.

## 5. Configure Pref MCP for development

First inspect the actual Pref MCP deployment. Determine whether it is a local STDIO server or a Streamable HTTP server.

### STDIO pattern

```bash
codex mcp add pref -- /absolute/path/to/pref-mcp-server <args>
```

### Streamable HTTP pattern

```bash
codex mcp add pref --url https://127.0.0.1:PORT/mcp
```

Then inspect configuration:

```bash
codex mcp list
```

Prefer project-scoped configuration for the runtime repository, and expose only read-only Pref capabilities needed for the current task. Do not register any market-order or external-write tool.

## 6. Recommended development sequence

Run tasks in this order:

1. P0-001 through P0-004
2. P1-001 through P1-003
3. P2-001 through P2-003
4. P3-001 through P3-005
5. Review the complete offline journey
6. P4-001 through P4-003
7. Review one live Codex mission
8. P5-001 through P5-003
9. Review one live Pref signal and provenance
10. P6-001 through P6-003

Do not make live integrations a prerequisite for the visual shell or offline journey.

## 7. Suggested validation commands

The exact scripts will be created during bootstrap. The intended root commands are:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm test:visual
```

Before closing a task, ask Codex to report the exact commands run, pass/fail results, screenshots generated, and any skipped validation.

## 8. Runtime profiles

Keep repository-development Codex usage separate from in-game agent usage.

### Development profile

- workspace-write access to the repository;
- tools required to build and test;
- Pref access only when implementing or testing integration;
- user reviews diffs.

### Game-agent profile

- read-only or narrowly writable scratch workspace;
- only approved Pref MCP tools;
- schema-constrained final output;
- no implementation-repository access;
- no real market actions;
- strict timeout and call budget.

## 9. Recovery

If a Codex task makes broad or visually poor changes:

1. Stop the task.
2. Inspect `git diff`.
3. Preserve useful isolated changes.
4. Revert unrelated edits.
5. Restate the visual target with a screenshot path and exact acceptance criteria.
6. Ask Codex to modify the smallest relevant component.

If live Pref integration blocks development, switch back to fixture mode and continue the user experience work.
