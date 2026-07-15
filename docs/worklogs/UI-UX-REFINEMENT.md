# UI-UX-REFINEMENT - User-centered interface refinement

## Status

Complete on `feat/ui-ux-refinement`.

## Goal

Evaluate Signal Atlas as a first-time observer, an active forecaster, a research operator, and a
keyboard/zoom user; then improve the existing five-part world shell so its next action, research
state, provenance, and forecast meaning are immediately understandable without weakening the
pixel-world presentation or exposing implementation detail as the main experience.

This is a usability and presentation milestone. It does not change event authority, market
semantics, Pref/Codex policy, persistence, or scenario choreography.

## Audit protocol

- Review the Lobby and all three worlds at the 1440 x 900 reference viewport and 1280 x 800.
- Test the 720 x 450 CSS viewport as the documented 200 percent reflow equivalent.
- Simulate the first-session sequence: choose a world, identify the market and team, dispatch an
  agent, inspect a source-linked signal, use Archive and Professor, commit a simulated forecast,
  and inspect Replay.
- Run three independent read-only reviews: first-time comprehension, active research workflow,
  and accessibility/responsive usability.
- Prefer observed task friction over speculative redesign. Preserve strong existing behavior.
- Re-run the same journeys after each coherent milestone and capture reviewed 1440 x 900 states.

## Consolidated audit decisions

Three independent read-only reviews covered first-time comprehension, the complete active-research
journey, and keyboard/zoom/forced-color behavior. The main review also inspected every maintained
workspace and reproduced layout measurements with headless Playwright.

### Fix in this milestone

1. Move each Lobby Create/Continue action above the fold and replace developer-facing workspace
   summary language with useful saved-progress language.
2. Replace the five-column, 10-pixel onboarding wall with one prominent current step, durable
   progress, and one contextual action.
3. Let authored suggestions prepare an explicit local draft immediately; reserve language parsing
   for natural-language input, keep confirmation authoritative, focus the one missing field, and
   move fixture failure injection behind an explicit debug query.
4. Make the empty evidence rail explain and launch the first research action rather than consuming
   a quarter of the viewport with a dead end.
5. Correct market/agent accessible names, retain compact public/team/deadline/source status at the
   narrow breakpoint, remove toolbar overlap, restore Lobby/world route focus, and enlarge
   task-critical text and runtime hit targets.
6. Make Archive and Replay genuinely scrollable at the 720 x 450 reflow target. Their current
   result/event regions collapse to zero height inside clipped parents even though the outer page
   has no overflow.
7. Keep Replay temporally coherent by replacing the live shell chrome with the selected replay
   projection and read-only replay status while scrubbing.
8. Correct the pre-exchange Meeting table from “signals in common” to evidence queued to share,
   including explicit pre-meeting holders.
9. Include a selected signal's linked sources in Professor consultations by default and restore
   persisted consultations through an inspectable history.
10. Keep the Forecast draft delta anchored to the prior forecast and disable duplicate submission
    until the player changes the draft.
11. Collapse source hashes, provider call IDs, and transport receipts under a technical disclosure
    while keeping publisher, time, relevance, caveats, and linked claims primary.

### Preserve

- Five-second market comprehension, the five-part world composition, honest simulated-forecast
  language, complete source linkage, internal dialog/workspace focus restoration, reduced motion,
  forced-color borders, and the unusually strong semantic canvas mirror already work well.

### Defer as separate boundaries

- Scenario-art expansion for a still stronger Northlight harbor silhouette belongs to a world-art
  milestone, not a shell usability patch.
- Per-scenario live-versus-fixture capability counts need a new public diagnostics projection;
  this milestone will say “sources connected” instead of over-promising that every Pref mapping is
  ready, but will not infer unavailable capability truth in the browser.
- Rich Replay filters and additional archive-generated turning-point classes require a separate
  case-file contract/indexing change. The immediate replay fix prevents temporal mixing without
  widening that contract.
- A stage-specific retry/narrow-query recovery surface for live Pref/Codex timeouts requires
  runtime failure metadata that the current UI projection does not expose. Existing explicit Retry
  remains available; the richer recovery model is recorded as follow-up rather than guessed.

## Intended files

The exact set will narrow after the independent audits. Expected changes are limited to:

- `apps/web/src/ExpeditionLobby.tsx` and `apps/web/src/styles.css` for world-selection hierarchy,
  visible continuation actions, typography, and responsive presentation;
- `apps/web/src/world-shell/MarketRibbon.tsx`, `OnboardingGuide.tsx`, `AgentDock.tsx`,
  `CommandTray.tsx`, and `SignalRail.tsx` for first-glance comprehension, next-action guidance,
  mission confirmation, runtime/source language, and useful empty states;
- the Archive, Professor, Meeting, Forecast, Replay, and Source Inspector workspaces only where
  the audit demonstrates a concrete readability, navigation, or disclosure problem;
- focused React/Vitest and Playwright tests for changed behavior, keyboard focus, reflow, and
  viewport visibility;
- reviewed files in `tests/visual` when intentional UI changes alter the maintained reference
  states;
- this worklog and user-facing documentation if interaction behavior changes.

No contract, reducer, persistence, Pref provider, Codex driver, credential, database, telemetry,
hosted authentication, or real-trading path is in scope.

## Acceptance criteria

### First-glance comprehension

- A first-time user can identify the market question and public/team probabilities within five
  seconds at 1440 x 900.
- The selected agent, its location/state, and the recommended next action are visually distinct
  within ten seconds without reading developer diagnostics.
- The world remains the largest continuous visual area and the existing five-part layout remains
  recognizable.
- Fixture/live source truth remains honest but does not compete with the market or next action.

### Mission flow

- A suggested or natural-language command produces a mission draft whose agent, destination,
  action, objective, validation feedback, and primary confirmation are visible together at the
  reference viewport.
- Ambiguous interpretation explains the one missing choice in plain language and moves focus to
  that choice; a valid draft has an unmistakable primary action.
- The mission queue remains available without forcing a first-time user to understand
  append-only/event-log terminology.
- Loading, no-result, error, queued, traveling, and completed states use user-facing language and
  preserve honest boundaries.

### Evidence and synthesis

- An empty signal rail tells the user how to obtain the first signal and offers a relevant action.
- Signal direction, freshness, reliability, source count, correlation state, and inspect action
  remain available without color-only meaning.
- Signal-to-source provenance remains reachable in no more than two interactions.
- Archive, Professor, Meeting, Forecast Commit, Source Inspector, and Replay preserve their full
  evidence semantics while prioritizing the task and primary action over internal identifiers.

### Lobby and long-lived workspace

- Every scenario card exposes its primary Create/Continue action without requiring the user to
  scan technical capability metadata first at 1440 x 900.
- Saved expedition progress is described as useful workspace state rather than only a durable
  sequence cursor.
- World switching, deep links, and expedition-scoped browser preferences remain unchanged.

### Accessibility and responsiveness

- The complete required journey remains keyboard possible with visible focus and correct modal or
  workspace focus restoration.
- At 720 x 450, core controls reflow without page overflow, closed drawers leave the focus order,
  and mission confirmation remains usable.
- Reduced motion and forced colors remain supported.
- Automated WCAG A/AA scanning reports no new serious or critical violations.
- Essential canvas places, agents, routes, and actions remain represented in semantic DOM.

### Validation and boundaries

- Focused component and browser journeys pass after each milestone.
- Repository format, typecheck, lint, unit/integration tests, build, E2E, and visual suites pass at
  completion, or any unrun required gate is reported explicitly.
- Fixture mode remains complete without Pref or Codex.
- No real-money trading, order, wallet, relayer, or write-capable Pref path is added.

## Initial observed risks

- The current 1440 x 900 Mission draft can place its confirmation controls at the visible tray
  boundary while leaving an unresolved action selector, making the primary dispatch journey easy
  to abandon.
- Many secondary labels use 8-10 pixel text. Raising every label indiscriminately would crowd the
  world and could worsen hierarchy, so the work will first enlarge task-critical copy and reduce
  redundant labels.
- Visual changes affect a broad screenshot surface. Baselines will be refreshed only after manual
  review confirms intentional hierarchy changes and no canvas/layout regression.
- Persistent demo state is not a deterministic usability baseline. Formal browser acceptance will
  use the existing isolated fixture profile; the live local workspace is used only for an
  additional realistic review.

## Planned commit boundaries

1. Record the audit and fix Lobby/market/first-session hierarchy.
2. Make mission drafting and empty evidence states self-explanatory and viewport-safe.
3. Improve research workspace readability and progressive disclosure where validated by the audit.
4. Add or align browser coverage and refresh only reviewed visual baselines.
5. Close the worklog with the full validation and remaining follow-ups.

Each milestone uses an English subject and a detailed English body. Unrelated local files remain
unstaged.

## Progress checkpoints

### Guided research dispatch

- Replaced the multi-action onboarding strip with one current step, durable evidence inspection
  progress, and one contextual action while retaining an accessible five-step summary.
- Authored place suggestions now prepare a complete local mission draft with explicit agent,
  destination, and supported verb. They do not append an event until the user confirms the route.
- A valid draft focuses its scenario-specific Send action; an incomplete natural-language draft
  focuses its first missing field without interrupting objective editing.
- The empty signal rail now explains how evidence arrives and offers a first-mission action.
- Fixture outcome injection is absent from the normal product and remains available at
  `?debug=1` for boundary tests.
- Reviewed screenshots: `/tmp/helios-1440-guide.png`, `/tmp/helios-1440-mission.png`,
  `/tmp/northlight-720-guide.png`, and `/tmp/northlight-720-mission.png`. The world remains the
  dominant reference-view surface; the compact mission sheet fits the full 720 x 450 viewport.
- Validation: web typecheck passed; 12 web test files / 29 tests passed; the focused 720 x 450
  Playwright authored-guidance test passed. Full repository gates remain for completion.

### Responsive archive and coherent replay

- Archive and Replay now own their scroll containers at 720 x 450 instead of placing zero-height
  result bodies inside the shell's clipped world row. Search results, selected records, sequence
  controls, replay projection, and forecast path remain keyboard reachable.
- Replay replaces live sidebars and the command tray with a full-width case-file surface. Its
  market ribbon is rebuilt from the selected historical projection, identifies the selected
  sequence, and disables forecast/simulation controls as read-only.
- Specialized Source Inspector, Forecast, and Runtime dialogs now size against the dialog layer's
  content box at compact widths rather than adding viewport-derived width to the layer padding.
- Reviewed screenshots: `/tmp/archive-720.png`, `/tmp/replay-720.png`, and
  `/tmp/replay-1440.png`. Measured Archive scroll height is 656 px in a 290 px viewport with a
  315 px record body; Replay scroll height is 1,174 px in a 378 px viewport with a 797 px body.
- Validation: web typecheck passed; 12 web test files / 29 tests passed; three focused Replay and
  Archive Playwright journeys covering reflow and historical scrubbing exited successfully. Full
  repository gates remain for completion.

### Evidence-synthesis truth and progressive disclosure

- Meeting cards are labeled as evidence queued to share before the exchange event, name the actual
  pre-meeting holder, and change to “now shared” only after the authoritative meeting exchange.
- Forecast drafts retain the baseline from the current open session, so the displayed revision
  remains anchored after projection refresh. A successful draft signature cannot be submitted
  twice until the operator changes the probability, evidence, rationale, memo, or uncertainty.
- Professor consultations automatically include sources linked by the initially selected signals.
  Completed query/response pairs in the projection appear as local consultation history and can
  restore the exact mode, question, selection, and bounded answer after the workspace is reopened.
- Source Inspector and Archive keep publisher, time, source class, relevance, and caveats primary;
  hashes, call IDs, gateway receipts, and transport identifiers remain available under explicit
  technical disclosures. Archive result rows also expose publisher, class, and version to
  disambiguate similarly titled records.
- Validation: web typecheck passed; 12 web test files / 29 tests passed; focused ESLint passed for
  all five changed workspaces; four non-visual Playwright journeys for Meeting, Forecast,
  Professor, and Source Inspector exited successfully. Full repository gates remain for
  completion.

### Final simulated-user regression

- Repeated the first-time, active-research, and keyboard/responsive journeys after integration.
  Lobby entry, authored mission drafting, Archive and Replay at 200 percent reflow, Forecast
  revision and duplicate prevention, Meeting exchange language, Professor history, and Source
  Inspector disclosure all remained understandable and reachable.
- The final review found two stale boundaries: the authored Professor fixture displayed four
  selected records but cited only its two authored signals, and a desktop collapse test still ran
  at the new 1280 px drawer boundary. The fixture now cites only explicitly selected sources linked
  to its authored signals, and the default reference browser runs at 1440 x 900 while explicit
  responsive tests continue to own 1280, 1024, 720, and zoom behavior.
- Manually reviewed all changed visual states before accepting baselines: Lobby, the three authored
  worlds, Archive, Meeting, Professor, Forecast Commit, Replay, Source Inspector, and the 1280 px
  drawer layout. The world remains the dominant surface, primary actions are visible, and no new
  clipping or overflow was accepted.

## Completion validation

- `pnpm format:check` - passed; all matched files use Prettier style.
- `pnpm typecheck` - passed across all 11 workspace projects.
- `pnpm lint` - passed with zero warnings.
- `pnpm test` - passed; 57 test files and 308 tests.
- `pnpm build` - passed; 24 schemas generated and both applications built. Vite retained its
  existing advisory for chunks larger than 500 kB.
- `pnpm test:e2e` - passed; 36 non-visual browser journeys in 3.7 minutes.
- `pnpm test:visual` - passed independently after the reviewed baseline update; 12 visual journeys
  in 1.2 minutes.
- The long-running `@soak` profile was not run; it is excluded from the standard complete E2E gate
  and this milestone did not change scheduler or stream longevity behavior.

Reviewed reference images are stored in `tests/visual`, including
`expedition-lobby-1440x900.png`, `world-shell-1440x900.png`, `world-shell-1280x800.png`,
`archive-quarter-1440x900.png`, `lantern-square-meeting-1440x900.png`,
`professor-study-1440x900.png`, `forecast-commit-1440x900.png`,
`case-file-replay-1440x900.png`, and `signal-source-inspector-1440x900.png`.

Fixture mode remains complete without Pref or Codex. No real-money trading, order placement,
wallet, relayer, hosted authentication, telemetry, or write-capable Pref path was added.
