# 03. World and Location System

## 3.1 World model

A market world is a semantic map, not a literal atlas. It compresses the places, institutions, actors, and information channels that matter to the question into a navigable two-dimensional space.

Each world contains:

- one central observatory;
- three to eight evidence locations;
- one social location;
- one archive or institutional memory location;
- optional transient locations created by events;
- roads, transit lines, or paths that make movement readable;
- environmental layers such as time of day and weather;
- a world state derived from the market and event log.

## 3.2 Location archetypes

### Observatory

The home base and market overview. It displays the question, outcomes, resolution criteria, forecast history, and mission board. It is the player's first and last stop.

### Newsroom

Provides recent reporting, official announcements, public statements, and local context. It favors fresh information but may surface derivative or duplicated reporting.

### Weather Tower

Provides local weather observations, warnings, and forecasts. It visually reflects current conditions and is ideal for location-bound markets.

### Exchange or Ledger Hall

Provides prices, economic indicators, market-sensitive data, and structured numeric feeds. It should visually feel analytical rather than financial-casino-like.

### Archive Quarter

Stores source records, prior case files, historical analogues, agent memos, and snapshots. It supports search, filtering, provenance tracing, and replay.

### Scholar's Hill

Contains the professor consultation scene. It is a place for synthesis, base-rate reasoning, assumption checks, and explanation.

### Town Square

A social hub where agents meet, trade signals, and debate. A notice board shows unresolved questions and proposed missions.

### Field Site

A temporary or market-specific place such as a port, parliament, factory, stadium, court, laboratory, or launch pad. Field sites make each market world feel distinct.

## 3.3 Topic-to-world templates

The world generator should begin with authored templates rather than fully generative maps.

### Politics and policy

Capital Hall, Polling Bureau, Local Newsroom, Court, Archive, Town Square, Scholar's Hill.

### Weather and climate

Weather Tower, Port, Farm District, Emergency Center, Satellite Station, Archive, Observatory.

### Economics

Central Bank, Exchange, Port, Factory District, Statistics Office, Newsroom, Archive.

### Technology and product launches

Research Lab, Factory, Developer Conference, Patent Office, Supplier Port, Newsroom, Archive.

### Sports and culture

Stadium, Training Ground, Press Box, Fan District, Medical Center, Archive, Town Square.

### Science and space

Launch Site, Mission Control, Weather Tower, Tracking Station, Contractor District, Archive, Observatory.

The generator selects a template, replaces one or two locations with market-specific sites, and assigns information affordances.

## 3.4 Map grammar

Maps should remain small enough to understand at a glance. The recommended first world uses a 48 x 30 logical tile grid, rendered at a 2x or 3x pixel scale.

The layout follows a simple grammar:

- Observatory near the visual center-left;
- freshest-source locations toward the right/top, suggesting outward investigation;
- Archive lower-left, visually stable and warm;
- Scholar's Hill elevated or separated by a bridge;
- Town Square near the center for easy meetings;
- one scenic landmark that identifies the expedition;
- two or three route choices, but no maze-like navigation.

The player should understand routes without a minimap in the first slice.

## 3.5 Movement

Movement is grid- or waypoint-based. Agents follow authored paths between location entrances. A pathfinding system may be added later, but a waypoint graph is more predictable for the vertical slice.

Each route has:

- travel duration;
- visual path;
- ambient events;
- optional transit type;
- interruption policy;
- camera framing hints.

Travel duration should usually be 4-12 seconds. The player can speed up or instantly skip after seeing the route once. The game should not waste the player's time to simulate distance.

## 3.6 Environmental state

The world reflects relevant live or fixture data through restrained environmental changes.

Examples:

- rain intensity near a weather-sensitive location;
- flags or crowds near a government site;
- factory lights indicating operating state;
- a newsroom ticker changing when a source arrives;
- clouds crossing the map as a weather front;
- harbor activity changing with logistics signals;
- the sky gradient shifting as the market horizon approaches.

Environmental state is always decorative or explanatory; it must not imply facts that are absent from source data.

## 3.7 Fog of uncertainty

Use fog as a metaphor for unanswered questions, not as a literal restriction on all information.

A location can have one of four states:

- **Known:** its affordances are visible.
- **Unvisited:** visible but softly desaturated.
- **Active:** an agent or new event is present.
- **Unresolved:** a question badge shows missing evidence.

The map should never conceal resolution rules, market prices, or already-retrieved sources.

## 3.8 Dynamic world events

World events make the map feel alive. Examples include:

- a breaking bulletin appears at the newsroom;
- weather changes at the tower;
- a new shelf opens in the archive;
- an agent requests a meeting;
- a route becomes slower due to an event;
- the professor posts a new question on the chalkboard;
- an evidence location gains or loses relevance;
- a contradiction marker appears between two buildings.

Events come from the deterministic simulation, live Pref data, or player action. Every event is appended to the event log.

## 3.9 World generation pipeline

The recommended pipeline is semi-authored:

1. Parse the market into subject, predicate, outcomes, entities, time horizon, resolution source, and location relevance.
2. Select a topic template.
3. Rank potential place archetypes by evidence value.
4. Choose five to eight locations.
5. Assign each location a visual kit and allowed mission verbs.
6. Build a waypoint graph using an authored layout pattern.
7. Attach Pref capability mappings.
8. Generate unresolved-question badges.
9. Run a validation pass for route connectivity, information coverage, and duplicate functions.
10. Let a human or authoring tool make final visual adjustments.

Fully generative tilemaps are not recommended for the MVP because visual composition is central to the product.

## 3.10 First vertical-slice world

### Market

"Will the Helios-3 mission launch before September 30?"

### Locations

- **Meridian Observatory:** market overview and forecast dial.
- **Galehaven Weather Tower:** local wind, storms, and launch-window conditions.
- **Ledger Bay Newsroom:** operational notices, contractor statements, and recent reports.
- **Archive Quarter:** historical launch delays and prior mission case files.
- **Scholar's Hill:** professor consultation and correlation checks.
- **Lantern Square:** agent meetings and shared mission board.

### Visual landmark

A distant launch vehicle is visible on the horizon. Its gantry lights change subtly as operational signals arrive. This is mood and state visualization, not a direct claim that launch readiness is confirmed.

## 3.11 Authoring tools after MVP

A world editor should eventually allow a designer to:

- place locations and route nodes;
- assign building archetypes;
- bind Pref capabilities;
- set camera zones;
- preview weather and day/night states;
- define ambient event pools;
- validate route connectivity;
- export a versioned world manifest.

The editor can begin as JSON plus a simple debug overlay before becoming a polished visual tool.
