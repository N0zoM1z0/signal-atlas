# 10. Data Models and Domain Events

## 10.1 Modeling principles

The data model should preserve identity, provenance, temporal order, and the distinction between observation and interpretation.

Four rules are non-negotiable:

1. A source record is never overwritten; a newer version supersedes it.
2. A signal cannot exist without at least one source reference, except for explicitly labeled player hypotheses.
3. A belief update records the previous value and the evidence used.
4. Every state-changing action is represented by an append-only event.

### Durable workspace records

The local workspace persists serialized, schema-validated `WorldEvent` envelopes as the sole
authority. `(expeditionId, sequence)` is the ordered primary key and event IDs are unique. Updates
and deletes are rejected by database triggers.

An accepted command also creates an immutable receipt containing its idempotency key, command ID,
canonical command hash, acceptance time, and exact result envelope. The receipt and every event
caused synchronously by that command commit in one transaction. On restart, receipts rebuild the
idempotency ledger so the same key and command return the original result; a different command under
the same key remains a conflict.

A checkpoint records the expedition ID, event sequence, projection schema version, projection hash,
serialized projection, and creation time. It is a disposable acceleration structure rather than a
domain event. Loading a checkpoint never advances authority: the runtime verifies it against the
event at the same sequence and folds the remaining event tail through the same pure reducer.

Every expedition row also owns the complete validated `ScenarioDefinition`, its schema version,
scenario ID/version, and canonical hash. The definition contains the authored fixture and visual
presentation metadata needed to rebuild sequence zero. It is copied into SQLite in the same
transaction as the initial event log and is immutable afterward; installed catalog updates can add
a new scenario version but cannot change an existing expedition.

```ts
interface ScenarioDefinition {
  definitionSchemaVersion: 1;
  scenario: {
    id: string;
    version: number;
    title: string;
    category:
      | 'science_technology'
      | 'climate_infrastructure'
      | 'economics_policy'
      | 'civic_official_records'
      | 'other_research';
    summary: string;
    mode: 'fixture' | 'historical_challenge' | 'live_import';
    requiredCapabilities: string[];
    availabilityPolicy: 'offline_ready' | 'live_optional';
    primaryOutcomeId: string;
    preview: {
      template: string;
      assetPack: string;
      regionLabel: string;
      tagline: string;
    };
  };
  fixture: ExpeditionFixture;
}
```

## 10.2 Market

```ts
interface Market {
  id: string;
  externalId?: string;
  provider?: string;
  question: string;
  description?: string;
  outcomes: MarketOutcome[];
  resolutionRules: string;
  resolutionSource?: string;
  opensAt?: string;
  closesAt?: string;
  resolvesAt?: string;
  status: 'draft' | 'open' | 'closed' | 'resolved' | 'void';
  currentPublicProbabilities?: Record<string, number>;
  resolvedOutcomeId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface MarketOutcome {
  id: string;
  label: string;
  shortLabel: string;
  description?: string;
}
```

For the MVP, enforce exactly two outcomes and probabilities that sum to one.

## 10.3 Expedition

```ts
interface Expedition {
  id: string;
  marketId: string;
  worldManifestId: string;
  title: string;
  mode: 'director' | 'observatory' | 'analyst' | 'replay';
  status: 'setup' | 'active' | 'paused' | 'resolved' | 'archived';
  simulationSpeed: 0 | 1 | 2 | 4;
  currentSequence: number;
  startedAt?: string;
  endedAt?: string;
  settings: ExpeditionSettings;
}
```

## 10.4 World manifest

```ts
interface WorldManifest {
  id: string;
  version: number;
  template: string;
  logicalWidth: number;
  logicalHeight: number;
  tileSize: number;
  places: Place[];
  routes: Route[];
  ambientLayers: AmbientLayer[];
  cameraZones: CameraZone[];
  defaultSpawnPlaceId: string;
  assetPack: string;
}
```

### Place

```ts
interface Place {
  id: string;
  name: string;
  archetype:
    | 'observatory'
    | 'newsroom'
    | 'weather_tower'
    | 'exchange'
    | 'archive'
    | 'professor'
    | 'town_square'
    | 'field_site';
  position: { x: number; y: number };
  entranceNodeId: string;
  description: string;
  missionVerbs: MissionVerb[];
  capabilityBindings: CapabilityBinding[];
  tags: string[];
  visualState?: Record<string, unknown>;
}
```

### Route

```ts
interface Route {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  waypoints: Array<{ x: number; y: number }>;
  baseDurationMs: number;
  bidirectional: boolean;
  transitType: 'walk' | 'tram' | 'boat' | 'elevator';
  cameraHint?: 'follow' | 'wide' | 'none';
}
```

## 10.5 Agent

```ts
interface Agent {
  id: string;
  displayName: string;
  role: 'scout' | 'archivist' | 'analyst' | 'skeptic' | 'liaison';
  profileVersion: number;
  placeId: string;
  movement?: AgentMovement;
  activeMissionId?: string;
  queuedMissionIds: string[];
  knownSourceIds: string[];
  knownSignalIds: string[];
  belief: AgentBelief;
  publicState: 'idle' | 'traveling' | 'working' | 'meeting' | 'error';
  codexSessionId?: string;
  lastTurnAt?: string;
}

interface AgentBelief {
  probabilities: Record<string, number>;
  uncertainty?: Record<string, { low: number; high: number }>;
  updatedAt: string;
  rationale: string;
  evidenceSignalIds: string[];
}
```

## 10.6 Mission

```ts
type MissionVerb =
  | 'investigate'
  | 'verify'
  | 'search_history'
  | 'find_contradiction'
  | 'compare_sources'
  | 'observe_conditions'
  | 'meet_agent'
  | 'deliver_signal'
  | 'reassess_forecast'
  | 'consult_professor';

interface Mission {
  id: string;
  expeditionId: string;
  assignedAgentId: string;
  verb: MissionVerb;
  objective: string;
  destinationPlaceId?: string;
  targetAgentIds?: string[];
  sourceIds?: string[];
  signalIds?: string[];
  budget: {
    maxToolCalls: number;
    timeoutMs: number;
  };
  status: 'draft' | 'queued' | 'traveling' | 'running' | 'completed' | 'failed' | 'canceled';
  createdBy: { kind: 'player' | 'agent' | 'system'; id?: string };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
```

## 10.7 Source record

```ts
interface SourceRecord {
  id: string;
  version: number;
  externalUri?: string;
  title: string;
  publisher?: string;
  author?: string;
  sourceClass:
    | 'official_primary'
    | 'primary'
    | 'secondary'
    | 'commentary'
    | 'sensor'
    | 'market'
    | 'archive'
    | 'user_supplied';
  publishedAt?: string;
  observedAt?: string;
  retrievedAt: string;
  location?: GeoSemanticLocation;
  mediaType?: string;
  excerpt?: string;
  structuredData?: unknown;
  contentHash: string;
  provenance: PrefProvenance;
  rights?: SourceRights;
  supersedesSourceId?: string;
  tags: string[];
}

interface PrefProvenance {
  serverName: string;
  transport: 'stdio' | 'streamable_http' | 'fixture';
  primitive: 'tool' | 'resource' | 'prompt' | 'fixture';
  primitiveName: string;
  argumentsHash?: string;
  responseHash: string;
  callId?: string;
}
```

## 10.8 Claim and signal

```ts
interface Claim {
  id: string;
  text: string;
  sourceIds: string[];
  extractor: { kind: 'agent' | 'system' | 'player'; id?: string };
  qualifiers: string[];
  temporalScope?: { startsAt?: string; endsAt?: string };
  status: 'active' | 'disputed' | 'superseded' | 'retracted';
  createdAt: string;
}

interface Signal {
  id: string;
  marketId: string;
  claimIds: string[];
  sourceIds: string[];
  headline: string;
  summary: string;
  direction: 'supports_outcome' | 'opposes_outcome' | 'context';
  targetOutcomeId?: string;
  impact: {
    label: 'small' | 'medium' | 'large' | 'unknown';
    probabilityPointRange?: { low: number; high: number };
  };
  reliability: ReliabilityAssessment;
  freshness: FreshnessAssessment;
  correlationGroupIds: string[];
  discoveredByAgentId?: string;
  createdAt: string;
  status: 'active' | 'stale' | 'disputed' | 'superseded' | 'irrelevant';
}
```

### Reliability

```ts
interface ReliabilityAssessment {
  label:
    | 'verified_primary'
    | 'primary_unconfirmed'
    | 'corroborated_secondary'
    | 'single_secondary'
    | 'derived'
    | 'unverified'
    | 'disputed';
  reasons: string[];
  assessedBy: { kind: 'system' | 'agent' | 'player'; id?: string };
}
```

### Freshness

```ts
interface FreshnessAssessment {
  referenceTime: string;
  usefulUntil?: string;
  label: 'fresh' | 'aging' | 'stale' | 'timeless' | 'unknown';
  newerSourceId?: string;
}
```

## 10.9 Knowledge edge

Knowledge is modeled explicitly as an edge.

```ts
interface AgentKnowledge {
  agentId: string;
  objectType: 'source' | 'signal' | 'claim' | 'memo';
  objectId: string;
  acquiredAt: string;
  acquisition:
    | { kind: 'retrieved'; missionId: string }
    | { kind: 'shared'; fromAgentId: string; meetingId?: string }
    | { kind: 'archive'; placeId: string }
    | { kind: 'system'; reason: string };
}
```

Do not infer knowledge merely because the player can see a card.

## 10.10 Belief update and forecast commit

```ts
interface BeliefUpdate {
  id: string;
  expeditionId: string;
  actor: { kind: 'agent' | 'player' | 'team'; id?: string };
  previousProbabilities: Record<string, number>;
  newProbabilities: Record<string, number>;
  uncertainty?: Record<string, { low: number; high: number }>;
  rationale: string;
  evidenceSignalIds: string[];
  assumptions: string[];
  createdAt: string;
}

interface ForecastCommit extends BeliefUpdate {
  commitType: 'initial' | 'revision' | 'hold' | 'final';
  publicNote: string;
  privateMemo?: string;
  scoringEligible: boolean;
}
```

## 10.11 Meeting

```ts
interface Meeting {
  id: string;
  expeditionId: string;
  placeId: string;
  participantAgentIds: string[];
  startedAt: string;
  endedAt?: string;
  sharedSignalIds: string[];
  disagreementTypes: Array<'evidence' | 'model' | 'prior'>;
  memo?: MeetingMemo;
}

interface MeetingMemo {
  summary: string;
  agreements: string[];
  disagreements: string[];
  followUpMissionProposals: Array<{
    agentId?: string;
    verb: MissionVerb;
    objective: string;
  }>;
}
```

## 10.12 Professor query

```ts
interface ProfessorQuery {
  id: string;
  expeditionId: string;
  mode:
    | 'explain'
    | 'challenge'
    | 'compare'
    | 'base_rate'
    | 'missing_evidence'
    | 'correlation_check'
    | 'forecast_impact';
  question: string;
  selectedSourceIds: string[];
  selectedSignalIds: string[];
  createdAt: string;
}

interface ProfessorResponse {
  queryId: string;
  mode?: ProfessorQuery['mode'];
  selectedSignalIds?: string[];
  answer: string;
  evidenceUsed: Array<{ type: 'source' | 'signal'; id: string }>;
  assumptions: string[];
  limitations: string[];
  suggestedNextQuestion?: string;
  suggestedMission?: {
    verb: MissionVerb;
    objective: string;
    destinationPlaceId?: string;
  };
  runtime?: {
    mode: 'scripted' | 'local_exec' | 'scripted_fallback';
    driverId: string;
    durationMs: number;
    repairAttempts: 0 | 1;
    fallbackReason?: string;
  };
}
```

In local mode, `professor.query.started` is committed immediately and
`professor.response.created` is appended only after the bounded Codex output passes validation (or
the runtime selects an explicitly labeled authored fallback). A fixture reset cancels pending
consultations and prevents their late results from entering the new projection.

## 10.13 Agent turn input and output

The orchestrator may attach one bounded evidence packet after a successful Pref retrieval. It is
optional so fixture and non-research turns retain the same input contract.

```ts
interface AgentTurnEvidencePacket {
  capability: PrefCanonicalCapability;
  evidenceRole: 'direct' | 'reference_class' | 'context_only';
  scopeNote?: string;
  callId: string;
  argumentsHash: string;
  retrievedAt: string;
  durationMs: number;
  cacheStatus: 'miss' | 'fresh' | 'stale';
  sources: SourceRecord[];
  facts: Array<{
    kind: string;
    sourceIds: string[];
    statement: string;
    attributes: Record<string, string | number | boolean | null>;
  }>;
}

interface AgentTurnInput {
  // Existing turn, mission, knowledge, capability, and timeout fields omitted here.
  currentTurnEvidence?: AgentTurnEvidencePacket;
}
```

Packet source IDs are unique, every fact references only packet sources, content is rights-filtered,
and the complete serialized packet is size-bounded. Context-only packets require an explicit scope
note. The Codex output contract is intentionally narrow.

```ts
interface AgentTurnOutput {
  schemaVersion: 1;
  agentId: string;
  missionId: string;
  action:
    | { type: 'wait'; reason: string }
    | { type: 'move'; destinationPlaceId: string }
    | { type: 'investigate'; capability: string; query: string }
    | { type: 'share_signal'; targetAgentId: string; signalIds: string[] }
    | { type: 'request_mission'; verb: MissionVerb; objective: string; destinationPlaceId?: string }
    | { type: 'update_belief'; probabilities: Record<string, number>; uncertainty?: Record<string, { low: number; high: number }> };
  publicDialogue: string;
  sourceIdsUsed: string[];
  proposedClaims: Array<{
    text: string;
    sourceIds: string[];
    qualifiers: string[];
  }>;
  proposedSignals: Array<{
    headline: string;
    summary: string;
    claimIndexes: number[];
    sourceIds: string[];
    direction: 'supports_outcome' | 'opposes_outcome' | 'context';
    targetOutcomeId?: string;
    impactLabel: 'small' | 'medium' | 'large' | 'unknown';
  }>;
  rationale: string;
  assumptions: string[];
  unknowns: string[];
  suggestedFollowUp?: {
    verb: MissionVerb;
    objective: string;
    destinationPlaceId?: string;
  };
}
```

Without a current-turn packet, the runtime validates that every source ID was known before the turn
or explicitly granted during it. With a packet, all output citations, claim sources, and signal
sources must be packet members. The model cannot create source identities. Candidate model
artifacts are assigned deterministic IDs by the orchestrator and no model-proposed probability
range is accepted as an authoritative belief mutation. Context-only evidence additionally cannot
target or directionally support an outcome and must retain unknown impact.

## 10.14 Domain event catalog

### Expedition lifecycle

- `expedition.created`
- `expedition.started`
- `expedition.paused`
- `expedition.speed_changed`
- `expedition.resolved`
- `expedition.archived`

### Agent lifecycle

- `agent.spawned`
- `agent.mission.queued`
- `agent.mission.assigned`
- `agent.travel.started`
- `agent.travel.progressed`
- `agent.arrived`
- `agent.work.started`
- `agent.turn.completed`
- `agent.turn.failed`
- `agent.dialogue.emitted`

### Information

- `pref.call.started`
- `pref.call.completed`
- `pref.call.failed`
- `source.recorded`
- `source.superseded`
- `claim.created`
- `claim.disputed`
- `signal.created`
- `signal.updated`
- `signal.shared`
- `signal.marked_stale`
- `correlation.detected`

### Social and synthesis

- `meeting.requested`
- `meeting.started`
- `meeting.signal_shared`
- `meeting.memo_created`
- `meeting.ended`
- `professor.query.started`
- `professor.response.created`

### Forecast

- `belief.updated`
- `forecast.committed`
- `market.price_updated`
- `market.resolved`
- `score.calculated`

## 10.15 Idempotency and versioning

- Every command includes a client-generated idempotency key.
- Every event has a unique ID and expedition sequence.
- Every schema has a version.
- Reducers support only known versions and fail clearly on unknown versions.
- Source content is addressed by hash.
- Agent turn outputs include schema version.
- World manifests are immutable once an expedition starts; modifications create a new manifest version.

## 10.16 Sample data

See `../fixtures/helios3_expedition.json`, `../fixtures/northlight_harbor_expedition.json`,
`../fixtures/northbridge_council_expedition.json`, and the JSON Schemas in `../schemas/` for
deterministic, independently replayable expedition fixtures.
