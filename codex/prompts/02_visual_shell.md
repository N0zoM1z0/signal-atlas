Build the Signal Atlas visual-shell milestone.

Read:
- AGENTS.md
- docs/06_ui_ux_specification.md
- docs/07_art_audio_motion_direction.md
- design-tokens.json
- prototype/index.html
- prototype/styles.css
- previews/world-view.png
- the P1 tasks in docs/CODEX_KICKOFF_TASKBOOK.md

Complete in order:
- P1-001 Main application frame
- P1-002 Phaser world scene
- P1-003 Agent dock and sprites

Visual target:
- a cozy night-time editorial pixel diorama;
- top market ribbon, left agent dock, central world, right signal rail, bottom command tray;
- warm windows against cool navy world colors;
- clear six-location map and three visually distinct agents;
- modern readable UI around crisp integer-scaled pixel art;
- no generic admin-dashboard appearance.

Use original placeholder assets only. Do not import third-party game art. CSS/SVG shapes and programmatic placeholder sprites are acceptable.

Requirements:
- semantic DOM mirrors for places and agents;
- keyboard selection and visible focus;
- reduced-motion behavior;
- screenshot tests at 1440x900 and 1280x800;
- no backend model or MCP dependency;
- fixture snapshot drives labels and agent state.

Create a worklog per task, implement narrowly, and run visual plus accessibility checks. Inspect every generated screenshot before claiming completion.

Finish with paths to the World View screenshots and a list of visual differences from the supplied prototype that are intentional.
