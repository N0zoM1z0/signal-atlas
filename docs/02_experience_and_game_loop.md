# 02. Experience and Game Loop

## 2.1 Core loop

The primary loop is:

**Orient -> Dispatch -> Discover -> Cross-check -> Debate -> Commit -> Resolve -> Learn**

### Orient

The player reads the market question, outcomes, resolution rules, time horizon, public market probability, and current team estimate. The game highlights unresolved questions rather than presenting a wall of information.

### Dispatch

The player assigns an agent to a place and selects a mission. A mission is a bounded research objective such as "check local weather warnings," "find historical cases," "look for contradictory reports," or "ask another agent what they know."

### Discover

The agent travels, invokes allowed Pref MCP capabilities, and returns a structured result. The world produces a signal card, a source record, a dialogue line, or an explicit "nothing useful found" event.

### Cross-check

The player or another agent compares signals, searches the archive, traces provenance, and tests whether apparently independent evidence shares the same source.

### Debate

Agents meet in a location and exchange only the information they possess. Their disagreement is represented by concise claims, confidence ranges, and evidence links.

### Commit

The player or team moves the forecast dial. A commit requires a probability, a short public rationale, and at least one linked signal unless the player explicitly chooses "hold with no new evidence."

### Resolve

When the market resolves, the world changes state. The game shows the outcome, the final forecast path, score, key turning points, and which signals were genuinely useful or misleading.

### Learn

The result is stored as a case file. Agents receive visible, bounded calibration updates. The player can replay the expedition and compare alternative decisions.

## 2.2 Session rhythm

A satisfying session alternates between ambient observation and meaningful events.

- **Ambient phase:** agents walk, weather moves, buildings animate, and the market ribbon breathes quietly.
- **Event phase:** a new source arrives, an agent reaches a location, a contradiction is detected, or a forecast changes.
- **Decision phase:** the game asks the player to choose a mission, inspect a signal, convene agents, or commit.
- **Reflection phase:** the world slows while the player reads, compares, or consults.

The interface should never demand constant clicking. A player should be able to enjoy simply watching the world, then intervene at high-value moments.

## 2.3 Time model

The game uses two time layers.

### Real-world time

This is the market's actual horizon: publication times, event deadlines, resolution date, and source freshness.

### Simulation time

This controls animation and pacing. A cross-city trip may take eight seconds on screen even if the real-world location is far away. The semantic cost is represented by mission duration, queueing, and attention rather than literal geography.

The player can pause and use 1x, 2x, and 4x speed. Important events automatically slow or pause according to preferences.

## 2.4 Mission system

A mission has five parts:

- an objective;
- a destination;
- an assigned agent;
- an information budget or timeout;
- a definition of useful output.

Recommended mission verbs:

- Investigate
- Verify
- Search history
- Find contradiction
- Compare sources
- Consult specialist
- Observe local conditions
- Meet agent
- Deliver signal
- Reassess forecast

A mission should be displayed as a small card that can be queued, canceled, or reordered. The agent may propose a follow-up mission, but the player can accept or dismiss it.

## 2.5 Information as game objects

Information enters the world as distinct objects rather than undifferentiated text.

### Source record

The raw retrieved item: document, report, observation, dataset row, market quote, or other Pref result. It has provenance, timestamps, location, content hash, and rights metadata when available.

### Claim

A concise proposition extracted from one or more source records. Claims can support, oppose, or contextualize an outcome.

### Signal card

The playable summary of a claim's relevance to the market. A signal card contains:

- headline;
- directional effect;
- estimated impact range;
- freshness;
- reliability status;
- independence warning;
- source count;
- location;
- who currently knows it;
- links to underlying source records.

### Belief update

A forecast change linked to one or more signal cards. It contains the old probability, new probability, uncertainty range, public rationale, and agent/player identity.

Keeping these objects separate prevents agent interpretation from being mistaken for source fact.

## 2.6 Knowledge asymmetry

Each agent has a knowledge set. An agent knows a signal only after:

- retrieving it;
- receiving it from another agent;
- reading it in the archive;
- being present during a discussion where it is shared.

The player can inspect knowledge distribution through subtle portrait badges and a dedicated "Who knows this?" view. This creates meaningful reasons for movement and meetings.

The game should not hide public information merely to create artificial difficulty. The asymmetry represents workflow and attention, not arbitrary secrecy. The player can always open the global source index in Analyst Mode.

## 2.7 Meetings and debates

When agents meet, the game creates a short structured exchange:

1. Each agent states a current estimate and one key reason.
2. New signals are exchanged.
3. Contradictions and duplicate sources are flagged.
4. Each agent may revise, hold, or request more research.
5. The meeting produces a concise memo.

The scene should last 15-45 seconds and remain skippable. Dialogue is one or two sentences per turn. Detailed notes are available behind the memo.

## 2.8 Forecast mechanic

The forecast control is a large 0-100 dial with three values:

- public market probability;
- team forecast;
- player forecast.

The player can drag the dial or enter a number. A translucent uncertainty band can be added, for example 48-58%. A commit animation should feel consequential but not casino-like: the worldline ribbon shifts, building lights subtly change, and the event log records the update.

For multi-outcome markets, replace the dial with a probability garden: outcome columns whose heights sum to 100%. Multi-outcome support should wait until the binary experience is polished.

## 2.9 Scoring and progression

The MVP should use calibration and research-quality scoring rather than monetary profit.

Recommended scores:

- Brier score or another proper scoring rule for forecast accuracy;
- calibration band performance;
- source discipline, such as percentage of updates with valid provenance;
- contradiction coverage;
- timeliness without rewarding reckless speed;
- diversity of independent evidence.

Progression should unlock cosmetic world elements, agent portraits, archive decorations, map themes, and new analytical tools. Avoid stat upgrades that make forecasts artificially more accurate; agent specialization should change behavior, not secretly improve truth.

## 2.10 Failure states

Failure is informative rather than punitive.

- An agent may return no useful evidence.
- A source may be stale, inaccessible, or contradictory.
- Two signals may collapse into one due to shared provenance.
- A mission may time out.
- A Codex turn may fail schema validation.
- The market may resolve unexpectedly.

Each failure creates a clear world event and a recoverable action. The agent can idle safely, retry once, or ask the player to choose a different mission.

## 2.11 Retention loops

The product can create long-term engagement through:

- daily or weekly expedition boards;
- market seasons grouped by topic;
- agent journals and calibration histories;
- collectible case files;
- world themes and cosmetic customization;
- shared replay links;
- community forecast rooms;
- challenge scenarios using historical markets with hidden outcomes.

Historical challenge scenarios are particularly valuable because they are deterministic, safe, and excellent for onboarding.

## 2.12 MVP content boundary

The first playable slice should contain:

- one binary fictional market;
- one world with six locations;
- three agents;
- eight mission types;
- twelve fixture source records;
- ten signal cards;
- one archive scene;
- one professor scene;
- one meeting sequence;
- forecast commit and resolution replay;
- deterministic save/load.

This is enough to validate the loop without creating a content-production burden.
