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
});
