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
- `FINAL_REPORT.md` - the implemented vertical slice's exact release gates, definition-of-done audit, skips, and known limitations.
- `docs/DEMO_SCRIPT.md` - a six-minute deterministic offline walkthrough.
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

### Pref fixture and live modes

Pref runs in deterministic fixture mode unless `SIGNAL_ATLAS_PREF_MODE=live` is present when the orchestrator starts. Changing modes requires a process restart; the browser can inspect and reconnect the active mode, but cannot read or replace its credential.

To start the approved live weather path without putting a bearer in a file or shell history:

```bash
source ~/clash.sh
proxy_on
export SIGNAL_ATLAS_PREF_MODE=live
read -r -s -p "Pref bearer: " SIGNAL_ATLAS_PREF_BEARER_TOKEN
export SIGNAL_ATLAS_PREF_BEARER_TOKEN
printf '\n'
pnpm dev
```

Use a credential explicitly issued for this application. Do not copy Codex OAuth state or commit a populated `.env`; `.env.example` documents only the safe keys. The live MCP transport honors `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` from the `proxy_on` shell.

The first live mission calls the exact read-only primitive `weather.get_current_conditions`. Because Helios-3 and Galehaven are fictional, Cape Canaveral is disclosed everywhere as a real-world interface-testing proxy. Its signal is always context-only with unknown impact and never changes the fictional market forecast.

### Resolution, replay, and case-file export

Open **Replay** from the world toolbar or press `R` outside an editable field. The replay workspace reconstructs the world from sequence zero, exposes event-backed evidence and forecast turning points, and verifies the latest projection against the orchestrator's canonical hash.

Fixture resolution is deliberately not a general outcome command. `POST /api/expeditions/:id/resolve-fixture` accepts only an empty body and copies the outcome, time, and note from the parsed Helios-3 fixture. It records the market resolution, a Brier score for each explicitly scoring-eligible forecast, and the expedition resolution. The browser cannot select an outcome.

`GET /api/expeditions/:id/replay?sequence=N` returns the exact projection at an event sequence. `GET /api/expeditions/:id/case-file` returns a deterministic public JSON case file with separate source, claim, signal, and forecast-rationale sections. Private forecast memos are excluded from both those sections and the exported event stream.

### Event recovery and accessibility

The world shell receives committed event notifications from `GET /api/expeditions/:id/stream?after=N` over WebSocket. Every envelope is versioned, bounded to 100 events, and requires contiguous expedition-owned sequences. The browser advances its reconnect cursor only after the envelope validates and a fresh authoritative snapshot covers that batch; stream data never mutates the projection directly. Temporary transport loss uses bounded backoff from the last validated sequence. A malformed envelope keeps the last valid projection visible and names the event-stream schema boundary.

Browser access is restricted to the fixed local web origins served on port `4173`; a foreign `Origin` cannot open the expedition stream or submit a state-changing API request to the localhost orchestrator. Origin-less requests remain available to explicit native/CLI clients. Stream notifications omit private forecast memos even though the authoritative local snapshot retains them for the player.

Connection failures remain distinct in the UI and diagnostics:

- **Orchestrator offline** means the local API/snapshot boundary is unavailable.
- **Stream reconnecting/schema error** means live notifications failed while the last projection remains readable.
- **Pref disconnected** means the read-only source gateway is unavailable; it does not imply that Codex or the orchestrator failed.
- **Local Codex unavailable · scripted fixture fallback active** means local execution could not start and the deterministic authored driver remains available.
- **Agent output schema boundary rejected** means no source, claim, signal, or world action from that result was applied.

All essential world places, agents, movement progress, routes, and actions have semantic React representations outside Phaser. Modal dialogs contain focus and restore it on close; Archive, Professor, Meeting, and Replay focus their main landmark and return to the originating world control. The required journey supports `/`, `1`–`3`, `A`, `P`, `C`, `R`, `M`, `Space`, `[`/`]`, `F`, `Home`, `Tab`, `Enter`, and `Escape`. Closed responsive drawers leave the focus order, reduced-motion disables nonessential motion, and forced-colors mode restores explicit borders and focus/selection outlines. The 200% reflow target is the 720 × 450 CSS viewport equivalent of the 1440 × 900 reference desktop.

Run the current repository gate with:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run the browser gates separately:

```bash
pnpm test:e2e
pnpm test:visual
pnpm test:soak
```

`test:soak` is an explicit 30-minute gate. It runs the normal-motion experience, completes the three authored evidence missions across the session, and records FPS p10, zoom-interaction p95, JavaScript heap growth, page errors, final event sequence, and mission count as `soak-metrics.json`. For a quick harness check only, set `SIGNAL_ATLAS_SOAK_DURATION_MS`; a shortened result is not release evidence.

### Controls

- `/` focuses the selected agent's command field; `1`–`3` select Mira, Orin, or Kestrel.
- `A`, `P`, `C`, `R`, and `M` open Archive, Professor, Forecast, Replay, and Lantern Square.
- `Space` pauses or resumes simulation; `[` and `]` change speed.
- `F` follows the selected agent; `Home` centers the map.
- `Tab`, arrow keys inside tablists, `Enter`, and `Escape` support the complete keyboard journey.
- The **Skip travel** checkbox is a local, non-authoritative convenience. If browser storage is unavailable, the current-session toggle still works.

### Capture workflow

Use `http://127.0.0.1:4173/?capture=1` for clean screenshots or video. Capture mode hides the first-run guide, renderer diagnostics, and test-only fixture controls; it does not hide fixture/live mode, connection health, source provenance, forecast semantics, or runtime fallback truth.

The reference baselines are 1440 × 900 and 1280 × 800. Wait until the world reports ready before recording. Presentation sound remains off until explicitly enabled and is locally synthesized; all art in the shipped world is programmatic CSS, SVG, canvas, or Phaser geometry. No third-party image, audio, or font asset is required.

### Local Codex smoke

The fixture driver is always available, even without Codex. To test the bounded local runtime explicitly:

```bash
pnpm --filter @signal-atlas/orchestrator smoke:codex
```

The command uses the local `codex` executable unless `SIGNAL_ATLAS_CODEX_EXECUTABLE` overrides it. It runs with an app-scoped per-user runtime root, one-tool mission budget, strict structured output, source-reference validation, and the same event-authority boundary as the fixture driver. A missing or failing executable is reported as unavailable; it is never described as a successful local turn.

Local credentials, databases, runtime transcripts, and cached source bodies must not be committed.
