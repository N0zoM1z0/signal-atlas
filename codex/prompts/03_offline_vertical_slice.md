Complete the fully playable offline Signal Atlas journey using fixture and scripted drivers.

Read the P2 and P3 tasks in docs/CODEX_KICKOFF_TASKBOOK.md, plus:
- docs/02_experience_and_game_loop.md
- docs/03_world_and_location_system.md
- docs/04_agents_and_social_system.md
- docs/05_information_archive_professor.md
- docs/10_data_models_and_events.md

Implement in order:
- P2-001 Mission commands and queue
- P2-002 Travel and arrival simulation
- P2-003 Scripted fixture driver
- P3-001 Signal rail and source inspector
- P3-002 Archive Quarter
- P3-003 Meetings and knowledge transfer
- P3-004 Professor's Study
- P3-005 Forecast commit and score

Required end-to-end journey:
1. Dispatch Mira to Galehaven Weather Tower.
2. Retrieve a source-linked weather signal.
3. Dispatch Orin to Archive Quarter.
4. Retrieve a historical base-rate signal.
5. Convene Mira, Orin, and Kestrel at Lantern Square.
6. Explicitly transfer knowledge and label disagreement type.
7. Ask Professor Vale whether the two signals are independent.
8. Commit a revised simulated forecast with evidence and rationale.

Non-negotiables:
- deterministic event sequence for the same fixture seed;
- every active signal opens to a source;
- agents know only explicitly acquired objects;
- all dialogue is concise and evidence-linked;
- meetings and travel can be skipped without losing events;
- no Codex or Pref dependency;
- no trading language or control.

Add a Playwright test for the full required journey and screenshot states for World, Archive, Professor, Meeting, and Forecast Commit. Review screenshots before completion.

At the end, provide exact commands/results and a short explanation of how event replay reproduces the final state.
