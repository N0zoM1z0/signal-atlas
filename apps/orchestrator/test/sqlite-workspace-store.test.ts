import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { parseWorldEvent } from '@signal-atlas/contracts';
import { canonicalHash, projectionHash, replayFixture } from '@signal-atlas/simulation';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';
import { SqliteWorkspaceStore } from '../src/sqlite-workspace-store.js';
import { WorkspacePersistenceError, WorkspaceSchemaError } from '../src/workspace-store.js';

const temporaryDirectories: string[] = [];

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'signal-atlas-workspace-'));
  temporaryDirectories.push(directory);
  return join(directory, 'workspace.sqlite');
}

function openRequest(fixture = createHelios3ExpeditionFixture()) {
  return {
    expeditionId: fixture.expedition.id,
    fixtureSeed: fixture.seed,
    fixtureHash: canonicalHash(fixture),
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
      schemaVersion: 1,
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
    ).toEqual([{ version: 1 }]);
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
});
