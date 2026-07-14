# 13. Open Questions and Product Decisions

## 13.1 Decisions already recommended

### Simulation-first

Build forecasting and calibration before any trade execution. This reduces risk and keeps the product focused on the unique experience.

### Local-first

Run the orchestrator, Codex sessions, Pref connection, cache, and event log on the user's machine for the first release.

### Semi-authored worlds

Use authored layout templates with data-driven locations rather than fully procedural maps.

### Logical agents, scheduled sessions

Represent each character with persistent state and a resumable Codex session. Do not require one always-running process per sprite.

### Dual Pref path

Let the orchestrator ingest authoritative sources while agents use an audited read-only proxy.

### React plus Phaser

Use Phaser for the world and React for information-dense, accessible UI.

### Event-sourced world state

All authoritative changes are append-only events, enabling replay and audit.

### Fictional first market

Use the Helios-3 launch scenario to perfect the loop before live-market complexity.

## 13.2 Decisions requiring the owner's input

### Pref MCP capability inventory

What tools, resources, and prompts does the existing Pref MCP expose? Which are safe and useful for the first vertical slice?

Decision output needed:

- server transport;
- authentication method;
- exact tool/resource list;
- rate limits;
- content rights;
- whether weather and market data are already available;
- whether subscriptions are supported.

### Market provider

Will the product initially display a real market price? If yes, which provider and under what terms? A read-only adapter should be selected before any UI depends on provider-specific fields.

### Runtime authentication

Will Codex use local ChatGPT login, API-key authentication, or a local OSS provider? The runtime abstraction supports multiple methods, but setup and diagnostics differ.

### Distribution target

Is the first release:

- a developer demo launched from terminal;
- a packaged desktop app;
- a hosted web experience with a local companion;
- an internal research tool?

The recommendation is a developer demo first, then desktop packaging.

### Audience priority

Which audience matters first: spectator, active forecaster, research operator, or streamer? The vertical slice serves all four lightly, but polish priorities differ.

### Visual production

Will final pixel assets be created internally, commissioned, or generated and hand-edited? The architecture should not proceed far beyond placeholders without a clear art pipeline.

## 13.3 Product questions to test rather than debate

### Is movement genuinely useful?

Test whether users understand knowledge acquisition better when agents travel. If travel feels like waiting, shorten it and increase visible mission context.

### How much autonomy is delightful?

Test Manual, Suggest, and Bounded Auto modes. The likely default is Suggest, but spectator users may prefer more autonomy.

### Does the professor feel useful or gimmicky?

Measure whether users ask evidence-specific questions and whether answers change decisions. If not, make the professor a direct evidence-analysis tool with less character staging.

### How many signal cards are manageable?

Start with a visible rail cap of five active cards and a compressed stack. Test before increasing density.

### Should the player see agent private notes?

The recommendation is no hidden reasoning, only structured working notes and public rationale. Test whether a task-state inspector supplies enough transparency.

### Should time pressure exist?

Avoid artificial timers in the first slice. Later historical challenges can use limited mission budgets for game tension.

## 13.4 Technical spikes

Before full implementation, run five short spikes.

### Spike 1: Codex structured turn

Invoke a local Codex session with the agent-turn JSON Schema. Verify output compliance, session resume, timeout behavior, and event streaming.

### Spike 2: Pref capability discovery

Connect to Pref MCP, list primitives, call one safe tool, normalize the response, and record provenance.

### Spike 3: Phaser/React bridge

Render an agent in Phaser, select it from a React dock, move it to a waypoint, and emit an arrival event back to React.

### Spike 4: Deterministic replay

Run a scripted expedition, persist events, reload from sequence zero, and verify the same projection hash.

### Spike 5: Accessibility mirror

Make a canvas location selectable through keyboard and screen reader via mirrored DOM controls.

Each spike should be small enough to discard and clear enough to produce an architectural decision record.

## 13.5 Risks and mitigations

### Risk: The world becomes decorative

Mitigation: every place has a clear information affordance, and every mission visibly uses location context.

### Risk: Agent latency kills pacing

Mitigation: asynchronous turns, ambient world activity, honest status, small concurrency pool, fixture fallback, and short post-result choreography.

### Risk: Evidence cards become unreadable

Mitigation: progressive disclosure, active-card cap, archive offloading, strong hierarchy, and dedicated Analyst Mode.

### Risk: Model output invents facts

Mitigation: source-ID grounding, schema validation, world validation, read-only tools, and explicit unknowns.

### Risk: Pref payloads vary too much

Mitigation: capability map, canonical source model, contract tests, and fixture snapshots.

### Risk: Pixel art delays development

Mitigation: prototype with original CSS/SVG and color-blocked sprites; lock composition before final asset production.

### Risk: Users mistake forecasts for trades

Mitigation: simulation-first language, no order controls, clear status labels, and onboarding confirmation.

### Risk: Too many agents create noise

Mitigation: three agents in MVP, one primary event at a time, concise dialogue, and agent dock prioritization.

## 13.6 Decision log template

Use this template in `docs/adr/`:

```md
# ADR-XXX: Decision title

## Status
Proposed | Accepted | Superseded

## Context
What problem are we solving?

## Decision
What will we do?

## Consequences
What becomes easier or harder?

## Alternatives considered
What did we reject and why?

## Validation
How will we know the decision is correct?
```

## 13.7 Recommended immediate next step

Build the visual vertical slice entirely in fixture mode while simultaneously running the Codex structured-output and Pref discovery spikes. The interface and contracts can converge in parallel without making the visual experience dependent on live integrations.
