import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

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
});
