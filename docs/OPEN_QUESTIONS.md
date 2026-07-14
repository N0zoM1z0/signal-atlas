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

- **Status:** Open; resolve during P0-003 contract synchronization.
- **Conflict:** Product specifications define Explain, Challenge, Compare, Base rate, Missing evidence, Correlation check, and Forecast impact. `professor-response.schema.json` currently permits only four of these modes.
- **Proposed direction:** Extend the implementation contract to all seven specified modes while keeping the supplied correlation fixture valid.

## OQ-004: Runtime event vocabulary

- **Status:** Open; resolve during P0-003/P0-004.
- **Conflict:** Architecture examples mention `pref.source.retrieved` and `runtime.turn.failed`; the detailed event catalog uses `source.recorded` and `agent.turn.failed`.
- **Proposed direction:** Treat the detailed catalog in `docs/10_data_models_and_events.md` as canonical and document aliases only at infrastructure boundaries.

## OQ-005: Agent action vocabulary versus mission vocabulary

- **Status:** Open; resolve during P0-003.
- **Conflict:** The agent behavior document lists direct actions such as `query_archive`, `consult_professor`, and `meet_agent`; the supplied agent-turn schema represents these mainly through `request_mission` plus a mission verb.
- **Proposed direction:** Keep the narrow agent-turn action union and express location workflows as validated missions, unless a concrete runtime flow proves a dedicated action necessary.

## Owner decisions that do not block the offline vertical slice

- Initial audience priority and distribution target.
- Final pixel-art production method.
- Optional read-only market-price provider.
- Pref capability selection and content-retention policy after live discovery.
