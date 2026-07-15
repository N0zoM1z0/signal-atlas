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
  type PrefCapabilityMappingStatus,
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

function mappedResult(payload: Record<string, unknown>): PrefMcpCallResult {
  const text = JSON.stringify(payload);
  return {
    structuredContent: payload,
    text,
    responseBytes: new TextEncoder().encode(text).byteLength,
  };
}

function enabledMap(canonicalName: string) {
  const capabilityMap = loadPrefCapabilityMapSync();
  const mapping = capabilityMap.mappings.find(
    (candidate) => candidate.canonicalName === canonicalName,
  );
  if (!mapping) throw new Error(`Missing test mapping for ${canonicalName}.`);
  mapping.enabled = true;
  return { capabilityMap, mapping };
}

class FakeConnection implements PrefMcpConnection {
  readonly responses: Array<PrefMcpCallResult | Error>;
  readonly calls: Array<{ toolRef: string; argumentsValue: Record<string, unknown> }> = [];
  connected = false;
  readonly mappings: PrefCapabilityMappingStatus[];

  constructor(
    responses: Array<PrefMcpCallResult | Error>,
    mappings: PrefCapabilityMappingStatus[] = [
      {
        canonicalName: 'local_conditions',
        toolRef: 'weather.get_current_conditions',
        providerServer: 'weather_toolkit',
        status: 'valid',
      },
      {
        canonicalName: 'search_sources',
        toolRef: 'gdelt.context.search_context',
        providerServer: 'gdelt_context',
        status: 'valid',
      },
    ],
  ) {
    this.responses = [...responses];
    this.mappings = structuredClone(mappings);
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
      mappings: structuredClone(this.mappings),
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
    config?: PrefGatewayConfig;
    capabilityMap?: ReturnType<typeof loadPrefCapabilityMapSync>;
  } = {},
): LivePrefGateway {
  return new LivePrefGateway({
    config: options.config ?? config(),
    capabilityMap: options.capabilityMap ?? loadPrefCapabilityMapSync(),
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
    expect(result.evidence.find((evidence) => evidence.kind === 'local_conditions')?.sourceId).toBe(
      result.sources[0]?.id,
    );
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

  it('normalizes a mapped article-search envelope without retaining provider content', async () => {
    const payload = {
      articles: [
        {
          url: 'https://news.example.test/launch-window',
          title: 'Launch window review delayed by upper-level winds',
          seendate: '20260715T003000Z',
          socialimage: '',
          domain: 'news.example.test',
          language: 'ENGLISH',
          isquote: 'Not quoted',
          sentence: 'The launch-window review was delayed by upper-level winds.',
          context: 'Untrusted provider context that must not be retained as displayable content.',
        },
      ],
      query: 'launch window winds',
      requested_max: 5,
      total_returned: 1,
    };
    const responseText = JSON.stringify(payload);
    const connection = new FakeConnection(
      [
        {
          structuredContent: payload,
          text: responseText,
          responseBytes: new TextEncoder().encode(responseText).byteLength,
        },
      ],
      [
        {
          canonicalName: 'local_conditions',
          toolRef: 'weather.get_current_conditions',
          providerServer: 'weather_toolkit',
          status: 'valid',
        },
        {
          canonicalName: 'search_sources',
          toolRef: 'gdelt.context.search_context',
          providerServer: 'gdelt_context',
          status: 'valid',
        },
      ],
    );
    const pref = gateway(connection, {
      config: { ...config(), allowCapabilities: ['search_sources'] },
    });

    const result = await pref.search(
      {
        query: 'launch window winds',
        limit: 5,
        since: '2026-07-14T00:00:00Z',
      },
      context({ correlationId: 'turn-live-search-1' }),
    );

    expect(connection.calls).toEqual([
      {
        toolRef: 'gdelt.context.search_context',
        argumentsValue: {
          query: 'launch window winds',
          maxrecords: 5,
          startdatetime: '20260714000000',
        },
      },
    ]);
    expect(result).toMatchObject({
      capability: 'search_sources',
      evidence: [
        {
          kind: 'article_match',
          matchedSentence: 'The launch-window review was delayed by upper-level winds.',
          publishedAt: '2026-07-15T00:30:00.000Z',
        },
      ],
      sources: [
        {
          title: 'Launch window review delayed by upper-level winds',
          publisher: 'news.example.test',
          sourceClass: 'secondary',
          publishedAt: '2026-07-15T00:30:00.000Z',
          externalUri: 'https://news.example.test/launch-window',
          rights: { display: 'metadata_only' },
          provenance: { primitiveName: 'gdelt.context.search_context' },
        },
      ],
    });
    expect(result.sources[0]).not.toHaveProperty('excerpt');
    expect(result.sources[0]).not.toHaveProperty('structuredData');
    expect(JSON.stringify(result.sources[0])).not.toContain('Untrusted provider context');
    expect(JSON.stringify(result.evidence)).not.toContain('Untrusted provider context');
    expect(result.evidence[0]).toMatchObject({ sourceId: result.sources[0]?.id });
  });

  it('exposes the inspected search mapping after its bounded live acceptance gate passes', async () => {
    const map = loadPrefCapabilityMapSync();
    const searchMapping = map.mappings.find(
      (mapping) => mapping.canonicalName === 'search_sources',
    );
    expect(searchMapping).toMatchObject({
      enabled: true,
      executionMode: 'synchronous',
      requiredSecurityHints: { sideEffect: 'read_only' },
    });
    const pref = gateway(new FakeConnection([]), {
      config: { ...config(), allowCapabilities: ['local_conditions', 'search_sources'] },
    });
    await expect(pref.discoverCapabilities()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalName: 'search_sources',
          primitiveName: 'gdelt.context.search_context',
          readOnly: true,
        }),
      ]),
    );
  });

  it('normalizes a bounded market search as context without retaining unknown provider fields', async () => {
    const { capabilityMap, mapping } = enabledMap('search_markets');
    const payload = {
      query: 'central bank rate cut',
      data: [
        {
          id: 'market-101',
          slug: 'central-bank-rate-cut',
          question: 'Will the central bank cut rates this month?',
          outcomes: ['Yes', 'No'],
          active: true,
          outcomePrices: ['0.61', '0.39'],
          privateProviderNote: 'must be stripped',
        },
      ],
      pagination: { limit: 1, offset: 0, returned: 1, has_more: false },
      metadata: { ignored: true },
    };
    const connection = new FakeConnection(
      [mappedResult(payload)],
      [
        {
          canonicalName: 'search_markets',
          toolRef: mapping.toolRef,
          providerServer: mapping.providerServer,
          status: 'valid',
        },
      ],
    );
    const pref = gateway(connection, {
      capabilityMap,
      config: { ...config(), allowCapabilities: ['search_markets'] },
    });

    const result = await pref.invokeCanonicalCapability(
      'search_markets',
      { query: 'central bank rate cut', limit: 1 },
      context({ correlationId: 'turn-live-market-search' }),
    );

    expect(connection.calls).toEqual([
      {
        toolRef: 'polymarket.discovery.search_markets',
        argumentsValue: {
          active: true,
          closed: false,
          fields: { question: true, outcomes: true, active: true },
          query: 'central bank rate cut',
          limit: 1,
        },
      },
    ]);
    expect(result).toMatchObject({
      capability: 'search_markets',
      sources: [
        {
          title: 'Will the central bank cut rates this month?',
          sourceClass: 'market',
          rights: { display: 'metadata_only' },
          provenance: { primitiveName: 'polymarket.discovery.search_markets' },
        },
      ],
      evidence: [
        {
          kind: 'market_summary',
          marketId: 'market-101',
          outcomes: ['Yes', 'No'],
          active: true,
          closed: null,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('outcomePrices');
    expect(JSON.stringify(result)).not.toContain('privateProviderNote');
  });

  it('normalizes strict resolution history and applies the canonical result cap adapter-side', async () => {
    const { capabilityMap, mapping } = enabledMap('search_resolution_history');
    const payload = {
      matches: [
        {
          market_id: 'resolved-1',
          question: 'Did the first comparable meeting cut rates?',
          tags: ['rates'],
          resolution: 'YES',
          resolution_date: '2025-06-12',
          reference_class: 'central-bank-rate-cuts',
        },
        {
          market_id: 'resolved-2',
          question: 'Did the second comparable meeting cut rates?',
          tags: ['rates'],
          resolution: 'NO',
          resolution_date: '2025-07-24',
          reference_class: 'central-bank-rate-cuts',
        },
      ],
      statistics: {
        total: 2,
        yes_count: 1,
        no_count: 1,
        base_rate: 0.5,
        sample_size_confidence: 'low',
      },
    };
    const connection = new FakeConnection(
      [mappedResult(payload)],
      [
        {
          canonicalName: 'search_resolution_history',
          toolRef: mapping.toolRef,
          providerServer: mapping.providerServer,
          status: 'valid',
        },
      ],
    );
    const pref = gateway(connection, {
      capabilityMap,
      config: { ...config(), allowCapabilities: ['search_resolution_history'] },
    });

    const result = await pref.invokeCanonicalCapability(
      'search_resolution_history',
      { referenceClass: 'central-bank-rate-cuts', limit: 1 },
      context({ correlationId: 'turn-live-resolution-history' }),
    );

    expect(connection.calls[0]).toEqual({
      toolRef: 'resolution.search_historical_resolutions',
      argumentsValue: { reference_class: 'central-bank-rate-cuts' },
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      title: 'Did the first comparable meeting cut rates?',
      sourceClass: 'archive',
      publishedAt: '2025-06-12T00:00:00.000Z',
      rights: { display: 'metadata_only' },
    });
    expect(result.evidence).toEqual([
      expect.objectContaining({
        kind: 'resolution_history',
        sourceIds: [result.sources[0]?.id],
        total: 2,
        yesCount: 1,
        noCount: 1,
        baseRate: 0.5,
        sampleSizeConfidence: 'low',
      }),
    ]);
  });

  it('normalizes bounded economic-series discovery with canonical source links', async () => {
    const { capabilityMap, mapping } = enabledMap('search_economic_series');
    const payload = {
      search_text: 'consumer prices',
      count: 1,
      series: [
        {
          id: 'CPIAUCSL',
          title: 'Consumer Price Index for All Urban Consumers',
          observation_start: '1947-01-01',
          observation_end: '2026-06-01',
          frequency_short: 'Monthly',
          units_short: 'Index 1982-1984=100',
        },
      ],
    };
    const connection = new FakeConnection(
      [mappedResult(payload)],
      [
        {
          canonicalName: 'search_economic_series',
          toolRef: mapping.toolRef,
          providerServer: mapping.providerServer,
          status: 'valid',
        },
      ],
    );
    const pref = gateway(connection, {
      capabilityMap,
      config: { ...config(), allowCapabilities: ['search_economic_series'] },
    });

    const result = await pref.invokeCanonicalCapability(
      'search_economic_series',
      { query: 'consumer prices' },
      context({ correlationId: 'turn-live-series-search' }),
    );

    expect(connection.calls[0]).toEqual({
      toolRef: 'fred.search_series',
      argumentsValue: { search_text: 'consumer prices', limit: 20 },
    });
    expect(result).toMatchObject({
      sources: [
        {
          externalUri: 'https://fred.stlouisfed.org/series/CPIAUCSL',
          sourceClass: 'official_primary',
          rights: { display: 'metadata_only' },
        },
      ],
      evidence: [
        {
          kind: 'economic_series_search',
          seriesId: 'CPIAUCSL',
          frequency: 'Monthly',
        },
      ],
    });
    expect(result.evidence[0]).toMatchObject({ sourceId: result.sources[0]?.id });
  });

  it('bounds full economic series, maps missing values to null, and versions revisions', async () => {
    let currentTime = new Date('2026-07-15T00:00:00Z');
    const { capabilityMap, mapping } = enabledMap('read_economic_series');
    const firstPayload = {
      scope: 'full',
      series_id: 'UNRATE',
      title: 'Unemployment Rate',
      units: 'Percent',
      frequency: 'Monthly',
      observation_start: '2026-05-01',
      observation_end: '2026-06-01',
      count: 2,
      observations: [
        { date: '2026-06-01', value: '.' },
        { date: '2026-05-01', value: '3.5' },
      ],
    };
    const revisedPayload = {
      ...firstPayload,
      observations: [
        { date: '2026-06-01', value: '3.6' },
        { date: '2026-05-01', value: '3.5' },
      ],
    };
    const connection = new FakeConnection(
      [mappedResult(firstPayload), mappedResult(revisedPayload)],
      [
        {
          canonicalName: 'read_economic_series',
          toolRef: mapping.toolRef,
          providerServer: mapping.providerServer,
          status: 'valid',
        },
      ],
    );
    const pref = gateway(connection, {
      capabilityMap,
      config: { ...config(), allowCapabilities: ['read_economic_series'] },
      now: () => currentTime,
      freshCacheMs: 0,
    });
    const input = { seriesId: 'UNRATE' };

    const first = await pref.invokeCanonicalCapability(
      'read_economic_series',
      input,
      context({ correlationId: 'turn-live-series-read-1' }),
    );
    currentTime = new Date('2026-07-15T00:01:00Z');
    const revised = await pref.invokeCanonicalCapability(
      'read_economic_series',
      input,
      context({ correlationId: 'turn-live-series-read-2' }),
    );

    expect(connection.calls[0]).toEqual({
      toolRef: 'fred.get_series',
      argumentsValue: { scope: 'full', sort_order: 'desc', series_id: 'UNRATE', limit: 250 },
    });
    expect(first.evidence).toEqual([
      expect.objectContaining({
        kind: 'economic_series',
        seriesId: 'UNRATE',
        observations: [
          { observedAt: '2026-06-01T00:00:00.000Z', value: null },
          { observedAt: '2026-05-01T00:00:00.000Z', value: 3.5 },
        ],
      }),
    ]);
    expect(revised.sources[0]).toMatchObject({
      version: 2,
      supersedesSourceId: first.sources[0]?.id,
      observedAt: '2026-06-01T00:00:00.000Z',
      rights: { display: 'metadata_only' },
    });
    expect(revised.evidence[0]).toMatchObject({
      sourceId: revised.sources[0]?.id,
      observations: expect.arrayContaining([expect.objectContaining({ value: 3.6 })]),
    });
  });
});
