import { describe, expect, it } from 'vitest';

import {
  loadPrefCapabilityMap,
  parsePrefCapabilityMap,
  projectPrefCapabilityInput,
} from '../src/index.js';

describe('Pref capability map', () => {
  it('loads the provider-neutral v2 registry with approved and policy-blocked mappings', async () => {
    const map = await loadPrefCapabilityMap();

    expect(map).toMatchObject({
      version: 2,
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
      allowedProviderTools: ['weather.get_current_conditions', 'gdelt.context.search_context'],
      mappings: [
        {
          mappingId: 'weather-current-conditions-v1',
          canonicalName: 'local_conditions',
          enabled: true,
          toolRef: 'weather.get_current_conditions',
          providerServer: 'weather_toolkit',
        },
        {
          mappingId: 'gdelt-context-articles-v1',
          canonicalName: 'search_sources',
          enabled: false,
          toolRef: 'gdelt.context.search_context',
          providerServer: 'gdelt_context',
          responseAdapter: 'article_search_v1',
        },
      ],
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
