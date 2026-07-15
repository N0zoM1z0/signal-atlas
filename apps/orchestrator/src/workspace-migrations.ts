export interface WorkspaceMigration {
  version: number;
  description: string;
  sql: string;
}

export const workspaceMigrations: readonly WorkspaceMigration[] = [
  {
    version: 1,
    description: 'Create durable expeditions, append-only events, receipts, and checkpoints.',
    sql: `
      CREATE TABLE expeditions (
        expedition_id TEXT PRIMARY KEY,
        fixture_seed TEXT NOT NULL,
        fixture_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        latest_sequence INTEGER NOT NULL CHECK (latest_sequence >= 0)
      ) STRICT;

      CREATE TABLE world_events (
        expedition_id TEXT NOT NULL REFERENCES expeditions(expedition_id),
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        correlation_id TEXT,
        event_json TEXT NOT NULL CHECK (json_valid(event_json)),
        PRIMARY KEY (expedition_id, sequence)
      ) STRICT;

      CREATE INDEX world_events_correlation_idx
        ON world_events (expedition_id, correlation_id, sequence);

      CREATE TRIGGER world_events_no_update
      BEFORE UPDATE ON world_events
      BEGIN
        SELECT RAISE(ABORT, 'world_events is append-only');
      END;

      CREATE TRIGGER world_events_no_delete
      BEFORE DELETE ON world_events
      BEGIN
        SELECT RAISE(ABORT, 'world_events is append-only');
      END;

      CREATE TABLE command_receipts (
        expedition_id TEXT NOT NULL REFERENCES expeditions(expedition_id),
        idempotency_key TEXT NOT NULL,
        command_id TEXT NOT NULL,
        command_hash TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        result_json TEXT NOT NULL CHECK (json_valid(result_json)),
        PRIMARY KEY (expedition_id, idempotency_key),
        UNIQUE (expedition_id, command_id)
      ) STRICT;

      CREATE TRIGGER command_receipts_no_update
      BEFORE UPDATE ON command_receipts
      BEGIN
        SELECT RAISE(ABORT, 'command_receipts is append-only');
      END;

      CREATE TRIGGER command_receipts_no_delete
      BEFORE DELETE ON command_receipts
      BEGIN
        SELECT RAISE(ABORT, 'command_receipts is append-only');
      END;

      CREATE TABLE world_checkpoints (
        expedition_id TEXT NOT NULL REFERENCES expeditions(expedition_id),
        sequence INTEGER NOT NULL CHECK (sequence >= 0),
        projection_schema_version INTEGER NOT NULL CHECK (projection_schema_version > 0),
        projection_hash TEXT NOT NULL,
        projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
        created_at TEXT NOT NULL,
        PRIMARY KEY (expedition_id, sequence)
      ) STRICT;

      CREATE INDEX world_checkpoints_latest_idx
        ON world_checkpoints (expedition_id, sequence DESC);
    `,
  },
];
