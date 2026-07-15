# 06. UI and UX Specification

## 6.1 Design objective

The interface must make a complex multi-agent research process feel inviting at first glance and rigorous on inspection. The player should experience a world first, then discover that every charming element is attached to a precise information model.

The target visual density is comparable to a polished management game, not a professional trading terminal. Information-heavy panels are progressive overlays that appear only when requested.

## 6.2 Primary desktop layout

The reference canvas is 1440 x 900 in a 16:10 ratio. The experience remains usable down to 1180 x 720. The game world occupies the largest continuous area.

### Top market ribbon: 72 pixels

Contains:

- Signal Atlas mark and expedition name;
- market question, truncated to two lines at most;
- public market probability;
- team forecast and player forecast;
- time to resolution;
- pause and speed controls;
- mode switch: Director or Observatory;
- connection and data-freshness status.

The probability display is a horizontal worldline ribbon rather than a stock-style chart. YES and NO occupy opposite ends; a glowing marker shows current values.

### Left agent dock: 216 pixels, collapsible

Contains agent portrait cards with:

- name and role;
- current location;
- active mission;
- compact progress bar;
- knowledge/new-signal badge;
- current forecast;
- error or attention state.

Selecting an agent opens a focused command card over the world rather than navigating to a new page.

### Central world stage: flexible

Contains the Phaser-rendered map, sprites, location labels, weather, route lines, event callouts, and contextual action menus. Camera motion is slow and intentional. The world stage receives roughly 60-65% of the width at the reference size.

### Right signal rail: 320 pixels, collapsible

Contains the newest and most relevant signal cards. The rail supports tabs:

- New
- Pinned
- Disputed
- All

The top card may be expanded in place. Older cards compress into a compact stack.

### Bottom command tray: 88 pixels, expandable to 260

Contains:

- natural-language command field;
- selected agent chip;
- destination chip;
- suggested action buttons;
- microphone placeholder if voice is added later;
- keyboard shortcut hints;
- mission queue preview.

The tray behaves like an in-world dispatch desk, not a generic chatbot composer.

## 6.3 World-stage interaction

### Hover or focus

A location receives a thin outline, nameplate, current data freshness, and available mission verbs. An agent receives a portrait tooltip with mission and forecast.

### Click or activate

Clicking a location opens a compact action wheel:

- Send selected agent
- Inspect location
- View local signals
- Ask who is here

Clicking an agent opens:

- Current mission
- Known key signals
- Forecast
- Give command
- Follow camera
- Meet with...

### Drag

A selected agent portrait may be dragged onto a location to create a mission draft. The game never immediately executes an ambiguous drag; the player confirms the mission verb.

### Camera

- mouse wheel or trackpad zoom with bounded levels;
- middle-drag or space-drag pan;
- double-click a location to center;
- `F` follows selected agent;
- `Home` returns to Observatory;
- event camera never takes control for more than two seconds without user preference.

## 6.4 Visual hierarchy

The world is the visual anchor. UI panels use lower saturation and flatter lighting so they do not overpower the map.

Hierarchy rules:

1. Critical market changes and errors.
2. New signals and completed missions.
3. Active agents and destinations.
4. Ambient world details.
5. Historical and secondary information.

Only one element should pulse strongly at a time. Avoid simultaneous notification badges, shaking cards, and camera movement.

## 6.5 Screen map

### A. Expedition Lobby

Purpose: choose or create a market world.

Key elements:

- featured expedition card;
- recent and unresolved markets;
- live, historical challenge, and fictional sandbox filters;
- small animated diorama preview;
- source-connection status;
- "Enter Atlas" primary action.

The implemented local Lobby is available at `/lobby` and from the ribbon's Signal Atlas mark. It
lists safe installed-scenario metadata and any matching durable expedition cursor/status, then
creates through an idempotent command or opens a stable `?expedition=<id>` deep link. Only one world
shell is mounted at a time; returning to the Lobby tears down its WebSocket and canvas. Evidence and
travel preferences use expedition-scoped browser keys. Market filters remain a later catalog-size
enhancement rather than empty controls in the single-world shelf.

### B. World View

Purpose: observe, command, inspect signals, and update forecasts.

This is the main screen described above.

### C. Archive

Purpose: search and compare sources, signals, memos, and prior cases.

The archive opens as a full-stage scene while the top market ribbon remains. A breadcrumb returns to the world. The player can keep the command tray minimized.

### D. Professor's Study

Purpose: ask a bounded question using selected evidence. The scene includes the professor, chalkboard, evidence table, response panel, and mode selector.

### E. Lantern Square Meeting

Purpose: show an agent debate. Agent portraits sit around a table. The center contains shared signal cards. A side strip shows forecast movement and disagreement type.

### F. Forecast Commit

Purpose: set probability, uncertainty range, rationale, and linked evidence. This appears as a centered modal with the world visible behind it.

### G. Resolution and Replay

Purpose: reveal outcome, score forecast path, identify turning points, and open replay. The world changes visually to a resolved state without celebratory gambling effects.

### H. Settings and Connections

Purpose: configure Pref MCP, Codex runtime, autonomy, source display, accessibility, data retention, and local paths.

## 6.6 Signal-card specification

Reference card size in the rail: 288 x 148 pixels.

### Header row

- direction icon;
- headline;
- age.

### Body

- two-line claim summary;
- compact source class and location;
- impact indicator;
- discoverer portrait.

### Footer

- reliability badge;
- source count;
- "known by" mini portraits;
- pin and inspect actions.

Direction should never rely on color alone. Use icon and text labels:

- Up arrow + "YES support"
- Down arrow + "NO support"
- Split diamond + "Context"
- Knot + "Correlated"
- Warning triangle + "Disputed"

## 6.7 Forecast commit dialog

The dialog has four zones:

1. **Probability dial:** large numeric input and draggable 0-100 rail.
2. **Comparison:** public market, team, previous player value.
3. **Evidence:** selected signal chips with remove/reorder controls.
4. **Rationale:** 280-character public note plus an optional longer private memo.

The confirmation button reads "Commit 51%" rather than "Buy" or "Bet." The game shows the scoring rule in a help tooltip.

## 6.8 Command tray behavior

The command tray supports three levels of input.

### Suggested commands

Contextual buttons such as:

- Check latest weather
- Search historical delays
- Find contradictory source
- Call a meeting
- Ask Professor Vale

### Structured command builder

Agent + verb + destination + objective + budget.

### Natural language

The player types a sentence. The system parses it into the structured builder and highlights assumptions. Execution requires confirmation only when the target, scope, or external effect is ambiguous.

Command history can be reopened with the up arrow. `/` focuses the command field.

## 6.9 Onboarding

The first session uses a five-step guided expedition, never a blocking tutorial page.

1. Select Mira.
2. Send her to Galehaven Weather Tower.
3. Open the returned signal card.
4. Ask Orin to search the archive.
5. Commit a revised forecast using both signals.

Tutorial guidance appears as small lantern markers in the world. Players can skip immediately.

## 6.10 Empty, loading, and error states

### Loading

Agents visibly work: a notebook animation, moving typewriter, radio pulse, or reading loop. The UI shows the mission objective and elapsed time. Avoid fake progress percentages for model calls.

### No useful result

The agent returns with a gray "No actionable signal" note explaining the search scope and suggesting one next query.

### MCP disconnected

The world enters fixture or archive-only mode. A small cable icon appears in the ribbon. Existing sources remain available.

### Codex unavailable

Manual mission simulation remains usable with fixture outputs. Agent cards show "Runtime offline" and the settings screen provides diagnostics.

### Invalid model output

The agent pauses, the runtime retries once, and the event log shows a sanitized validation error. The world never applies a partial invalid action.

## 6.11 Keyboard and controller

Minimum keyboard support:

- `Tab` cycles interactive elements;
- arrow keys move within lists and action wheels;
- `Enter` activates;
- `Esc` closes overlays;
- `/` focuses command;
- `1`, `2`, `3` select agents;
- `A` opens Archive;
- `P` opens Professor;
- `M` opens meeting controls;
- `Space` pauses;
- `[` and `]` change speed;
- `F` follows agent;
- `Home` centers Observatory.

Controller support can follow after desktop usability is proven.

## 6.12 Responsive strategy

The MVP is desktop-first. For narrower widths:

- left and right rails become mutually exclusive drawers;
- the top ribbon collapses secondary values;
- the command tray becomes a full-width bottom sheet;
- the world remains at least 720 x 500 logical pixels;
- archive and professor scenes use conventional stacked panels.

A phone-sized experience should eventually be a companion observer, not a compressed full game.

## 6.13 Accessibility

- every color-coded state also has an icon and text;
- pixel fonts are used only for headings and labels, never long body text;
- minimum 16-pixel body text at reference scale;
- reduced-motion mode removes camera sweeps, card bounces, and weather flashes;
- high-contrast theme preserves the visual identity;
- subtitles and visual sound cues are always available;
- source excerpts are selectable and screen-reader accessible outside the canvas;
- the Phaser canvas mirrors essential interactive state into semantic DOM controls;
- all actions are possible without drag-and-drop.

## 6.14 UI acceptance criteria for the vertical slice

A first-time tester should be able to:

- identify the market question and current probabilities in five seconds;
- identify all agents and their activities in ten seconds;
- dispatch an agent in under thirty seconds;
- inspect provenance from a signal card in two interactions;
- open the archive and find a historical item in under one minute;
- ask the professor a question using selected evidence;
- commit a forecast without confusing it for a real-money trade;
- pause or skip all animation.
