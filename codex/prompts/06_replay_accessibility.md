Finish Signal Atlas replay, accessibility, and resilience.

Read P6-001 and P6-002 in docs/CODEX_KICKOFF_TASKBOOK.md, plus docs/11_trust_safety_accessibility.md.

Implement:
- market resolution fixture and scoring;
- forecast timeline and turning points;
- event-sequence scrubber and world projection at any sequence;
- jump from archive/source to the event where it entered the world;
- human-readable and machine-readable case-file export;
- complete keyboard journey;
- semantic DOM mirrors for all essential canvas actions;
- reduced-motion and high-contrast passes;
- 200% zoom support;
- Codex unavailable, Pref unavailable, invalid output, and WebSocket reconnect flows.

Validation requirements:
- replay final projection hash equals live final projection hash;
- required journey is completable without a mouse;
- no essential market, agent, signal, source, forecast, or error state is canvas-only;
- temporary service outage does not lose or corrupt events;
- reconnect requests missing events or a fresh snapshot by sequence;
- export clearly distinguishes sources, claims, signals, and rationales.

Run accessibility checks, focused manual keyboard review, unit/integration/e2e tests, and screenshot review. Document any limitation that cannot be automated.
