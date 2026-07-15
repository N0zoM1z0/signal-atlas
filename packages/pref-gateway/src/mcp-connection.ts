import {
  Client,
  SdkError,
  SdkErrorCode,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type ServerCapabilities,
} from '@modelcontextprotocol/client';
import { EnvHttpProxyAgent } from 'undici';

import {
  assertAllowedPrefEndpoint,
  type PrefCapabilityMap,
  type PrefCapabilityMapping,
} from './capability-map.js';
import {
  PrefMcpConnectionDiagnosticsSchema,
  PrefMcpConnectionError,
  type PrefCapabilityMappingStatus,
  type PrefMcpCallOptions,
  type PrefMcpCallResult,
  type PrefMcpConnection,
  type PrefMcpConnectionDiagnostics,
  type PrefMcpConnectionErrorCode,
  type PrefPrimitiveInventory,
  type PrefPromptPrimitive,
  type PrefResourcePrimitive,
  type PrefResourceTemplatePrimitive,
  type PrefToolPrimitive,
} from './types.js';

interface SdkToolDescriptor {
  name: string;
  title?: string | undefined;
  description?: string | undefined;
  inputSchema?: unknown | undefined;
  annotations?: unknown | undefined;
}

interface SdkResourceDescriptor {
  name: string;
  title?: string | undefined;
  uri: string;
  description?: string | undefined;
  mimeType?: string | undefined;
}

interface SdkResourceTemplateDescriptor {
  name: string;
  title?: string | undefined;
  uriTemplate: string;
  description?: string | undefined;
  mimeType?: string | undefined;
}

interface SdkPromptDescriptor {
  name: string;
  title?: string | undefined;
  description?: string | undefined;
  arguments?: Array<{ name: string }> | undefined;
}

export interface PrefMcpSdkCallResult {
  structuredContent?: Record<string, unknown> | undefined;
  content?: unknown[] | undefined;
  isError?: boolean | undefined;
}

export interface PrefMcpSdkClient {
  connect(options: PrefMcpCallOptions): Promise<void>;
  close(): Promise<void>;
  getServerCapabilities(): Record<string, unknown> | undefined;
  getServerVersion(): { name: string; version: string } | undefined;
  getProtocolVersion(): string | undefined;
  listTools(
    cursor: string | undefined,
    options: PrefMcpCallOptions,
  ): Promise<{ tools: SdkToolDescriptor[]; nextCursor?: string }>;
  listResources(
    cursor: string | undefined,
    options: PrefMcpCallOptions,
  ): Promise<{ resources: SdkResourceDescriptor[]; nextCursor?: string }>;
  listResourceTemplates(
    cursor: string | undefined,
    options: PrefMcpCallOptions,
  ): Promise<{ resourceTemplates: SdkResourceTemplateDescriptor[]; nextCursor?: string }>;
  listPrompts(
    cursor: string | undefined,
    options: PrefMcpCallOptions,
  ): Promise<{ prompts: SdkPromptDescriptor[]; nextCursor?: string }>;
  callTool(
    name: string,
    argumentsValue: Record<string, unknown>,
    options: PrefMcpCallOptions,
  ): Promise<PrefMcpSdkCallResult>;
}

export interface PrefMcpSdkClientFactoryInput {
  endpoint: URL;
  credentialProvider: () => Promise<string | undefined>;
  maxResponseBytes: number;
  onClose: () => void;
}

export type PrefMcpSdkClientFactory = (input: PrefMcpSdkClientFactoryInput) => PrefMcpSdkClient;

export interface StreamableHttpPrefConnectionOptions {
  capabilityMap: PrefCapabilityMap;
  endpoint?: string;
  credential: {
    configured: boolean;
    token: () => string | undefined | Promise<string | undefined>;
  };
  clientFactory?: PrefMcpSdkClientFactory;
  timeoutMs?: number;
  maxDiscoveryBytes?: number;
  maxPrimitiveCount?: number;
  now?: () => Date;
}

const EMPTY_INVENTORY: PrefPrimitiveInventory = {
  tools: [],
  resources: [],
  resourceTemplates: [],
  prompts: [],
};
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_DISCOVERY_BYTES = 1_000_000;
const DEFAULT_MAX_PRIMITIVES = 256;
const MAX_PAGES = 16;
const encoder = new TextEncoder();

export class StreamableHttpPrefConnection implements PrefMcpConnection {
  readonly #map: PrefCapabilityMap;
  readonly #endpoint: URL;
  readonly #credential: StreamableHttpPrefConnectionOptions['credential'];
  readonly #clientFactory: PrefMcpSdkClientFactory;
  readonly #timeoutMs: number;
  readonly #maxDiscoveryBytes: number;
  readonly #maxPrimitiveCount: number;
  readonly #now: () => Date;
  #client: PrefMcpSdkClient | undefined;
  #state: PrefMcpConnectionDiagnostics['state'] = 'disconnected';
  #lastTransitionAt: string;
  #lastCheckedAt: string | undefined;
  #inventory: PrefPrimitiveInventory = structuredClone(EMPTY_INVENTORY);
  #mappings: PrefCapabilityMappingStatus[];
  #serverVersion: string | undefined;
  #protocolVersion: string | undefined;
  #catalogVersion: string | undefined;
  #indexedCapabilityCount: number | undefined;
  #lastError: PrefMcpConnectionDiagnostics['lastError'];
  #connectAttempt: Promise<PrefMcpConnectionDiagnostics> | undefined;
  #activeCredential: string | undefined;
  #closing = false;

  constructor(options: StreamableHttpPrefConnectionOptions) {
    this.#map = structuredClone(options.capabilityMap);
    try {
      this.#endpoint = assertAllowedPrefEndpoint(
        options.endpoint ?? this.#map.server.endpoint,
        this.#map.server.allowedHosts,
      );
    } catch {
      throw safeConnectionError('pref_server_denied');
    }
    this.#credential = options.credential;
    this.#clientFactory = options.clientFactory ?? createOfficialPrefMcpSdkClient;
    this.#timeoutMs = boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 250, 120_000);
    this.#maxDiscoveryBytes = boundedInteger(
      options.maxDiscoveryBytes,
      DEFAULT_MAX_DISCOVERY_BYTES,
      1_024,
      10_000_000,
    );
    this.#maxPrimitiveCount = boundedInteger(
      options.maxPrimitiveCount,
      DEFAULT_MAX_PRIMITIVES,
      1,
      1_000,
    );
    this.#now = options.now ?? (() => new Date());
    this.#lastTransitionAt = this.#timestamp();
    this.#mappings = initialMappingStatuses(this.#map);
  }

  async connect(): Promise<PrefMcpConnectionDiagnostics> {
    if (this.#connectAttempt) return this.#connectAttempt;
    const attempt = this.#connect();
    this.#connectAttempt = attempt;
    try {
      return await attempt;
    } finally {
      this.#connectAttempt = undefined;
    }
  }

  async disconnect(): Promise<void> {
    this.#closing = true;
    const client = this.#client;
    this.#client = undefined;
    try {
      await client?.close();
    } catch {
      // The local state still closes; transport details are never exposed.
    } finally {
      this.#activeCredential = undefined;
      this.#closing = false;
      this.#transition('disconnected');
      this.#lastError = undefined;
    }
  }

  diagnostics(): PrefMcpConnectionDiagnostics {
    return PrefMcpConnectionDiagnosticsSchema.parse({
      mode: 'live',
      serverName: this.#map.server.name,
      transport: this.#map.server.transport,
      state: this.#state,
      connected: this.#state === 'connected',
      credentialState: this.#credential.configured ? 'configured' : 'missing',
      endpointHost: this.#endpoint.hostname,
      readOnly: true,
      lastTransitionAt: this.#lastTransitionAt,
      ...(this.#lastCheckedAt ? { lastCheckedAt: this.#lastCheckedAt } : {}),
      ...(this.#serverVersion ? { serverVersion: this.#serverVersion } : {}),
      ...(this.#protocolVersion ? { protocolVersion: this.#protocolVersion } : {}),
      ...(this.#catalogVersion ? { catalogVersion: this.#catalogVersion } : {}),
      ...(this.#indexedCapabilityCount !== undefined
        ? { indexedCapabilityCount: this.#indexedCapabilityCount }
        : {}),
      inventory: structuredClone(this.#inventory),
      mappings: structuredClone(this.#mappings),
      ...(this.#lastError ? { lastError: structuredClone(this.#lastError) } : {}),
    });
  }

  async callProviderTool(
    toolRef: string,
    argumentsValue: Record<string, unknown>,
    options: PrefMcpCallOptions = {},
  ): Promise<PrefMcpCallResult> {
    const mapping = this.#map.mappings.find(
      (candidate) => candidate.enabled && candidate.toolRef === toolRef,
    );
    const mappingStatus = this.#mappings.find((candidate) => candidate.toolRef === toolRef);
    if (
      !mapping ||
      !this.#map.allowedProviderTools.includes(toolRef) ||
      mappingStatus?.status !== 'valid'
    ) {
      throw safeConnectionError('pref_tool_denied');
    }
    if (!this.#client || this.#state !== 'connected') {
      throw safeConnectionError('pref_disconnected');
    }
    try {
      const result = await this.#callDirectTool(
        this.#map.discovery.executionTool,
        { tool_ref: toolRef, arguments: structuredClone(argumentsValue) },
        options,
        'pref_upstream_error',
      );
      if (result.isError) throw safeConnectionError('pref_upstream_error');
      return publicCallResult(result, this.#maxDiscoveryBytes);
    } catch (error: unknown) {
      const normalized = normalizeConnectionError(error, 'pref_upstream_error');
      this.#lastError = { code: normalized.code, message: normalized.message };
      throw normalized;
    }
  }

  async #connect(): Promise<PrefMcpConnectionDiagnostics> {
    if (!this.#credential.configured) {
      const error = safeConnectionError('pref_auth_required');
      this.#lastCheckedAt = this.#timestamp();
      this.#lastError = { code: error.code, message: error.message };
      this.#transition('auth_required');
      throw error;
    }

    await this.disconnect();
    this.#transition('connecting');
    this.#lastError = undefined;
    this.#inventory = structuredClone(EMPTY_INVENTORY);
    this.#mappings = initialMappingStatuses(this.#map);
    this.#serverVersion = undefined;
    this.#protocolVersion = undefined;
    this.#catalogVersion = undefined;
    this.#indexedCapabilityCount = undefined;

    const credentialProvider = async (): Promise<string | undefined> => {
      const value = await this.#credential.token();
      const token = typeof value === 'string' ? value.trim() : '';
      this.#activeCredential = token.length > 0 ? token : undefined;
      return this.#activeCredential;
    };
    const token = await credentialProvider();
    if (!token) {
      const error = safeConnectionError('pref_auth_required');
      this.#lastCheckedAt = this.#timestamp();
      this.#lastError = { code: error.code, message: error.message };
      this.#transition('auth_required');
      throw error;
    }
    const client = this.#clientFactory({
      endpoint: new URL(this.#endpoint),
      credentialProvider,
      maxResponseBytes: this.#maxDiscoveryBytes,
      onClose: () => this.#handleRemoteClose(),
    });
    this.#client = client;
    try {
      await client.connect({ timeoutMs: this.#timeoutMs });
      await this.#discover(client);
      const version = client.getServerVersion();
      this.#assertNoActiveCredential(version, 'pref_discovery_failed');
      const protocolVersion = client.getProtocolVersion();
      this.#assertNoActiveCredential(protocolVersion, 'pref_discovery_failed');
      this.#serverVersion = version
        ? safeText(`${version.name} ${version.version}`, 256)
        : undefined;
      this.#protocolVersion = safeOptionalText(protocolVersion, 256);
      this.#lastCheckedAt = this.#timestamp();
      this.#lastError = undefined;
      this.#transition('connected');
      return this.diagnostics();
    } catch (error: unknown) {
      this.#client = undefined;
      this.#activeCredential = undefined;
      try {
        await client.close();
      } catch {
        // The sanitized connection failure below is authoritative.
      }
      const normalized = normalizeConnectionError(error, 'pref_connection_failed');
      this.#lastCheckedAt = this.#timestamp();
      this.#lastError = { code: normalized.code, message: normalized.message };
      this.#transition(normalized.code === 'pref_auth_required' ? 'auth_required' : 'error');
      throw normalized;
    }
  }

  async #discover(client: PrefMcpSdkClient): Promise<void> {
    const options = { timeoutMs: this.#timeoutMs };
    const tools = await this.#collectPages(
      (cursor) => client.listTools(cursor, options),
      (page) => page.tools,
    );
    const toolInventory = tools.map(toPublicTool).sort(byName);
    const advertisedTools = new Set(toolInventory.map((tool) => tool.name));
    const serverCapabilities = client.getServerCapabilities();
    this.#assertNoActiveCredential(serverCapabilities, 'pref_discovery_failed');

    let resources: PrefResourcePrimitive[] = [];
    let resourceTemplates: PrefResourceTemplatePrimitive[] = [];
    if (hasCapability(serverCapabilities, 'resources')) {
      resources = (
        await this.#collectPages(
          (cursor) => client.listResources(cursor, options),
          (page) => page.resources,
        )
      )
        .map(toPublicResource)
        .sort(byName);
      resourceTemplates = (
        await this.#collectPages(
          (cursor) => client.listResourceTemplates(cursor, options),
          (page) => page.resourceTemplates,
        )
      )
        .map(toPublicResourceTemplate)
        .sort(byName);
    } else if (
      this.#map.discovery.resourceListTool &&
      advertisedTools.has(this.#map.discovery.resourceListTool)
    ) {
      const result = await this.#callDirectTool(this.#map.discovery.resourceListTool, {}, options);
      if (result.isError) throw safeConnectionError('pref_discovery_failed');
      const parsed = helperResources(result.structuredContent);
      resources = parsed.resources;
      resourceTemplates = parsed.resourceTemplates;
      this.#indexedCapabilityCount = parsed.indexedCapabilityCount;
    }

    let prompts: PrefPromptPrimitive[] = [];
    if (hasCapability(serverCapabilities, 'prompts')) {
      prompts = (
        await this.#collectPages(
          (cursor) => client.listPrompts(cursor, options),
          (page) => page.prompts,
        )
      )
        .map(toPublicPrompt)
        .sort(byName);
    } else if (
      this.#map.discovery.promptListTool &&
      advertisedTools.has(this.#map.discovery.promptListTool)
    ) {
      const result = await this.#callDirectTool(
        this.#map.discovery.promptListTool,
        { client: 'signal-atlas', task: 'discover read-only information capabilities' },
        options,
      );
      if (result.isError) throw safeConnectionError('pref_discovery_failed');
      prompts = helperPrompts(result.structuredContent);
    }

    this.#inventory = {
      tools: toolInventory.slice(0, this.#maxPrimitiveCount),
      resources: resources.slice(0, this.#maxPrimitiveCount),
      resourceTemplates: resourceTemplates.slice(0, this.#maxPrimitiveCount),
      prompts: prompts.slice(0, this.#maxPrimitiveCount),
    };
    assertBoundedPayload(this.#inventory, this.#maxDiscoveryBytes);
    this.#mappings = await Promise.all(
      this.#map.mappings.map((mapping) => this.#validateMapping(mapping, advertisedTools)),
    );
  }

  async #validateMapping(
    mapping: PrefCapabilityMapping,
    advertisedTools: ReadonlySet<string>,
  ): Promise<PrefCapabilityMappingStatus> {
    const base = {
      canonicalName: mapping.canonicalName,
      toolRef: mapping.toolRef,
      providerServer: mapping.providerServer,
    };
    if (!mapping.enabled) return { ...base, status: 'disabled' };
    if (
      !this.#map.allowedProviderTools.includes(mapping.toolRef) ||
      !advertisedTools.has(this.#map.discovery.catalogTool) ||
      !advertisedTools.has(this.#map.discovery.executionTool)
    ) {
      return { ...base, status: 'invalid', message: 'Required Pref tools are unavailable.' };
    }
    try {
      const result = await this.#callDirectTool(
        this.#map.discovery.catalogTool,
        { tool_ref: mapping.toolRef },
        { timeoutMs: this.#timeoutMs },
      );
      if (result.isError) throw safeConnectionError('pref_mapping_invalid');
      const contract = catalogContract(result.structuredContent, this.#maxDiscoveryBytes);
      const metadata = recordValue(result.structuredContent?.['_meta']);
      this.#catalogVersion = safeOptionalText(metadata?.['snapshot_version'], 256);
      if (!mappingMatchesContract(mapping, contract)) {
        throw safeConnectionError('pref_mapping_invalid');
      }
      return { ...base, status: 'valid' };
    } catch {
      return {
        ...base,
        status: 'invalid',
        message: 'The discovered Pref contract does not match the approved mapping.',
      };
    }
  }

  async #callDirectTool(
    name: string,
    argumentsValue: Record<string, unknown>,
    options: PrefMcpCallOptions,
    credentialLeakCode: PrefMcpConnectionErrorCode = 'pref_discovery_failed',
  ): Promise<PrefMcpSdkCallResult> {
    if (!this.#map.discovery.allowedDirectTools.includes(name)) {
      throw safeConnectionError('pref_tool_denied');
    }
    if (!this.#client) throw safeConnectionError('pref_disconnected');
    const timeoutMs = Math.min(options.timeoutMs ?? this.#timeoutMs, this.#timeoutMs);
    const result = await this.#client.callTool(name, argumentsValue, {
      timeoutMs,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    assertBoundedPayload(result, this.#maxDiscoveryBytes);
    this.#assertNoActiveCredential(result, credentialLeakCode);
    return result;
  }

  async #collectPages<Page, Item>(
    load: (cursor: string | undefined) => Promise<Page & { nextCursor?: string }>,
    items: (page: Page) => readonly Item[],
  ): Promise<Item[]> {
    const collected: Item[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
      const page = await load(cursor);
      assertBoundedPayload(page, this.#maxDiscoveryBytes);
      this.#assertNoActiveCredential(page, 'pref_discovery_failed');
      collected.push(...items(page));
      if (collected.length > this.#maxPrimitiveCount) {
        throw safeConnectionError('pref_response_too_large');
      }
      cursor = page.nextCursor;
      if (cursor === undefined) return collected;
      if (seenCursors.has(cursor)) throw safeConnectionError('pref_discovery_failed');
      seenCursors.add(cursor);
    }
    throw safeConnectionError('pref_discovery_failed');
  }

  #handleRemoteClose(): void {
    if (this.#closing) return;
    this.#client = undefined;
    this.#activeCredential = undefined;
    const error = safeConnectionError('pref_disconnected');
    this.#lastError = { code: error.code, message: error.message };
    this.#transition('disconnected');
  }

  #transition(state: PrefMcpConnectionDiagnostics['state']): void {
    this.#state = state;
    this.#lastTransitionAt = this.#timestamp();
  }

  #timestamp(): string {
    return this.#now().toISOString();
  }

  #assertNoActiveCredential(value: unknown, code: PrefMcpConnectionErrorCode): void {
    const credential = this.#activeCredential;
    if (credential) assertCredentialAbsent(value, credential, code);
  }
}

function createOfficialPrefMcpSdkClient(input: PrefMcpSdkClientFactoryInput): PrefMcpSdkClient {
  const proxyDispatcher = new EnvHttpProxyAgent();
  let proxyCloseAttempt: Promise<void> | undefined;
  const closeProxy = (): Promise<void> => {
    proxyCloseAttempt ??= proxyDispatcher.close().catch(() => undefined);
    return proxyCloseAttempt;
  };
  const proxyFetch: typeof fetch = (request, init) =>
    fetch(request, {
      ...init,
      redirect: 'error',
      dispatcher: proxyDispatcher,
    } as RequestInit & { dispatcher: EnvHttpProxyAgent });
  const transport = new StreamableHTTPClientTransport(input.endpoint, {
    authProvider: { token: input.credentialProvider },
    fetch: createBoundedPrefFetch(input.maxResponseBytes, proxyFetch),
  });
  const client = new Client(
    { name: 'signal-atlas-pref-gateway', version: '0.0.0' },
    { capabilities: {}, enforceStrictCapabilities: true },
  );
  client.onclose = () => {
    void closeProxy();
    input.onClose();
  };
  return {
    async connect(options) {
      await client.connect(transport, requestOptions(options));
    },
    async close() {
      try {
        if (transport.sessionId) {
          try {
            await transport.terminateSession();
          } catch {
            // Session termination is best effort; local close always follows.
          }
        }
        await client.close();
      } finally {
        await closeProxy();
      }
    },
    getServerCapabilities() {
      return client.getServerCapabilities() as ServerCapabilities | undefined;
    },
    getServerVersion() {
      return client.getServerVersion();
    },
    getProtocolVersion() {
      return client.getNegotiatedProtocolVersion();
    },
    async listTools(cursor, options) {
      const result = await client.listTools(
        cursor === undefined ? undefined : { cursor },
        requestOptions(options),
      );
      return {
        tools: result.tools,
        ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
      };
    },
    async listResources(cursor, options) {
      const result = await client.listResources(
        cursor === undefined ? undefined : { cursor },
        requestOptions(options),
      );
      return {
        resources: result.resources,
        ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
      };
    },
    async listResourceTemplates(cursor, options) {
      const result = await client.listResourceTemplates(
        cursor === undefined ? undefined : { cursor },
        requestOptions(options),
      );
      return {
        resourceTemplates: result.resourceTemplates,
        ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
      };
    },
    async listPrompts(cursor, options) {
      const result = await client.listPrompts(
        cursor === undefined ? undefined : { cursor },
        requestOptions(options),
      );
      return {
        prompts: result.prompts,
        ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
      };
    },
    callTool(name, argumentsValue, options) {
      return client.callTool({ name, arguments: argumentsValue }, requestOptions(options));
    },
  };
}

export function createBoundedPrefFetch(
  maximumBytes: number,
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  if (!Number.isInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error('A bounded Pref fetch requires a positive integer byte limit.');
  }
  return async (input, init) => {
    const response = await baseFetch(input, { ...init, redirect: 'error' });
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null) {
      const declaredBytes = Number(declaredLength);
      if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
        await response.body?.cancel();
        throw safeConnectionError('pref_response_too_large');
      }
    }
    if (!response.body) return response;

    const reader = response.body.getReader();
    let receivedBytes = 0;
    const boundedBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            controller.close();
            return;
          }
          receivedBytes += chunk.value.byteLength;
          if (receivedBytes > maximumBytes) {
            await reader.cancel();
            controller.error(safeConnectionError('pref_response_too_large'));
            return;
          }
          controller.enqueue(chunk.value);
        } catch (error: unknown) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(boundedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

function requestOptions(options: PrefMcpCallOptions): {
  timeout?: number;
  maxTotalTimeout?: number;
  signal?: AbortSignal;
} {
  return {
    ...(options.timeoutMs !== undefined
      ? { timeout: options.timeoutMs, maxTotalTimeout: options.timeoutMs }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

function initialMappingStatuses(map: PrefCapabilityMap): PrefCapabilityMappingStatus[] {
  return map.mappings.map((mapping) => ({
    canonicalName: mapping.canonicalName,
    toolRef: mapping.toolRef,
    providerServer: mapping.providerServer,
    status: mapping.enabled ? 'unverified' : 'disabled',
  }));
}

function safeConnectionError(code: PrefMcpConnectionErrorCode): PrefMcpConnectionError {
  switch (code) {
    case 'pref_auth_required':
      return new PrefMcpConnectionError(
        code,
        'A server-side Pref credential is required before connecting.',
      );
    case 'pref_connection_failed':
      return new PrefMcpConnectionError(
        code,
        'The Pref connection could not be established.',
        true,
      );
    case 'pref_discovery_failed':
      return new PrefMcpConnectionError(code, 'Pref primitive discovery failed safely.', true);
    case 'pref_server_denied':
      return new PrefMcpConnectionError(code, 'The configured Pref server is not allow-listed.');
    case 'pref_tool_denied':
      return new PrefMcpConnectionError(code, 'The requested Pref tool is not allow-listed.');
    case 'pref_mapping_invalid':
      return new PrefMcpConnectionError(code, 'The discovered Pref contract is not approved.');
    case 'pref_response_too_large':
      return new PrefMcpConnectionError(code, 'The Pref response exceeded its safe size limit.');
    case 'pref_timeout':
      return new PrefMcpConnectionError(code, 'The Pref operation exceeded its time limit.', true);
    case 'pref_canceled':
      return new PrefMcpConnectionError(code, 'The Pref operation was canceled.', true);
    case 'pref_disconnected':
      return new PrefMcpConnectionError(code, 'The Pref connection is closed.', true);
    case 'pref_upstream_error':
      return new PrefMcpConnectionError(code, 'The approved Pref tool returned an error.', true);
  }
}

function normalizeConnectionError(
  error: unknown,
  fallback: PrefMcpConnectionErrorCode,
): PrefMcpConnectionError {
  if (error instanceof PrefMcpConnectionError) return safeConnectionError(error.code);
  if (error instanceof UnauthorizedError) return safeConnectionError('pref_auth_required');
  if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
    return safeConnectionError('pref_timeout');
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return safeConnectionError('pref_canceled');
  }
  return safeConnectionError(fallback);
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const selected = value ?? fallback;
  if (!Number.isInteger(selected) || selected < minimum || selected > maximum) {
    throw new Error('Invalid bounded Pref connection option.');
  }
  return selected;
}

function assertBoundedPayload(value: unknown, maximumBytes: number): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw safeConnectionError('pref_discovery_failed');
  }
  if (encoder.encode(serialized).byteLength > maximumBytes) {
    throw safeConnectionError('pref_response_too_large');
  }
}

function assertCredentialAbsent(
  value: unknown,
  credential: string,
  code: PrefMcpConnectionErrorCode,
): void {
  const seen = new WeakSet<object>();
  const containsCredential = (candidate: unknown): boolean => {
    if (typeof candidate === 'string') return candidate.includes(credential);
    if (candidate === null || typeof candidate !== 'object') return false;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    if (Array.isArray(candidate)) return candidate.some(containsCredential);
    return Object.entries(candidate).some(
      ([key, nested]) => key.includes(credential) || containsCredential(nested),
    );
  };
  if (containsCredential(value)) throw safeConnectionError(code);
}

function publicCallResult(result: PrefMcpSdkCallResult, maximumBytes: number): PrefMcpCallResult {
  assertBoundedPayload(result, maximumBytes);
  const text = Array.isArray(result.content)
    ? result.content
        .map((item) => recordValue(item))
        .filter((item): item is Record<string, unknown> => item !== undefined)
        .filter((item) => item['type'] === 'text' && typeof item['text'] === 'string')
        .map((item) => item['text'] as string)
        .join('\n')
        .slice(0, 20_000)
    : '';
  return {
    ...(result.structuredContent
      ? { structuredContent: structuredClone(result.structuredContent) }
      : {}),
    ...(text.length > 0 ? { text } : {}),
    responseBytes: encoder.encode(JSON.stringify(result)).byteLength,
  };
}

function hasCapability(
  capabilities: Record<string, unknown> | undefined,
  capability: string,
): boolean {
  return capabilities !== undefined && capabilities[capability] !== undefined;
}

function toPublicTool(tool: SdkToolDescriptor): PrefToolPrimitive {
  const annotations = recordValue(tool.annotations);
  const inputSchema = recordValue(tool.inputSchema);
  const properties = recordValue(inputSchema?.['properties']);
  return {
    name: safeText(tool.name, 256),
    ...(safeOptionalText(tool.title, 256) ? { title: safeText(tool.title ?? '', 256) } : {}),
    ...(safeOptionalText(tool.description, 500)
      ? { description: safeText(tool.description ?? '', 500) }
      : {}),
    inputFields: properties
      ? Object.keys(properties)
          .map((name) => safeText(name, 256))
          .slice(0, 64)
          .sort()
      : [],
    readOnly:
      typeof annotations?.['readOnlyHint'] === 'boolean' ? annotations['readOnlyHint'] : null,
  };
}

function toPublicResource(resource: SdkResourceDescriptor): PrefResourcePrimitive {
  return publicResourceFromRecord({
    name: resource.title ?? resource.name,
    uri: resource.uri,
    description: resource.description,
    mimeType: resource.mimeType,
  });
}

function toPublicResourceTemplate(
  template: SdkResourceTemplateDescriptor,
): PrefResourceTemplatePrimitive {
  return publicResourceTemplateFromRecord({
    name: template.title ?? template.name,
    uriTemplate: template.uriTemplate,
    description: template.description,
    mimeType: template.mimeType,
  });
}

function toPublicPrompt(prompt: SdkPromptDescriptor): PrefPromptPrimitive {
  return publicPromptFromRecord({
    name: prompt.name,
    description: prompt.description,
    arguments: prompt.arguments,
  });
}

function helperResources(value: unknown): {
  resources: PrefResourcePrimitive[];
  resourceTemplates: PrefResourceTemplatePrimitive[];
  indexedCapabilityCount?: number;
} {
  const payload = recordValue(value);
  const resources = arrayValue(payload?.['resources'])
    .map(recordValue)
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map(publicResourceFromRecord)
    .sort(byName);
  const templates = arrayValue(payload?.['resourceTemplates'])
    .map(recordValue)
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map(publicResourceTemplateFromRecord)
    .sort(byName);
  const metadata = recordValue(payload?.['_meta']);
  const indexedCapabilityCount = metadata?.['indexed_capability_count'];
  return {
    resources,
    resourceTemplates: templates,
    ...(typeof indexedCapabilityCount === 'number' && Number.isInteger(indexedCapabilityCount)
      ? { indexedCapabilityCount }
      : {}),
  };
}

function helperPrompts(value: unknown): PrefPromptPrimitive[] {
  const payload = recordValue(value);
  return arrayValue(payload?.['prompts'])
    .map(recordValue)
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map(publicPromptFromRecord)
    .sort(byName);
}

function publicResourceFromRecord(value: Record<string, unknown>): PrefResourcePrimitive {
  const name = stringValue(value['title']) ?? stringValue(value['name']);
  const uri = stringValue(value['uri']);
  if (!name || !uri) throw safeConnectionError('pref_discovery_failed');
  const description = safeOptionalText(value['description'], 500);
  const mimeType = safeOptionalText(value['mimeType'], 255);
  return {
    name: safeText(name, 256),
    uri: safeText(uri, 2_048),
    ...(description ? { description } : {}),
    ...(mimeType ? { mimeType } : {}),
  };
}

function publicResourceTemplateFromRecord(
  value: Record<string, unknown>,
): PrefResourceTemplatePrimitive {
  const name = stringValue(value['title']) ?? stringValue(value['name']);
  const uriTemplate = stringValue(value['uriTemplate']) ?? stringValue(value['uri_template']);
  if (!name || !uriTemplate) throw safeConnectionError('pref_discovery_failed');
  const description = safeOptionalText(value['description'], 500);
  const mimeType = safeOptionalText(value['mimeType'], 255);
  return {
    name: safeText(name, 256),
    uriTemplate: safeText(uriTemplate, 2_048),
    ...(description ? { description } : {}),
    ...(mimeType ? { mimeType } : {}),
  };
}

function publicPromptFromRecord(value: Record<string, unknown>): PrefPromptPrimitive {
  const name = stringValue(value['name']);
  if (!name) throw safeConnectionError('pref_discovery_failed');
  const description = safeOptionalText(value['description'], 500);
  const argumentNames = arrayValue(value['arguments'])
    .map(recordValue)
    .map((argument) => stringValue(argument?.['name']))
    .filter((argument): argument is string => argument !== undefined)
    .map((argument) => safeText(argument, 256))
    .slice(0, 32)
    .sort();
  return {
    name: safeText(name, 256),
    ...(description ? { description } : {}),
    argumentNames,
  };
}

function catalogContract(value: unknown, maximumBytes: number): Record<string, unknown> {
  assertBoundedPayload(value, maximumBytes);
  const payload = recordValue(value);
  const tools = arrayValue(payload?.['tools']);
  const contract = tools.length === 1 ? recordValue(tools[0]) : undefined;
  if (!contract) throw safeConnectionError('pref_mapping_invalid');
  return contract;
}

function mappingMatchesContract(
  mapping: PrefCapabilityMapping,
  contract: Record<string, unknown>,
): boolean {
  if (
    contract['tool_ref'] !== mapping.toolRef ||
    contract['server_name'] !== mapping.providerServer
  ) {
    return false;
  }
  const inputSchema = recordValue(contract['input_schema']);
  const properties = recordValue(inputSchema?.['properties']);
  const required = arrayValue(inputSchema?.['required']).filter(
    (value): value is string => typeof value === 'string',
  );
  if (!inputSchema || !properties || inputSchema['additionalProperties'] !== false) return false;
  for (const [argumentName, expectedType] of Object.entries(mapping.expectedInput)) {
    const property = recordValue(properties[argumentName]);
    if (!property || property['type'] !== expectedType || !required.includes(argumentName)) {
      return false;
    }
  }
  const annotations = recordValue(contract['annotations']);
  if (!annotations) return false;
  for (const [annotation, expected] of Object.entries(mapping.requiredAnnotations)) {
    if (annotations[annotation] !== expected) return false;
  }
  const securityHints = recordValue(contract['security_hints']);
  return (
    securityHints?.['side_effect'] === undefined || securityHints['side_effect'] === 'read_only'
  );
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function safeOptionalText(value: unknown, maximumLength: number): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? safeText(value, maximumLength)
    : undefined;
}

function safeText(value: string, maximumLength: number): string {
  const normalized = [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 0x20 || codePoint === 0x7f ? ' ' : character;
    })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maximumLength);
  if (normalized.length === 0) throw safeConnectionError('pref_discovery_failed');
  return normalized;
}

function byName<T extends { name: string }>(left: T, right: T): number {
  return left.name.localeCompare(right.name);
}
