# 05. Information, Archive, and Professor

## 5.1 Information architecture

Signal Atlas uses a layered evidence model:

1. **Source record:** the retrieved material or observation.
2. **Claim:** a proposition grounded in one or more source records.
3. **Signal:** the claim interpreted for a specific market.
4. **Belief update:** a probability change linked to one or more signals.
5. **Case file:** the complete history of the expedition.

The interface must preserve these boundaries. A source is not automatically a signal, and an agent's interpretation is not automatically a fact.

## 5.2 Pref Gateway

Pref MCP is the primary information channel, but the game should not bind itself directly to unknown tool names or payload shapes. A Pref Gateway discovers available tools/resources and maps them into canonical operations.

Canonical capabilities may include:

- search sources;
- retrieve a source;
- retrieve location conditions;
- retrieve market or event data;
- list archive resources;
- run a topic-specific query;
- subscribe or poll for changes.

The exact mapping is configured per Pref deployment. The game records the original MCP server, tool name, arguments hash, response hash, and retrieval timestamp for auditability.

## 5.3 Source record fields

A source record should contain, when available:

- stable local ID;
- external URI or resource identifier;
- title;
- publisher or origin;
- author;
- publication time;
- observation time;
- retrieval time;
- relevant location;
- media type;
- content hash;
- short excerpt or structured payload;
- source class: primary, official, secondary, commentary, sensor, market, archive;
- rights or display constraints;
- Pref tool/resource provenance;
- version and supersession links.

## 5.4 Signal-card anatomy

A signal card is designed for rapid judgment without hiding nuance.

### Front

- short headline;
- supports YES, supports NO, or context-only indicator;
- estimated impact: small, medium, large, or a numeric range;
- freshness strip;
- reliability badge;
- source count;
- location badge;
- agent portrait showing discoverer;
- independence/correlation warning when relevant.

### Back or expanded view

- exact claim;
- source list;
- publication and retrieval times;
- excerpt or structured facts;
- why the agent believes it matters;
- counterarguments;
- known duplicates;
- who currently knows the signal;
- forecast updates linked to it;
- archive shelf and tags.

## 5.5 Reliability presentation

Avoid a single opaque "truth score." Use interpretable labels:

- **Verified primary:** directly from an official or primary source and validated structurally.
- **Primary, unconfirmed:** direct source but not independently checked.
- **Corroborated secondary:** multiple independent secondary sources.
- **Single secondary:** one report or analysis.
- **Derived:** computed from source data.
- **Rumor or unverified:** explicitly marked and visually muted.
- **Disputed:** credible sources conflict.

The game can compute internal ranking features, but the user-facing UI should show reasons rather than false precision.

## 5.6 Freshness and temporal validity

Every signal has a temporal window. A weather observation can become stale quickly; a historical base rate may remain useful for years. Freshness should therefore be relative to source type and market horizon.

The card's freshness strip shows:

- observed/published time;
- age;
- expected useful lifetime;
- whether a newer version exists.

Stale cards remain in the archive but fade in the active signal rail.

## 5.7 Correlation and duplicate detection

The system should detect when apparently separate signals derive from the same source or event.

Correlation warnings can come from:

- identical or near-identical source URIs;
- shared upstream publisher;
- matching content hashes;
- overlapping excerpts;
- explicit citations;
- same timestamp and event;
- agent or professor analysis.

The UI draws a thread between cards and labels the relationship: duplicate, derivative, same event, or possibly correlated.

## 5.8 Archive experience

The archive is a full-screen or large overlay scene that still feels like a place.

### Spatial metaphor

Shelves represent topics or source classes. A central table holds pinned case files. A rolling ladder moves to the selected date range. Lamps illuminate active filters. The metaphor should remain usable rather than overly literal.

### Functional layout

- left shelf index for markets, topics, locations, and source types;
- central card grid or timeline;
- right inspector for the selected source or signal;
- top search field with natural-language and structured filters;
- bottom case-file tray for selected items.

### Archive content

- raw source records;
- signal cards;
- agent mission reports;
- meeting memos;
- forecast commits;
- prior resolved markets;
- world snapshots;
- exported evidence packs.

## 5.9 Archive interactions

The player can:

- search by phrase, entity, date, place, source class, or agent;
- compare two items side by side;
- trace provenance upstream;
- pin items to the current case file;
- ask an agent to read selected items;
- ask the professor a question about selected items;
- mark an item stale, superseded, disputed, or irrelevant;
- export a cited memo;
- replay the moment an item entered the world.

## 5.10 Professor character

The professor is a diegetic interface for synthesis, not an omniscient oracle.

Working character: **Professor Vale**, a warm but rigorous scholar who writes assumptions on a chalkboard and frequently answers with a question. Vale has access only to the selected items, allowed archive scope, and clearly identified general reasoning tools.

The professor's job is to help the user:

- explain a source or claim;
- compare evidence;
- identify missing assumptions;
- estimate a base rate;
- test independence;
- generate counterarguments;
- propose the next best research question;
- summarize a case file;
- explain a forecast update.

## 5.11 Professor interaction model

The player selects zero or more evidence items, chooses a mode, and enters a question.

Modes:

- Explain
- Challenge
- Compare
- Base rate
- Missing evidence
- Correlation check
- Forecast impact

The response has four visible sections:

1. **Answer:** concise direct response.
2. **Evidence used:** linked signal/source chips.
3. **Assumptions:** explicit and editable.
4. **Next question:** one suggested investigation.

The professor must say when the selected evidence is insufficient.

## 5.12 Professor scene design

The scene is a cozy study on Scholar's Hill. The professor stands near a chalkboard. Selected evidence cards appear as physical notes on a table. As the response arrives, the chalkboard animates a simple structure: facts, assumptions, inference, uncertainty.

The player can expand the response into a conventional reading panel. The scene supplies charm; the panel supplies accessibility and precision.

## 5.13 Evidence-board view

Outside the archive, the player can pin a small set of active signals to an evidence board. Cards can be arranged into:

- YES support;
- NO support;
- context;
- unknowns;
- disputed/correlated clusters.

A forecast update can be initiated from the board, carrying selected evidence into the commit dialog.

## 5.14 Export and portability

A case-file export should include:

- market question and resolution rules;
- forecast timeline;
- selected signals;
- source citations and timestamps;
- agent meeting memos;
- unresolved questions;
- final rationale;
- machine-readable JSON attachment.

The export must distinguish quoted source material, paraphrase, and agent interpretation.
