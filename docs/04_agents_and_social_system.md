# 04. Agents and Social System

## 4.1 Agent model

An agent is a persistent game character with a role, location, knowledge set, current belief, mission queue, public personality, and a resumable Codex session.

An agent is not identical to an operating-system process. The runtime should treat agents as logical actors and activate a Codex turn only when an action is needed. This allows many visible characters without keeping many expensive processes alive.

## 4.2 MVP agent roster

### Mira - Field Scout

Fast, curious, and freshness-oriented. Mira is best at local observations, breaking reports, and quickly checking a place. She tends to overweight recent information, so she benefits from the archivist's counterbalance.

### Orin - Archivist

Patient and source-conscious. Orin searches case files, tracks provenance, and identifies repeated patterns. He may be slow to react to genuinely novel events.

### Kestrel - Skeptical Analyst

Focused on contradictions, alternative explanations, and probability updates. Kestrel is good at synthesis but should not be allowed to invent evidence. Every forecast rationale must cite known signal IDs.

A fourth role, Liaison, can be added later for larger teams and social coordination.

## 4.3 Agent state

Each agent has:

- stable ID and display name;
- portrait and sprite configuration;
- role and skill tags;
- current place and path progress;
- current mission and queue;
- known source IDs and signal IDs;
- private working notes stored locally;
- public forecast and uncertainty range;
- relationships with other agents;
- fatigue or attention state, if enabled;
- Codex thread/session identifier;
- last successful turn and error state.

Private working notes should never be presented as hidden chain-of-thought. The product stores concise task state, observations, and public rationale only.

## 4.4 Behavioral contract

A Codex-driven agent may choose only from a bounded action vocabulary:

- `move`
- `investigate`
- `query_archive`
- `consult_professor`
- `meet_agent`
- `share_signal`
- `request_mission`
- `update_belief`
- `wait`

Each action is schema-validated. The orchestrator, not the model, decides whether the action is legal in the current world state.

An agent cannot:

- place a real trade;
- execute arbitrary external actions;
- modify another agent's memory directly;
- claim a source it has not retrieved or received;
- create a new world location without an authorized event;
- bypass the Pref Gateway;
- disclose secrets or raw credentials;
- use unrestricted shell/network access for gameplay.

## 4.5 Public personality

Personality should affect style and priorities, not truth access.

A compact personality profile includes:

- sentence rhythm and vocabulary;
- preferred mission types;
- known cognitive tendency;
- social behavior in meetings;
- visual emotes;
- confidence-expression style.

For example, Mira may say, "The tower issued a fresh crosswind notice. I would lower launch odds a little, but this is one update, not a trend." Orin may say, "Three comparable launches waited through similar wind windows. The archive suggests caution, though the sample is small."

The style is distinctive while remaining concise and evidence-linked.

## 4.6 Mission execution flow

1. The scheduler selects an eligible agent turn.
2. The orchestrator assembles a context packet with market state, agent state, destination affordances, known signals, and mission objective.
3. The agent may call read-only Pref tools through the gateway.
4. Codex returns a schema-conforming action result.
5. The orchestrator validates evidence references, permissions, and world legality.
6. Valid results become world events.
7. Invalid results receive one constrained repair attempt.
8. A second failure produces a safe `wait` action and a visible error badge.

## 4.7 Agent-to-agent exchange

Agents exchange explicit objects, not vague summaries. A meeting can transfer:

- signal IDs;
- source IDs;
- unresolved questions;
- forecast estimates;
- mission proposals;
- correlation warnings.

The event log records who shared what, where, and when. This enables replay and true knowledge asymmetry.

## 4.8 Disagreement model

Disagreement has three layers:

### Evidence disagreement

Agents have different sources or interpret source reliability differently.

### Model disagreement

Agents agree on facts but estimate different impact on the outcome.

### Prior disagreement

Agents use different base rates or starting probabilities.

The debate UI labels the type of disagreement. This is more useful than simply showing opposing dialogue.

## 4.9 Trust and relationships

Relationships should be lightweight in the MVP. Each pair of agents can have:

- familiarity;
- recent agreement rate;
- signal-sharing history;
- unresolved challenge count.

Do not implement a hidden "trust stat" that causes one agent to accept another's claims without evidence. Social history can affect which follow-up questions are asked, but provenance remains primary.

## 4.10 Attention and workload

Agents may have one active mission and a short queue. A soft attention meter can explain why they cannot investigate everything simultaneously. It should regenerate quickly and never become a monetization mechanic.

The MVP can omit fatigue entirely and use mission queue length as the only constraint.

## 4.11 Player commands

The player can command agents through direct manipulation or natural language.

Direct manipulation:

- select an agent;
- click a destination;
- choose a mission card;
- confirm or edit the objective.

Natural language examples:

- "Mira, check whether the weather alert is newer than the launch notice."
- "Orin, find three historical delays caused by crosswinds."
- "Kestrel, compare the two strongest delay signals and look for a shared source."
- "Everyone, meet at Lantern Square and reassess."

The command parser converts language into a draft structured mission. The player sees the interpreted command before execution when ambiguity is material.

## 4.12 Autonomous behavior

In Observatory Mode, agents can propose and execute low-risk missions according to policy.

Autonomy levels:

- **Manual:** no mission begins without player approval.
- **Suggest:** agents propose missions; player approves.
- **Bounded auto:** agents execute read-only research missions within budgets.
- **Theater:** agents run continuously, but forecast commits still require configured policy.

The MVP should default to Suggest and support Bounded Auto as an opt-in.

## 4.13 Agent growth

Growth should be transparent and non-mystical. An agent can accumulate:

- a calibration history;
- topic familiarity tags;
- a library of successful mission templates;
- cosmetic journal pages;
- social history.

Do not silently fine-tune behavior based on outcomes in the first release. Any learning mechanism should be inspectable and versioned.
