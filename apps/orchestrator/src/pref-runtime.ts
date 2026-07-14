import {
  PrefMcpConnectionDiagnosticsSchema,
  StreamableHttpPrefConnection,
  loadPrefCapabilityMapSync,
  type PrefMcpConnection,
  type PrefMcpConnectionDiagnostics,
  type PrefMcpConnectionErrorCode,
} from '@signal-atlas/pref-gateway';

export interface PrefRuntime {
  diagnostics(): PrefMcpConnectionDiagnostics;
  testConnection(): Promise<PrefMcpConnectionDiagnostics>;
  disconnect(): Promise<PrefMcpConnectionDiagnostics>;
}

export interface CreatePrefRuntimeOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  connection?: PrefMcpConnection;
  now?: () => Date;
}

export function createConfiguredPrefRuntime(options: CreatePrefRuntimeOptions = {}): PrefRuntime {
  if (options.connection) return new LivePrefRuntime(options.connection);
  const environment = options.environment ?? process.env;
  if (environment['SIGNAL_ATLAS_PREF_MODE'] !== 'live') {
    return new FixturePrefRuntime(options.now);
  }

  const capabilityMap = loadPrefCapabilityMapSync();
  const token = environment[capabilityMap.server.credentialEnvKey];
  try {
    const connection = new StreamableHttpPrefConnection({
      capabilityMap,
      ...(environment['SIGNAL_ATLAS_PREF_URL']
        ? { endpoint: environment['SIGNAL_ATLAS_PREF_URL'] }
        : {}),
      credential: {
        configured: typeof token === 'string' && token.trim().length > 0,
        token: () => environment[capabilityMap.server.credentialEnvKey],
      },
    });
    return new LivePrefRuntime(connection);
  } catch {
    return new UnavailablePrefRuntime(
      'pref_server_denied',
      typeof token === 'string' && token.trim().length > 0,
      options.now,
    );
  }
}

class LivePrefRuntime implements PrefRuntime {
  readonly #connection: PrefMcpConnection;

  constructor(connection: PrefMcpConnection) {
    this.#connection = connection;
  }

  diagnostics(): PrefMcpConnectionDiagnostics {
    return this.#connection.diagnostics();
  }

  async testConnection(): Promise<PrefMcpConnectionDiagnostics> {
    try {
      await this.#connection.disconnect();
      await this.#connection.connect();
    } catch {
      // The connection owns the fixed safe diagnostic projection.
    }
    return this.#connection.diagnostics();
  }

  async disconnect(): Promise<PrefMcpConnectionDiagnostics> {
    await this.#connection.disconnect();
    return this.#connection.diagnostics();
  }
}

class FixturePrefRuntime implements PrefRuntime {
  readonly #now: () => Date;
  #state: 'connected' | 'disconnected' = 'connected';
  #lastTransitionAt: string;

  constructor(now: (() => Date) | undefined) {
    this.#now = now ?? (() => new Date());
    this.#lastTransitionAt = this.#now().toISOString();
  }

  diagnostics(): PrefMcpConnectionDiagnostics {
    return PrefMcpConnectionDiagnosticsSchema.parse({
      mode: 'fixture',
      serverName: 'pref-fixture',
      transport: 'fixture',
      state: this.#state,
      connected: this.#state === 'connected',
      credentialState: 'not_required',
      readOnly: true,
      lastTransitionAt: this.#lastTransitionAt,
      lastCheckedAt: this.#lastTransitionAt,
      serverVersion: 'recorded-fixture 1',
      inventory: {
        tools: [
          {
            name: 'fixture.local_conditions',
            description: 'Recorded local-condition observations.',
            inputFields: ['location'],
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
          toolRef: 'fixture.local_conditions',
          providerServer: 'pref-fixture',
          status: 'valid',
        },
      ],
    });
  }

  async testConnection(): Promise<PrefMcpConnectionDiagnostics> {
    this.#state = 'connected';
    this.#lastTransitionAt = this.#now().toISOString();
    return this.diagnostics();
  }

  async disconnect(): Promise<PrefMcpConnectionDiagnostics> {
    this.#state = 'disconnected';
    this.#lastTransitionAt = this.#now().toISOString();
    return this.diagnostics();
  }
}

class UnavailablePrefRuntime implements PrefRuntime {
  readonly #diagnostics: PrefMcpConnectionDiagnostics;

  constructor(
    code: PrefMcpConnectionErrorCode,
    credentialConfigured: boolean,
    now: (() => Date) | undefined,
  ) {
    const timestamp = (now ?? (() => new Date()))().toISOString();
    this.#diagnostics = PrefMcpConnectionDiagnosticsSchema.parse({
      mode: 'live',
      serverName: 'pref',
      transport: 'streamable_http',
      state: 'error',
      connected: false,
      credentialState: credentialConfigured ? 'configured' : 'missing',
      readOnly: true,
      lastTransitionAt: timestamp,
      lastCheckedAt: timestamp,
      inventory: { tools: [], resources: [], resourceTemplates: [], prompts: [] },
      mappings: [],
      lastError: {
        code,
        message: 'The configured Pref server is not allow-listed.',
      },
    });
  }

  diagnostics(): PrefMcpConnectionDiagnostics {
    return structuredClone(this.#diagnostics);
  }

  async testConnection(): Promise<PrefMcpConnectionDiagnostics> {
    return this.diagnostics();
  }

  async disconnect(): Promise<PrefMcpConnectionDiagnostics> {
    return this.diagnostics();
  }
}
