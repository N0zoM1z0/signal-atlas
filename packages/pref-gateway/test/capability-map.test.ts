import { describe, expect, it } from 'vitest';

import {
  loadPrefCapabilityMap,
  parsePrefCapabilityMap,
  projectPrefCapabilityInput,
} from '../src/index.js';

describe('Pref capability map', () => {
  it('loads the provider-neutral v3 registry with approved synchronous mappings', async () => {
    const map = await loadPrefCapabilityMap();

    expect(map).toMatchObject({
      version: 3,
      server: {
        name: 'pref',
        transport: 'streamable_http',
        endpoint: 'https://pref.trade/mcp',
        allowedHosts: ['pref.trade'],
      },
      discovery: {
        catalogTool: 'search_tools',
        executionTool: 'call_tool',
      },
      allowedProviderTools: [
        'weather.get_current_conditions',
        'gdelt.context.search_context',
        'polymarket.discovery.search_markets',
        'resolution.search_historical_resolutions',
        'fred.search_series',
        'fred.get_series',
      ],
      mappings: [
        {
          mappingId: 'weather-current-conditions-v1',
          canonicalName: 'local_conditions',
          enabled: true,
          toolRef: 'weather.get_current_conditions',
          providerServer: 'weather_toolkit',
          executionMode: 'synchronous',
        },
        {
          mappingId: 'gdelt-context-articles-v1',
          canonicalName: 'search_sources',
          enabled: true,
          toolRef: 'gdelt.context.search_context',
          providerServer: 'gdelt_context',
          executionMode: 'synchronous',
          responseAdapter: 'article_search_v1',
        },
        {
          canonicalName: 'search_markets',
          enabled: false,
          toolRef: 'polymarket.discovery.search_markets',
          responseAdapter: 'market_search_v1',
        },
        {
          canonicalName: 'search_resolution_history',
          enabled: false,
          toolRef: 'resolution.search_historical_resolutions',
          responseAdapter: 'resolution_history_v1',
        },
        {
          canonicalName: 'search_economic_series',
          enabled: false,
          toolRef: 'fred.search_series',
          responseAdapter: 'economic_series_search_v1',
        },
        {
          canonicalName: 'read_economic_series',
          enabled: false,
          toolRef: 'fred.get_series',
          responseAdapter: 'economic_series_read_v1',
        },
      ],
    });
  });

  it('projects fixed provider policy and canonical research inputs without leaking provider refs', async () => {
    const map = await loadPrefCapabilityMap();
    const marketMapping = map.mappings.find(
      (candidate) => candidate.canonicalName === 'search_markets',
    );
    const historyMapping = map.mappings.find(
      (candidate) => candidate.canonicalName === 'search_resolution_history',
    );
    const seriesMapping = map.mappings.find(
      (candidate) => candidate.canonicalName === 'read_economic_series',
    );
    const seriesSearchMapping = map.mappings.find(
      (candidate) => candidate.canonicalName === 'search_economic_series',
    );
    expect(marketMapping).toBeDefined();
    expect(historyMapping).toBeDefined();
    expect(seriesMapping).toBeDefined();
    expect(seriesSearchMapping).toBeDefined();

    expect(projectPrefCapabilityInput(marketMapping!, { query: 'rate cut', limit: 5 })).toEqual({
      active: true,
      closed: false,
      fields: { question: true, outcomes: true, active: true },
      query: 'rate cut',
      limit: 5,
    });
    expect(
      projectPrefCapabilityInput(historyMapping!, {
        referenceClass: 'central-bank-rate-cuts',
        outcome: 'YES',
        minSampleSize: 4,
        limit: 8,
      }),
    ).toEqual({
      reference_class: 'central-bank-rate-cuts',
      outcome: 'YES',
      min_sample_size: 4,
    });
    expect(
      projectPrefCapabilityInput(seriesMapping!, {
        seriesId: 'CPIAUCSL',
        since: '2026-01-15T12:30:00Z',
        until: '2026-07-15T23:45:00Z',
        limit: 120,
      }),
    ).toEqual({
      scope: 'full',
      sort_order: 'desc',
      series_id: 'CPIAUCSL',
      observation_start: '2026-01-15',
      observation_end: '2026-07-15',
      limit: 120,
    });
    expect(projectPrefCapabilityInput(seriesMapping!, { seriesId: 'UNRATE' })).toEqual({
      scope: 'full',
      sort_order: 'desc',
      series_id: 'UNRATE',
      limit: 250,
    });
    expect(projectPrefCapabilityInput(seriesSearchMapping!, { query: 'consumer prices' })).toEqual({
      search_text: 'consumer prices',
      limit: 20,
    });
  });

  it('projects optional search controls and provider datetime transforms declaratively', async () => {
    const map = await loadPrefCapabilityMap();
    const mapping = map.mappings.find((candidate) => candidate.canonicalName === 'search_sources');
    expect(mapping).toBeDefined();

    expect(
      projectPrefCapabilityInput(mapping!, {
        query: 'orbital launch weather delay',
        limit: 7,
        since: '2026-07-14T01:02:03Z',
        until: '2026-07-15T04:05:06Z',
      }),
    ).toEqual({
      query: 'orbital launch weather delay',
      maxrecords: 7,
      startdatetime: '20260714010203',
      enddatetime: '20260715040506',
    });
    expect(projectPrefCapabilityInput(mapping!, { query: 'launch delay' })).toEqual({
      query: 'launch delay',
    });
  });

  it('projects a canonical semantic location without leaking provider names into gameplay code', async () => {
    const map = await loadPrefCapabilityMap();
    const mapping = map.mappings[0];
    expect(mapping).toBeDefined();

    expect(
      projectPrefCapabilityInput(mapping!, {
        location: { placeId: 'weather-tower', label: 'Galehaven Weather Tower' },
      }),
    ).toEqual({ location: 'Galehaven Weather Tower' });
    expect(
      projectPrefCapabilityInput(mapping!, {
        location: { latitude: 51.5, longitude: -0.12 },
      }),
    ).toEqual({ location: '51.5,-0.12' });
  });

  it('fails closed on endpoint, allow-list, duplicate, and safety-policy drift', async () => {
    const baseline = await loadPrefCapabilityMap();

    const queriedEndpoint = structuredClone(baseline);
    queriedEndpoint.server.endpoint = 'https://pref.trade/mcp?token=not-allowed';
    expect(() => parsePrefCapabilityMap(queriedEndpoint)).toThrow();

    const unlistedTool = structuredClone(baseline);
    unlistedTool.mappings[0]!.toolRef = 'weather.unapproved_tool';
    expect(() => parsePrefCapabilityMap(unlistedTool)).toThrow();

    const duplicateTool = structuredClone(baseline);
    duplicateTool.allowedProviderTools.push('weather.get_current_conditions');
    expect(() => parsePrefCapabilityMap(duplicateTool)).toThrow();

    const unsafe = structuredClone(baseline) as unknown as {
      mappings: Array<{ requiredAnnotations: { readOnlyHint: boolean } }>;
    };
    unsafe.mappings[0]!.requiredAnnotations.readOnlyHint = false;
    expect(() => parsePrefCapabilityMap(unsafe)).toThrow();

    const overlappingInput = structuredClone(baseline);
    overlappingInput.mappings[2]!.fixedArguments['query'] = 'hidden override';
    expect(() => parsePrefCapabilityMap(overlappingInput)).toThrow(
      'cannot be both projected and fixed',
    );
  });

  it('denies arbitrary hosts and direct helper expansion', async () => {
    const baseline = await loadPrefCapabilityMap();

    const hostileHost = structuredClone(baseline);
    hostileHost.server.endpoint = 'https://pref.trade.attacker.example/mcp';
    hostileHost.server.allowedHosts = ['pref.trade'];
    expect(() => parsePrefCapabilityMap(hostileHost)).toThrow();

    const missingHelperGrant = structuredClone(baseline);
    missingHelperGrant.discovery.allowedDirectTools = ['search_tools', 'call_tool'];
    expect(() => parsePrefCapabilityMap(missingHelperGrant)).toThrow();
  });
});
