# 01. Product Vision

## 1.1 One-sentence concept

Signal Atlas is a living pixel world for prediction markets in which local agents travel to relevant places, gather sourced information through Pref MCP, exchange knowledge, and visibly update their beliefs.

## 1.2 The central design move

Prediction-market research is normally invisible. A user sees a probability, perhaps a chart, and a fragmented discussion. Signal Atlas spatializes the hidden world model behind the forecast.

A place in the game corresponds to a useful class of evidence or interaction. A weather tower represents local observations and forecasts. A newsroom represents recent reports. An archive represents historical documents and base rates. A public square represents social exchange. A professor's study represents deliberate synthesis. Agents move between these locations, so information acquisition and information asymmetry become visible rather than abstract.

The world should feel like a game, but its meaning must remain legible. Movement is not a random delay. A location tells the player what kind of evidence is being sought, why it matters, and which agent is best suited to retrieve it.

## 1.3 Product promise

The product promises that a user can look at the screen and immediately understand:

- what is being predicted;
- what the current market and team forecasts are;
- where each agent is;
- what each agent is trying to learn;
- which new signals have appeared;
- how reliable and fresh those signals are;
- why the forecast changed;
- what remains unresolved.

## 1.4 Experience pillars

### Evidence has a place

Every major information type has a spatial home. The user learns the world by learning where evidence lives.

### Agents are characters, not chat tabs

Agents have roles, routes, habits, visible status, and interpersonal dynamics. Their dialogue is short and situated. Dense reasoning belongs in inspectable notes, not endless speech bubbles.

### Uncertainty is playable

The game presents uncertainty as a changing world: fog, branching paths, conflicting signal cards, unsettled weather, incomplete archives, and agents who disagree. The objective is not to eliminate uncertainty but to make it intelligible.

### Every belief has provenance

A forecast update should point to the signals that caused it. Every signal should point to source records. The interface must distinguish source fact, extracted claim, agent interpretation, and forecast impact.

### Delight precedes density

The first impression should be a beautiful, animated world. Advanced detail is available on demand. The product should not look like a dashboard wearing a pixel-art background.

### The player remains in control

The player can pause, inspect, redirect, and replay. Live external actions require explicit confirmation. Autonomous behavior is observable and bounded.

## 1.5 Target users

### The curious observer

This user wants to watch a market unfold as a story. They may never issue a complex command. They need obvious motion, expressive agents, simple explanations, and a satisfying resolution sequence.

### The active forecaster

This user wants to direct research, compare evidence, challenge assumptions, and commit a personal or team probability. They need precise source inspection, fast commands, and a strong forecast-history view.

### The research operator

This user treats the game as a visual multi-agent workbench. They need reliable MCP integration, audit logs, source filtering, custom agents, repeatable runs, and exportable evidence packs.

### The host or streamer

This user wants a legible spectacle that an audience can follow. They need theater mode, readable overlays, event callouts, and a clean way to explain disagreements and forecast changes.

## 1.6 Product modes

### Director Mode

The default mode. The player selects agents, assigns missions, pins signals, calls meetings, consults the professor, and commits forecasts.

### Observatory Mode

Agents run mostly autonomously. The player watches and can intervene. The camera follows meaningful events and compresses idle time.

### Analyst Mode

The world remains visible, but the evidence graph, timeline, source metadata, and forecast history receive more screen space. This mode is for serious investigation.

### Replay Mode

The player scrubs through the event log and sees where every agent was, what information each had, and when forecasts changed. Replay is essential for learning and trust.

The MVP should ship Director Mode and a lightweight Observatory toggle. Analyst and Replay modes can follow once event sourcing is stable.

## 1.7 Positioning

Signal Atlas is not merely a skin for a market chart. It is a visual research environment that makes the process of forecasting understandable and entertaining.

It sits at the intersection of:

- prediction-market interfaces;
- cozy management and simulation games;
- multi-agent research systems;
- personal knowledge management;
- live data visualization;
- interactive explainability.

The strongest differentiator is the combination of spatial world modeling, visible information asymmetry, sourced agent behavior, and a playful presentation.

## 1.8 Non-goals for the first release

The first release should not attempt to become:

- a complete exchange or order-book implementation;
- an automatic real-money trading bot;
- an open-ended massively multiplayer world;
- a photorealistic geographic simulator;
- a general social network;
- a universal truth engine;
- a platform with dozens of market types and hundreds of locations.

These directions create operational and design complexity before the core magic is proven.

## 1.9 The ideal first-session story

A new user opens a market and sees a small night-time world. One agent is in the observatory, one is walking toward a weather tower, and one is reading in the archive. The market ribbon says the public price is 61%, while the team's current estimate is 55%.

A weather alert appears over Galehaven. The scout reaches the tower and returns with a sourced signal card. The card supports delay, but its freshness and reliability are clearly shown. The analyst requests a meeting in the town square. The archivist arrives with a historical base-rate card. The agents disagree, briefly debate, and the team estimate moves from 55% to 48%.

The player opens the professor's study, selects both cards, and asks, "Are these signals independent?" The professor explains that both may derive from the same underlying weather system and marks a correlation warning. The player commits 51%, adds a short note, and watches the world's probability lighting settle.

Within a few minutes, the player has experienced discovery, movement, provenance, disagreement, synthesis, and a forecast update without reading a long manual.

## 1.10 Brand direction

**Working name:** Signal Atlas  
**Tagline:** Walk the world. Gather the signal. Price the future.  
**World name:** The Atlas  
**Agents:** Field agents, forecasters, or correspondents  
**Evidence objects:** Signals  
**Forecast actions:** Commit, revise, or hold  
**Historical collections:** Case files  
**Market worlds:** Expeditions

The language should feel intelligent but not corporate. Avoid casino imagery, aggressive trading language, and generic science-fiction jargon. The tone is curious, editorial, warm, and slightly mysterious.
