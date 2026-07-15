import { describe, expect, it } from 'vitest';

import {
  PrefMcpConnectionError,
  StreamableHttpPrefConnection,
  createBoundedPrefFetch,
  loadPrefCapabilityMap,
  type PrefMcpCallOptions,
  type PrefMcpSdkCallResult,
  type PrefMcpSdkClient,
  type PrefMcpSdkClientFactory,
} from '../src/index.js';

interface FakeClientOptions {
  onClose: () => void;
  credentialProvider?: () => Promise<string | undefined>;
  failConnect?: boolean;
  driftMapping?: boolean;
  securityTaskSupport?: string;
  omitSecurityTaskSupport?: boolean;
  extraRequiredArgument?: boolean;
  oversized?: boolean;
  nativePrimitives?: boolean;
  credentialEcho?: 'server_version' | 'provider_payload';
  echoedCredential?: string;
  refreshCredentialOnConnect?: boolean;
}

class FakeSdkClient implements PrefMcpSdkClient {
  readonly calls: Array<{ name: string; argumentsValue: Record<string, unknown> }> = [];
  readonly #options: FakeClientOptions;
  connects = 0;
  closes = 0;

  constructor(options: FakeClientOptions) {
    this.#options = options;
  }

  async connect(_options: PrefMcpCallOptions): Promise<void> {
    this.connects += 1;
    if (this.#options.refreshCredentialOnConnect) {
      await this.#options.credentialProvider?.();
    }
    if (this.#options.failConnect) {
      throw new Error('Bearer seeded-secret appeared in an unsafe upstream failure.');
    }
  }

  async close(): Promise<void> {
    this.closes += 1;
    this.#options.onClose();
  }

  remoteClose(): void {
    this.#options.onClose();
  }

  async refreshCredential(): Promise<string | undefined> {
    return this.#options.credentialProvider?.();
  }

  getServerCapabilities(): Record<string, unknown> {
    return this.#options.nativePrimitives
      ? { tools: {}, resources: {}, prompts: {} }
      : { tools: {} };
  }

  getServerVersion(): { name: string; version: string } {
    if (this.#options.credentialEcho === 'server_version') {
      return {
        name: `preference-mcp-gateway ${this.#options.echoedCredential ?? 'seeded-secret'}`,
        version: '1.0.0',
      };
    }
    return { name: 'preference-mcp-gateway', version: '1.0.0' };
  }

  getProtocolVersion(): string {
    return '2025-11-25';
  }

  async listTools(): Promise<{
    tools: Array<{
      name: string;
      inputSchema: unknown;
      annotations: { readOnlyHint: boolean };
      description?: string;
    }>;
  }> {
    const description = this.#options.oversized ? 'x'.repeat(4_000) : undefined;
    return {
      tools: ['help', 'onboard', 'search_tools', 'call_tool', 'list_resources'].map((name) => ({
        name,
        inputSchema: {
          type: 'object',
          properties: name === 'search_tools' ? { tool_ref: {} } : {},
        },
        annotations: { readOnlyHint: true },
        ...(description ? { description } : {}),
      })),
    };
  }

  async listResources(): Promise<{
    resources: Array<{ name: string; uri: string; mimeType: string }>;
  }> {
    return {
      resources: [
        { name: 'Native overview', uri: 'pref://native/overview', mimeType: 'text/markdown' },
      ],
    };
  }

  async listResourceTemplates(): Promise<{
    resourceTemplates: Array<{ name: string; uriTemplate: string; mimeType: string }>;
  }> {
    return {
      resourceTemplates: [
        {
          name: 'Native manual',
          uriTemplate: 'pref://native/{tool_ref}',
          mimeType: 'text/markdown',
        },
      ],
    };
  }

  async listPrompts(): Promise<{
    prompts: Array<{ name: string; description: string; arguments: Array<{ name: string }> }>;
  }> {
    return {
      prompts: [
        {
          name: 'native_routing',
          description: 'Route a capability.',
          arguments: [{ name: 'task' }],
        },
      ],
    };
  }

  async callTool(
    name: string,
    argumentsValue: Record<string, unknown>,
  ): Promise<PrefMcpSdkCallResult> {
    this.calls.push({ name, argumentsValue: structuredClone(argumentsValue) });
    switch (name) {
      case 'list_resources':
        return {
          structuredContent: {
            resources: [
              {
                name: 'Overview',
                uri: 'pref://docs/overview',
                mimeType: 'text/markdown',
              },
            ],
            resourceTemplates: [
              {
                name: 'Capability manual',
                uriTemplate: 'pref://capabilities/{tool_ref}/manual',
                mimeType: 'text/markdown',
              },
            ],
            _meta: { indexed_capability_count: 547 },
          },
          content: [],
        };
      case 'onboard':
        return {
          structuredContent: {
            prompts: [
              { name: 'onboard', description: 'Orient a selected task.' },
              { name: 'capability_routing', description: 'Route a task through discovery.' },
            ],
            auth_guidance: { claim_link: 'provider-claim-secret-that-must-not-be-retained' },
          },
          content: [],
        };
      case 'search_tools':
        if (argumentsValue['tool_ref'] === 'gdelt.context.search_context') {
          return {
            structuredContent: {
              tools: [
                {
                  tool_ref: 'gdelt.context.search_context',
                  server_name: this.#options.driftMapping ? 'unexpected_server' : 'gdelt_context',
                  input_schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      query: { type: 'string' },
                      maxrecords: { type: 'number' },
                      startdatetime: { type: 'string' },
                      enddatetime: { type: 'string' },
                      format: { type: 'string' },
                      searchlang: { type: 'string' },
                      sort: { type: 'string' },
                      timespan: { type: 'string' },
                      isquote: { type: 'number' },
                    },
                    required: ['query'],
                  },
                  annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                  },
                  security_hints: {
                    side_effect: 'read_only',
                    ...(this.#options.omitSecurityTaskSupport
                      ? {}
                      : {
                          task_support: this.#options.securityTaskSupport ?? 'forbidden',
                        }),
                  },
                  output_schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      articles: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            url: { type: 'string' },
                            title: { type: 'string' },
                            domain: { type: 'string' },
                            seendate: { type: 'string' },
                            sentence: { type: 'string' },
                            context: { type: 'string' },
                          },
                          required: ['url', 'title', 'domain', 'seendate', 'sentence', 'context'],
                        },
                      },
                    },
                  },
                },
              ],
              _meta: { snapshot_version: 'snapshot-v1' },
            },
            content: [],
          };
        }
        return {
          structuredContent: {
            tools: [
              {
                tool_ref: 'weather.get_current_conditions',
                server_name: this.#options.driftMapping ? 'unexpected_server' : 'weather_toolkit',
                input_schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    location: { type: 'string' },
                    ...(this.#options.extraRequiredArgument
                      ? { undocumented_required: { type: 'string' } }
                      : {}),
                  },
                  required: [
                    'location',
                    ...(this.#options.extraRequiredArgument ? ['undocumented_required'] : []),
                  ],
                },
                annotations: {
                  readOnlyHint: true,
                  destructiveHint: false,
                  idempotentHint: true,
                },
                security_hints: {
                  side_effect: 'read_only',
                  ...(this.#options.omitSecurityTaskSupport
                    ? {}
                    : { task_support: this.#options.securityTaskSupport ?? 'optional' }),
                },
                output_schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    location: { type: 'object' },
                    weather_description: { type: 'string' },
                    weather_category: { type: 'string' },
                    retrieved_at: { type: 'number' },
                  },
                },
              },
            ],
            _meta: { snapshot_version: 'snapshot-v1' },
          },
          content: [],
        };
      case 'call_tool':
        return {
          structuredContent: {
            location: {
              name:
                this.#options.credentialEcho === 'provider_payload'
                  ? `Galehaven ${this.#options.echoedCredential ?? 'seeded-secret'}`
                  : 'Galehaven',
            },
            temperature_c: 17,
            weather_description: 'Light rain',
          },
          content: [{ type: 'text', text: 'Current conditions returned.' }],
        };
      default:
        return { content: [], isError: true };
    }
  }
}

async function connectionFixture(
  overrides: Omit<FakeClientOptions, 'onClose'> = {},
  connectionOverrides: {
    credentialConfigured?: boolean;
    enableSearchMapping?: boolean;
    maxDiscoveryBytes?: number;
    token?: () => string | undefined;
  } = {},
): Promise<{
  connection: StreamableHttpPrefConnection;
  clients: FakeSdkClient[];
  factoryCalls: number;
}> {
  const capabilityMap = await loadPrefCapabilityMap();
  if (connectionOverrides.enableSearchMapping) {
    capabilityMap.mappings[1]!.enabled = true;
  }
  const clients: FakeSdkClient[] = [];
  let factoryCalls = 0;
  const factory: PrefMcpSdkClientFactory = ({ onClose, credentialProvider }) => {
    factoryCalls += 1;
    const client = new FakeSdkClient({ onClose, credentialProvider, ...overrides });
    clients.push(client);
    return client;
  };
  const connection = new StreamableHttpPrefConnection({
    capabilityMap,
    credential: {
      configured: connectionOverrides.credentialConfigured ?? true,
      token: connectionOverrides.token ?? (() => 'seeded-secret'),
    },
    clientFactory: factory,
    ...(connectionOverrides.maxDiscoveryBytes
      ? { maxDiscoveryBytes: connectionOverrides.maxDiscoveryBytes }
      : {}),
  });
  return {
    connection,
    clients,
    get factoryCalls() {
      return factoryCalls;
    },
  };
}

describe('Streamable HTTP Pref connection', () => {
  it('discovers tools plus helper-backed resources/prompts and validates the capability map', async () => {
    const fixture = await connectionFixture();

    const diagnostics = await fixture.connection.connect();

    expect(diagnostics).toMatchObject({
      mode: 'live',
      serverName: 'pref',
      transport: 'streamable_http',
      state: 'connected',
      connected: true,
      credentialState: 'configured',
      endpointHost: 'pref.trade',
      serverVersion: 'preference-mcp-gateway 1.0.0',
      protocolVersion: '2025-11-25',
      catalogVersion: 'snapshot-v1',
      indexedCapabilityCount: 547,
      mappings: [
        {
          canonicalName: 'local_conditions',
          toolRef: 'weather.get_current_conditions',
          status: 'valid',
        },
        {
          canonicalName: 'search_sources',
          toolRef: 'gdelt.context.search_context',
          status: 'disabled',
        },
      ],
    });
    expect(diagnostics.inventory.tools.map((tool) => tool.name)).toEqual([
      'call_tool',
      'help',
      'list_resources',
      'onboard',
      'search_tools',
    ]);
    expect(diagnostics.inventory.resources[0]?.uri).toBe('pref://docs/overview');
    expect(diagnostics.inventory.resourceTemplates[0]?.uriTemplate).toBe(
      'pref://capabilities/{tool_ref}/manual',
    );
    expect(diagnostics.inventory.prompts.map((prompt) => prompt.name)).toEqual([
      'capability_routing',
      'onboard',
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('seeded-secret');
    expect(JSON.stringify(diagnostics)).not.toContain('claim_link');
  });

  it('prefers native resource and prompt discovery when the server advertises it', async () => {
    const fixture = await connectionFixture({ nativePrimitives: true });

    const diagnostics = await fixture.connection.connect();

    expect(diagnostics.inventory.resources[0]?.uri).toBe('pref://native/overview');
    expect(diagnostics.inventory.resourceTemplates[0]?.uriTemplate).toBe(
      'pref://native/{tool_ref}',
    );
    expect(diagnostics.inventory.prompts).toEqual([
      {
        name: 'native_routing',
        description: 'Route a capability.',
        argumentNames: ['task'],
      },
    ]);
    expect(fixture.clients[0]?.calls.map((call) => call.name)).not.toContain('list_resources');
    expect(fixture.clients[0]?.calls.map((call) => call.name)).not.toContain('onboard');
  });

  it('wraps an approved provider ref through call_tool and denies unknown refs before dispatch', async () => {
    const fixture = await connectionFixture();
    await fixture.connection.connect();

    const result = await fixture.connection.callProviderTool('weather.get_current_conditions', {
      location: 'Galehaven',
    });

    expect(result).toMatchObject({
      structuredContent: { temperature_c: 17, weather_description: 'Light rain' },
      text: 'Current conditions returned.',
    });
    expect(fixture.clients[0]?.calls.at(-1)).toEqual({
      name: 'call_tool',
      argumentsValue: {
        tool_ref: 'weather.get_current_conditions',
        arguments: { location: 'Galehaven' },
      },
    });
    await expect(
      fixture.connection.callProviderTool('market.place_order', { market: 'forbidden' }),
    ).rejects.toMatchObject({ code: 'pref_tool_denied' });
    expect(fixture.clients[0]?.calls.at(-1)?.name).toBe('call_tool');
  });

  it('marks contract drift invalid and refuses to execute the stale mapping', async () => {
    const fixture = await connectionFixture({ driftMapping: true });

    const diagnostics = await fixture.connection.connect();

    expect(diagnostics.mappings[0]).toMatchObject({
      status: 'invalid',
      message: 'The discovered Pref contract does not match the approved mapping.',
    });
    await expect(
      fixture.connection.callProviderTool('weather.get_current_conditions', {
        location: 'Galehaven',
      }),
    ).rejects.toMatchObject({ code: 'pref_tool_denied' });
  });

  it.each(['forbidden', 'optional'] as const)(
    'accepts task_support=%s for a synchronous read-only mapping',
    async (securityTaskSupport) => {
      const fixture = await connectionFixture({ securityTaskSupport });

      const diagnostics = await fixture.connection.connect();

      expect(diagnostics.mappings[0]).toMatchObject({ status: 'valid' });
      await expect(
        fixture.connection.callProviderTool('weather.get_current_conditions', {
          location: 'Galehaven',
        }),
      ).resolves.toMatchObject({ structuredContent: { temperature_c: 17 } });
    },
  );

  it('validates the exact GDELT catalog contract with synchronous task support forbidden', async () => {
    const fixture = await connectionFixture({}, { enableSearchMapping: true });

    const diagnostics = await fixture.connection.connect();

    expect(diagnostics.mappings[1]).toMatchObject({
      canonicalName: 'search_sources',
      toolRef: 'gdelt.context.search_context',
      status: 'valid',
    });
    expect(
      fixture.clients[0]?.calls
        .filter((call) => call.name === 'search_tools')
        .map((call) => call.argumentsValue['tool_ref']),
    ).toEqual(['weather.get_current_conditions', 'gdelt.context.search_context']);
  });

  it.each([
    ['task-required transport', { securityTaskSupport: 'required' }],
    ['unknown task policy', { securityTaskSupport: 'unknown' }],
    ['missing task policy', { omitSecurityTaskSupport: true }],
    ['unmapped required argument', { extraRequiredArgument: true }],
  ] as const)('rejects a mapping with %s drift', async (_label, overrides) => {
    const fixture = await connectionFixture(overrides);

    const diagnostics = await fixture.connection.connect();

    expect(diagnostics.mappings[0]).toMatchObject({ status: 'invalid' });
    await expect(
      fixture.connection.callProviderTool('weather.get_current_conditions', {
        location: 'Galehaven',
      }),
    ).rejects.toMatchObject({ code: 'pref_tool_denied' });
  });

  it('shows explicit disconnect, remote close, and reconnect transitions', async () => {
    const fixture = await connectionFixture();
    await fixture.connection.connect();
    const firstClient = fixture.clients[0];

    firstClient?.remoteClose();
    expect(fixture.connection.diagnostics()).toMatchObject({
      state: 'disconnected',
      connected: false,
      lastError: { code: 'pref_disconnected' },
    });

    await fixture.connection.connect();
    expect(fixture.factoryCalls).toBe(2);
    expect(fixture.connection.diagnostics().state).toBe('connected');

    await fixture.connection.disconnect();
    expect(fixture.connection.diagnostics()).toMatchObject({
      state: 'disconnected',
      connected: false,
    });
    expect(fixture.clients[1]?.closes).toBe(1);
  });

  it('reports missing credentials without constructing a network client', async () => {
    const fixture = await connectionFixture({}, { credentialConfigured: false });

    await expect(fixture.connection.connect()).rejects.toMatchObject({
      code: 'pref_auth_required',
    });
    expect(fixture.factoryCalls).toBe(0);
    expect(fixture.connection.diagnostics()).toMatchObject({
      state: 'auth_required',
      credentialState: 'missing',
      connected: false,
    });
  });

  it('replaces credential-bearing upstream errors with fixed safe diagnostics', async () => {
    const fixture = await connectionFixture({ failConnect: true });

    await expect(fixture.connection.connect()).rejects.toBeInstanceOf(PrefMcpConnectionError);
    const serialized = JSON.stringify(fixture.connection.diagnostics());
    expect(serialized).toContain('pref_connection_failed');
    expect(serialized).not.toContain('seeded-secret');
    expect(serialized).not.toMatch(/Bearer/iu);
  });

  it('rejects credential echoes in discovery metadata without retaining them', async () => {
    const fixture = await connectionFixture({ credentialEcho: 'server_version' });

    await expect(fixture.connection.connect()).rejects.toMatchObject({
      code: 'pref_discovery_failed',
    });
    const serialized = JSON.stringify(fixture.connection.diagnostics());
    expect(serialized).toContain('pref_discovery_failed');
    expect(serialized).not.toContain('seeded-secret');
    expect(serialized).not.toContain('preference-mcp-gateway seeded-secret');
  });

  it('tracks a credential rotated by the SDK auth provider before validating responses', async () => {
    let calls = 0;
    const fixture = await connectionFixture(
      {
        credentialEcho: 'server_version',
        echoedCredential: 'rotated-secret',
        refreshCredentialOnConnect: true,
      },
      { token: () => (calls++ === 0 ? 'seeded-secret' : 'rotated-secret') },
    );

    await expect(fixture.connection.connect()).rejects.toMatchObject({
      code: 'pref_discovery_failed',
    });
    const serialized = JSON.stringify(fixture.connection.diagnostics());
    expect(serialized).not.toContain('seeded-secret');
    expect(serialized).not.toContain('rotated-secret');
  });

  it('rejects an otherwise valid provider payload that echoes the active credential', async () => {
    const fixture = await connectionFixture({ credentialEcho: 'provider_payload' });
    await fixture.connection.connect();

    await expect(
      fixture.connection.callProviderTool('weather.get_current_conditions', {
        location: 'Galehaven',
      }),
    ).rejects.toMatchObject({ code: 'pref_upstream_error' });
    const serialized = JSON.stringify(fixture.connection.diagnostics());
    expect(serialized).toContain('pref_upstream_error');
    expect(serialized).not.toContain('seeded-secret');
    expect(serialized).not.toContain('Galehaven seeded-secret');
  });

  it('rejects a provider payload that echoes a credential used before rotation', async () => {
    let calls = 0;
    const fixture = await connectionFixture(
      {
        credentialEcho: 'provider_payload',
        echoedCredential: 'seeded-secret',
        refreshCredentialOnConnect: true,
      },
      { token: () => (calls++ === 0 ? 'seeded-secret' : 'rotated-secret') },
    );
    await fixture.connection.connect();

    await expect(
      fixture.connection.callProviderTool('weather.get_current_conditions', {
        location: 'Galehaven',
      }),
    ).rejects.toMatchObject({ code: 'pref_upstream_error' });
    const serialized = JSON.stringify(fixture.connection.diagnostics());
    expect(serialized).not.toContain('seeded-secret');
    expect(serialized).not.toContain('rotated-secret');
  });

  it('retains a reused credential when bounded rotation history evicts an older value', async () => {
    const values = [
      'reused-secret',
      ...Array.from({ length: 15 }, (_, index) => `rotated-secret-${index}`),
      'reused-secret',
      'rotated-secret-final',
    ];
    let calls = 0;
    const fixture = await connectionFixture(
      { credentialEcho: 'provider_payload', echoedCredential: 'reused-secret' },
      { token: () => values[calls++] },
    );
    await fixture.connection.connect();
    for (let index = 1; index < values.length; index += 1) {
      await fixture.clients[0]?.refreshCredential();
    }

    await expect(
      fixture.connection.callProviderTool('weather.get_current_conditions', {
        location: 'Galehaven',
      }),
    ).rejects.toMatchObject({ code: 'pref_upstream_error' });
  });

  it('rejects oversized discovery payloads before retaining them', async () => {
    const fixture = await connectionFixture({ oversized: true }, { maxDiscoveryBytes: 1_024 });

    await expect(fixture.connection.connect()).rejects.toMatchObject({
      code: 'pref_response_too_large',
    });
    expect(fixture.connection.diagnostics()).toMatchObject({
      state: 'error',
      connected: false,
      lastError: { code: 'pref_response_too_large' },
      inventory: { tools: [], resources: [], resourceTemplates: [], prompts: [] },
    });
  });

  it('caps declared and streamed HTTP response bytes before the SDK parses them', async () => {
    let observedRedirect: RequestRedirect | undefined;
    const redirectSafeFetch = createBoundedPrefFetch(128, async (_input, init) => {
      observedRedirect = init?.redirect;
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    });
    await redirectSafeFetch('https://pref.trade/mcp', { redirect: 'follow' });
    expect(observedRedirect).toBe('error');

    const declaredFetch = createBoundedPrefFetch(
      8,
      async () =>
        new Response('too large', {
          headers: { 'content-length': '9', 'content-type': 'application/json' },
        }),
    );
    await expect(declaredFetch('https://pref.trade/mcp')).rejects.toMatchObject({
      code: 'pref_response_too_large',
    });

    const streamedFetch = createBoundedPrefFetch(
      8,
      async () => new Response(new TextEncoder().encode('streamed response without a length')),
    );
    const streamedResponse = await streamedFetch('https://pref.trade/mcp');
    await expect(streamedResponse.text()).rejects.toMatchObject({
      code: 'pref_response_too_large',
    });
  });
});
