import { describe, expect, it } from 'vitest';

import { createConfiguredPrefRuntime } from '../src/pref-runtime.js';

describe('configured Pref runtime', () => {
  it('defaults to a deterministic, network-free fixture connection', async () => {
    const runtime = createConfiguredPrefRuntime({
      environment: {},
      now: () => new Date('2027-09-26T18:30:00Z'),
    });

    expect(runtime.diagnostics()).toMatchObject({
      mode: 'fixture',
      transport: 'fixture',
      state: 'connected',
      connected: true,
      credentialState: 'not_required',
      mappings: [{ canonicalName: 'local_conditions', status: 'valid' }],
    });
    expect(runtime.gateway()).toBeUndefined();

    await runtime.disconnect();
    expect(runtime.diagnostics()).toMatchObject({ state: 'disconnected', connected: false });
    await runtime.testConnection();
    expect(runtime.diagnostics()).toMatchObject({ state: 'connected', connected: true });
  });

  it('reports authentication required before any live network client is created', async () => {
    const runtime = createConfiguredPrefRuntime({
      environment: { SIGNAL_ATLAS_PREF_MODE: 'live' },
      now: () => new Date('2027-09-26T18:30:00Z'),
    });

    expect(runtime.diagnostics()).toMatchObject({
      mode: 'live',
      state: 'disconnected',
      credentialState: 'missing',
      endpointHost: 'pref.trade',
    });
    expect(runtime.gateway()).toBeDefined();

    const tested = await runtime.testConnection();
    expect(tested).toMatchObject({
      state: 'auth_required',
      connected: false,
      lastError: { code: 'pref_auth_required' },
    });
  });

  it('fails closed on an endpoint override while retaining only credential state', async () => {
    const secret = 'pref-seeded-super-secret';
    const runtime = createConfiguredPrefRuntime({
      environment: {
        SIGNAL_ATLAS_PREF_MODE: 'live',
        SIGNAL_ATLAS_PREF_URL: 'https://pref.trade.attacker.example/mcp?credential=echo-me',
        SIGNAL_ATLAS_PREF_BEARER_TOKEN: secret,
      },
      now: () => new Date('2027-09-26T18:30:00Z'),
    });

    const diagnostics = await runtime.testConnection();
    expect(diagnostics).toMatchObject({
      state: 'error',
      connected: false,
      credentialState: 'configured',
      lastError: { code: 'pref_server_denied' },
    });
    expect(runtime.gateway()).toBeUndefined();
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('attacker.example');
    expect(serialized).not.toContain('echo-me');
  });
});
