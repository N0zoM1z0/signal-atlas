import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalHash } from '@signal-atlas/simulation';
import {
  createHeliosScenarioDefinition,
  InstalledScenarioCatalog,
} from '@signal-atlas/world-content';
import { afterEach, describe, expect, it } from 'vitest';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';
import {
  ExpeditionCreationConflictError,
  ExpeditionRuntimeRegistry,
} from '../src/expedition-runtime-registry.js';
import { SqliteWorkspaceStore } from '../src/sqlite-workspace-store.js';
import { createTestRiverScenarioDefinition } from './support/scenario-definitions.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'signal-atlas-registry-'));
  temporaryDirectories.push(directory);
  return join(directory, 'workspace.sqlite');
}

function registryAt(location: string) {
  const helios = createHeliosScenarioDefinition();
  const river = createTestRiverScenarioDefinition();
  const catalog = new InstalledScenarioCatalog([helios, river]);
  const workspaceStore = new SqliteWorkspaceStore({ location });
  const registry = new ExpeditionRuntimeRegistry({
    catalog,
    workspaceStore,
    now: () => new Date('2027-09-26T18:10:00Z'),
    runtimeFactory: (definition, context) =>
      new ExpeditionRuntime(structuredClone(definition.fixture), {
        scenarioDefinition: definition,
        ...(context.workspaceStore ? { workspaceStore: context.workspaceStore } : {}),
        ...(context.creationReceipt ? { workspaceCreationReceipt: context.creationReceipt } : {}),
        ownsWorkspaceStore: false,
      }),
  });
  return { catalog, registry };
}

function pauseRiverCommand() {
  return {
    id: 'cmd-test-river-pause-1',
    idempotencyKey: 'test-river:pause:1',
    expeditionId: 'exp-test-river-demo',
    issuedAt: '2027-09-26T18:40:00Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'expedition.pause',
    payload: { reason: 'Prove that only this runtime changes.' },
  };
}

describe('expedition runtime registry', () => {
  it('creates, routes, and restores multiple isolated expeditions idempotently', () => {
    const location = temporaryDatabasePath();
    const first = registryAt(location).registry;

    const created = first.create({
      scenarioId: 'test-river-crossing',
      idempotencyKey: 'create:test-river:1',
    });
    expect(created).toMatchObject({
      created: true,
      duplicate: false,
      expedition: { id: 'exp-test-river-demo', latestSequence: 2, status: 'active' },
    });
    expect(
      first.create({
        scenarioId: 'test-river-crossing',
        idempotencyKey: 'create:test-river:1',
      }),
    ).toMatchObject({ created: false, duplicate: true });
    expect(() =>
      first.create({
        scenarioId: 'helios-3-launch-window',
        idempotencyKey: 'create:test-river:1',
      }),
    ).toThrow(ExpeditionCreationConflictError);

    const river = first.get('exp-test-river-demo');
    const helios = first.get('exp-helios3-demo');
    expect(river?.submit(pauseRiverCommand())).toMatchObject({ accepted: true, sequence: 3 });
    expect(river?.snapshot()).toMatchObject({
      sequence: 3,
      expedition: { id: 'exp-test-river-demo', status: 'paused' },
    });
    expect(helios?.snapshot()).toMatchObject({
      sequence: 2,
      expedition: { id: 'exp-helios3-demo', status: 'active' },
    });
    expect(first.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'exp-helios3-demo', latestSequence: 2, status: 'active' }),
        expect.objectContaining({
          id: 'exp-test-river-demo',
          latestSequence: 3,
          status: 'paused',
        }),
      ]),
    );
    first.close();

    const restored = registryAt(location).registry;
    expect(restored.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'exp-helios3-demo', latestSequence: 2, status: 'active' }),
        expect.objectContaining({
          id: 'exp-test-river-demo',
          latestSequence: 3,
          status: 'paused',
        }),
      ]),
    );
    expect(restored.get('exp-test-river-demo')?.snapshot()).toMatchObject({
      sequence: 3,
      expedition: { status: 'paused' },
    });
    expect(
      restored.create({
        scenarioId: 'test-river-crossing',
        idempotencyKey: 'create:test-river:1',
      }),
    ).toMatchObject({ created: false, duplicate: true });
    restored.close();
  });

  it('stores the immutable definition hash reported by the registry', () => {
    const { catalog, registry } = registryAt(':memory:');
    registry.create({
      scenarioId: 'test-river-crossing',
      idempotencyKey: 'create:test-river:hash',
    });
    const installed = catalog.resolve('test-river-crossing', 1);
    expect(registry.list()).toContainEqual(
      expect.objectContaining({
        id: 'exp-test-river-demo',
        definitionHash: installed ? canonicalHash(installed.definition) : 'missing',
      }),
    );
    registry.close();
  });
});
