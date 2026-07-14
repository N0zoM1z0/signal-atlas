# Executive Summary

## The opportunity

Prediction markets are cognitively powerful but visually flat. Most interfaces present a question, a probability chart, order-book details, and a comment stream. The user sees the price, but rarely sees a coherent world model explaining where information is coming from, which evidence is fresh, why participants disagree, or how a forecast evolved.

Signal Atlas converts that invisible research process into a visible game world.

Each market generates a small semantic geography. Places represent where useful evidence lives: a weather station for local conditions, a newsroom for recent reporting, an exchange for market-sensitive data, an archive for historical base rates, a public square for agent-to-agent exchange, and a professor's study for guided synthesis. Agents physically travel between these places. Their actions are driven by local Codex sessions and constrained to a safe, inspectable vocabulary. Pref MCP supplies the underlying information and provenance.

## Product thesis

A strong forecasting experience becomes more compelling when the interface answers five questions continuously:

- Where is each agent, and what are they doing?
- What new evidence entered the world?
- Who has seen it, and who has not?
- Why did a forecast change?
- What remains unknown?

The spatial world is not decoration. It is an interaction model for information asymmetry, research cost, specialization, collaboration, and uncertainty.

## Recommended product shape

Signal Atlas should begin as a local, simulation-first web application rather than a trading terminal. The first goal is to create an irresistible, streamable experience with strong evidence discipline. Live market prices can be displayed, but order placement should remain external and user-confirmed until the product has mature trust, permissions, and compliance boundaries.

The core screen uses a 16:10 editorial-game layout:

- a top market ribbon with question, probability, horizon, and mode;
- a left agent dock with portraits, locations, missions, and status;
- a central pixel world with weather and moving characters;
- a right signal rail containing evidence cards;
- a bottom command tray for direct orders and suggested actions.

The visual identity is "cozy intelligence": warm windows, night-sky blues, parchment evidence cards, animated weather, and tiny expressive agents, paired with crisp modern typography and rigorous provenance UI.

## Technical recommendation

Use a TypeScript monorepo:

- React and Vite for the application shell and information-heavy overlays;
- Phaser for the world scene, tilemaps, camera, animation, and input;
- a Node/Fastify orchestrator with WebSocket events;
- SQLite for local event history, sources, signals, beliefs, and replay;
- Zod/JSON Schema contracts shared across the frontend, orchestrator, and agent runtime;
- a Pref Gateway that normalizes MCP tools/resources into canonical source records;
- a Codex Runtime that either invokes `codex exec` with a final output schema or keeps persistent sessions through `codex mcp-server`.

Agents should be logical actors with persistent IDs and memory, not necessarily one permanently running operating-system process per character. A scheduler resumes a session only when an agent needs a turn. This is cheaper, easier to supervise, and more stable.

## First vertical slice

The first playable slice should use a fictional launch market: "Will the Helios-3 mission launch before September 30?" The world contains Meridian Observatory, Galehaven Weather Tower, Ledger Bay Newsroom, Archive Quarter, Scholar's Hill, and Signal Square. Three agents investigate weather, historical launch delays, and current operational notices. The player can dispatch them, inspect evidence, arrange a meeting, consult the professor, and commit a forecast.

The vertical slice is successful when a new viewer can understand the product without explanation, issue a meaningful command within one minute, see an agent retrieve a sourced signal, and explain why the team forecast changed.
