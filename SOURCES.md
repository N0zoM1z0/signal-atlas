# Technical Sources

Accessed: **2026-07-14**

This file records the official primary references used to ground the implementation recommendations. The product, gameplay, visual direction, fixture data, diagrams, and prototype are original design work for Signal Atlas.

## OpenAI Codex

1. **Codex CLI reference**  
   https://developers.openai.com/codex/cli/reference  
   Used for the current command surface, including `codex exec`, `codex mcp`, and `codex mcp-server`.

2. **Codex non-interactive mode**  
   https://developers.openai.com/codex/non-interactive-mode  
   Used for the proposed scheduler-driven agent-turn path, JSONL output, session resume, and CI-style invocation.

3. **Codex as an MCP server / Agents SDK integration**  
   https://developers.openai.com/codex/mcp-server  
   Used for the optional persistent orchestration path and thread-continuation model.

4. **Model Context Protocol in Codex**  
   https://developers.openai.com/codex/mcp  
   Used for project/user MCP configuration and STDIO or streamable-HTTP connection patterns.

5. **Codex subagents**  
   https://developers.openai.com/codex/subagents  
   Consulted for the distinction between product agents and implementation-time subagents.

6. **Codex agent loop / tool boundaries**  
   https://openai.com/index/unrolling-the-codex-agent-loop/  
   Used for security notes about separately supervising external tools and MCP servers.

## Model Context Protocol

7. **MCP specification, revision 2025-11-25**  
   https://modelcontextprotocol.io/specification/2025-11-25  
   Used for the host/client/server model, JSON-RPC transport, capability negotiation, and the tools/resources/prompts primitives.

8. **MCP server tools**  
   https://modelcontextprotocol.io/specification/2025-11-25/server/tools  
   Used for tool invocation and user-control boundaries.

9. **MCP server resources**  
   https://modelcontextprotocol.io/specification/2025-11-25/server/resources  
   Used for read-oriented contextual records and source retrieval.

## Recommended application stack

10. **Phaser Tilemap API**  
    https://docs.phaser.io/api-documentation/class/tilemaps-tilemap  
    Used to verify support for orthogonal/isometric tilemaps, Tiled JSON, and runtime tile manipulation.

11. **Vite guide**  
    https://vite.dev/guide/  
    Used for the modern frontend build/dev-server recommendation.

12. **Fastify TypeScript reference**  
    https://fastify.dev/docs/latest/Reference/TypeScript/  
    Used for the typed Node orchestrator recommendation.

13. **SQLite documentation**  
    https://sqlite.org/docs.html  
    Used for the local-first event/source/belief store recommendation.

## Versioning note

All runtime integrations should be hidden behind adapters. Codex, MCP, Phaser, Vite, Fastify, and database APIs evolve. The implementation team should pin versions, record them in the repository lockfile, and rerun the contract suite before upgrading.
