import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InstalledScenarioCatalog,
  createHeliosScenarioDefinition,
} from '@signal-atlas/world-content';

import { buildApp } from '../src/app.js';
import { SqliteWorkspaceStore } from '../src/sqlite-workspace-store.js';
import type { WorkspaceStore } from '../src/workspace-store.js';
import { createTestRiverScenarioDefinition } from './support/scenario-definitions.js';

const openApps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('orchestrator health endpoint', () => {
  it('returns a typed, fixture-safe readiness response', async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'signal-atlas-orchestrator',
      mode: 'fixture',
      version: '0.0.0',
    });
  });

  it('serves the current authoritative expedition snapshot', async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-helios3-demo/snapshot',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projection: {
        sequence: 2,
        expedition: { id: 'exp-helios3-demo' },
      },
    });
  });

  it('lists the local expedition before the browser requests its snapshot', async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/expeditions' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      expeditions: [
        {
          id: 'exp-helios3-demo',
          latestSequence: 2,
          marketQuestion: 'Will the Helios-3 mission launch before September 30?',
          scenarioId: 'helios-3-launch-window',
          scenarioVersion: 1,
          definitionHash: expect.any(String),
          status: 'active',
          title: 'Helios-3 Launch Window',
          createdAt: '2027-09-26T18:00:00Z',
        },
      ],
    });
  });

  it('validates and idempotently creates an installed expedition through the public API', async () => {
    const scenarioCatalog = new InstalledScenarioCatalog([
      createHeliosScenarioDefinition(),
      createTestRiverScenarioDefinition(),
    ]);
    const app = buildApp({
      scenarioCatalog,
      workspaceStore: new SqliteWorkspaceStore({ location: ':memory:' }),
    });
    openApps.push(app);

    const malformed = await app.inject({
      method: 'POST',
      url: '/api/expeditions',
      payload: { scenarioId: 'test-river-crossing', unexpected: true },
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/api/expeditions',
      payload: { scenarioId: 'missing-scenario', idempotencyKey: 'create:missing:1' },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/expeditions',
      payload: { scenarioId: 'test-river-crossing', idempotencyKey: 'create:test-river:api:1' },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/expeditions',
      payload: { scenarioId: 'test-river-crossing', idempotencyKey: 'create:test-river:api:1' },
    });
    const riverSnapshot = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-test-river-demo/snapshot',
    });
    const riverDiagnostics = await app.inject({
      method: 'GET',
      url: '/api/runtime/diagnostics?expeditionId=exp-test-river-demo',
    });

    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ error: 'invalid_create_expedition_request' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'scenario_not_installed' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      created: true,
      duplicate: false,
      expedition: { id: 'exp-test-river-demo', scenarioId: 'test-river-crossing' },
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ created: false, duplicate: true });
    expect(riverSnapshot.statusCode).toBe(200);
    expect(riverSnapshot.json()).toMatchObject({
      projection: { expedition: { id: 'exp-test-river-demo' }, sequence: 2 },
    });
    expect(riverDiagnostics.statusCode).toBe(200);
    expect(riverDiagnostics.json()).toMatchObject({ workspace: { latestSequence: 2 } });
  });

  it('lists safe installed scenario metadata without exposing fixture resolution content', async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/scenarios' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scenarios: [
        expect.objectContaining({
          id: 'helios-3-launch-window',
          version: 1,
          authoredExpeditionId: 'exp-helios3-demo',
          definitionSchemaVersion: 1,
          available: true,
          requiredCapabilities: ['local_conditions', 'search_sources'],
        }),
      ],
    });
    expect(response.body).not.toContain('resolutionFixture');
    expect(response.body).not.toContain('resolvedOutcomeId');
    expect(response.body).not.toContain('scriptedMissionResults');
  });

  it('reports the configured driver and scheduler without exposing private input', async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/runtime/diagnostics' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      driver: {
        id: 'fixture-scripted-codex',
        kind: 'scripted',
        available: true,
      },
      scheduler: {
        maxConcurrency: 2,
        defaultTimeoutMs: 30_000,
        activeCount: 0,
        queuedCount: 0,
      },
      professor: {
        id: 'scripted-professor',
        kind: 'scripted',
        configuredMode: 'scripted',
        activeMode: 'scripted',
      },
      workspace: {
        mode: 'memory',
        state: 'ready',
        eventCount: 2,
        latestSequence: 2,
        replayBaseSequence: 0,
      },
      turns: [],
    });
    expect(response.body).not.toContain('prompt');
    expect(response.body).not.toContain('secret');
  });

  it('closes an injected workspace store when runtime restoration rejects startup', () => {
    const close = vi.fn();
    const workspaceStore: WorkspaceStore = {
      open: () => {
        throw new Error('fixture fingerprint mismatch');
      },
      listExpeditions: () => [],
      storedScenarioDefinition: () => undefined,
      expeditionCreationReceipt: () => undefined,
      commit: () => undefined,
      saveCheckpoint: () => undefined,
      checkpointsAtOrBefore: () => [],
      diagnostics: () => ({
        mode: 'sqlite',
        state: 'ready',
        schemaVersion: 3,
        location: '<test>',
        eventCount: 0,
        latestSequence: 0,
        checkpointCount: 0,
      }),
      close,
    };

    expect(() => buildApp({ workspaceStore })).toThrow('fixture fingerprint mismatch');
    expect(close).toHaveBeenCalledOnce();
  });

  it('exposes safe Pref connection controls and primitive diagnostics', async () => {
    const app = buildApp();
    openApps.push(app);

    const initial = await app.inject({ method: 'GET', url: '/api/runtime/pref' });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({
      mode: 'fixture',
      state: 'connected',
      credentialState: 'not_required',
      inventory: {
        tools: [{ name: 'fixture.local_conditions', readOnly: true }],
      },
      mappings: [{ canonicalName: 'local_conditions', status: 'valid' }],
    });

    const disconnected = await app.inject({
      method: 'POST',
      url: '/api/runtime/pref/disconnect',
    });
    expect(disconnected.statusCode).toBe(200);
    expect(disconnected.json()).toMatchObject({ state: 'disconnected', connected: false });

    const reconnected = await app.inject({ method: 'POST', url: '/api/runtime/pref/test' });
    expect(reconnected.statusCode).toBe(200);
    expect(reconnected.json()).toMatchObject({ state: 'connected', connected: true });
    expect(reconnected.body).not.toMatch(/authorization|bearer|api[_-]?key|token/iu);
  });

  it('rejects foreign browser mutation origins without changing local state', async () => {
    const app = buildApp();
    openApps.push(app);

    const disconnected = await app.inject({
      method: 'POST',
      url: '/api/runtime/pref/disconnect',
      headers: { origin: 'https://attacker.example' },
    });
    const resolved = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/resolve-fixture',
      headers: { origin: 'https://attacker.example' },
      payload: {},
    });
    const crossSiteWithoutOrigin = await app.inject({
      method: 'POST',
      url: '/api/runtime/pref/disconnect',
      headers: { 'sec-fetch-site': 'cross-site' },
    });

    expect(disconnected.statusCode).toBe(403);
    expect(resolved.statusCode).toBe(403);
    expect(crossSiteWithoutOrigin.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/runtime/pref' })).json()).toMatchObject({
      state: 'connected',
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/expeditions/exp-helios3-demo/snapshot',
        })
      ).json(),
    ).toMatchObject({ projection: { market: { status: 'open' } } });
  });

  it('accepts the fixed local web origin and origin-less native clients', async () => {
    const app = buildApp();
    openApps.push(app);

    const localBrowser = await app.inject({
      method: 'POST',
      url: '/api/runtime/pref/disconnect',
      headers: { origin: 'http://127.0.0.1:4173' },
    });
    const nativeClient = await app.inject({ method: 'POST', url: '/api/runtime/pref/test' });

    expect(localBrowser.statusCode).toBe(200);
    expect(nativeClient.statusCode).toBe(200);
  });

  it('allows public commands to represent only the player and rejects forged creators', async () => {
    const app = buildApp();
    openApps.push(app);
    const missionCommand = {
      id: 'cmd-public-authority-1',
      idempotencyKey: 'public:authority:mission:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt: '2027-09-26T18:32:00Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'agent.assign_mission',
      payload: {
        mission: {
          id: 'mission-public-authority-1',
          expeditionId: 'exp-helios3-demo',
          assignedAgentId: 'mira',
          verb: 'observe_conditions',
          objective: 'Check the latest weather at Galehaven Weather Tower.',
          destinationPlaceId: 'weather-tower',
          budget: { maxToolCalls: 1, timeoutMs: 15_000 },
          status: 'draft',
          createdBy: { kind: 'player' },
          createdAt: '2027-09-26T18:32:00Z',
        },
      },
    };

    for (const kind of ['agent', 'system']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/expeditions/exp-helios3-demo/commands',
        payload: {
          ...missionCommand,
          id: `cmd-forged-${kind}-authority`,
          idempotencyKey: `public:forged:${kind}:authority`,
          actor: kind === 'agent' ? { kind, id: 'mira' } : { kind },
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'command_actor_not_allowed' });
    }

    const forgedCreator = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/commands',
      payload: {
        ...missionCommand,
        id: 'cmd-forged-mission-creator',
        idempotencyKey: 'public:forged:mission:creator',
        payload: {
          mission: { ...missionCommand.payload.mission, createdBy: { kind: 'system' } },
        },
      },
    });
    expect(forgedCreator.statusCode).toBe(422);
    expect(forgedCreator.json()).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ['payload', 'mission', 'createdBy'] }),
      ]),
    });

    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-helios3-demo/snapshot',
    });
    expect(snapshot.json()).toMatchObject({ projection: { sequence: 2, missionsById: {} } });
  });

  it('rejects foreign authorities on read and mutation routes before exposing local state', async () => {
    const app = buildApp();
    openApps.push(app);
    const hostileHeaders = { host: 'attacker.example:4317' };

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/runtime/diagnostics', headers: hostileHeaders }),
      app.inject({ method: 'GET', url: '/api/runtime/pref', headers: hostileHeaders }),
      app.inject({
        method: 'GET',
        url: '/api/expeditions/exp-helios3-demo/snapshot',
        headers: hostileHeaders,
      }),
      app.inject({
        method: 'GET',
        url: '/api/expeditions/exp-helios3-demo/events',
        headers: hostileHeaders,
      }),
      app.inject({
        method: 'POST',
        url: '/api/runtime/pref/disconnect',
        headers: hostileHeaders,
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'request_authority_not_allowed' });
    }

    for (const host of ['127.0.0.1:4317', '127.0.0.1:4173', 'localhost:4317']) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/expeditions/exp-helios3-demo/snapshot',
        headers: { host },
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it('selects the visible scripted fallback when local Codex is absent', async () => {
    const previousMode = process.env['SIGNAL_ATLAS_CODEX_MODE'];
    const previousExecutable = process.env['SIGNAL_ATLAS_CODEX_EXECUTABLE'];
    process.env['SIGNAL_ATLAS_CODEX_MODE'] = 'local';
    process.env['SIGNAL_ATLAS_CODEX_EXECUTABLE'] = '/definitely/missing/signal-atlas-codex';
    try {
      const app = buildApp();
      openApps.push(app);

      const response = await app.inject({ method: 'GET', url: '/api/runtime/diagnostics' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        driver: {
          kind: 'local_exec',
          activeMode: 'scripted_fallback',
          available: true,
          fallback: { driverId: 'fixture-scripted-codex', used: false },
        },
        professor: {
          kind: 'local_exec',
          configuredMode: 'local',
          activeMode: 'local_exec',
          available: false,
        },
      });
      expect(response.body).not.toMatch(/auth\.json|api[_-]?key|bearer/iu);
    } finally {
      if (previousMode === undefined) delete process.env['SIGNAL_ATLAS_CODEX_MODE'];
      else process.env['SIGNAL_ATLAS_CODEX_MODE'] = previousMode;
      if (previousExecutable === undefined) {
        delete process.env['SIGNAL_ATLAS_CODEX_EXECUTABLE'];
      } else {
        process.env['SIGNAL_ATLAS_CODEX_EXECUTABLE'] = previousExecutable;
      }
    }
  });

  it('interprets drafts and accepts idempotent mission commands', async () => {
    const app = buildApp();
    openApps.push(app);
    const command = {
      id: 'cmd-api-weather-1',
      idempotencyKey: 'api:mission:weather:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt: '2027-09-26T18:32:00Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'agent.assign_mission',
      payload: {
        mission: {
          id: 'mission-api-weather-1',
          expeditionId: 'exp-helios3-demo',
          assignedAgentId: 'mira',
          verb: 'observe_conditions',
          objective: 'Check latest weather at Galehaven Weather Tower.',
          destinationPlaceId: 'weather-tower',
          budget: { maxToolCalls: 3, timeoutMs: 30_000 },
          status: 'draft',
          createdBy: { kind: 'player' },
          createdAt: '2027-09-26T18:32:00Z',
        },
      },
    };

    const draft = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/mission-drafts/interpret',
      payload: { text: command.payload.mission.objective, selectedAgentId: 'mira' },
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/commands',
      payload: command,
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/commands',
      payload: command,
    });

    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toMatchObject({ draft: { status: 'ready', verb: 'observe_conditions' } });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toMatchObject({ accepted: true, duplicate: false, sequence: 5 });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ accepted: true, duplicate: true, sequence: 5 });
  });

  it('switches fixture result scenarios through a validated configuration endpoint', async () => {
    const app = buildApp();
    openApps.push(app);

    const initial = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-helios3-demo/fixture-configuration',
    });
    const changed = await app.inject({
      method: 'PUT',
      url: '/api/expeditions/exp-helios3-demo/fixture-configuration',
      payload: { missionScenario: 'timeout' },
    });
    const rejected = await app.inject({
      method: 'PUT',
      url: '/api/expeditions/exp-helios3-demo/fixture-configuration',
      payload: { missionScenario: 'surprise' },
    });

    expect(initial.json()).toMatchObject({
      seed: 'helios3-cozy-intelligence-v1',
      missionScenario: 'success',
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ missionScenario: 'timeout' });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({ error: 'invalid_fixture_mission_scenario' });
  });

  it('resolves only from the fixture and serves exact replay plus a public case file', async () => {
    const app = buildApp();
    openApps.push(app);
    const forecast = {
      id: 'cmd-api-forecast-hold-1',
      idempotencyKey: 'api:forecast:hold:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt: '2027-09-26T18:42:00Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'forecast.commit',
      payload: {
        commit: {
          id: 'forecast-api-hold-1',
          expeditionId: 'exp-helios3-demo',
          actor: { kind: 'player' },
          previousProbabilities: { yes: 0.55, no: 0.45 },
          newProbabilities: { yes: 0.55, no: 0.45 },
          rationale: 'Holding the team prior before the final fixture resolution.',
          evidenceSignalIds: [],
          assumptions: ['No additional evidence was introduced.'],
          createdAt: '2027-09-26T18:42:00Z',
          commitType: 'hold',
          publicNote: 'Holding at 55% yes.',
          privateMemo: 'This private note must never enter the public export.',
          scoringEligible: true,
        },
      },
    };
    const committed = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/commands',
      payload: forecast,
    });
    expect(committed.statusCode).toBe(202);

    const forged = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/resolve-fixture',
      payload: { resolvedOutcomeId: 'yes' },
    });
    expect(forged.statusCode).toBe(400);
    expect(forged.json()).toEqual({ error: 'fixture_resolution_body_must_be_empty' });

    const resolved = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/resolve-fixture',
      payload: {},
    });
    expect(resolved.statusCode).toBe(202);
    expect(resolved.json()).toMatchObject({
      resolved: true,
      duplicate: false,
      events: [
        { type: 'market.resolved', payload: { resolvedOutcomeId: 'no' } },
        { type: 'score.calculated', payload: { brierScore: 0.605 } },
        { type: 'expedition.resolved', payload: { resolvedOutcomeId: 'no' } },
      ],
    });

    const replayZero = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-helios3-demo/replay?sequence=0',
    });
    const replayFinal = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-helios3-demo/replay',
    });
    const invalidReplay = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-helios3-demo/replay?sequence=999',
    });
    expect(replayZero.statusCode).toBe(200);
    expect(replayZero.json()).toMatchObject({
      sequence: 0,
      projection: { sequence: 0, forecasts: [], scores: [] },
    });
    expect(replayFinal.statusCode).toBe(200);
    expect(replayFinal.json()).toMatchObject({
      projection: { expedition: { status: 'resolved' }, scores: [{ brierScore: 0.605 }] },
    });
    expect(replayFinal.json().hash).toBe(replayFinal.json().authoritativeHash);
    expect(invalidReplay.statusCode).toBe(400);
    expect(invalidReplay.json()).toMatchObject({ error: 'invalid_replay_sequence' });

    const caseFile = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-helios3-demo/case-file',
    });
    expect(caseFile.statusCode).toBe(200);
    expect(caseFile.headers['content-disposition']).toContain('signal-atlas-exp-helios3-demo');
    expect(caseFile.json()).toMatchObject({
      kind: 'signal-atlas.case-file',
      resolution: { outcomeId: 'no' },
      sources: [],
      claims: [],
      signals: [],
      forecastRationales: expect.arrayContaining([
        expect.objectContaining({
          commitId: 'forecast-api-hold-1',
          rationale: 'Holding the team prior before the final fixture resolution.',
          score: expect.objectContaining({ brierScore: expect.any(Number) }),
        }),
      ]),
    });
    expect(caseFile.body).not.toContain('This private note must never enter the public export.');

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/resolve-fixture',
      payload: {},
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ resolved: true, duplicate: true });
  });
});
