import type { ScenarioDefinition } from '@signal-atlas/contracts';
import { canonicalHash } from '@signal-atlas/simulation';
import {
  installedScenarioCatalog,
  type InstalledScenarioCatalog,
} from '@signal-atlas/world-content';

import type { ExpeditionRuntime } from './expedition-runtime.js';
import {
  WorkspacePersistenceError,
  WorkspaceSchemaError,
  type StoredExpeditionCreationReceipt,
  type StoredExpeditionRecord,
  type WorkspaceStore,
} from './workspace-store.js';

export interface ExpeditionRuntimeFactoryContext {
  creationReceipt?: StoredExpeditionCreationReceipt;
  workspaceStore?: WorkspaceStore;
}

export type ExpeditionRuntimeFactory = (
  definition: ScenarioDefinition,
  context: ExpeditionRuntimeFactoryContext,
) => ExpeditionRuntime;

export interface ExpeditionRuntimeRegistryOptions {
  catalog?: InstalledScenarioCatalog;
  defaultScenario?: { id: string; version?: number };
  initialRuntimes?: readonly ExpeditionRuntime[];
  now?: () => Date;
  runtimeFactory: ExpeditionRuntimeFactory;
  workspaceStore?: WorkspaceStore;
}

export interface ExpeditionRegistrySummary {
  id: string;
  scenarioId: string;
  scenarioVersion: number;
  definitionHash: string;
  title: string;
  marketQuestion: string;
  status: 'setup' | 'active' | 'paused' | 'resolved' | 'archived';
  latestSequence: number;
  createdAt: string;
}

export interface CreateExpeditionInput {
  scenarioId: string;
  scenarioVersion?: number;
  idempotencyKey: string;
}

export interface CreateExpeditionResult {
  created: boolean;
  duplicate: boolean;
  expedition: ExpeditionRegistrySummary;
}

export class ScenarioNotInstalledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioNotInstalledError';
  }
}

export class ExpeditionCreationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpeditionCreationConflictError';
  }
}

function parsedCreationResult(receipt: StoredExpeditionCreationReceipt): { expeditionId: string } {
  const result = receipt.result;
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new WorkspacePersistenceError(
      `Expedition creation receipt ${receipt.idempotencyKey} has an invalid result.`,
    );
  }
  const expeditionId = (result as Record<string, unknown>)['expeditionId'];
  if (typeof expeditionId !== 'string' || expeditionId !== receipt.expeditionId) {
    throw new WorkspacePersistenceError(
      `Expedition creation receipt ${receipt.idempotencyKey} does not identify its expedition.`,
    );
  }
  return { expeditionId };
}

export class ExpeditionRuntimeRegistry {
  readonly #catalog: InstalledScenarioCatalog;
  readonly #defaultScenario: { id: string; version?: number };
  readonly #runtimeFactory: ExpeditionRuntimeFactory;
  readonly #workspaceStore: WorkspaceStore | undefined;
  readonly #now: () => Date;
  readonly #runtimes = new Map<string, ExpeditionRuntime>();
  readonly #memoryCreationReceipts = new Map<string, StoredExpeditionCreationReceipt>();
  #closed = false;

  constructor(options: ExpeditionRuntimeRegistryOptions) {
    this.#catalog = options.catalog ?? installedScenarioCatalog;
    this.#defaultScenario = options.defaultScenario ?? { id: 'helios-3-launch-window', version: 1 };
    this.#runtimeFactory = options.runtimeFactory;
    this.#workspaceStore = options.workspaceStore;
    this.#now = options.now ?? (() => new Date());
    for (const runtime of options.initialRuntimes ?? []) {
      if (this.#runtimes.has(runtime.expeditionId)) {
        throw new Error(`Duplicate initial runtime ${runtime.expeditionId}.`);
      }
      this.#runtimes.set(runtime.expeditionId, runtime);
    }
    if (this.#runtimes.size === 0 && (this.#workspaceStore?.listExpeditions().length ?? 0) === 0) {
      const installed = this.#catalog.resolve(
        this.#defaultScenario.id,
        this.#defaultScenario.version,
      );
      if (!installed) {
        throw new ScenarioNotInstalledError(
          `Default scenario ${this.#defaultScenario.id} is not installed.`,
        );
      }
      this.#openDefinition(installed.definition);
    }
  }

  list(): ExpeditionRegistrySummary[] {
    this.#assertOpen();
    const summaries = new Map<string, ExpeditionRegistrySummary>();
    const storedRecords = this.#workspaceStore?.listExpeditions() ?? [];
    for (const record of storedRecords) {
      const definition = this.#definitionForRecord(record);
      summaries.set(record.expeditionId, this.#summaryForRecord(record, definition));
    }
    for (const runtime of this.#runtimes.values()) {
      const snapshot = runtime.snapshot();
      const stored = storedRecords.find((record) => record.expeditionId === runtime.expeditionId);
      const definition = stored
        ? this.#definitionForRecord(stored)
        : this.#catalog.resolveAuthoredExpedition(runtime.expeditionId)?.definition;
      summaries.set(runtime.expeditionId, {
        id: runtime.expeditionId,
        scenarioId: definition?.scenario.id ?? `embedded-${runtime.expeditionId}`,
        scenarioVersion: definition?.scenario.version ?? 1,
        definitionHash: definition ? canonicalHash(definition) : 'memory-only',
        title: snapshot.expedition.title,
        marketQuestion: snapshot.market.question,
        status: snapshot.expedition.status,
        latestSequence: snapshot.sequence,
        createdAt: stored?.createdAt ?? snapshot.expedition.startedAt ?? snapshot.market.createdAt,
      });
    }
    return [...summaries.values()].sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
  }

  get(expeditionId: string): ExpeditionRuntime | undefined {
    this.#assertOpen();
    const active = this.#runtimes.get(expeditionId);
    if (active) return active;
    const record = this.#workspaceStore
      ?.listExpeditions()
      .find((candidate) => candidate.expeditionId === expeditionId);
    if (!record) return undefined;
    return this.#openDefinition(this.#definitionForRecord(record));
  }

  primary(): ExpeditionRuntime {
    const first = this.list()[0];
    if (!first) throw new WorkspacePersistenceError('No local expedition is available.');
    const runtime = this.get(first.id);
    if (!runtime)
      throw new WorkspacePersistenceError(`Expedition ${first.id} could not be opened.`);
    return runtime;
  }

  create(input: CreateExpeditionInput): CreateExpeditionResult {
    this.#assertOpen();
    const installed = this.#catalog.resolve(input.scenarioId, input.scenarioVersion);
    if (!installed) {
      throw new ScenarioNotInstalledError(
        `Scenario ${input.scenarioId}${input.scenarioVersion ? ` version ${input.scenarioVersion}` : ''} is not installed.`,
      );
    }
    const requestHash = canonicalHash({
      scenarioId: installed.summary.id,
      scenarioVersion: installed.summary.version,
    });
    const existingReceipt =
      this.#workspaceStore?.expeditionCreationReceipt(input.idempotencyKey) ??
      this.#memoryCreationReceipts.get(input.idempotencyKey);
    if (existingReceipt) {
      if (existingReceipt.requestHash !== requestHash) {
        throw new ExpeditionCreationConflictError(
          `Idempotency key ${input.idempotencyKey} was already used for another scenario request.`,
        );
      }
      const { expeditionId } = parsedCreationResult(existingReceipt);
      const expedition = this.list().find((candidate) => candidate.id === expeditionId);
      if (!expedition) {
        throw new WorkspacePersistenceError(
          `Creation receipt ${input.idempotencyKey} references a missing expedition.`,
        );
      }
      return { created: false, duplicate: true, expedition };
    }

    const expeditionId = installed.definition.fixture.expedition.id;
    if (this.list().some((candidate) => candidate.id === expeditionId)) {
      throw new ExpeditionCreationConflictError(
        `Scenario ${installed.summary.id} version ${installed.summary.version} already owns expedition ${expeditionId}.`,
      );
    }
    const createdAt = this.#now().toISOString();
    const receipt: StoredExpeditionCreationReceipt = {
      idempotencyKey: input.idempotencyKey,
      requestHash,
      scenarioId: installed.summary.id,
      scenarioVersion: installed.summary.version,
      expeditionId,
      createdAt,
      result: {
        expeditionId,
        scenarioId: installed.summary.id,
        scenarioVersion: installed.summary.version,
      },
    };
    const runtime = this.#openDefinition(installed.definition, receipt);
    if (!this.#workspaceStore) this.#memoryCreationReceipts.set(input.idempotencyKey, receipt);
    const expedition = this.list().find((candidate) => candidate.id === runtime.expeditionId);
    if (!expedition) throw new Error(`Created expedition ${runtime.expeditionId} was not listed.`);
    return { created: true, duplicate: false, expedition };
  }

  advance(elapsedMs: number, occurredAt: string): void {
    this.#assertOpen();
    for (const runtime of this.#runtimes.values()) runtime.advance(elapsedMs, occurredAt);
  }

  async waitForIdle(): Promise<void> {
    await Promise.all([...this.#runtimes.values()].map((runtime) => runtime.waitForRuntimeIdle()));
  }

  close(): void {
    if (this.#closed) return;
    for (const runtime of this.#runtimes.values()) runtime.close();
    this.#workspaceStore?.close();
    this.#closed = true;
  }

  #definitionForRecord(record: StoredExpeditionRecord): ScenarioDefinition {
    const stored = this.#workspaceStore?.storedScenarioDefinition(record.expeditionId);
    if (stored) return stored.definition;
    const installed = this.#catalog.resolveAuthoredExpedition(record.expeditionId);
    if (!installed || canonicalHash(installed.definition.fixture) !== record.fixtureHash) {
      throw new WorkspaceSchemaError(
        `Legacy expedition ${record.expeditionId} has no exact installed scenario definition for migration.`,
      );
    }
    return installed.definition;
  }

  #summaryForRecord(
    record: StoredExpeditionRecord,
    definition: ScenarioDefinition,
  ): ExpeditionRegistrySummary {
    return {
      id: record.expeditionId,
      scenarioId: definition.scenario.id,
      scenarioVersion: definition.scenario.version,
      definitionHash: record.definitionHash ?? canonicalHash(definition),
      title: definition.fixture.expedition.title,
      marketQuestion: definition.fixture.market.question,
      status: record.currentStatus ?? definition.fixture.expedition.status,
      latestSequence: record.latestSequence,
      createdAt: record.createdAt,
    };
  }

  #openDefinition(
    definition: ScenarioDefinition,
    creationReceipt?: StoredExpeditionCreationReceipt,
  ): ExpeditionRuntime {
    const existing = this.#runtimes.get(definition.fixture.expedition.id);
    if (existing) return existing;
    const runtime = this.#runtimeFactory(definition, {
      ...(creationReceipt ? { creationReceipt } : {}),
      ...(this.#workspaceStore ? { workspaceStore: this.#workspaceStore } : {}),
    });
    this.#runtimes.set(runtime.expeditionId, runtime);
    return runtime;
  }

  #assertOpen(): void {
    if (this.#closed) throw new WorkspacePersistenceError('Expedition registry is closed.');
  }
}
