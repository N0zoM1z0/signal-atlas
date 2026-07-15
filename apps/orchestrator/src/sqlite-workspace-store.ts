import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { parseWorldEvent, type WorldEvent } from '@signal-atlas/contracts';

import { workspaceMigrations } from './workspace-migrations.js';
import {
  WORKSPACE_SCHEMA_VERSION,
  WorkspacePersistenceError,
  WorkspaceSchemaError,
  type StoredCommandReceipt,
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
  latest_sequence: number;
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
  #expeditionId: string | undefined;

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
    if (this.#expeditionId && this.#expeditionId !== request.expeditionId) {
      throw new WorkspacePersistenceError(
        `This workspace store is already open for expedition ${this.#expeditionId}.`,
      );
    }

    try {
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
          return;
        }

        created = true;
        this.#database
          .prepare(
            `INSERT INTO expeditions
              (expedition_id, fixture_seed, fixture_hash, created_at, latest_sequence)
             VALUES (?, ?, ?, ?, 0)`,
          )
          .run(
            request.expeditionId,
            request.fixtureSeed,
            request.fixtureHash,
            new Date().toISOString(),
          );
        this.#appendEvents(request.expeditionId, 0, request.initialEvents);
      });

      this.#expeditionId = request.expeditionId;
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
        events,
        receipts: this.#loadReceipts(request.expeditionId),
      };
    } catch (error: unknown) {
      throw publicPersistenceError('initialization', error);
    }
  }

  commit(input: WorkspaceCommit): void {
    this.#assertExpedition(input.expeditionId);
    try {
      this.#transaction(() => {
        this.#appendEvents(input.expeditionId, input.expectedSequence, input.events);
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

  diagnostics(): WorkspaceStoreDiagnostics {
    this.#assertOpen();
    const expeditionId = this.#expeditionId;
    if (!expeditionId) {
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
        .get(expeditionId),
      'event diagnostics',
    );
    const checkpointRow = asRecord(
      this.#database
        .prepare(
          `SELECT COUNT(*) AS checkpoint_count, MAX(sequence) AS latest_checkpoint_sequence
             FROM world_checkpoints WHERE expedition_id = ?`,
        )
        .get(expeditionId),
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
        `SELECT fixture_seed, fixture_hash, latest_sequence
           FROM expeditions WHERE expedition_id = ?`,
      )
      .get(expeditionId);
    if (!value) return undefined;
    const row = asRecord(value, 'expedition');
    return {
      fixture_seed: stringField(row, 'fixture_seed', 'expedition'),
      fixture_hash: stringField(row, 'fixture_hash', 'expedition'),
      latest_sequence: integerField(row, 'latest_sequence', 'expedition'),
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
    if (this.#expeditionId !== expeditionId) {
      throw new WorkspacePersistenceError(
        `Workspace store is not open for expedition ${expeditionId}.`,
      );
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new WorkspacePersistenceError('Workspace store is closed.');
  }
}
