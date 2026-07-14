import { describe, expect, it } from 'vitest';

import {
  loadPrefCapabilityMap,
  parsePrefCapabilityMap,
  projectPrefCapabilityInput,
} from '../src/index.js';

describe('Pref capability map', () => {
  it('loads the inspected Streamable HTTP deployment and approved weather mapping', async () => {
    const map = await loadPrefCapabilityMap();

    expect(map).toMatchObject({
      version: 1,
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
      allowedProviderTools: ['weather.get_current_conditions'],
      mappings: [
        {
          canonicalName: 'local_conditions',
          toolRef: 'weather.get_current_conditions',
          providerServer: 'weather_toolkit',
        },
      ],
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
