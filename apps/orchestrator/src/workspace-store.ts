import type { ScenarioDefinition, WorldEvent } from '@signal-atlas/contracts';
import type { WorldProjection } from '@signal-atlas/simulation';

export const WORKSPACE_SCHEMA_VERSION = 2;

export interface StoredCommandReceipt {
  idempotencyKey: string;
  commandId: string;
  commandHash: string;
  acceptedAt: string;
  result: unknown;
}

export interface WorkspaceCheckpoint {
  expeditionId: string;
  sequence: number;
  projectionSchemaVersion: number;
  projectionHash: string;
  projection: unknown;
  createdAt: string;
}

export interface WorkspaceLoadRequest {
  expeditionId: string;
  fixtureSeed: string;
  fixtureHash: string;
  definition: ScenarioDefinition;
  definitionHash: string;
  initialEvents: readonly WorldEvent[];
}

export interface WorkspaceLoadResult {
  created: boolean;
  definition: StoredScenarioDefinition;
  events: WorldEvent[];
  receipts: StoredCommandReceipt[];
}

export interface StoredScenarioDefinition {
  definition: ScenarioDefinition;
  definitionHash: string;
}

export interface StoredExpeditionRecord {
  expeditionId: string;
  fixtureSeed: string;
  fixtureHash: string;
  createdAt: string;
  latestSequence: number;
  scenarioId?: string;
  scenarioVersion?: number;
  definitionSchemaVersion?: number;
  definitionHash?: string;
}

export interface WorkspaceCheckpointInput {
  expeditionId: string;
  sequence: number;
  projectionSchemaVersion: number;
  projectionHash: string;
  projection: WorldProjection;
  createdAt: string;
}

export interface WorkspaceCommit {
  expeditionId: string;
  expectedSequence: number;
  events: readonly WorldEvent[];
  receipt?: StoredCommandReceipt;
  checkpoint?: WorkspaceCheckpointInput;
}

export interface WorkspaceStoreDiagnostics {
  mode: 'sqlite';
  state: 'ready' | 'closed';
  schemaVersion: number;
  location: string;
  eventCount: number;
  latestSequence: number;
  checkpointCount: number;
  latestCheckpointSequence?: number;
}

export interface WorkspaceStore {
  open(request: WorkspaceLoadRequest): WorkspaceLoadResult;
  listExpeditions(): StoredExpeditionRecord[];
  storedScenarioDefinition(expeditionId: string): StoredScenarioDefinition | undefined;
  commit(input: WorkspaceCommit): void;
  saveCheckpoint(input: WorkspaceCheckpointInput): void;
  checkpointsAtOrBefore(expeditionId: string, sequence: number): WorkspaceCheckpoint[];
  diagnostics(): WorkspaceStoreDiagnostics;
  close(): void;
}

export class WorkspacePersistenceError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'WorkspacePersistenceError';
  }
}

export class WorkspaceSchemaError extends WorkspacePersistenceError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'WorkspaceSchemaError';
  }
}
