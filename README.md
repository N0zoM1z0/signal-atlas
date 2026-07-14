# Signal Atlas

**Working title:** Signal Atlas  
**Tagline:** Walk the world. Gather the signal. Price the future.

Signal Atlas turns a prediction market into a living two-dimensional pixel world. A market is no longer only a chart and a question: it becomes a map of relevant cities, institutions, archives, weather stations, newsrooms, exchanges, laboratories, and social spaces. Local Codex-driven agents move through that world, retrieve sourced information through Pref MCP, exchange findings, challenge one another, and update their forecasts in a way the player can watch, direct, inspect, and replay.

The product is designed around three qualities:

1. **Beautiful:** a cozy editorial pixel-diorama with modern, legible information design.
2. **Playful:** movement, discovery, meetings, signal cards, changing weather, and visible agent personalities.
3. **Trustworthy:** every important claim has provenance, every forecast change can be explained, and all external actions remain reviewable.

## What is in this package

- `DESIGN_BIBLE.md` - the complete product and game design in one document.
- `docs/` - modular design specifications by topic.
- `codex/` - an implementation taskbook, repository instructions, and prompts ready to paste into Codex.
- `prototype/` - a self-contained clickable HTML/CSS/JavaScript concept prototype.
- `previews/` - screenshots of the prototype's major states.
- `diagrams/` - original SVG system, gameplay, and information-flow diagrams.
- `schemas/` - implementation-oriented JSON Schemas and a TypeScript Pref adapter contract.
- `fixtures/` - a fictional market/world fixture for deterministic development.
- `design-tokens.json` - color, spacing, typography, motion, and pixel-scale tokens.
- `Signal_Atlas_Design_Bible.pdf` - a styled printable companion with the core design, diagrams, screen previews, architecture, roadmap, and Codex kickoff plan.
- `SOURCES.md` - official technical references used for the Codex and MCP recommendations.
- `VALIDATION_REPORT.md` - automated and visual quality checks performed before packaging.
- `MANIFEST.sha256` - SHA-256 checksums for every packaged file except the manifest itself.
- `tools/` - reproducible PDF-build and package-validation scripts.

## Recommended order

1. Read `DESIGN_BIBLE.md`.
2. Open `prototype/index.html` in a browser.
3. Review `codex/CODEX_KICKOFF_TASKBOOK.md`.
4. Copy `codex/AGENTS.md` into the root of the implementation repository.
5. Start with the vertical-slice prompt in `codex/prompts/00_master_kickoff.md`.

## The first shippable slice

The recommended first release is a **simulation-first desktop web app** with:

- one fictional binary market;
- one handcrafted map with six locations;
- three visible agents with distinct roles;
- movement, missions, and meetings;
- a signal feed with provenance;
- an archive room;
- a professor consultation scene;
- a forecast dial and calibration score;
- a fake Pref adapter for deterministic offline development;
- one live Pref MCP integration path behind a feature flag;
- a local Codex runtime wrapper that emits schema-validated agent actions;
- no real-money trading or automatic market execution.

This slice is deliberately narrow. It is enough to prove the central magic: **information becomes a place, research becomes movement, and forecasting becomes a story the player can understand.**

## Development quick start

Signal Atlas is implemented as a pnpm TypeScript workspace. The default development profile is local and fixture-first.

Prerequisites:

- Node.js 22.12 or newer;
- pnpm 10 or newer.

Before an installation or another command that requires Internet access, enable the project owner's local proxy in the same shell:

```bash
source ~/clash.sh
proxy_on
```

Install and start both the web application and local orchestrator:

```bash
pnpm install
pnpm dev
```

The web application listens on `http://127.0.0.1:4173` and the orchestrator health endpoint is `http://127.0.0.1:4317/api/health`.

Run the current repository gate with:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Local credentials, databases, runtime transcripts, and cached source bodies must not be committed.
