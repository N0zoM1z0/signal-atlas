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
  {
    version: 2,
    description: 'Persist immutable versioned scenario definitions with each expedition.',
    sql: `
      ALTER TABLE expeditions ADD COLUMN scenario_id TEXT;
      ALTER TABLE expeditions ADD COLUMN scenario_version INTEGER
        CHECK (scenario_version IS NULL OR scenario_version > 0);
      ALTER TABLE expeditions ADD COLUMN definition_schema_version INTEGER
        CHECK (definition_schema_version IS NULL OR definition_schema_version > 0);
      ALTER TABLE expeditions ADD COLUMN definition_hash TEXT;
      ALTER TABLE expeditions ADD COLUMN definition_json TEXT
        CHECK (definition_json IS NULL OR json_valid(definition_json));

      CREATE INDEX expeditions_scenario_version_idx
        ON expeditions (scenario_id, scenario_version, created_at);

      CREATE TRIGGER expeditions_fixture_identity_no_update
      BEFORE UPDATE OF fixture_seed, fixture_hash ON expeditions
      BEGIN
        SELECT RAISE(ABORT, 'expedition fixture identity is immutable');
      END;

      CREATE TRIGGER expeditions_definition_no_update
      BEFORE UPDATE OF scenario_id, scenario_version, definition_schema_version,
                       definition_hash, definition_json ON expeditions
      WHEN OLD.definition_json IS NOT NULL AND (
        NEW.scenario_id IS NOT OLD.scenario_id OR
        NEW.scenario_version IS NOT OLD.scenario_version OR
        NEW.definition_schema_version IS NOT OLD.definition_schema_version OR
        NEW.definition_hash IS NOT OLD.definition_hash OR
        NEW.definition_json IS NOT OLD.definition_json
      )
      BEGIN
        SELECT RAISE(ABORT, 'expedition scenario definition is immutable');
      END;
    `,
  },
];
