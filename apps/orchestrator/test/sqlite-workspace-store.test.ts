import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { parseWorldEvent } from '@signal-atlas/contracts';
import { canonicalHash, projectionHash, replayFixture } from '@signal-atlas/simulation';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { createHeliosScenarioDefinition } from '@signal-atlas/world-content';
import { afterEach, describe, expect, it } from 'vitest';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';
import { SqliteWorkspaceStore } from '../src/sqlite-workspace-store.js';
import { workspaceMigrations } from '../src/workspace-migrations.js';
import { WorkspacePersistenceError, WorkspaceSchemaError } from '../src/workspace-store.js';
import type {
  WorkspaceCheckpoint,
  WorkspaceCheckpointInput,
  WorkspaceCommit,
  WorkspaceLoadRequest,
  WorkspaceLoadResult,
  WorkspaceStore,
  WorkspaceStoreDiagnostics,
} from '../src/workspace-store.js';

const temporaryDirectories: string[] = [];

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'signal-atlas-workspace-'));
  temporaryDirectories.push(directory);
  return join(directory, 'workspace.sqlite');
}

function openRequest(fixture = createHelios3ExpeditionFixture()) {
  const definition = { ...createHeliosScenarioDefinition(), fixture };
  return {
    expeditionId: fixture.expedition.id,
    fixtureSeed: fixture.seed,
    fixtureHash: canonicalHash(fixture),
    definition,
    definitionHash: canonicalHash(definition),
    initialEvents: fixture.initialEvents,
  };
}

function pauseCommand() {
  return {
    id: 'cmd-persistence-pause-1',
    idempotencyKey: 'persistence:pause:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:40:00Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'expedition.pause',
    payload: {},
  };
}

function startCommand() {
  return {
    id: 'cmd-persistence-start-1',
    idempotencyKey: 'persistence:start:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:41:00Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'expedition.start',
    payload: {},
  };
}

function weatherAssignmentCommand() {
  return {
    id: 'cmd-persistence-weather-1',
    idempotencyKey: 'persistence:weather:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:32:00Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.assign_mission',
    payload: {
      mission: {
        id: 'mission-persistence-weather-1',
        expeditionId: 'exp-helios3-demo',
        assignedAgentId: 'mira',
        verb: 'observe_conditions',
        objective: 'Check current conditions after a workspace restart.',
        destinationPlaceId: 'weather-tower',
        budget: { maxToolCalls: 3, timeoutMs: 30_000 },
        status: 'draft',
        createdBy: { kind: 'player' },
        createdAt: '2027-09-26T18:32:00Z',
      },
    },
  };
}

class FailingCommitStore implements WorkspaceStore {
  #request: WorkspaceLoadRequest | undefined;

  open(request: WorkspaceLoadRequest): WorkspaceLoadResult {
    this.#request = request;
    return {
      created: true,
      definition: {
        definition: structuredClone(request.definition),
        definitionHash: request.definitionHash,
      },
      events: [...structuredClone(request.initialEvents)],
      receipts: [],
    };
  }

  listExpeditions() {
    return [];
  }

  storedScenarioDefinition() {
    return undefined;
  }

  commit(_input: WorkspaceCommit): void {
    throw new WorkspacePersistenceError('Injected local database write failure.');
  }

  saveCheckpoint(_input: WorkspaceCheckpointInput): void {}

  checkpointsAtOrBefore(_expeditionId: string, _sequence: number): WorkspaceCheckpoint[] {
    return [];
  }

  diagnostics(): WorkspaceStoreDiagnostics {
    return {
      mode: 'sqlite',
      state: 'ready',
      schemaVersion: 2,
      location: ':injected-failure:',
      eventCount: this.#request?.initialEvents.length ?? 0,
      latestSequence: this.#request?.initialEvents.at(-1)?.sequence ?? 0,
      checkpointCount: 0,
    };
  }

  close(): void {}
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLite workspace store', () => {
  it('migrates, seeds fixture events once, and reopens the same contiguous log', () => {
    const location = temporaryDatabasePath();
    const request = openRequest();
    const first = new SqliteWorkspaceStore({ location });

    expect(first.open(request)).toMatchObject({
      created: true,
      events: [{ sequence: 1 }, { sequence: 2 }],
      receipts: [],
    });
    expect(first.diagnostics()).toMatchObject({
      schemaVersion: 2,
      eventCount: 2,
      latestSequence: 2,
      checkpointCount: 0,
    });
    first.close();

    const reopened = new SqliteWorkspaceStore({ location });
    const restored = reopened.open(request);
    expect(restored.created).toBe(false);
    expect(restored.events).toEqual(request.initialEvents);
    expect(reopened.diagnostics()).toMatchObject({ eventCount: 2, latestSequence: 2 });
    reopened.close();

    const database = new DatabaseSync(location);
    expect(
      database.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
    ).toEqual([{ version: 1 }, { version: 2 }]);
    expect(database.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    database.close();
  });

  it('commits an event batch and command receipt atomically across restarts', () => {
    const fixture = createHelios3ExpeditionFixture();
    const runtime = new ExpeditionRuntime(fixture);
    const accepted = runtime.submit(pauseCommand());
    if (!accepted.accepted) throw new Error('Expected the pause command to be accepted.');

    const location = temporaryDatabasePath();
    const store = new SqliteWorkspaceStore({ location });
    store.open(openRequest(fixture));
    store.commit({
      expeditionId: fixture.expedition.id,
      expectedSequence: 2,
      events: accepted.events,
      receipt: {
        idempotencyKey: pauseCommand().idempotencyKey,
        commandId: pauseCommand().id,
        commandHash: canonicalHash(pauseCommand()),
        acceptedAt: pauseCommand().issuedAt,
        result: accepted,
      },
    });
    store.close();

    const reopened = new SqliteWorkspaceStore({ location });
    const restored = reopened.open(openRequest(fixture));
    expect(restored.events.at(-1)).toEqual(accepted.events.at(-1));
    expect(restored.receipts).toEqual([
      expect.objectContaining({
        idempotencyKey: pauseCommand().idempotencyKey,
        commandId: pauseCommand().id,
        result: accepted,
      }),
    ]);
    reopened.close();
  });

  it('stores the full scenario definition and rejects every later identity change', () => {
    const location = temporaryDatabasePath();
    const request = openRequest();
    const store = new SqliteWorkspaceStore({ location });

    const opened = store.open(request);
    expect(opened.definition).toEqual({
      definition: request.definition,
      definitionHash: request.definitionHash,
    });
    expect(store.listExpeditions()).toEqual([
      expect.objectContaining({
        expeditionId: request.expeditionId,
        scenarioId: request.definition.scenario.id,
        scenarioVersion: request.definition.scenario.version,
        definitionSchemaVersion: request.definition.definitionSchemaVersion,
        definitionHash: request.definitionHash,
        latestSequence: 2,
      }),
    ]);
    expect(store.storedScenarioDefinition(request.expeditionId)).toEqual(opened.definition);
    store.close();

    const database = new DatabaseSync(location);
    expect(() =>
      database
        .prepare('UPDATE expeditions SET definition_hash = ? WHERE expedition_id = ?')
        .run('replacement-hash', request.expeditionId),
    ).toThrow(/scenario definition is immutable/u);
    database.close();

    const changedDefinition = structuredClone(request.definition);
    changedDefinition.scenario.title = 'A rewritten installed title';
    const reopened = new SqliteWorkspaceStore({ location });
    expect(() =>
      reopened.open({
        ...request,
        definition: changedDefinition,
        definitionHash: canonicalHash(changedDefinition),
      }),
    ).toThrow(WorkspaceSchemaError);
    reopened.close();
  });

  it('backfills an exact schema-v1 expedition once without rewriting its event history', () => {
    const location = temporaryDatabasePath();
    const request = openRequest();
    const migration = workspaceMigrations.find((candidate) => candidate.version === 1);
    if (!migration) throw new Error('Expected the schema-v1 migration.');
    const legacy = new DatabaseSync(location);
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version > 0),
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    legacy.exec(migration.sql);
    legacy
      .prepare('INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)')
      .run(1, migration.description, '2027-09-26T18:00:00Z');
    legacy
      .prepare(
        `INSERT INTO expeditions
          (expedition_id, fixture_seed, fixture_hash, created_at, latest_sequence)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        request.expeditionId,
        request.fixtureSeed,
        request.fixtureHash,
        '2027-09-26T18:00:00Z',
        request.initialEvents.length,
      );
    const insertEvent = legacy.prepare(
      `INSERT INTO world_events
        (expedition_id, sequence, event_id, event_type, occurred_at, recorded_at,
         correlation_id, event_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    request.initialEvents.forEach((event) =>
      insertEvent.run(
        event.expeditionId,
        event.sequence,
        event.id,
        event.type,
        event.occurredAt,
        event.recordedAt,
        event.correlationId ?? null,
        JSON.stringify(event),
      ),
    );
    legacy.close();

    const migrated = new SqliteWorkspaceStore({ location });
    expect(migrated.storedScenarioDefinition(request.expeditionId)).toBeUndefined();
    const restored = migrated.open(request);
    expect(restored.created).toBe(false);
    expect(restored.events).toEqual(request.initialEvents);
    expect(restored.definition).toEqual({
      definition: request.definition,
      definitionHash: request.definitionHash,
    });
    migrated.close();

    const verified = new DatabaseSync(location);
    expect(
      verified
        .prepare(
          `SELECT scenario_id, scenario_version, definition_schema_version, definition_hash
             FROM expeditions WHERE expedition_id = ?`,
        )
        .get(request.expeditionId),
    ).toEqual({
      scenario_id: request.definition.scenario.id,
      scenario_version: request.definition.scenario.version,
      definition_schema_version: request.definition.definitionSchemaVersion,
      definition_hash: request.definitionHash,
    });
    expect(verified.prepare('SELECT event_json FROM world_events ORDER BY sequence').all()).toEqual(
      request.initialEvents.map((event) => ({ event_json: JSON.stringify(event) })),
    );
    verified.close();
  });

  it('rolls back the entire transaction when a later event violates append-only identity', () => {
    const fixture = createHelios3ExpeditionFixture();
    const runtime = new ExpeditionRuntime(fixture);
    const accepted = runtime.submit(pauseCommand());
    if (!accepted.accepted) throw new Error('Expected the pause command to be accepted.');
    const location = temporaryDatabasePath();
    const store = new SqliteWorkspaceStore({ location });
    store.open(openRequest(fixture));

    const acceptedEvent = accepted.events[0];
    const fixtureEventId = fixture.initialEvents[0]?.id;
    if (!acceptedEvent || !fixtureEventId) throw new Error('Expected fixture and pause events.');
    const duplicateIdentity = parseWorldEvent({
      ...acceptedEvent,
      id: fixtureEventId,
      sequence: 3,
    });
    expect(() =>
      store.commit({
        expeditionId: fixture.expedition.id,
        expectedSequence: 2,
        events: [duplicateIdentity],
        receipt: {
          idempotencyKey: pauseCommand().idempotencyKey,
          commandId: pauseCommand().id,
          commandHash: canonicalHash(pauseCommand()),
          acceptedAt: pauseCommand().issuedAt,
          result: accepted,
        },
      }),
    ).toThrow(WorkspacePersistenceError);
    expect(store.diagnostics()).toMatchObject({ eventCount: 2, latestSequence: 2 });
    store.close();

    const reopened = new SqliteWorkspaceStore({ location });
    const restored = reopened.open(openRequest(fixture));
    expect(restored.receipts).toEqual([]);
    expect(restored.events).toEqual(fixture.initialEvents);
    reopened.close();
  });

  it('stores immutable verified-checkpoint material without replacing an existing sequence', () => {
    const fixture = createHelios3ExpeditionFixture();
    const replay = replayFixture(fixture);
    const location = temporaryDatabasePath();
    const store = new SqliteWorkspaceStore({ location });
    store.open(openRequest(fixture));
    const checkpoint = {
      expeditionId: fixture.expedition.id,
      sequence: replay.projection.sequence,
      projectionSchemaVersion: 1,
      projectionHash: replay.hash,
      projection: replay.projection,
      createdAt: '2027-09-26T18:30:00Z',
    };

    store.saveCheckpoint(checkpoint);
    store.saveCheckpoint({
      ...checkpoint,
      projectionHash: 'replacement-must-not-win',
      createdAt: '2027-09-26T18:31:00Z',
    });

    expect(store.checkpointsAtOrBefore(fixture.expedition.id, 2)).toEqual([
      expect.objectContaining({
        sequence: 2,
        projectionHash: projectionHash(replay.projection),
        projection: replay.projection,
        createdAt: '2027-09-26T18:30:00Z',
      }),
    ]);
    expect(store.diagnostics()).toMatchObject({
      checkpointCount: 1,
      latestCheckpointSequence: 2,
    });
    store.close();
  });

  it('rejects fixture drift and a database created by a newer runtime', () => {
    const location = temporaryDatabasePath();
    const store = new SqliteWorkspaceStore({ location });
    store.open(openRequest());
    store.close();

    const fixtureMismatch = new SqliteWorkspaceStore({ location });
    expect(() =>
      fixtureMismatch.open({ ...openRequest(), fixtureHash: 'different-fixture-hash' }),
    ).toThrow(WorkspaceSchemaError);
    fixtureMismatch.close();

    const futureLocation = temporaryDatabasePath();
    const database = new DatabaseSync(futureLocation);
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations VALUES (99, 'future', '2027-09-26T18:30:00Z');
    `);
    database.close();

    expect(() => new SqliteWorkspaceStore({ location: futureLocation })).toThrow(
      WorkspaceSchemaError,
    );
  });

  it('enforces append-only triggers for events and receipts', () => {
    const fixture = createHelios3ExpeditionFixture();
    const runtime = new ExpeditionRuntime(fixture);
    const accepted = runtime.submit(pauseCommand());
    if (!accepted.accepted) throw new Error('Expected the pause command to be accepted.');
    const location = temporaryDatabasePath();
    const store = new SqliteWorkspaceStore({ location });
    store.open(openRequest(fixture));
    store.commit({
      expeditionId: fixture.expedition.id,
      expectedSequence: 2,
      events: accepted.events,
      receipt: {
        idempotencyKey: pauseCommand().idempotencyKey,
        commandId: pauseCommand().id,
        commandHash: canonicalHash(pauseCommand()),
        acceptedAt: pauseCommand().issuedAt,
        result: accepted,
      },
    });
    store.close();

    const database = new DatabaseSync(location);
    expect(() => database.exec("UPDATE world_events SET event_type = 'changed'")).toThrow(
      /append-only/u,
    );
    expect(() => database.exec('DELETE FROM command_receipts')).toThrow(/append-only/u);
    database.close();
  });

  it('restores the exact projection, replay cursor, and duplicate result after restart', () => {
    const fixture = createHelios3ExpeditionFixture();
    const location = temporaryDatabasePath();
    const first = new ExpeditionRuntime(fixture, {
      workspaceStore: new SqliteWorkspaceStore({ location }),
      checkpointInterval: 2,
    });
    const accepted = first.submit(pauseCommand());
    if (!accepted.accepted) throw new Error('Expected the pause command to be accepted.');
    const expectedProjection = first.snapshot();
    const expectedHash = projectionHash(expectedProjection);
    const expectedEvents = first.eventsAfter(0);
    first.close();

    const restored = new ExpeditionRuntime(fixture, {
      workspaceStore: new SqliteWorkspaceStore({ location }),
      checkpointInterval: 2,
    });
    expect(restored.snapshot()).toEqual(expectedProjection);
    expect(projectionHash(restored.snapshot())).toBe(expectedHash);
    expect(restored.eventsAfter(0)).toEqual(expectedEvents);
    expect(restored.runtimeDiagnostics().workspace).toMatchObject({
      mode: 'sqlite',
      state: 'ready',
      replayBaseSequence: expectedProjection.sequence,
      store: {
        eventCount: expectedProjection.sequence,
        latestSequence: expectedProjection.sequence,
      },
    });

    expect(restored.submit(pauseCommand())).toEqual({ ...accepted, duplicate: true });
    expect(
      restored.submit({
        ...pauseCommand(),
        id: 'cmd-persistence-pause-conflict',
        payload: { reason: 'Different command under the same key.' },
      }),
    ).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'idempotency_conflict' })]),
    });
    restored.close();
  });

  it('falls back to an older verified checkpoint and replays only its event tail', () => {
    const fixture = createHelios3ExpeditionFixture();
    const location = temporaryDatabasePath();
    const first = new ExpeditionRuntime(fixture, {
      workspaceStore: new SqliteWorkspaceStore({ location }),
      checkpointInterval: 1,
    });
    expect(first.submit(pauseCommand())).toMatchObject({ accepted: true, sequence: 3 });
    expect(first.submit(startCommand())).toMatchObject({ accepted: true, sequence: 4 });
    const expected = first.snapshot();
    first.close();

    const database = new DatabaseSync(location);
    database
      .prepare('UPDATE world_checkpoints SET projection_hash = ? WHERE sequence = ?')
      .run('injected-invalid-checkpoint-hash', 4);
    database.close();

    const restored = new ExpeditionRuntime(fixture, {
      workspaceStore: new SqliteWorkspaceStore({ location }),
      checkpointInterval: 1,
    });
    expect(restored.snapshot()).toEqual(expected);
    expect(restored.runtimeDiagnostics().workspace).toMatchObject({
      replayBaseSequence: 3,
      invalidCheckpointCount: 1,
    });
    expect(restored.replayAt(4).hash).toBe(projectionHash(expected));
    restored.close();
  });

  it('resumes durable travel and work scheduling without renumbering history', () => {
    const fixture = createHelios3ExpeditionFixture();
    const location = temporaryDatabasePath();
    const first = new ExpeditionRuntime(fixture, {
      workspaceStore: new SqliteWorkspaceStore({ location }),
    });
    expect(first.submit(weatherAssignmentCommand())).toMatchObject({ accepted: true });
    first.advance(1_000, '2027-09-26T18:32:01Z');
    const travelSequence = first.snapshot().sequence;
    expect(first.snapshot().agentsById['mira']).toMatchObject({
      publicState: 'traveling',
      movement: { progress: expect.any(Number) },
    });
    first.close();

    const afterTravelRestart = new ExpeditionRuntime(fixture, {
      workspaceStore: new SqliteWorkspaceStore({ location }),
    });
    expect(afterTravelRestart.snapshot().sequence).toBe(travelSequence);
    afterTravelRestart.advance(15_000, '2027-09-26T18:32:16Z');
    expect(afterTravelRestart.snapshot().agentsById['mira']).toMatchObject({
      publicState: 'working',
      placeId: 'weather-tower',
    });
    const workSequence = afterTravelRestart.snapshot().sequence;
    afterTravelRestart.close();

    const afterWorkRestart = new ExpeditionRuntime(fixture, {
      workspaceStore: new SqliteWorkspaceStore({ location }),
    });
    expect(afterWorkRestart.snapshot().sequence).toBe(workSequence);
    afterWorkRestart.advance(2_400, '2027-09-26T18:32:18.400Z');
    expect(afterWorkRestart.snapshot().missionsById['mission-persistence-weather-1']).toMatchObject(
      {
        status: 'completed',
      },
    );
    expect(afterWorkRestart.snapshot().signalsById['sig-crosswind']).toBeDefined();
    expect(afterWorkRestart.replayAt(afterWorkRestart.snapshot().sequence).hash).toBe(
      projectionHash(afterWorkRestart.snapshot()),
    );
    afterWorkRestart.close();
  });

  it('rejects and publishes nothing when persistence fails before authority changes', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture(), {
      workspaceStore: new FailingCommitStore(),
    });
    const before = runtime.snapshot();
    const published: unknown[] = [];
    runtime.subscribeEvents((events) => published.push(...events));

    expect(runtime.submit(pauseCommand())).toMatchObject({
      accepted: false,
      issues: [
        expect.objectContaining({
          code: 'invalid_state',
          message: 'Injected local database write failure.',
        }),
      ],
    });
    expect(runtime.snapshot()).toEqual(before);
    expect(runtime.eventsAfter(before.sequence)).toEqual([]);
    expect(published).toEqual([]);
    expect(runtime.runtimeDiagnostics().workspace).toMatchObject({
      state: 'degraded',
      issue: { code: 'workspace_persistence_failed' },
    });
    expect(runtime.submit(pauseCommand())).toMatchObject({ accepted: false });
    runtime.close();
  });
});
