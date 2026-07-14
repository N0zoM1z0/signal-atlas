# Open Questions

This log records design-package ambiguities that must be resolved without silently changing product direction.

## OQ-001: Canonical social-location name

- **Status:** Resolved for implementation baseline.
- **Conflict:** `EXECUTIVE_SUMMARY.md` says "Signal Square" once; the fixture, taskbook, prototype, and modular specifications use "Lantern Square."
- **Implementation decision:** Use **Lantern Square** and the stable place ID `square`.
- **Reason:** This is the overwhelmingly consistent canonical name across executable references.

## OQ-002: Fixture content count versus MVP content target

- **Status:** Clarified by the package validation report.
- **Conflict:** The experience specification targets twelve fixture sources and ten signal cards, while the supplied deterministic fixture contains six sources and three signals.
- **Implementation decision:** Preserve the supplied fixture exactly during P0. Expand content only in the scoped offline-content task after contracts and replay are stable.
- **Reason:** `VALIDATION_REPORT.md` explicitly identifies the smaller fixture as intentional starter data.

## OQ-003: Professor mode contract coverage

- **Status:** Resolved in P0-003.
- **Conflict:** Product specifications define Explain, Challenge, Compare, Base rate, Missing evidence, Correlation check, and Forecast impact. `professor-response.schema.json` currently permits only four of these modes.
- **Implementation decision:** The shared `ProfessorMode` contract contains all seven product modes. Professor queries require one of them; responses may repeat the mode and selected signal IDs so both the lean architecture interface and the richer supplied fixture remain valid.
- **Reason:** The complete product vocabulary is finite and safe to expose as a closed enum, while response metadata is useful but not required to ground a response because the query ID remains canonical.

## OQ-004: Runtime event vocabulary

- **Status:** Resolved for the contract baseline in P0-003; reducer behavior remains P0-004 work.
- **Conflict:** Architecture examples mention `pref.source.retrieved` and `runtime.turn.failed`; the detailed event catalog uses `source.recorded` and `agent.turn.failed`.
- **Implementation decision:** `source.recorded` and `agent.turn.failed` are canonical domain events. Infrastructure adapters translate any provider/runtime aliases before appending events. The contract also adds the explicit mission reorder/cancel/complete/fail and agent-knowledge-acquired transitions required by later taskbook flows.
- **Reason:** One closed, discriminated event vocabulary gives the reducer exhaustive handling and prevents infrastructure terminology from leaking into replay data.

## OQ-005: Agent action vocabulary versus mission vocabulary

- **Status:** Resolved in P0-003.
- **Conflict:** The agent behavior document lists direct actions such as `query_archive`, `consult_professor`, and `meet_agent`; the supplied agent-turn schema represents these mainly through `request_mission` plus a mission verb.
- **Implementation decision:** Keep the six-action agent-turn union (`wait`, `move`, `investigate`, `share_signal`, `request_mission`, and `update_belief`) and express location workflows through the ten validated mission verbs.
- **Reason:** The orchestrator owns legality and world transitions. A narrow model output surface is easier to validate, retry, and replay without losing the richer player-facing mission vocabulary.

## OQ-006: Source location semantics

- **Status:** Resolved in P0-003.
- **Ambiguity:** A source can describe conditions at one world place while an agent retrieves it from another; the starter archive record, for example, concerns weather-tower conditions even when an archivist may find it in the archive.
- **Implementation decision:** `SourceRecord.location` identifies the source's subject, observation, or geographic scope. Retrieval and possession locations belong to missions, events, and `AgentKnowledge.acquisition` edges.
- **Reason:** Separating subject location from acquisition location preserves provenance and avoids rewriting a source when agents retrieve or share it through different places.

## OQ-007: First Pref capability and credential boundary

- **Status:** Resolved in P5-002 for the first live path.
- **Ambiguity:** The original design examples named hypothetical Pref capabilities, while the hosted deployment exposes a catalog front door and requires authentication before discovery.
- **Implementation decision:** Use hosted Streamable HTTP with a server-only bearer, discover exact provider contracts through `search_tools`, execute only through `call_tool`, and allow only the read-only `weather.get_current_conditions` mapping for the first mission. Do not copy the Codex OAuth credential or automatically register an agent.
- **Reason:** The inspected weather contract is read-only, non-destructive, idempotent, and matches the Helios-3 vertical slice. The considered news-search contract currently reports an external-write side effect and therefore fails the MVP safety policy.

## Owner decisions that do not block the offline vertical slice

- Initial audience priority and distribution target.
- Final pixel-art production method.
- Optional read-only market-price provider.
- Selection and rights review for any second Pref capability after the weather path.
