import { createSignalAtlasCaseFile, type SignalAtlasCaseFile } from '@signal-atlas/archive';
import {
  SCHEMA_VERSION,
  parseWorldEvent,
  type ExpeditionFixture,
  type Mission,
  type ProfessorQuery,
  type WorldCommand,
  type WorldEvent,
} from '@signal-atlas/contracts';
import type { PrefMcpConnectionDiagnostics } from '@signal-atlas/pref-gateway';
import {
  calculateBrierScore,
  canonicalHash,
  createInitialWorldStateFromFixture,
  projectionHash,
  reduceWorldEvent,
  replayWorldEventsWithHash,
  selectRoutePlan,
  validateWorldCommand,
  type CommandIdempotencyLedger,
  type WorldProjection,
} from '@signal-atlas/simulation';
import {
  createScriptedFixtureTurn,
  createScriptedProfessorResponse,
  interpretFixtureMission,
  type FixtureMissionScenario,
} from '@signal-atlas/fixture-runtime';
import { installedScenarioCatalog, type InstalledScenarioEntry } from '@signal-atlas/world-content';

import type {
  ExpeditionEventStreamOptions,
  WorldEventsEnvelope,
} from '../world-shell/event-stream-client.js';
import type {
  CreateExpeditionResponse,
  ExpeditionListItem,
  FixtureConfiguration,
  MissionDraft,
  ReplayProjectionResponse,
  ScenarioListItem,
  SignalAtlasRuntimeDiagnostics,
} from '../world-shell/runtime-client.js';
import type { RuntimeEventSubscription, RuntimePort } from './runtime-port.js';

const STORAGE_VERSION = 1;
const DEFAULT_STORAGE_KEY = 'signal-atlas:static-demo:workspace:v1';
const MAX_STORED_BYTES = 1_500_000;
const MAX_STORED_EVENTS = 5_000;

interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface StoredExpedition {
  scenarioId: string;
  scenarioVersion: number;
  missionScenario: FixtureMissionScenario;
  events: WorldEvent[];
}

interface StoredWorkspace {
  version: 1;
  expeditions: StoredExpedition[];
}

interface StaticExpedition {
  definition: InstalledScenarioEntry;
  fixture: ExpeditionFixture;
  events: WorldEvent[];
  projection: WorldProjection;
  missionScenario: FixtureMissionScenario;
  ledger: CommandIdempotencyLedger;
  acceptedByKey: Map<
    string,
    { accepted: true; duplicate: false; commandId: string; sequence: number }
  >;
}

export interface StaticDemoRuntimeOptions {
  storage?: StorageLike | undefined;
  storageKey?: string;
  travelDelayMs?: number;
  workDelayMs?: number;
  now?: () => Date;
}

interface EventDraft {
  id: string;
  type: WorldEvent['type'];
  payload: unknown;
  occurredAt?: string;
  actor?: WorldEvent['actor'];
  causationId?: string;
  correlationId?: string;
}

function storageFromBrowser(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expeditionListItem(record: StaticExpedition): ExpeditionListItem {
  return {
    id: record.fixture.expedition.id,
    scenarioId: record.definition.summary.id,
    scenarioVersion: record.definition.summary.version,
    definitionHash: record.definition.definitionHash,
    latestSequence: record.projection.sequence,
    marketQuestion: record.projection.market.question,
    status: record.projection.expedition.status,
    title: record.projection.expedition.title,
    createdAt: record.projection.expedition.startedAt ?? record.projection.market.createdAt,
  };
}

function staticPrefDiagnostics(now: string): PrefMcpConnectionDiagnostics {
  return {
    mode: 'fixture',
    serverName: 'static-authored-showcase',
    transport: 'fixture',
    state: 'connected',
    connected: true,
    credentialState: 'not_required',
    readOnly: true,
    lastTransitionAt: now,
    lastCheckedAt: now,
    serverVersion: 'browser fixture runtime 1',
    inventory: { tools: [], resources: [], resourceTemplates: [], prompts: [] },
    mappings: [],
  } satisfies PrefMcpConnectionDiagnostics;
}

function addMilliseconds(value: string, milliseconds: number): string {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

function commandError(issues: readonly { message: string }[]): Error {
  return new Error(issues.map((issue) => issue.message).join(' '));
}

class StaticEventSubscription implements RuntimeEventSubscription {
  readonly #runtime: StaticDemoRuntime;
  readonly #options: ExpeditionEventStreamOptions;
  #active = false;
  #cursor: number;
  #queue = Promise.resolve();

  constructor(runtime: StaticDemoRuntime, options: ExpeditionEventStreamOptions) {
    this.#runtime = runtime;
    this.#options = options;
    this.#cursor = options.initialSequence;
  }

  start(): void {
    if (this.#active) return;
    this.#active = true;
    this.#options.onStatus({
      phase: 'connecting',
      cursor: this.#cursor,
      attempt: 0,
      message: `Opening the local static event stream from sequence ${this.#cursor}.`,
    });
    this.#runtime.attachSubscription(this);
    const unseen = this.#runtime.eventsAfter(this.#options.expeditionId, this.#cursor);
    this.accept(unseen);
    this.#queue = this.#queue.then(() => {
      if (!this.#active) return;
      this.#options.onStatus({
        phase: 'live',
        cursor: this.#cursor,
        attempt: 0,
        message: `Static event stream ready at sequence ${this.#cursor}.`,
      });
    });
  }

  stop(): void {
    if (!this.#active) return;
    this.#active = false;
    this.#runtime.detachSubscription(this);
    this.#options.onStatus({
      phase: 'stopped',
      cursor: this.#cursor,
      attempt: 0,
      message: 'Static event stream stopped.',
    });
  }

  matches(expeditionId: string): boolean {
    return this.#active && this.#options.expeditionId === expeditionId;
  }

  accept(events: readonly WorldEvent[]): void {
    const unseen = events.filter((event) => event.sequence > this.#cursor);
    for (let index = 0; index < unseen.length; index += 100) {
      const chunk = unseen.slice(index, index + 100);
      const first = chunk[0];
      const last = chunk.at(-1);
      if (!first || !last) continue;
      const expected = this.#cursor + 1;
      if (first.sequence !== expected) {
        const message = `Static event sequence gap: expected ${expected}, received ${first.sequence}.`;
        this.#options.onBoundaryError?.(message);
        this.#options.onStatus({
          phase: 'boundary_error',
          cursor: this.#cursor,
          attempt: 0,
          message,
        });
        this.stop();
        return;
      }
      const envelope: WorldEventsEnvelope = {
        schemaVersion: 1,
        type: 'world.events',
        expeditionId: this.#options.expeditionId,
        afterSequence: this.#cursor,
        sequence: last.sequence,
        events: chunk.map((event) => structuredClone(event)),
      };
      this.#cursor = last.sequence;
      this.#queue = this.#queue.then(async () => {
        if (this.#active) await this.#options.onEvents(envelope);
      });
    }
  }
}

export class StaticDemoRuntime implements RuntimePort {
  readonly kind = 'static-demo' as const;
  readonly supportsConnectionControls = false;
  readonly #storage: StorageLike | undefined;
  readonly #storageKey: string;
  readonly #travelDelayMs: number;
  readonly #workDelayMs: number;
  readonly #now: () => Date;
  readonly #records = new Map<string, StaticExpedition>();
  readonly #subscriptions = new Set<StaticEventSubscription>();
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #fallbackId = 0;

  constructor(options: StaticDemoRuntimeOptions = {}) {
    this.#storage = options.storage ?? storageFromBrowser();
    this.#storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.#travelDelayMs = options.travelDelayMs ?? 650;
    this.#workDelayMs = options.workDelayMs ?? 450;
    this.#now = options.now ?? (() => new Date());
    this.#hydrate();
  }

  createClientId(prefix: string): string {
    const id = globalThis.crypto?.randomUUID?.() ?? `fallback-${++this.#fallbackId}`;
    return `${prefix}-${id}`;
  }

  async fetchScenarios(): Promise<ScenarioListItem[]> {
    return installedScenarioCatalog.list().map((scenario) => ({
      ...scenario,
      available: true,
      availabilityReason: 'Authored static showcase; no backend or live services required.',
    }));
  }

  async fetchExpeditions(): Promise<ExpeditionListItem[]> {
    return [...this.#records.values()]
      .map(expeditionListItem)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
      );
  }

  async createExpedition(
    scenarioId: string,
    scenarioVersion: number,
    _idempotencyKey: string,
  ): Promise<CreateExpeditionResponse> {
    const definition = installedScenarioCatalog.resolve(scenarioId, scenarioVersion);
    if (!definition)
      throw new Error(`Static scenario ${scenarioId} v${scenarioVersion} is missing.`);
    const expeditionId = definition.definition.fixture.expedition.id;
    const existing = this.#records.get(expeditionId);
    if (existing) {
      return { created: false, duplicate: true, expedition: expeditionListItem(existing) };
    }
    const record = this.#recordFromGenesis(definition);
    this.#records.set(expeditionId, record);
    this.#persist();
    this.#resumePending(record);
    return { created: true, duplicate: false, expedition: expeditionListItem(record) };
  }

  async fetchExpeditionSnapshot(expeditionId: string): Promise<WorldProjection> {
    const record = this.#requireRecord(expeditionId);
    this.#resumePending(record);
    return structuredClone(record.projection);
  }

  async fetchExpeditionEvents(
    expeditionId: string,
    after = 0,
  ): Promise<{ events: WorldEvent[]; sequence: number }> {
    const record = this.#requireRecord(expeditionId);
    return {
      events: record.events
        .filter((event) => event.sequence > after)
        .map((event) => structuredClone(event)),
      sequence: record.projection.sequence,
    };
  }

  async fetchReplayProjection(
    expeditionId: string,
    sequence?: number,
  ): Promise<ReplayProjectionResponse> {
    const record = this.#requireRecord(expeditionId);
    const latestSequence = record.projection.sequence;
    const target = sequence ?? latestSequence;
    if (!Number.isInteger(target) || target < 0 || target > latestSequence) {
      throw new Error(`Replay sequence ${target} is outside 0-${latestSequence}.`);
    }
    const events = record.events.filter((event) => event.sequence <= target);
    const replay = replayWorldEventsWithHash(
      createInitialWorldStateFromFixture(record.fixture),
      events,
    );
    if (replay.projection.sequence !== target) {
      throw new Error(`Replay sequence ${target} is not present in the static event log.`);
    }
    const authoritativeHash = projectionHash(record.projection);
    const selectedEvent = events.at(-1);
    return {
      sequence: target,
      latestSequence,
      projection: structuredClone(replay.projection),
      hash: replay.hash,
      authoritativeHash,
      ...(selectedEvent ? { selectedEvent: structuredClone(selectedEvent) } : {}),
    };
  }

  async fetchCaseFile(expeditionId: string): Promise<SignalAtlasCaseFile> {
    const record = this.#requireRecord(expeditionId);
    return createSignalAtlasCaseFile(record.projection, record.events);
  }

  async resolveFixtureCase(expeditionId: string) {
    const record = this.#requireRecord(expeditionId);
    const correlationId = `fixture-resolution:${expeditionId}`;
    if (record.projection.market.status === 'resolved') {
      return {
        resolved: true as const,
        duplicate: true,
        events: record.events
          .filter((event) => event.correlationId === correlationId)
          .map((event) => structuredClone(event)),
        sequence: record.projection.sequence,
        projectionHash: projectionHash(record.projection),
      };
    }
    const hasWork = Object.values(record.projection.agentsById).some(
      (agent) => Boolean(agent.activeMissionId) || agent.queuedMissionIds.length > 0,
    );
    if (hasWork) throw new Error('Finish or cancel every mission before resolving the fixture.');
    const { resolvedOutcomeId, resolvedAt, resolutionNote } = record.fixture.resolutionFixture;
    const drafts: EventDraft[] = [
      {
        id: `evt-resolution-market-${expeditionId}`,
        type: 'market.resolved',
        occurredAt: resolvedAt,
        payload: { resolvedOutcomeId, resolvedAt, resolutionNote },
      },
      ...record.projection.forecasts
        .filter((forecast) => forecast.scoringEligible === true)
        .map((forecast): EventDraft => ({
          id: `evt-resolution-score-${forecast.id}`,
          type: 'score.calculated',
          occurredAt: resolvedAt,
          payload: {
            forecastCommitId: forecast.id,
            ...calculateBrierScore(forecast.newProbabilities, resolvedOutcomeId),
          },
        })),
      {
        id: `evt-resolution-expedition-${expeditionId}`,
        type: 'expedition.resolved',
        occurredAt: resolvedAt,
        payload: { resolvedOutcomeId, resolvedAt },
      },
    ];
    const events = this.#append(record, drafts, {
      occurredAt: resolvedAt,
      causationId: correlationId,
      correlationId,
    });
    return {
      resolved: true as const,
      duplicate: false,
      events: structuredClone(events),
      sequence: record.projection.sequence,
      projectionHash: projectionHash(record.projection),
    };
  }

  async fetchFixtureConfiguration(expeditionId: string): Promise<FixtureConfiguration> {
    const record = this.#requireRecord(expeditionId);
    return { seed: record.fixture.seed, missionScenario: record.missionScenario };
  }

  async updateFixtureMissionScenario(
    expeditionId: string,
    missionScenario: FixtureMissionScenario,
  ): Promise<FixtureConfiguration> {
    const record = this.#requireRecord(expeditionId);
    record.missionScenario = missionScenario;
    this.#persist();
    return { seed: record.fixture.seed, missionScenario };
  }

  async interpretMissionDraft(
    expeditionId: string,
    text: string,
    selectedAgentId: string,
  ): Promise<MissionDraft> {
    const record = this.#requireRecord(expeditionId);
    const draft = interpretFixtureMission(text, record.projection, selectedAgentId);
    return {
      ...draft,
      submissionId: this.createClientId('submission'),
      createdAt: this.#now().toISOString(),
    };
  }

  async submitWorldCommand(command: WorldCommand) {
    const record = this.#requireRecord(command.expeditionId);
    const validation = validateWorldCommand(command, record.projection, record.ledger);
    if (!validation.accepted) throw commandError(validation.issues);
    if (validation.duplicate) {
      const accepted = record.acceptedByKey.get(command.idempotencyKey);
      if (!accepted) throw new Error('The static idempotency receipt is unavailable.');
      return { ...accepted, duplicate: true as const };
    }
    this.#applyCommand(record, validation.command);
    const accepted = {
      accepted: true as const,
      duplicate: false as const,
      commandId: command.id,
      sequence: record.projection.sequence,
    };
    record.ledger = {
      ...record.ledger,
      [command.idempotencyKey]: {
        commandId: command.id,
        commandHash: canonicalHash(command),
      },
    };
    record.acceptedByKey.set(command.idempotencyKey, accepted);
    return accepted;
  }

  async fetchRuntimeDiagnostics(expeditionId?: string): Promise<SignalAtlasRuntimeDiagnostics> {
    const record = expeditionId
      ? this.#requireRecord(expeditionId)
      : ([...this.#records.values()][0] ?? undefined);
    const projection = record?.projection;
    const eventCount = record?.events.length ?? 0;
    const latestSequence = projection?.sequence ?? 0;
    return {
      driver: {
        id: 'static-authored-agent',
        kind: 'scripted',
        available: true,
        description: 'Browser-only authored fixture driver; no Codex or Pref process is running.',
        runs: projection ? Object.keys(projection.agentTurnsById).length : 0,
      },
      professor: {
        id: 'static-authored-professor',
        kind: 'scripted',
        configuredMode: 'scripted',
        activeMode: 'scripted',
        available: true,
        description: 'Evidence-bounded authored Professor response in the static showcase.',
        runs: projection ? Object.keys(projection.professorResponsesByQueryId).length : 0,
        fallbackCount: 0,
        repairCount: 0,
      },
      workspace: {
        mode: 'memory',
        state: 'ready',
        eventCount,
        latestSequence,
        checkpointInterval: 0,
        replayBaseSequence: 0,
        invalidCheckpointCount: 0,
      },
      scheduler: {
        maxConcurrency: 1,
        defaultTimeoutMs: 30_000,
        activeCount: projection
          ? Object.values(projection.agentsById).filter((agent) => agent.publicState === 'working')
              .length
          : 0,
        queuedCount: projection
          ? Object.values(projection.agentsById).reduce(
              (count, agent) => count + agent.queuedMissionIds.length,
              0,
            )
          : 0,
      },
      totals: {
        queued: 0,
        running: 0,
        completed: projection
          ? Object.values(projection.missionsById).filter(
              (mission) => mission.status === 'completed',
            ).length
          : 0,
        failed: projection
          ? Object.values(projection.missionsById).filter((mission) => mission.status === 'failed')
              .length
          : 0,
        canceled: projection
          ? Object.values(projection.missionsById).filter(
              (mission) => mission.status === 'canceled',
            ).length
          : 0,
        timed_out: 0,
      },
      turns: [],
      recentEvents: [],
      registry: { runtimeCount: this.#records.size },
      globalExternalCalls: {
        maxConcurrency: 0,
        maxQueued: 0,
        activeCount: 0,
        queuedCount: 0,
        admittedCount: 0,
        rejectedCount: 0,
      },
    };
  }

  async fetchPrefDiagnostics(): Promise<PrefMcpConnectionDiagnostics> {
    return staticPrefDiagnostics(this.#now().toISOString());
  }

  async testPrefConnection(): Promise<PrefMcpConnectionDiagnostics> {
    return this.fetchPrefDiagnostics();
  }

  async disconnectPrefConnection(): Promise<PrefMcpConnectionDiagnostics> {
    return this.fetchPrefDiagnostics();
  }

  createEventSubscription(options: ExpeditionEventStreamOptions): RuntimeEventSubscription {
    return new StaticEventSubscription(this, options);
  }

  async resetDemoWorkspace(): Promise<void> {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
    this.#records.clear();
    try {
      this.#storage?.removeItem(this.#storageKey);
    } catch {
      // A blocked browser store still permits a complete current-session showcase.
    }
  }

  attachSubscription(subscription: StaticEventSubscription): void {
    this.#subscriptions.add(subscription);
  }

  detachSubscription(subscription: StaticEventSubscription): void {
    this.#subscriptions.delete(subscription);
  }

  eventsAfter(expeditionId: string, sequence: number): WorldEvent[] {
    return this.#requireRecord(expeditionId).events.filter((event) => event.sequence > sequence);
  }

  #requireRecord(expeditionId: string): StaticExpedition {
    const record = this.#records.get(expeditionId);
    if (!record) throw new Error(`Static expedition ${expeditionId} has not been created.`);
    return record;
  }

  #recordFromGenesis(definition: InstalledScenarioEntry): StaticExpedition {
    const fixture = structuredClone(definition.definition.fixture);
    const initialState = createInitialWorldStateFromFixture(fixture);
    const replay = replayWorldEventsWithHash(initialState, fixture.initialEvents);
    return {
      definition: structuredClone(definition),
      fixture,
      events: structuredClone(fixture.initialEvents),
      projection: replay.projection,
      missionScenario: 'success',
      ledger: {},
      acceptedByKey: new Map(),
    };
  }

  #recordFromStored(value: unknown): StaticExpedition | undefined {
    if (!isRecord(value)) return undefined;
    const { scenarioId, scenarioVersion, missionScenario, events } = value;
    if (
      typeof scenarioId !== 'string' ||
      !Number.isInteger(scenarioVersion) ||
      !['success', 'no_result', 'timeout', 'invalid_result'].includes(String(missionScenario)) ||
      !Array.isArray(events) ||
      events.length > MAX_STORED_EVENTS
    ) {
      return undefined;
    }
    const definition = installedScenarioCatalog.resolve(scenarioId, Number(scenarioVersion));
    if (!definition) return undefined;
    try {
      const parsedEvents = events.map(parseWorldEvent);
      const fixture = structuredClone(definition.definition.fixture);
      const genesis = fixture.initialEvents;
      if (
        parsedEvents.length < genesis.length ||
        canonicalHash(parsedEvents.slice(0, genesis.length)) !== canonicalHash(genesis) ||
        parsedEvents.some(
          (event, index) =>
            event.sequence !== index + 1 || event.expeditionId !== fixture.expedition.id,
        )
      ) {
        return undefined;
      }
      const replay = replayWorldEventsWithHash(
        createInitialWorldStateFromFixture(fixture),
        parsedEvents,
      );
      return {
        definition,
        fixture,
        events: parsedEvents,
        projection: replay.projection,
        missionScenario: missionScenario as FixtureMissionScenario,
        ledger: {},
        acceptedByKey: new Map(),
      };
    } catch {
      return undefined;
    }
  }

  #hydrate(): void {
    let raw: string | null;
    try {
      raw = this.#storage?.getItem(this.#storageKey) ?? null;
    } catch {
      return;
    }
    if (!raw || utf8Length(raw) > MAX_STORED_BYTES) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed['version'] !== STORAGE_VERSION) return;
      const expeditions = parsed['expeditions'];
      if (
        !Array.isArray(expeditions) ||
        expeditions.length > installedScenarioCatalog.list().length
      )
        return;
      for (const value of expeditions) {
        const record = this.#recordFromStored(value);
        if (record) this.#records.set(record.fixture.expedition.id, record);
      }
    } catch {
      // Malformed browser data is ignored; the Lobby offers a fresh authored world.
    }
  }

  #persist(): void {
    if (!this.#storage) return;
    const stored: StoredWorkspace = {
      version: 1,
      expeditions: [...this.#records.values()].map((record) => ({
        scenarioId: record.definition.summary.id,
        scenarioVersion: record.definition.summary.version,
        missionScenario: record.missionScenario,
        events: record.events.map((event) => structuredClone(event)),
      })),
    };
    const serialized = JSON.stringify(stored);
    if (utf8Length(serialized) > MAX_STORED_BYTES) return;
    try {
      this.#storage.setItem(this.#storageKey, serialized);
    } catch {
      // Persistence is a convenience in static mode; current-session authority remains valid.
    }
  }

  #append(
    record: StaticExpedition,
    drafts: readonly EventDraft[],
    defaults: {
      occurredAt: string;
      actor?: WorldEvent['actor'];
      causationId?: string;
      correlationId?: string;
    },
  ): WorldEvent[] {
    let projection = record.projection;
    const events: WorldEvent[] = [];
    for (const draft of drafts) {
      const occurredAt = draft.occurredAt ?? defaults.occurredAt;
      const event = parseWorldEvent({
        id: draft.id,
        expeditionId: record.fixture.expedition.id,
        sequence: projection.sequence + 1,
        type: draft.type,
        occurredAt,
        recordedAt: occurredAt,
        actor: draft.actor ?? defaults.actor ?? { kind: 'system' },
        ...((draft.causationId ?? defaults.causationId)
          ? { causationId: draft.causationId ?? defaults.causationId }
          : {}),
        ...((draft.correlationId ?? defaults.correlationId)
          ? { correlationId: draft.correlationId ?? defaults.correlationId }
          : {}),
        schemaVersion: SCHEMA_VERSION,
        payload: draft.payload,
      });
      projection = reduceWorldEvent(projection, event);
      events.push(event);
    }
    record.projection = projection;
    record.events = [...record.events, ...events];
    this.#persist();
    for (const subscription of this.#subscriptions) {
      if (subscription.matches(record.fixture.expedition.id)) subscription.accept(events);
    }
    return events;
  }

  #applyCommand(record: StaticExpedition, command: WorldCommand): void {
    const at = command.issuedAt;
    const base = {
      occurredAt: at,
      actor: command.actor,
      causationId: command.id,
      correlationId: command.id,
    };
    const eventId = (label: string) => `evt-static-${command.id}-${label}`;
    switch (command.type) {
      case 'expedition.start':
        this.#append(
          record,
          [{ id: eventId('started'), type: 'expedition.started', payload: { startedAt: at } }],
          base,
        );
        return;
      case 'expedition.pause':
        this.#append(
          record,
          [{ id: eventId('paused'), type: 'expedition.paused', payload: command.payload }],
          base,
        );
        return;
      case 'expedition.change_speed':
        this.#append(
          record,
          [
            {
              id: eventId('speed'),
              type: 'expedition.speed_changed',
              payload: {
                previousSpeed: record.projection.expedition.simulationSpeed,
                newSpeed: command.payload.speed,
              },
            },
          ],
          base,
        );
        return;
      case 'forecast.commit': {
        const commit = command.payload.commit;
        this.#append(
          record,
          [
            {
              id: eventId('forecast'),
              type: 'forecast.committed',
              payload: {
                commitId: commit.id,
                actor: commit.actor,
                previousProbabilities: commit.previousProbabilities,
                newProbabilities: commit.newProbabilities,
                ...(commit.uncertainty ? { uncertainty: commit.uncertainty } : {}),
                rationale: commit.rationale,
                evidenceSignalIds: commit.evidenceSignalIds,
                assumptions: commit.assumptions,
                commitType: commit.commitType,
                publicNote: commit.publicNote,
                ...(commit.privateMemo ? { privateMemo: commit.privateMemo } : {}),
                scoringEligible: commit.scoringEligible,
              },
            },
          ],
          base,
        );
        return;
      }
      case 'professor.query':
        this.#completeProfessor(record, command.payload.query, command.id, at);
        return;
      case 'agent.assign_mission':
        this.#assignMission(record, command.payload.mission, command.id, at, command.actor);
        return;
      case 'agent.skip_travel':
        this.#completeTravel(record, command.payload.agentId, command.payload.missionId);
        return;
      case 'agent.cancel_mission':
        this.#clearMissionTimers(command.payload.missionId);
        this.#append(
          record,
          [
            {
              id: eventId('mission-canceled'),
              type: 'agent.mission.canceled',
              payload: command.payload,
            },
          ],
          base,
        );
        return;
      case 'agent.reorder_missions':
        this.#append(
          record,
          [
            {
              id: eventId('mission-reordered'),
              type: 'agent.mission.reordered',
              payload: command.payload,
            },
          ],
          base,
        );
        return;
      case 'meeting.request':
        this.#completeMeeting(record, command, at);
        return;
      case 'runtime.retry_turn': {
        this.#append(
          record,
          [
            {
              id: eventId('retry-work'),
              type: 'agent.work.started',
              payload: { agentId: command.payload.agentId, missionId: command.payload.missionId },
            },
          ],
          base,
        );
        this.#scheduleWork(record, command.payload.agentId, command.payload.missionId);
        return;
      }
    }
  }

  #assignMission(
    record: StaticExpedition,
    mission: Mission,
    commandId: string,
    at: string,
    actor: WorldEvent['actor'],
  ): void {
    const agent = record.projection.agentsById[mission.assignedAgentId];
    if (!agent) throw new Error(`Static mission agent ${mission.assignedAgentId} is missing.`);
    const drafts: EventDraft[] = [
      {
        id: `evt-static-${commandId}-mission-queued`,
        type: 'agent.mission.queued',
        payload: { mission },
      },
      {
        id: `evt-static-${commandId}-mission-assigned`,
        type: 'agent.mission.assigned',
        payload: { missionId: mission.id, agentId: mission.assignedAgentId },
      },
    ];
    if (!mission.destinationPlaceId || mission.destinationPlaceId === agent.placeId) {
      drafts.push({
        id: `evt-static-${commandId}-work-started`,
        type: 'agent.work.started',
        payload: { agentId: agent.id, missionId: mission.id },
      });
      this.#append(record, drafts, {
        occurredAt: at,
        actor,
        causationId: commandId,
        correlationId: commandId,
      });
      this.#scheduleWork(record, agent.id, mission.id);
      return;
    }
    const route = selectRoutePlan(
      record.projection.worldManifest,
      agent.placeId,
      mission.destinationPlaceId,
    );
    const firstLeg = route?.legs[0];
    if (!route || !firstLeg) throw new Error('The static mission destination is unreachable.');
    const speed = record.projection.expedition.simulationSpeed || 1;
    drafts.push({
      id: `evt-static-${commandId}-travel-started`,
      type: 'agent.travel.started',
      payload: {
        agentId: agent.id,
        missionId: mission.id,
        routeId: firstLeg.routeId,
        fromPlaceId: firstLeg.fromPlaceId,
        toPlaceId: firstLeg.toPlaceId,
        startedAt: at,
        endsAt: addMilliseconds(at, Math.ceil(firstLeg.durationMs / speed)),
        durationMs: firstLeg.durationMs,
      },
    });
    this.#append(record, drafts, {
      occurredAt: at,
      actor,
      causationId: commandId,
      correlationId: commandId,
    });
    this.#scheduleTravel(record, agent.id, mission.id);
  }

  #scheduleTravel(record: StaticExpedition, agentId: string, missionId: string): void {
    const key = `travel:${missionId}`;
    if (this.#timers.has(key)) return;
    const timer = setTimeout(() => {
      this.#timers.delete(key);
      this.#completeTravel(record, agentId, missionId);
    }, this.#travelDelayMs);
    this.#timers.set(key, timer);
  }

  #completeTravel(record: StaticExpedition, agentId: string, missionId: string): void {
    this.#clearTimer(`travel:${missionId}`);
    const agent = record.projection.agentsById[agentId];
    const mission = record.projection.missionsById[missionId];
    if (!agent?.movement || !mission?.destinationPlaceId) return;
    const plan = selectRoutePlan(
      record.projection.worldManifest,
      agent.movement.fromPlaceId,
      mission.destinationPlaceId,
    );
    if (!plan || plan.legs.length === 0) return;
    const at = this.#now().toISOString();
    const speed = record.projection.expedition.simulationSpeed || 1;
    const drafts: EventDraft[] = [];
    for (const [index, leg] of plan.legs.entries()) {
      if (index > 0) {
        drafts.push({
          id: `evt-static-${missionId}-travel-${index}-started`,
          type: 'agent.travel.started',
          payload: {
            agentId,
            missionId,
            routeId: leg.routeId,
            fromPlaceId: leg.fromPlaceId,
            toPlaceId: leg.toPlaceId,
            startedAt: at,
            endsAt: addMilliseconds(at, Math.ceil(leg.durationMs / speed)),
            durationMs: leg.durationMs,
          },
        });
      }
      drafts.push(
        {
          id: `evt-static-${missionId}-travel-${index}-progress`,
          type: 'agent.travel.progressed',
          payload: { agentId, routeId: leg.routeId, progress: 1 },
        },
        {
          id: `evt-static-${missionId}-travel-${index}-arrived`,
          type: 'agent.arrived',
          payload: { agentId, missionId, placeId: leg.toPlaceId },
        },
      );
    }
    drafts.push({
      id: `evt-static-${missionId}-work-started`,
      type: 'agent.work.started',
      payload: { agentId, missionId },
    });
    this.#append(record, drafts, {
      occurredAt: at,
      causationId: missionId,
      correlationId: missionId,
    });
    this.#scheduleWork(record, agentId, missionId);
  }

  #scheduleWork(record: StaticExpedition, agentId: string, missionId: string): void {
    const key = `work:${missionId}`;
    if (this.#timers.has(key)) return;
    const timer = setTimeout(() => {
      this.#timers.delete(key);
      this.#completeMission(record, agentId, missionId);
    }, this.#workDelayMs);
    this.#timers.set(key, timer);
  }

  #completeMission(record: StaticExpedition, agentId: string, missionId: string): void {
    this.#clearTimer(`work:${missionId}`);
    const mission = record.projection.missionsById[missionId];
    const agent = record.projection.agentsById[agentId];
    if (!mission || !agent || ['completed', 'failed', 'canceled'].includes(mission.status)) return;
    const turn = createScriptedFixtureTurn(record.fixture, {
      mission,
      effectivePlaceId: mission.destinationPlaceId ?? agent.placeId,
      attempt: 1,
      scenario: record.missionScenario,
    });
    const at = this.#now().toISOString();
    const drafts: EventDraft[] = [];
    if (turn.scenario === 'timeout' || turn.scenario === 'invalid_result') {
      const invalid = turn.scenario === 'invalid_result';
      const code = invalid ? 'fixture_invalid_result' : 'fixture_timeout';
      const message = invalid
        ? 'The authored output boundary rejected the injected result; no evidence was applied.'
        : 'The authored static source request reached its injected time limit.';
      drafts.push(
        {
          id: `evt-${turn.turnId}-dialogue`,
          type: 'agent.dialogue.emitted',
          payload: { agentId, text: turn.dialogue, sourceIds: [], signalIds: [] },
        },
        {
          id: `evt-${turn.turnId}-failed`,
          type: 'agent.turn.failed',
          payload: { agentId, missionId, turnId: turn.turnId, code, message, recoverable: true },
        },
        {
          id: `evt-${turn.turnId}-mission-failed`,
          type: 'agent.mission.failed',
          payload: { missionId, code, message },
        },
      );
      this.#append(record, drafts, {
        occurredAt: at,
        causationId: missionId,
        correlationId: missionId,
      });
      return;
    }
    for (const source of turn.sources) {
      if (record.projection.sourcesById[source.id]) continue;
      if (source.supersedesSourceId && record.projection.sourcesById[source.supersedesSourceId]) {
        drafts.push({
          id: `evt-${turn.turnId}-source-${source.id}`,
          type: 'source.superseded',
          payload: { previousSourceId: source.supersedesSourceId, source },
        });
        for (const signal of Object.values(record.projection.signalsById)) {
          if (signal.status !== 'stale' && signal.sourceIds.includes(source.supersedesSourceId)) {
            drafts.push({
              id: `evt-${turn.turnId}-stale-${signal.id}`,
              type: 'signal.marked_stale',
              payload: {
                signalId: signal.id,
                reason: 'A newer authored source version entered the static case file.',
                newerSourceId: source.id,
              },
            });
          }
        }
      } else {
        drafts.push({
          id: `evt-${turn.turnId}-source-${source.id}`,
          type: 'source.recorded',
          payload: { source },
        });
      }
    }
    for (const claim of turn.claims) {
      if (!record.projection.claimsById[claim.id]) {
        drafts.push({
          id: `evt-${turn.turnId}-claim-${claim.id}`,
          type: 'claim.created',
          payload: { claim },
        });
      }
    }
    for (const signal of turn.signals) {
      if (!record.projection.signalsById[signal.id]) {
        drafts.push({
          id: `evt-${turn.turnId}-signal-${signal.id}`,
          type: 'signal.created',
          payload: { signal },
        });
      }
    }
    for (const [objectType, values] of [
      ['source', turn.sources],
      ['claim', turn.claims],
      ['signal', turn.signals],
    ] as const) {
      for (const value of values) {
        const key = `${agentId}:${objectType}:${value.id}`;
        if (record.projection.knowledgeByKey[key]) continue;
        drafts.push({
          id: `evt-${turn.turnId}-knowledge-${objectType}-${value.id}`,
          type: 'agent.knowledge.acquired',
          payload: {
            knowledge: {
              agentId,
              objectType,
              objectId: value.id,
              acquiredAt: at,
              acquisition: { kind: 'retrieved', missionId },
            },
          },
        });
      }
    }
    drafts.push(
      {
        id: `evt-${turn.turnId}-dialogue`,
        type: 'agent.dialogue.emitted',
        payload: {
          agentId,
          text: turn.dialogue,
          sourceIds: turn.sources.map((source) => source.id),
          signalIds: turn.signals.map((signal) => signal.id),
        },
      },
      {
        id: `evt-${turn.turnId}-mission-completed`,
        type: 'agent.mission.completed',
        payload: { missionId, completedAt: at },
      },
    );
    this.#append(record, drafts, {
      occurredAt: at,
      causationId: missionId,
      correlationId: missionId,
    });
  }

  #completeProfessor(
    record: StaticExpedition,
    query: ProfessorQuery,
    commandId: string,
    at: string,
  ): void {
    const response = createScriptedProfessorResponse(record.fixture, record.projection, query);
    const selectedSignalIds = [...new Set(query.selectedSignalIds)].sort();
    const hasEnoughEvidence =
      query.mode === 'correlation_check' &&
      selectedSignalIds.length >= 2 &&
      !response.answer.startsWith('Insufficient evidence:');
    const alreadyAssessed = Object.values(record.projection.correlationsById).some(
      (correlation) => [...correlation.signalIds].sort().join('|') === selectedSignalIds.join('|'),
    );
    const drafts: EventDraft[] = [
      {
        id: `evt-static-${commandId}-professor-started`,
        type: 'professor.query.started',
        payload: { query },
      },
    ];
    if (hasEnoughEvidence && !alreadyAssessed) {
      drafts.push({
        id: `evt-static-${commandId}-correlation`,
        type: 'correlation.detected',
        payload: {
          correlation: {
            id: `correlation-${query.id}`,
            signalIds: selectedSignalIds,
            relationship: 'possibly_correlated',
            reasons: [
              'The selected authored records may share an upstream mechanism.',
              'Distinct signal IDs do not establish statistical independence.',
            ],
            assessedAt: at,
          },
        },
      });
    }
    drafts.push({
      id: `evt-static-${commandId}-professor-response`,
      type: 'professor.response.created',
      payload: {
        response: {
          ...response,
          runtime: {
            mode: 'scripted',
            driverId: 'static-authored-professor',
            durationMs: 0,
            repairAttempts: 0,
          },
        },
      },
    });
    this.#append(record, drafts, {
      occurredAt: at,
      causationId: commandId,
      correlationId: commandId,
    });
  }

  #completeMeeting(
    record: StaticExpedition,
    command: Extract<WorldCommand, { type: 'meeting.request' }>,
    at: string,
  ): void {
    const { meetingId, placeId, participantAgentIds } = command.payload;
    const signalIds = [
      ...new Set(
        participantAgentIds.flatMap(
          (agentId) => record.projection.agentsById[agentId]?.knownSignalIds ?? [],
        ),
      ),
    ].sort();
    const drafts: EventDraft[] = [
      {
        id: `evt-static-${command.id}-meeting-requested`,
        type: 'meeting.requested',
        payload: command.payload,
      },
    ];
    const speed = record.projection.expedition.simulationSpeed || 1;
    for (const agentId of participantAgentIds) {
      const agent = record.projection.agentsById[agentId];
      if (!agent || agent.placeId === placeId) continue;
      const route = selectRoutePlan(record.projection.worldManifest, agent.placeId, placeId);
      if (!route || route.legs.length === 0) {
        throw new Error(`Static meeting place ${placeId} is unreachable for ${agentId}.`);
      }
      const missionId = `meeting-mission-${meetingId}-${agentId}`;
      const meetingMission: Mission = {
        id: missionId,
        expeditionId: record.fixture.expedition.id,
        assignedAgentId: agentId,
        verb: 'meet_agent',
        objective: 'Join the authored static evidence exchange.',
        destinationPlaceId: placeId,
        targetAgentIds: participantAgentIds.filter((id) => id !== agentId),
        budget: { maxToolCalls: 0, timeoutMs: 30_000 },
        status: 'draft',
        createdBy: { kind: 'system' },
        createdAt: at,
      };
      drafts.push(
        {
          id: `evt-static-${command.id}-${agentId}-meeting-mission-queued`,
          type: 'agent.mission.queued',
          payload: { mission: meetingMission },
        },
        {
          id: `evt-static-${command.id}-${agentId}-meeting-mission-assigned`,
          type: 'agent.mission.assigned',
          payload: { missionId, agentId },
        },
      );
      for (const [index, leg] of route.legs.entries()) {
        drafts.push(
          {
            id: `evt-static-${command.id}-${agentId}-meeting-travel-${index}-started`,
            type: 'agent.travel.started',
            payload: {
              agentId,
              missionId,
              routeId: leg.routeId,
              fromPlaceId: leg.fromPlaceId,
              toPlaceId: leg.toPlaceId,
              startedAt: at,
              endsAt: addMilliseconds(at, Math.ceil(leg.durationMs / speed)),
              durationMs: leg.durationMs,
            },
          },
          {
            id: `evt-static-${command.id}-${agentId}-meeting-travel-${index}-progress`,
            type: 'agent.travel.progressed',
            payload: { agentId, routeId: leg.routeId, progress: 1 },
          },
          {
            id: `evt-static-${command.id}-${agentId}-meeting-travel-${index}-arrived`,
            type: 'agent.arrived',
            payload: { agentId, missionId, placeId: leg.toPlaceId },
          },
        );
      }
      drafts.push({
        id: `evt-static-${command.id}-${agentId}-meeting-mission-completed`,
        type: 'agent.mission.completed',
        payload: { missionId, completedAt: at },
      });
    }
    drafts.push({
      id: `evt-static-${command.id}-meeting-started`,
      type: 'meeting.started',
      payload: {
        meeting: {
          id: meetingId,
          expeditionId: record.fixture.expedition.id,
          placeId,
          participantAgentIds,
          startedAt: at,
          sharedSignalIds: [],
          disagreementTypes: signalIds.length > 1 ? ['evidence', 'model', 'prior'] : ['prior'],
        },
      },
    });
    for (const signalId of signalIds) {
      const fromAgentId = participantAgentIds.find((agentId) =>
        record.projection.agentsById[agentId]?.knownSignalIds.includes(signalId),
      );
      const toAgentIds = participantAgentIds.filter(
        (agentId) => !record.projection.agentsById[agentId]?.knownSignalIds.includes(signalId),
      );
      if (!fromAgentId || toAgentIds.length === 0) continue;
      drafts.push({
        id: `evt-static-${command.id}-meeting-share-${signalId}`,
        type: 'meeting.signal_shared',
        payload: { meetingId, signalId, fromAgentId, toAgentIds },
      });
      for (const agentId of toAgentIds) {
        drafts.push({
          id: `evt-static-${command.id}-meeting-knowledge-${agentId}-${signalId}`,
          type: 'agent.knowledge.acquired',
          payload: {
            knowledge: {
              agentId,
              objectType: 'signal',
              objectId: signalId,
              acquiredAt: at,
              acquisition: { kind: 'shared', fromAgentId, meetingId },
            },
          },
        });
      }
    }
    drafts.push(
      {
        id: `evt-static-${command.id}-meeting-memo`,
        type: 'meeting.memo_created',
        payload: {
          meetingId,
          memo: {
            summary:
              signalIds.length > 0
                ? `The team compared ${signalIds.length} authored signal${signalIds.length === 1 ? '' : 's'} and kept their different priors visible.`
                : 'The team recorded that no source-linked signal was yet available to exchange.',
            agreements: ['Every forecast claim must remain linked to the authored source records.'],
            disagreements: [
              'The agents retain different priors and interpretations after the exchange.',
            ],
            followUpMissionProposals: [
              {
                verb: 'consult_professor',
                objective: 'Ask Professor Vale whether the shared signals are independent.',
              },
            ],
          },
        },
      },
      {
        id: `evt-static-${command.id}-meeting-ended`,
        type: 'meeting.ended',
        payload: { meetingId, endedAt: at },
      },
    );
    this.#append(record, drafts, {
      occurredAt: at,
      causationId: command.id,
      correlationId: meetingId,
    });
  }

  #resumePending(record: StaticExpedition): void {
    for (const agent of Object.values(record.projection.agentsById)) {
      const missionId = agent.activeMissionId;
      if (!missionId) continue;
      if (agent.movement) this.#scheduleTravel(record, agent.id, missionId);
      else if (agent.publicState === 'working') this.#scheduleWork(record, agent.id, missionId);
    }
  }

  #clearMissionTimers(missionId: string): void {
    this.#clearTimer(`travel:${missionId}`);
    this.#clearTimer(`work:${missionId}`);
  }

  #clearTimer(key: string): void {
    const timer = this.#timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.#timers.delete(key);
  }
}

export function createStaticDemoRuntime(options: StaticDemoRuntimeOptions = {}): StaticDemoRuntime {
  return new StaticDemoRuntime(options);
}
