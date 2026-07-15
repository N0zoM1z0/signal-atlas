import { chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  parseScenarioDefinition,
  parseWorldEvent,
  type ScenarioDefinition,
  type WorldEvent,
} from '@signal-atlas/contracts';
import { canonicalHash } from '@signal-atlas/simulation';

import { workspaceMigrations } from './workspace-migrations.js';
import {
  WORKSPACE_SCHEMA_VERSION,
  WorkspacePersistenceError,
  WorkspaceSchemaError,
  type StoredCommandReceipt,
  type StoredExpeditionCreationReceipt,
  type StoredExpeditionRecord,
  type StoredScenarioDefinition,
  type WorkspaceCheckpoint,
  type WorkspaceCheckpointInput,
  type WorkspaceCommit,
  type WorkspaceLoadRequest,
  type WorkspaceLoadResult,
  type WorkspaceStore,
  type WorkspaceStoreDiagnostics,
} from './workspace-store.js';

interface SqliteWorkspaceStoreOptions {
  location: string;
}

interface ExpeditionRow {
  fixture_seed: string;
  fixture_hash: string;
  created_at: string;
  latest_sequence: number;
  scenario_id?: string;
  scenario_version?: number;
  definition_schema_version?: number;
  definition_hash?: string;
  definition_json?: string;
  current_status?: StoredExpeditionRecord['currentStatus'];
}

interface EventRow {
  event_json: string;
}

interface ReceiptRow {
  idempotency_key: string;
  command_id: string;
  command_hash: string;
  accepted_at: string;
  result_json: string;
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorkspacePersistenceError(`SQLite returned an invalid ${context} row.`);
  }
  return value as Record<string, unknown>;
}

function stringField(row: Record<string, unknown>, key: string, context: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new WorkspacePersistenceError(`SQLite ${context}.${key} must be text.`);
  }
  return value;
}

function integerField(row: Record<string, unknown>, key: string, context: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new WorkspacePersistenceError(`SQLite ${context}.${key} must be an integer.`);
  }
  return value;
}

function optionalStringField(
  row: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new WorkspacePersistenceError(`SQLite ${context}.${key} must be text or null.`);
  }
  return value;
}

function optionalIntegerField(
  row: Record<string, unknown>,
  key: string,
  context: string,
): number | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new WorkspacePersistenceError(`SQLite ${context}.${key} must be an integer or null.`);
  }
  return value;
}

const expeditionStatuses: ReadonlySet<string> = new Set([
  'setup',
  'active',
  'paused',
  'resolved',
  'archived',
]);

function optionalExpeditionStatusField(
  row: Record<string, unknown>,
  key: string,
  context: string,
): StoredExpeditionRecord['currentStatus'] | undefined {
  const value = optionalStringField(row, key, context);
  if (value === undefined) return undefined;
  if (!expeditionStatuses.has(value)) {
    throw new WorkspacePersistenceError(`SQLite ${context}.${key} is not an expedition status.`);
  }
  return value as StoredExpeditionRecord['currentStatus'];
}

function parseJson(input: string, context: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch (error: unknown) {
    throw new WorkspacePersistenceError(`SQLite ${context} contains invalid JSON.`, {
      cause: error,
    });
  }
}

function publicPersistenceError(operation: string, error: unknown): WorkspacePersistenceError {
  if (error instanceof WorkspacePersistenceError) return error;
  return new WorkspacePersistenceError(`SQLite workspace ${operation} failed.`, { cause: error });
}

export class SqliteWorkspaceStore implements WorkspaceStore {
  readonly #database: DatabaseSync;
  readonly #location: string;
  #closed = false;
  readonly #openedExpeditionIds = new Set<string>();

  constructor(options: SqliteWorkspaceStoreOptions) {
    this.#location = options.location;
    if (this.#location !== ':memory:') {
      mkdirSync(dirname(this.#location), { recursive: true, mode: 0o700 });
    }
    try {
      this.#database = new DatabaseSync(this.#location);
      if (this.#location !== ':memory:') chmodSync(this.#location, 0o600);
      this.#database.exec('PRAGMA foreign_keys = ON;');
      this.#database.exec('PRAGMA busy_timeout = 5000;');
      this.#database.exec('PRAGMA synchronous = FULL;');
      if (this.#location !== ':memory:') this.#database.exec('PRAGMA journal_mode = WAL;');
      this.#migrate();
    } catch (error: unknown) {
      throw publicPersistenceError('open', error);
    }
  }

  open(request: WorkspaceLoadRequest): WorkspaceLoadResult {
    this.#assertOpen();

    try {
      const definition = this.#validateLoadRequest(request);
      let created = false;
      this.#transaction(() => {
        const existing = this.#expeditionRow(request.expeditionId);
        if (existing) {
          if (
            existing.fixture_seed !== request.fixtureSeed ||
            existing.fixture_hash !== request.fixtureHash
          ) {
            throw new WorkspaceSchemaError(
              `Stored expedition ${request.expeditionId} was created from a different fixture revision.`,
            );
          }
          this.#backfillOrValidateDefinition(request.expeditionId, existing, request, definition);
          if (request.creationReceipt) {
            throw new WorkspacePersistenceError(
              `Expedition ${request.expeditionId} already exists and cannot receive a new creation receipt.`,
            );
          }
          return;
        }

        created = true;
        this.#database
          .prepare(
            `INSERT INTO expeditions
              (expedition_id, fixture_seed, fixture_hash, created_at, latest_sequence,
               scenario_id, scenario_version, definition_schema_version,
               definition_hash, definition_json, current_status)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            request.expeditionId,
            request.fixtureSeed,
            request.fixtureHash,
            request.creationReceipt?.createdAt ?? new Date().toISOString(),
            definition.scenario.id,
            definition.scenario.version,
            definition.definitionSchemaVersion,
            request.definitionHash,
            JSON.stringify(definition),
            definition.fixture.expedition.status,
          );
        this.#appendEvents(request.expeditionId, 0, request.initialEvents);
        if (request.creationReceipt) this.#insertCreationReceipt(request.creationReceipt);
      });

      this.#openedExpeditionIds.add(request.expeditionId);
      const events = this.#loadEvents(request.expeditionId);
      const latestSequence = events.at(-1)?.sequence ?? 0;
      const expedition = this.#expeditionRow(request.expeditionId);
      if (!expedition || expedition.latest_sequence !== latestSequence) {
        throw new WorkspacePersistenceError(
          `Stored expedition sequence metadata does not match its append-only event log.`,
        );
      }
      events.forEach((event, index) => {
        if (event.expeditionId !== request.expeditionId || event.sequence !== index + 1) {
          throw new WorkspacePersistenceError(
            `Stored event log is non-contiguous at sequence ${index + 1}.`,
          );
        }
      });

      return {
        created,
        definition: this.#requiredStoredDefinition(request.expeditionId),
        events,
        receipts: this.#loadReceipts(request.expeditionId),
      };
    } catch (error: unknown) {
      throw publicPersistenceError('initialization', error);
    }
  }

  listExpeditions(): StoredExpeditionRecord[] {
    this.#assertOpen();
    try {
      const rows = this.#database
        .prepare(
          `SELECT expedition_id, fixture_seed, fixture_hash, created_at, latest_sequence,
                  scenario_id, scenario_version, definition_schema_version, definition_hash,
                  current_status
             FROM expeditions
            ORDER BY created_at ASC, expedition_id ASC`,
        )
        .all();
      return rows.map((value): StoredExpeditionRecord => {
        const row = asRecord(value, 'expedition listing');
        const scenarioId = optionalStringField(row, 'scenario_id', 'expedition listing');
        const scenarioVersion = optionalIntegerField(row, 'scenario_version', 'expedition listing');
        const definitionSchemaVersion = optionalIntegerField(
          row,
          'definition_schema_version',
          'expedition listing',
        );
        const definitionHash = optionalStringField(row, 'definition_hash', 'expedition listing');
        const currentStatus = optionalExpeditionStatusField(
          row,
          'current_status',
          'expedition listing',
        );
        return {
          expeditionId: stringField(row, 'expedition_id', 'expedition listing'),
          fixtureSeed: stringField(row, 'fixture_seed', 'expedition listing'),
          fixtureHash: stringField(row, 'fixture_hash', 'expedition listing'),
          createdAt: stringField(row, 'created_at', 'expedition listing'),
          latestSequence: integerField(row, 'latest_sequence', 'expedition listing'),
          ...(currentStatus ? { currentStatus } : {}),
          ...(scenarioId ? { scenarioId } : {}),
          ...(scenarioVersion === undefined ? {} : { scenarioVersion }),
          ...(definitionSchemaVersion === undefined ? {} : { definitionSchemaVersion }),
          ...(definitionHash ? { definitionHash } : {}),
        };
      });
    } catch (error: unknown) {
      throw publicPersistenceError('expedition listing', error);
    }
  }

  storedScenarioDefinition(expeditionId: string): StoredScenarioDefinition | undefined {
    this.#assertOpen();
    try {
      const row = this.#expeditionRow(expeditionId);
      return row ? this.#storedDefinitionFromRow(expeditionId, row) : undefined;
    } catch (error: unknown) {
      throw publicPersistenceError('scenario definition read', error);
    }
  }

  expeditionCreationReceipt(idempotencyKey: string): StoredExpeditionCreationReceipt | undefined {
    this.#assertOpen();
    try {
      const value = this.#database
        .prepare(
          `SELECT idempotency_key, request_hash, scenario_id, scenario_version,
                  expedition_id, created_at, result_json
             FROM expedition_creation_receipts
            WHERE idempotency_key = ?`,
        )
        .get(idempotencyKey);
      if (!value) return undefined;
      const row = asRecord(value, 'expedition creation receipt');
      return {
        idempotencyKey: stringField(row, 'idempotency_key', 'expedition creation receipt'),
        requestHash: stringField(row, 'request_hash', 'expedition creation receipt'),
        scenarioId: stringField(row, 'scenario_id', 'expedition creation receipt'),
        scenarioVersion: integerField(row, 'scenario_version', 'expedition creation receipt'),
        expeditionId: stringField(row, 'expedition_id', 'expedition creation receipt'),
        createdAt: stringField(row, 'created_at', 'expedition creation receipt'),
        result: parseJson(
          stringField(row, 'result_json', 'expedition creation receipt'),
          'expedition creation receipt result_json',
        ),
      };
    } catch (error: unknown) {
      throw publicPersistenceError('expedition creation receipt read', error);
    }
  }

  commit(input: WorkspaceCommit): void {
    this.#assertExpedition(input.expeditionId);
    try {
      this.#transaction(() => {
        this.#appendEvents(input.expeditionId, input.expectedSequence, input.events);
        this.#database
          .prepare('UPDATE expeditions SET current_status = ? WHERE expedition_id = ?')
          .run(input.expeditionStatus, input.expeditionId);
        if (input.receipt) this.#insertReceipt(input.expeditionId, input.receipt);
        if (input.checkpoint) this.#insertCheckpoint(input.checkpoint);
      });
    } catch (error: unknown) {
      throw publicPersistenceError('commit', error);
    }
  }

  saveCheckpoint(input: WorkspaceCheckpointInput): void {
    this.#assertExpedition(input.expeditionId);
    try {
      this.#transaction(() => this.#insertCheckpoint(input));
    } catch (error: unknown) {
      throw publicPersistenceError('checkpoint write', error);
    }
  }

  checkpointsAtOrBefore(expeditionId: string, sequence: number): WorkspaceCheckpoint[] {
    this.#assertExpedition(expeditionId);
    try {
      const rows = this.#database
        .prepare(
          `SELECT expedition_id, sequence, projection_schema_version, projection_hash,
                  projection_json, created_at
             FROM world_checkpoints
            WHERE expedition_id = ? AND sequence <= ?
            ORDER BY sequence DESC`,
        )
        .all(expeditionId, sequence);
      return rows.map((value): WorkspaceCheckpoint => {
        const row = asRecord(value, 'checkpoint');
        const projectionJson = stringField(row, 'projection_json', 'checkpoint');
        let projection: unknown = null;
        try {
          projection = JSON.parse(projectionJson) as unknown;
        } catch {
          // A malformed checkpoint is recoverable because the append-only event log is authority.
        }
        return {
          expeditionId: stringField(row, 'expedition_id', 'checkpoint'),
          sequence: integerField(row, 'sequence', 'checkpoint'),
          projectionSchemaVersion: integerField(row, 'projection_schema_version', 'checkpoint'),
          projectionHash: stringField(row, 'projection_hash', 'checkpoint'),
          projection,
          createdAt: stringField(row, 'created_at', 'checkpoint'),
        };
      });
    } catch (error: unknown) {
      throw publicPersistenceError('checkpoint read', error);
    }
  }

  diagnostics(expeditionId?: string): WorkspaceStoreDiagnostics {
    this.#assertOpen();
    const selectedExpeditionId =
      expeditionId ??
      (this.#openedExpeditionIds.size === 1 ? [...this.#openedExpeditionIds][0] : undefined);
    if (!selectedExpeditionId) {
      return {
        mode: 'sqlite',
        state: 'ready',
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        location: this.#location,
        eventCount: 0,
        latestSequence: 0,
        checkpointCount: 0,
      };
    }
    const eventRow = asRecord(
      this.#database
        .prepare(
          `SELECT COUNT(*) AS event_count, COALESCE(MAX(sequence), 0) AS latest_sequence
             FROM world_events WHERE expedition_id = ?`,
        )
        .get(selectedExpeditionId),
      'event diagnostics',
    );
    const checkpointRow = asRecord(
      this.#database
        .prepare(
          `SELECT COUNT(*) AS checkpoint_count, MAX(sequence) AS latest_checkpoint_sequence
             FROM world_checkpoints WHERE expedition_id = ?`,
        )
        .get(selectedExpeditionId),
      'checkpoint diagnostics',
    );
    const latestCheckpoint = checkpointRow['latest_checkpoint_sequence'];
    return {
      mode: 'sqlite',
      state: 'ready',
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      location: this.#location,
      eventCount: integerField(eventRow, 'event_count', 'event diagnostics'),
      latestSequence: integerField(eventRow, 'latest_sequence', 'event diagnostics'),
      checkpointCount: integerField(checkpointRow, 'checkpoint_count', 'checkpoint diagnostics'),
      ...(typeof latestCheckpoint === 'number' && Number.isInteger(latestCheckpoint)
        ? { latestCheckpointSequence: latestCheckpoint }
        : {}),
    };
  }

  close(): void {
    if (this.#closed) return;
    this.#database.close();
    this.#openedExpeditionIds.clear();
    this.#closed = true;
  }

  #migrate(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version > 0),
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const row = asRecord(
      this.#database
        .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
        .get(),
      'schema migration',
    );
    const currentVersion = integerField(row, 'version', 'schema migration');
    if (currentVersion > WORKSPACE_SCHEMA_VERSION) {
      throw new WorkspaceSchemaError(
        `Workspace schema ${currentVersion} is newer than supported schema ${WORKSPACE_SCHEMA_VERSION}.`,
      );
    }

    for (const migration of workspaceMigrations) {
      if (migration.version <= currentVersion) continue;
      this.#transaction(() => {
        this.#database.exec(migration.sql);
        this.#database
          .prepare(
            'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
          )
          .run(migration.version, migration.description, new Date().toISOString());
      });
    }
  }

  #validateLoadRequest(request: WorkspaceLoadRequest): ScenarioDefinition {
    let definition: ScenarioDefinition;
    try {
      definition = parseScenarioDefinition(request.definition);
    } catch (error: unknown) {
      throw new WorkspaceSchemaError(
        `Expedition ${request.expeditionId} supplied an invalid scenario definition.`,
        { cause: error },
      );
    }
    if (
      definition.fixture.expedition.id !== request.expeditionId ||
      definition.fixture.seed !== request.fixtureSeed
    ) {
      throw new WorkspaceSchemaError(
        `Scenario definition identity does not match expedition ${request.expeditionId}.`,
      );
    }
    if (canonicalHash(definition.fixture) !== request.fixtureHash) {
      throw new WorkspaceSchemaError(
        `Scenario definition fixture hash does not match expedition ${request.expeditionId}.`,
      );
    }
    if (canonicalHash(definition) !== request.definitionHash) {
      throw new WorkspaceSchemaError(
        `Scenario definition hash does not match expedition ${request.expeditionId}.`,
      );
    }
    return definition;
  }

  #backfillOrValidateDefinition(
    expeditionId: string,
    existing: ExpeditionRow,
    request: WorkspaceLoadRequest,
    definition: ScenarioDefinition,
  ): void {
    const stored = this.#storedDefinitionFromRow(expeditionId, existing);
    if (!stored) {
      this.#database
        .prepare(
          `UPDATE expeditions
              SET scenario_id = ?, scenario_version = ?, definition_schema_version = ?,
                  definition_hash = ?, definition_json = ?, current_status = ?
            WHERE expedition_id = ? AND definition_json IS NULL`,
        )
        .run(
          definition.scenario.id,
          definition.scenario.version,
          definition.definitionSchemaVersion,
          request.definitionHash,
          JSON.stringify(definition),
          definition.fixture.expedition.status,
          expeditionId,
        );
      return;
    }
    if (
      stored.definitionHash !== request.definitionHash ||
      stored.definition.scenario.id !== definition.scenario.id ||
      stored.definition.scenario.version !== definition.scenario.version ||
      stored.definition.definitionSchemaVersion !== definition.definitionSchemaVersion
    ) {
      throw new WorkspaceSchemaError(
        `Stored expedition ${expeditionId} was created from a different immutable scenario definition.`,
      );
    }
    if (!existing.current_status) {
      this.#database
        .prepare('UPDATE expeditions SET current_status = ? WHERE expedition_id = ?')
        .run(stored.definition.fixture.expedition.status, expeditionId);
    }
  }

  #requiredStoredDefinition(expeditionId: string): StoredScenarioDefinition {
    const stored = this.storedScenarioDefinition(expeditionId);
    if (!stored) {
      throw new WorkspaceSchemaError(
        `Stored expedition ${expeditionId} does not have a scenario definition.`,
      );
    }
    return stored;
  }

  #storedDefinitionFromRow(
    expeditionId: string,
    row: ExpeditionRow,
  ): StoredScenarioDefinition | undefined {
    const fields = [
      row.scenario_id,
      row.scenario_version,
      row.definition_schema_version,
      row.definition_hash,
      row.definition_json,
    ];
    if (fields.every((field) => field === undefined)) return undefined;
    if (fields.some((field) => field === undefined)) {
      throw new WorkspaceSchemaError(
        `Stored expedition ${expeditionId} has an incomplete scenario-definition migration.`,
      );
    }

    const scenarioId = row.scenario_id as string;
    const scenarioVersion = row.scenario_version as number;
    const definitionSchemaVersion = row.definition_schema_version as number;
    const definitionHash = row.definition_hash as string;
    const definitionJson = row.definition_json as string;
    let definition: ScenarioDefinition;
    try {
      definition = parseScenarioDefinition(parseJson(definitionJson, 'definition_json'));
    } catch (error: unknown) {
      throw new WorkspaceSchemaError(
        `Stored expedition ${expeditionId} contains an invalid scenario definition.`,
        { cause: error },
      );
    }
    if (
      definition.fixture.expedition.id !== expeditionId ||
      definition.fixture.seed !== row.fixture_seed ||
      canonicalHash(definition.fixture) !== row.fixture_hash ||
      definition.scenario.id !== scenarioId ||
      definition.scenario.version !== scenarioVersion ||
      definition.definitionSchemaVersion !== definitionSchemaVersion ||
      canonicalHash(definition) !== definitionHash
    ) {
      throw new WorkspaceSchemaError(
        `Stored expedition ${expeditionId} scenario definition failed its immutable identity check.`,
      );
    }
    return { definition, definitionHash };
  }

  #appendEvents(
    expeditionId: string,
    expectedSequence: number,
    events: readonly WorldEvent[],
  ): void {
    const expedition = this.#expeditionRow(expeditionId);
    if (!expedition) {
      throw new WorkspacePersistenceError(`Expedition ${expeditionId} is not initialized.`);
    }
    if (expedition.latest_sequence !== expectedSequence) {
      throw new WorkspacePersistenceError(
        `Expected durable sequence ${expectedSequence}; found ${expedition.latest_sequence}.`,
      );
    }
    let sequence = expectedSequence;
    const insert = this.#database.prepare(
      `INSERT INTO world_events
        (expedition_id, sequence, event_id, event_type, occurred_at, recorded_at,
         correlation_id, event_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const event of events) {
      sequence += 1;
      if (event.expeditionId !== expeditionId || event.sequence !== sequence) {
        throw new WorkspacePersistenceError(
          `Event ${event.id} must be contiguous at sequence ${sequence}.`,
        );
      }
      insert.run(
        event.expeditionId,
        event.sequence,
        event.id,
        event.type,
        event.occurredAt,
        event.recordedAt,
        event.correlationId ?? null,
        JSON.stringify(event),
      );
    }
    if (events.length > 0) {
      this.#database
        .prepare('UPDATE expeditions SET latest_sequence = ? WHERE expedition_id = ?')
        .run(sequence, expeditionId);
    }
  }

  #insertReceipt(expeditionId: string, receipt: StoredCommandReceipt): void {
    this.#database
      .prepare(
        `INSERT INTO command_receipts
          (expedition_id, idempotency_key, command_id, command_hash, accepted_at, result_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        expeditionId,
        receipt.idempotencyKey,
        receipt.commandId,
        receipt.commandHash,
        receipt.acceptedAt,
        JSON.stringify(receipt.result),
      );
  }

  #insertCreationReceipt(receipt: StoredExpeditionCreationReceipt): void {
    const expedition = this.#expeditionRow(receipt.expeditionId);
    const stored = expedition
      ? this.#storedDefinitionFromRow(receipt.expeditionId, expedition)
      : undefined;
    if (
      !stored ||
      stored.definition.scenario.id !== receipt.scenarioId ||
      stored.definition.scenario.version !== receipt.scenarioVersion
    ) {
      throw new WorkspacePersistenceError(
        `Creation receipt ${receipt.idempotencyKey} does not match expedition ${receipt.expeditionId}.`,
      );
    }
    this.#database
      .prepare(
        `INSERT INTO expedition_creation_receipts
          (idempotency_key, request_hash, scenario_id, scenario_version,
           expedition_id, created_at, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        receipt.idempotencyKey,
        receipt.requestHash,
        receipt.scenarioId,
        receipt.scenarioVersion,
        receipt.expeditionId,
        receipt.createdAt,
        JSON.stringify(receipt.result),
      );
  }

  #insertCheckpoint(input: WorkspaceCheckpointInput): void {
    const expedition = this.#expeditionRow(input.expeditionId);
    if (!expedition || input.sequence > expedition.latest_sequence) {
      throw new WorkspacePersistenceError(
        `Checkpoint sequence ${input.sequence} is ahead of the durable event log.`,
      );
    }
    this.#database
      .prepare(
        `INSERT OR IGNORE INTO world_checkpoints
          (expedition_id, sequence, projection_schema_version, projection_hash,
           projection_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.expeditionId,
        input.sequence,
        input.projectionSchemaVersion,
        input.projectionHash,
        JSON.stringify(input.projection),
        input.createdAt,
      );
  }

  #loadEvents(expeditionId: string): WorldEvent[] {
    const rows = this.#database
      .prepare('SELECT event_json FROM world_events WHERE expedition_id = ? ORDER BY sequence ASC')
      .all(expeditionId);
    return rows.map((value) => {
      const row = asRecord(value, 'event') as unknown as EventRow;
      return parseWorldEvent(parseJson(row.event_json, 'event_json'));
    });
  }

  #loadReceipts(expeditionId: string): StoredCommandReceipt[] {
    const rows = this.#database
      .prepare(
        `SELECT idempotency_key, command_id, command_hash, accepted_at, result_json
           FROM command_receipts
          WHERE expedition_id = ?
          ORDER BY accepted_at ASC, command_id ASC`,
      )
      .all(expeditionId);
    return rows.map((value): StoredCommandReceipt => {
      const row = asRecord(value, 'command receipt') as unknown as ReceiptRow;
      return {
        idempotencyKey: row.idempotency_key,
        commandId: row.command_id,
        commandHash: row.command_hash,
        acceptedAt: row.accepted_at,
        result: parseJson(row.result_json, 'command receipt result_json'),
      };
    });
  }

  #expeditionRow(expeditionId: string): ExpeditionRow | undefined {
    const value = this.#database
      .prepare(
        `SELECT fixture_seed, fixture_hash, created_at, latest_sequence,
                scenario_id, scenario_version, definition_schema_version,
                definition_hash, definition_json, current_status
           FROM expeditions WHERE expedition_id = ?`,
      )
      .get(expeditionId);
    if (!value) return undefined;
    const row = asRecord(value, 'expedition');
    const scenarioId = optionalStringField(row, 'scenario_id', 'expedition');
    const scenarioVersion = optionalIntegerField(row, 'scenario_version', 'expedition');
    const definitionSchemaVersion = optionalIntegerField(
      row,
      'definition_schema_version',
      'expedition',
    );
    const definitionHash = optionalStringField(row, 'definition_hash', 'expedition');
    const definitionJson = optionalStringField(row, 'definition_json', 'expedition');
    const currentStatus = optionalExpeditionStatusField(row, 'current_status', 'expedition');
    return {
      fixture_seed: stringField(row, 'fixture_seed', 'expedition'),
      fixture_hash: stringField(row, 'fixture_hash', 'expedition'),
      created_at: stringField(row, 'created_at', 'expedition'),
      latest_sequence: integerField(row, 'latest_sequence', 'expedition'),
      ...(scenarioId ? { scenario_id: scenarioId } : {}),
      ...(scenarioVersion === undefined ? {} : { scenario_version: scenarioVersion }),
      ...(definitionSchemaVersion === undefined
        ? {}
        : { definition_schema_version: definitionSchemaVersion }),
      ...(definitionHash ? { definition_hash: definitionHash } : {}),
      ...(definitionJson ? { definition_json: definitionJson } : {}),
      ...(currentStatus ? { current_status: currentStatus } : {}),
    };
  }

  #transaction<T>(operation: () => T): T {
    this.#database.exec('BEGIN IMMEDIATE;');
    try {
      const result = operation();
      this.#database.exec('COMMIT;');
      return result;
    } catch (error: unknown) {
      try {
        this.#database.exec('ROLLBACK;');
      } catch {
        // Preserve the original persistence failure.
      }
      throw error;
    }
  }

  #assertExpedition(expeditionId: string): void {
    this.#assertOpen();
    if (!this.#openedExpeditionIds.has(expeditionId)) {
      throw new WorkspacePersistenceError(
        `Workspace store is not open for expedition ${expeditionId}.`,
      );
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new WorkspacePersistenceError('Workspace store is closed.');
  }
}

export function defaultWorkspaceDatabasePath(): string {
  const stateRoot = process.env['XDG_STATE_HOME'] ?? join(homedir(), '.local', 'state');
  return join(stateRoot, 'signal-atlas', 'workspace.sqlite');
}
