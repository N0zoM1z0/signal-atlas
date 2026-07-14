Perform the final Signal Atlas vertical-slice review and polish pass. Do not add new product scope.

Read:
- AGENTS.md
- codex/DEFINITION_OF_DONE.md or docs/DEFINITION_OF_DONE.md
- docs/06_ui_ux_specification.md
- docs/07_art_audio_motion_direction.md
- docs/11_trust_safety_accessibility.md
- P6-003 in the taskbook

Review the product as four specialists, preferably using independent subagents for read-only review:
1. Product/gameplay comprehension reviewer.
2. Visual/UI quality reviewer.
3. Provenance/security reviewer.
4. Accessibility/resilience reviewer.

Have each reviewer return a prioritized issue list with file paths or reproduction steps. Merge duplicates, then fix only issues required for the vertical-slice definition of done.

Required final checks:
- fresh-clone setup instructions;
- pnpm install and dev startup;
- typecheck, lint, unit, integration, build, e2e, and visual tests;
- 1440x900 and 1280x800 screenshot inspection;
- full offline required journey;
- one local Codex mission, or a clearly documented skip if runtime is unavailable;
- one live Pref mission, or a clearly documented skip if owner configuration is unavailable;
- deterministic replay hash;
- keyboard-only journey;
- reduced-motion mode;
- Codex and Pref outage recovery;
- no secret in repository or logs;
- no real-money trading path;
- no third-party unlicensed art.

Produce:
- FINAL_REPORT.md with exact commands/results;
- a short demo script;
- known limitations and next-phase recommendations;
- final screenshot paths;
- confirmation that the vertical slice meets or does not meet each definition-of-done item.

Be explicit about anything not validated. Do not claim success based only on code inspection.
