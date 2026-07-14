import { describe, expect, it } from 'vitest';

import {
  LivePrefGateway,
  PrefMcpConnectionError,
  loadPrefCapabilityMapSync,
  type PrefAuditEvent,
  type PrefCallContext,
  type PrefGatewayConfig,
  type PrefMcpCallResult,
  type PrefMcpConnection,
  type PrefMcpConnectionDiagnostics,
} from '../src/index.js';

const baseWeather = {
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
  timestamp: '2026-07-14T23:15',
  retrieved_at: 1_784_071_673,
};

function config(): PrefGatewayConfig {
  return {
    serverName: 'pref',
    transport: 'streamable_http',
    readOnly: true,
    allowCapabilities: ['local_conditions'],
    timeoutMs: 10_000,
    maxResponseBytes: 100_000,
    maxCallsPerMission: 10,
    cacheMode: 'full_when_permitted',
  };
}

function context(overrides: Partial<PrefCallContext> = {}): PrefCallContext {
  return {
    expeditionId: 'exp-live-weather',
    missionId: 'mission-live-weather',
    agentId: 'mira',
    correlationId: 'turn-live-weather-1',
    deadlineAt: '2026-07-15T01:00:00Z',
    ...overrides,
  };
}

function weatherResult(
  payload: Record<string, unknown> = baseWeather,
  structured = true,
): PrefMcpCallResult {
  const text = JSON.stringify(payload);
  return {
    ...(structured ? { structuredContent: payload } : {}),
    text,
    responseBytes: new TextEncoder().encode(text).byteLength,
  };
}

class FakeConnection implements PrefMcpConnection {
  readonly responses: Array<PrefMcpCallResult | Error>;
  readonly calls: Array<{ toolRef: string; argumentsValue: Record<string, unknown> }> = [];
  connected = false;

  constructor(responses: Array<PrefMcpCallResult | Error>) {
    this.responses = [...responses];
  }

  async connect(): Promise<PrefMcpConnectionDiagnostics> {
    this.connected = true;
    return this.diagnostics();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  diagnostics(): PrefMcpConnectionDiagnostics {
    return {
      mode: 'live',
      serverName: 'pref',
      transport: 'streamable_http',
      state: this.connected ? 'connected' : 'disconnected',
      connected: this.connected,
      credentialState: 'configured',
      endpointHost: 'pref.trade',
      readOnly: true,
      lastTransitionAt: '2026-07-15T00:00:00Z',
      inventory: { tools: [], resources: [], resourceTemplates: [], prompts: [] },
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
    const response = this.responses.shift();
    if (!response) throw new Error('Fake Pref response queue is empty.');
    if (response instanceof Error) throw response;
    return structuredClone(response);
  }
}

function gateway(
  connection: PrefMcpConnection,
  options: {
    now?: () => Date;
    audit?: (event: PrefAuditEvent) => void;
    freshCacheMs?: number;
  } = {},
): LivePrefGateway {
  return new LivePrefGateway({
    config: config(),
    capabilityMap: loadPrefCapabilityMapSync(),
    connection,
    now: options.now ?? (() => new Date('2026-07-15T00:00:00Z')),
    ...(options.audit ? { audit: options.audit } : {}),
    ...(options.freshCacheMs === undefined ? {} : { freshCacheMs: options.freshCacheMs }),
  });
}

describe('LivePrefGateway', () => {
  it('normalizes the verified weather envelope without collapsing its three time boundaries', async () => {
    const connection = new FakeConnection([weatherResult()]);
    const events: PrefAuditEvent[] = [];
    const pref = gateway(connection, { audit: (event) => events.push(event) });

    const result = await pref.invokeCanonicalCapability(
      'local_conditions',
      { location: { label: 'Cape Canaveral, Florida' } },
      context(),
    );

    expect(connection.calls).toEqual([
      {
        toolRef: 'weather.get_current_conditions',
        argumentsValue: { location: 'Cape Canaveral, Florida' },
      },
    ]);
    expect(result).toMatchObject({
      capability: 'local_conditions',
      fromCache: false,
      cache: { status: 'miss', storedAt: '2026-07-15T00:00:00.000Z' },
      sources: [
        {
          version: 1,
          sourceClass: 'sensor',
          observedAt: '2026-07-14T23:15:00.000Z',
          retrievedAt: '2026-07-15T00:00:00.000Z',
          provenance: {
            serverName: 'pref',
            transport: 'streamable_http',
            primitive: 'tool',
            primitiveName: 'weather.get_current_conditions',
          },
          rights: { display: 'metadata_only' },
          tags: ['context-only', 'live', 'real-world-proxy', 'weather'],
        },
      ],
      evidence: [
        {
          kind: 'local_conditions',
          providerRetrievedAt: '2026-07-14T23:27:53.000Z',
          observedAt: '2026-07-14T23:15:00.000Z',
          weatherDescription: 'Heavy rain',
          temperatureC: 24.1,
          windSpeedKmh: 13.3,
        },
      ],
    });
    expect(result.sources[0]).not.toHaveProperty('publishedAt');
    expect(result.sources[0]).not.toHaveProperty('structuredData');
    expect(result.sources[0]).not.toHaveProperty('excerpt');
    expect(result.evidence[0]?.sourceId).toBe(result.sources[0]?.id);
    expect(events.map(({ type }) => type)).toEqual(['pref.call.started', 'pref.call.completed']);
  });

  it('uses a fresh in-memory result, then versions changed provider content', async () => {
    let currentTime = new Date('2026-07-15T00:00:00Z');
    const changedWeather = {
      ...baseWeather,
      temperature_c: 25.2,
      temperature_f: 77.36,
      weather_code: 61,
      weather_description: 'Light rain',
    };
    const connection = new FakeConnection([weatherResult(), weatherResult(changedWeather)]);
    const pref = gateway(connection, { now: () => currentTime, freshCacheMs: 60_000 });
    const input = { location: { label: 'Cape Canaveral, Florida' } };

    const first = await pref.invokeCanonicalCapability('local_conditions', input, context());
    currentTime = new Date('2026-07-15T00:00:30Z');
    const cached = await pref.invokeCanonicalCapability(
      'local_conditions',
      input,
      context({ correlationId: 'turn-live-weather-2' }),
    );
    currentTime = new Date('2026-07-15T00:02:00Z');
    const changed = await pref.invokeCanonicalCapability(
      'local_conditions',
      input,
      context({ correlationId: 'turn-live-weather-3' }),
    );

    expect(connection.calls).toHaveLength(2);
    expect(cached).toMatchObject({ fromCache: true, cache: { status: 'fresh' } });
    expect(cached.sources[0]?.id).toBe(first.sources[0]?.id);
    expect(changed).toMatchObject({ fromCache: false, sources: [{ version: 2 }] });
    expect(changed.sources[0]?.id).not.toBe(first.sources[0]?.id);
    expect(changed.sources[0]?.supersedesSourceId).toBe(first.sources[0]?.id);
    expect(pref.diagnostics().cache).toEqual({ entries: 1, hits: 1, staleFallbacks: 0 });
  });

  it('returns only a visibly stale cached observation after a retryable provider failure', async () => {
    let currentTime = new Date('2026-07-15T00:00:00Z');
    const connection = new FakeConnection([
      weatherResult(),
      new PrefMcpConnectionError('pref_upstream_error', 'secret provider detail', true),
    ]);
    const pref = gateway(connection, { now: () => currentTime, freshCacheMs: 1_000 });
    const input = { location: { label: 'Cape Canaveral, Florida' } };
    const first = await pref.invokeCanonicalCapability('local_conditions', input, context());
    currentTime = new Date('2026-07-15T00:10:00Z');

    const stale = await pref.invokeCanonicalCapability(
      'local_conditions',
      input,
      context({ correlationId: 'turn-live-weather-stale' }),
    );

    expect(stale).toMatchObject({
      fromCache: true,
      retrievedAt: '2026-07-15T00:10:00.000Z',
      cache: {
        status: 'stale',
        storedAt: '2026-07-15T00:00:00.000Z',
        warning: expect.stringContaining('last validated observation'),
      },
    });
    expect(stale.sources[0]).toEqual(first.sources[0]);
    expect(JSON.stringify(stale)).not.toContain('secret provider detail');
    expect(pref.diagnostics()).toMatchObject({
      completed: 2,
      failed: 0,
      cache: { entries: 1, hits: 0, staleFallbacks: 1 },
      lastError: { code: 'pref_upstream_error' },
    });
  });

  it('supports the bounded text fallback and fails closed for unsupported temporal requests', async () => {
    const connection = new FakeConnection([weatherResult(baseWeather, false)]);
    const pref = gateway(connection);
    const result = await pref.invokeCanonicalCapability(
      'local_conditions',
      { location: { label: 'Cape Canaveral, Florida' } },
      context(),
    );
    expect(result.evidence[0]).toMatchObject({ weatherDescription: 'Heavy rain' });

    await expect(
      pref.invokeCanonicalCapability(
        'local_conditions',
        { location: { label: 'Cape Canaveral, Florida' }, at: '2026-07-14T00:00:00Z' },
        context({ correlationId: 'turn-live-weather-historical' }),
      ),
    ).rejects.toMatchObject({ code: 'pref_invalid_request' });
    await expect(
      pref.invokeCanonicalCapability('search_sources', { query: 'weather' }, context()),
    ).rejects.toMatchObject({ code: 'pref_capability_denied' });
  });
});
