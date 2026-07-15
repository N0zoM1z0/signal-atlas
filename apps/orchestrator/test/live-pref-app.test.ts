import type {
  PrefMcpCallResult,
  PrefMcpConnection,
  PrefMcpConnectionDiagnostics,
} from '@signal-atlas/pref-gateway';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { ExpeditionRuntime } from '../src/expedition-runtime.js';
import { createFixtureCodexDriver } from '../src/fixture-mission-driver.js';
import { createPrefAgentProxyDriver } from '../src/pref-agent-proxy-driver.js';
import { createConfiguredPrefRuntime } from '../src/pref-runtime.js';

const openApps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

class RecordedWeatherConnection implements PrefMcpConnection {
  readonly calls: Array<{ toolRef: string; argumentsValue: Record<string, unknown> }> = [];
  readonly #payload: Record<string, unknown>;
  #connected = false;

  constructor(payload: Record<string, unknown>) {
    this.#payload = structuredClone(payload);
  }

  async connect(): Promise<PrefMcpConnectionDiagnostics> {
    this.#connected = true;
    return this.diagnostics();
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
  }

  diagnostics(): PrefMcpConnectionDiagnostics {
    return {
      mode: 'live',
      serverName: 'pref',
      transport: 'streamable_http',
      state: this.#connected ? 'connected' : 'disconnected',
      connected: this.#connected,
      credentialState: 'configured',
      endpointHost: 'pref.trade',
      readOnly: true,
      lastTransitionAt: '2026-07-15T00:00:00Z',
      inventory: {
        tools: [
          {
            name: 'call_tool',
            description: 'Execute an approved provider capability.',
            inputFields: ['tool_ref', 'arguments'],
            readOnly: true,
          },
        ],
        resources: [],
        resourceTemplates: [],
        prompts: [],
      },
      mappings: [
        {
          canonicalName: 'local_conditions',
          toolRef: 'weather.get_current_conditions',
          providerServer: 'weather_toolkit',
          status: 'valid',
        },
      ],
    };
  }

  async callProviderTool(
    toolRef: string,
    argumentsValue: Record<string, unknown>,
  ): Promise<PrefMcpCallResult> {
    this.calls.push({ toolRef, argumentsValue: structuredClone(argumentsValue) });
    const text = JSON.stringify(this.#payload);
    return {
      structuredContent: structuredClone(this.#payload),
      text,
      responseBytes: new TextEncoder().encode(text).byteLength,
    };
  }
}

function assignmentCommand() {
  return {
    id: 'cmd-live-pref-app-weather-1',
    idempotencyKey: 'live-pref-app:weather:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:32:00Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.assign_mission',
    payload: {
      mission: {
        id: 'mission-live-pref-app-weather-1',
        expeditionId: 'exp-helios3-demo',
        assignedAgentId: 'mira',
        verb: 'observe_conditions',
        objective: 'Check the latest conditions at Galehaven Weather Tower.',
        destinationPlaceId: 'weather-tower',
        budget: { maxToolCalls: 1, timeoutMs: 10_000 },
        status: 'draft',
        createdBy: { kind: 'player' },
        createdAt: '2027-09-26T18:32:00Z',
      },
    },
  };
}

function skipCommand() {
  return {
    id: 'cmd-live-pref-app-skip-1',
    idempotencyKey: 'live-pref-app:skip:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:32:01Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.skip_travel',
    payload: { agentId: 'mira', missionId: 'mission-live-pref-app-weather-1' },
  };
}

describe('recorded live Pref application mission', () => {
  it('produces inspectable source, claim, signal, and dialogue objects through HTTP', async () => {
    const observedDate = new Date(Date.now() - 15 * 60_000);
    const observedMinute = observedDate.toISOString().slice(0, 16);
    const observedAt = `${observedMinute}:00.000Z`;
    const providerRetrievedAt = new Date(Date.now() - 5 * 60_000);
    const providerRetrievedUnix = Math.floor(providerRetrievedAt.getTime() / 1_000);
    const providerRetrievedIso = new Date(providerRetrievedUnix * 1_000).toISOString();
    const connection = new RecordedWeatherConnection({
      location: {
        name: 'Cape Canaveral, Brevard County, Florida, United States',
        lat: 28.4513556,
        lon: -80.5283059,
      },
      temperature_c: 24.1,
      temperature_f: 75.38,
      humidity_percent: 95,
      wind_speed_kmh: 13.3,
      wind_direction_degrees: 2,
      weather_code: 65,
      weather_description: 'Heavy rain',
      weather_category: 'rain',
      pressure_hpa: 1019.7,
      timestamp: observedMinute,
      retrieved_at: providerRetrievedUnix,
    });
    const prefRuntime = createConfiguredPrefRuntime({ connection });
    const gateway = prefRuntime.gateway();
    expect(gateway).toBeDefined();
    if (!gateway) throw new Error('Recorded live Pref test requires a gateway.');
    const fixture = createHelios3ExpeditionFixture();
    const runtime = new ExpeditionRuntime(fixture, {
      missionDriver: createPrefAgentProxyDriver({
        fixture,
        gateway,
        fallback: createFixtureCodexDriver(fixture, () => 'success'),
      }),
    });
    const initialBelief = structuredClone(runtime.snapshot().agentsById['mira']?.belief);
    const app = buildApp({ runtime, prefRuntime, runScheduler: false });
    openApps.push(app);

    const assigned = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/commands',
      payload: assignmentCommand(),
    });
    const skipped = await app.inject({
      method: 'POST',
      url: '/api/expeditions/exp-helios3-demo/commands',
      payload: skipCommand(),
    });
    expect(assigned.statusCode).toBe(202);
    expect(skipped.statusCode).toBe(202);
    await runtime.waitForRuntimeIdle();
    runtime.advance(1, '2027-09-26T18:32:02Z');

    const snapshotResponse = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-helios3-demo/snapshot',
    });
    const projection = snapshotResponse.json().projection as ReturnType<
      ExpeditionRuntime['snapshot']
    >;
    const source = Object.values(projection.sourcesById).find((candidate) =>
      candidate.tags.includes('real-world-proxy'),
    );
    expect(source).toMatchObject({
      version: 1,
      observedAt,
      sourceClass: 'sensor',
      provenance: {
        serverName: 'pref',
        transport: 'streamable_http',
        primitive: 'tool',
        primitiveName: 'weather.get_current_conditions',
      },
      rights: { display: 'metadata_only' },
    });
    expect(source).not.toHaveProperty('publishedAt');
    expect(source?.retrievedAt).not.toBe(observedAt);
    const claim = Object.values(projection.claimsById).find((candidate) =>
      source ? candidate.sourceIds.includes(source.id) : false,
    );
    const signal = Object.values(projection.signalsById).find((candidate) =>
      source ? candidate.sourceIds.includes(source.id) : false,
    );
    expect(claim).toMatchObject({
      qualifiers: expect.arrayContaining([
        `not a direct observation of the scenario market: ${fixture.market.question}`,
        `provider retrieved at ${providerRetrievedIso}`,
      ]),
    });
    expect(signal).toMatchObject({
      headline: expect.stringContaining('Live proxy weather'),
      direction: 'context',
      impact: { label: 'unknown' },
      freshness: { label: 'fresh' },
      status: 'active',
    });
    expect(projection.agentsById['mira']?.belief).toEqual(initialBelief);

    const events = await app.inject({
      method: 'GET',
      url: '/api/expeditions/exp-helios3-demo/events?after=0',
    });
    expect(events.json().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'pref.call.started',
          payload: expect.objectContaining({
            capability: 'local_conditions',
          }),
        }),
        expect.objectContaining({
          type: 'agent.dialogue.emitted',
          payload: expect.objectContaining({ text: expect.stringContaining('real-world proxy') }),
        }),
      ]),
    );
    const diagnostics = await app.inject({ method: 'GET', url: '/api/runtime/diagnostics' });
    expect(diagnostics.json()).toMatchObject({
      driver: { id: 'pref-agent-proxy', kind: 'pref_proxy' },
      totals: { completed: 1 },
    });
    expect(connection.calls).toEqual([
      {
        toolRef: 'weather.get_current_conditions',
        argumentsValue: { location: 'Cape Canaveral, Florida' },
      },
    ]);
    expect(`${snapshotResponse.body}${events.body}${diagnostics.body}`).not.toMatch(
      /authorization|bearer|api[_-]?key|token/iu,
    );
  });
});
