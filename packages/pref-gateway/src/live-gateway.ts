import { z } from 'zod';

import { SourceRecordSchema, type SourceRecord } from '@signal-atlas/contracts';

import {
  projectPrefCapabilityInput,
  type PrefCapabilityMap,
  type PrefCapabilityMapping,
} from './capability-map.js';
import { prefHash } from './hash.js';
import { normalizePrefRawResult } from './normalize.js';
import {
  PrefCallContextSchema,
  PrefCanonicalCapabilitySchema,
  PrefArticleMatchEvidenceSchema,
  PrefEconomicSeriesReadRequestSchema,
  PrefEconomicSeriesEvidenceSchema,
  PrefEconomicSeriesSearchRequestSchema,
  PrefEconomicSeriesSearchEvidenceSchema,
  PrefGatewayConfigSchema,
  PrefLocalConditionsEvidenceSchema,
  PrefLocalConditionsRequestSchema,
  PrefMarketSearchRequestSchema,
  PrefMarketSummaryEvidenceSchema,
  PrefReadRequestSchema,
  PrefResolutionHistoryEvidenceSchema,
  PrefResolutionHistoryRequestSchema,
  PrefSearchRequestSchema,
  PrefGatewayError,
  PrefMcpConnectionError,
  type PrefAuditEvent,
  type PrefAuditSink,
  type PrefCallContext,
  type PrefCanonicalCapability,
  type PrefCanonicalEvidence,
  type PrefCapabilityDescriptor,
  type PrefCapabilityResult,
  type PrefGateway,
  type PrefGatewayConfig,
  type PrefGatewayDiagnostics,
  type PrefGatewayErrorCode,
  type PrefGatewayHealth,
  type PrefLocalConditionsEvidence,
  type PrefMarketSearchRequest,
  type PrefMcpCallResult,
  type PrefMcpConnection,
  type PrefReadRequest,
  type PrefSearchRequest,
} from './types.js';

const WeatherPayloadSchema = z.strictObject({
  location: z.strictObject({
    name: z.string().trim().min(1).max(500),
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
  }),
  temperature_c: z.number().finite().nullable(),
  temperature_f: z.number().finite().nullable(),
  humidity_percent: z.number().finite().nullable(),
  wind_speed_kmh: z.number().finite().nullable(),
  wind_direction_degrees: z.number().finite().nullable(),
  weather_code: z.number().finite().nullable(),
  weather_description: z.string().trim().min(1).max(256),
  weather_category: z.string().trim().min(1).max(128),
  pressure_hpa: z.number().finite().nullable(),
  timestamp: z.string().trim().min(1).max(64).nullable(),
  retrieved_at: z.number().int().nonnegative(),
});

type WeatherPayload = z.infer<typeof WeatherPayloadSchema>;

const ArticleSearchPayloadSchema = z.strictObject({
  articles: z
    .array(
      z.strictObject({
        url: z.url().max(4_096),
        title: z.string().trim().min(1).max(1_000),
        seendate: z
          .string()
          .max(32)
          .refine((value) => value === '' || /^\d{8}T\d{6}Z$/u.test(value)),
        socialimage: z.string().max(4_096),
        domain: z.string().trim().min(1).max(500),
        language: z.string().trim().min(1).max(128),
        isquote: z.enum(['Not quoted', 'Quoted']).nullable(),
        sentence: z.string().trim().min(1).max(20_000),
        context: z.string().max(40_000),
      }),
    )
    .max(200),
  query: z.string().trim().min(1).max(1_000),
  requested_max: z.number().finite().positive().optional(),
  total_returned: z.number().int().nonnegative(),
  note: z.string().max(2_000).optional(),
});

const MarketSearchPayloadSchema = z
  .object({
    query: z.string().trim().min(1).max(1_000),
    data: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(500),
            slug: z.string().trim().min(1).max(500),
            question: z.string().trim().min(1).max(1_000).optional(),
            outcomes: z.array(z.string().trim().min(1).max(256)).max(20).optional(),
            active: z.boolean().optional(),
            closed: z.boolean().optional(),
          })
          .strip(),
      )
      .max(100),
    pagination: z
      .object({
        limit: z.number().int().nonnegative(),
        offset: z.number().int().nonnegative(),
        returned: z.number().int().nonnegative(),
        has_more: z.boolean(),
      })
      .strip(),
  })
  .strip();

const ResolutionHistoryPayloadSchema = z.strictObject({
  matches: z
    .array(
      z.strictObject({
        market_id: z.string().trim().min(1).max(500),
        question: z.string().trim().min(1).max(1_000),
        tags: z.array(z.string().trim().min(1).max(100)).max(50),
        resolution: z.enum(['YES', 'NO']),
        resolution_date: z.string().trim().min(1).max(64),
        reference_class: z.string().trim().min(1).max(256),
      }),
    )
    .max(500),
  statistics: z.strictObject({
    total: z.number().int().nonnegative(),
    yes_count: z.number().int().nonnegative(),
    no_count: z.number().int().nonnegative(),
    base_rate: z.number().min(0).max(1).nullable(),
    sample_size_confidence: z.enum(['low', 'medium', 'high']),
  }),
});

const EconomicSeriesSearchPayloadSchema = z.strictObject({
  search_text: z.string().trim().min(1).max(1_000),
  count: z.number().int().nonnegative(),
  series: z
    .array(
      z.strictObject({
        id: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[A-Za-z0-9._-]+$/u),
        title: z.string().trim().min(1).max(1_000),
        observation_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
        observation_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
        frequency_short: z.string().trim().min(1).max(256),
        units_short: z.string().trim().min(1).max(256),
      }),
    )
    .max(1_000),
});

const EconomicSeriesReadPayloadSchema = z.strictObject({
  scope: z.literal('full'),
  series_id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/u),
  title: z.string().trim().min(1).max(1_000),
  units: z.string().trim().min(1).max(256),
  frequency: z.string().trim().min(1).max(256),
  observation_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  observation_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  count: z.number().int().nonnegative(),
  observations: z
    .array(
      z.strictObject({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
        value: z.string().trim().min(1).max(100),
      }),
    )
    .max(500),
  date: z.string().nullable().optional(),
  value: z.string().nullable().optional(),
});

type LiveCanonicalInput =
  | ReturnType<typeof PrefLocalConditionsRequestSchema.parse>
  | PrefSearchRequest
  | PrefReadRequest
  | ReturnType<typeof PrefMarketSearchRequestSchema.parse>
  | ReturnType<typeof PrefResolutionHistoryRequestSchema.parse>
  | ReturnType<typeof PrefEconomicSeriesSearchRequestSchema.parse>
  | ReturnType<typeof PrefEconomicSeriesReadRequestSchema.parse>;

interface LiveCacheEntry {
  storedAt: string;
  storedAtMs: number;
  sources: SourceRecord[];
  evidence: PrefCanonicalEvidence[];
  responseHash: string;
  responseBytes: number;
}

export interface LivePrefGatewayOptions {
  config: PrefGatewayConfig;
  capabilityMap: PrefCapabilityMap;
  connection: PrefMcpConnection;
  audit?: PrefAuditSink;
  now?: () => Date;
  freshCacheMs?: number;
}

const DEFAULT_FRESH_CACHE_MS = 5 * 60_000;

function safeError(code: PrefGatewayErrorCode): PrefGatewayError {
  switch (code) {
    case 'pref_invalid_request':
      return new PrefGatewayError(code, 'The Pref request did not match its canonical contract.');
    case 'pref_disconnected':
      return new PrefGatewayError(code, 'The Pref Gateway is disconnected.', true);
    case 'pref_capability_denied':
      return new PrefGatewayError(code, 'The requested Pref capability is not allow-listed.');
    case 'pref_call_budget_exceeded':
      return new PrefGatewayError(code, 'The mission Pref call budget has been exhausted.');
    case 'pref_deadline_exceeded':
      return new PrefGatewayError(code, 'The Pref call deadline has already elapsed.', true);
    case 'pref_timeout':
      return new PrefGatewayError(code, 'The Pref call exceeded its time limit.', true);
    case 'pref_canceled':
      return new PrefGatewayError(code, 'The Pref call was canceled.', true);
    case 'pref_response_too_large':
      return new PrefGatewayError(code, 'The Pref response exceeded the configured byte limit.');
    case 'pref_upstream_error':
      return new PrefGatewayError(code, 'The Pref provider could not return a safe result.', true);
    case 'pref_fixture_miss':
      return new PrefGatewayError(code, 'No recorded fixture matches this canonical Pref request.');
    case 'pref_invalid_response':
      return new PrefGatewayError(code, 'The Pref response could not be safely normalized.');
  }
}

function gatewayError(error: unknown): PrefGatewayError {
  if (error instanceof PrefGatewayError) return error;
  if (!(error instanceof PrefMcpConnectionError)) return safeError('pref_invalid_response');
  switch (error.code) {
    case 'pref_timeout':
      return safeError('pref_timeout');
    case 'pref_canceled':
      return safeError('pref_canceled');
    case 'pref_response_too_large':
      return safeError('pref_response_too_large');
    case 'pref_tool_denied':
    case 'pref_mapping_invalid':
    case 'pref_server_denied':
      return safeError('pref_capability_denied');
    case 'pref_auth_required':
    case 'pref_connection_failed':
    case 'pref_discovery_failed':
    case 'pref_disconnected':
    case 'pref_upstream_error':
      return safeError('pref_upstream_error');
  }
}

function contextWithoutSignal(context: PrefCallContext): unknown {
  return {
    expeditionId: context.expeditionId,
    correlationId: context.correlationId,
    deadlineAt: context.deadlineAt,
    ...(context.missionId ? { missionId: context.missionId } : {}),
    ...(context.agentId ? { agentId: context.agentId } : {}),
  };
}

function observedAt(value: string | null): string | null {
  if (value === null) return null;
  const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value);
  const normalized = explicitZone ? value : `${value}${value.length === 16 ? ':00' : ''}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw safeError('pref_invalid_response');
  return parsed.toISOString();
}

function providerRetrievedAt(unixSeconds: number): string {
  const parsed = new Date(unixSeconds * 1_000);
  if (Number.isNaN(parsed.getTime())) throw safeError('pref_invalid_response');
  return parsed.toISOString();
}

function parseWeatherPayload(result: PrefMcpCallResult): WeatherPayload {
  if (result.structuredContent) return WeatherPayloadSchema.parse(result.structuredContent);
  if (!result.text) throw safeError('pref_invalid_response');
  try {
    return WeatherPayloadSchema.parse(JSON.parse(result.text) as unknown);
  } catch {
    throw safeError('pref_invalid_response');
  }
}

function parseArticleSearchPayload(result: PrefMcpCallResult) {
  if (result.structuredContent) {
    return ArticleSearchPayloadSchema.parse(result.structuredContent);
  }
  if (!result.text) throw safeError('pref_invalid_response');
  try {
    return ArticleSearchPayloadSchema.parse(JSON.parse(result.text) as unknown);
  } catch {
    throw safeError('pref_invalid_response');
  }
}

function mappedPayload<T>(result: PrefMcpCallResult, schema: z.ZodType<T>): T {
  if (result.structuredContent) return schema.parse(result.structuredContent);
  if (!result.text) throw safeError('pref_invalid_response');
  try {
    return schema.parse(JSON.parse(result.text) as unknown);
  } catch {
    throw safeError('pref_invalid_response');
  }
}

function gdeltPublishedAt(value: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(value);
  if (!match) throw safeError('pref_invalid_response');
  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  if (Number.isNaN(parsed.getTime())) throw safeError('pref_invalid_response');
  return parsed.toISOString();
}

function providerDateTime(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00Z` : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw safeError('pref_invalid_response');
  return parsed.toISOString();
}

function economicValue(value: string): number | null {
  if (value === '.') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw safeError('pref_invalid_response');
  return parsed;
}

function safeTag(value: string): string {
  return value.slice(0, 100);
}

function validatedFreshCacheMs(value: number | undefined): number {
  const selected = value ?? DEFAULT_FRESH_CACHE_MS;
  if (!Number.isInteger(selected) || selected < 0 || selected > 24 * 60 * 60_000) {
    throw new Error('Live Pref fresh-cache duration must be an integer from zero to 24 hours.');
  }
  return selected;
}

/**
 * Live canonical Pref gateway for the approved read-only provider mappings.
 *
 * Provider payloads are validated as data, normalized into immutable source records, and retained
 * only in the bounded in-memory cache. The current weather mapping intentionally keeps source
 * rights metadata-only while still exposing a typed, transient observation to the agent proxy.
 */
export class LivePrefGateway implements PrefGateway {
  readonly #config: PrefGatewayConfig;
  readonly #map: PrefCapabilityMap;
  readonly #connection: PrefMcpConnection;
  readonly #audit: PrefAuditSink | undefined;
  readonly #now: () => Date;
  readonly #freshCacheMs: number;
  readonly #callsByBudgetKey = new Map<string, number>();
  readonly #cache = new Map<string, LiveCacheEntry>();
  #calls = 0;
  #completed = 0;
  #failed = 0;
  #cacheHits = 0;
  #staleFallbacks = 0;
  #lastCallAt: string | undefined;
  #lastError: PrefGatewayDiagnostics['lastError'];

  constructor(options: LivePrefGatewayOptions) {
    this.#config = PrefGatewayConfigSchema.parse(options.config);
    if (this.#config.transport !== 'streamable_http') {
      throw new Error('LivePrefGateway requires the streamable_http transport.');
    }
    this.#map = structuredClone(options.capabilityMap);
    this.#connection = options.connection;
    this.#audit = options.audit;
    this.#now = options.now ?? (() => new Date());
    this.#freshCacheMs = validatedFreshCacheMs(options.freshCacheMs);
  }

  async connect(): Promise<void> {
    if (!this.#connection.diagnostics().connected) await this.#connection.connect();
  }

  async disconnect(): Promise<void> {
    await this.#connection.disconnect();
  }

  async health(): Promise<PrefGatewayHealth> {
    const diagnostics = this.#connection.diagnostics();
    return {
      connected: diagnostics.connected,
      checkedAt: this.#timestamp(),
      message: diagnostics.connected
        ? 'Live Pref Gateway is connected.'
        : 'Live Pref Gateway is disconnected.',
    };
  }

  async discoverCapabilities(): Promise<PrefCapabilityDescriptor[]> {
    await this.connect();
    const statuses = this.#connection.diagnostics().mappings;
    const selected = this.#map.mappings
      .filter(
        (mapping) =>
          mapping.enabled &&
          this.#config.allowCapabilities.includes(mapping.canonicalName) &&
          statuses.some(
            (status) => status.toolRef === mapping.toolRef && status.status === 'valid',
          ),
      )
      .sort(
        (left, right) =>
          right.priority - left.priority || left.mappingId.localeCompare(right.mappingId),
      )
      .filter(
        (mapping, index, mappings) =>
          mappings.findIndex((candidate) => candidate.canonicalName === mapping.canonicalName) ===
          index,
      );
    return selected.map((mapping) => ({
      canonicalName: mapping.canonicalName,
      primitive: 'tool' as const,
      primitiveName: mapping.toolRef,
      readOnly: true as const,
      locationAware: mapping.canonicalName === 'local_conditions',
      temporal:
        mapping.canonicalName === 'local_conditions' ||
        mapping.canonicalName === 'search_sources' ||
        mapping.canonicalName === 'read_economic_series',
    }));
  }

  search(request: PrefSearchRequest, context: PrefCallContext): Promise<PrefCapabilityResult> {
    return this.invokeCanonicalCapability('search_sources', request, context);
  }

  read(request: PrefReadRequest, context: PrefCallContext): Promise<PrefCapabilityResult> {
    return this.invokeCanonicalCapability('read_source', request, context);
  }

  async invokeCanonicalCapability(
    capabilityValue: string,
    inputValue: unknown,
    contextValue: PrefCallContext,
  ): Promise<PrefCapabilityResult> {
    const parsedCapability = PrefCanonicalCapabilitySchema.safeParse(capabilityValue);
    if (!parsedCapability.success) throw safeError('pref_capability_denied');
    let capability: PrefCanonicalCapability;
    let context: ReturnType<typeof PrefCallContextSchema.parse>;
    let input: LiveCanonicalInput;
    try {
      capability = parsedCapability.data;
      context = PrefCallContextSchema.parse(contextWithoutSignal(contextValue));
      input = this.#parseInput(capability, inputValue);
      if (capability === 'local_conditions' && 'at' in input && input.at) {
        throw safeError('pref_invalid_request');
      }
    } catch (error: unknown) {
      if (error instanceof PrefGatewayError) throw error;
      throw safeError('pref_invalid_request');
    }

    const argumentsHash = prefHash({ capability, input });
    const cacheKey = argumentsHash;
    const budgetKey = `${context.expeditionId}:${context.missionId ?? context.correlationId}`;
    const callNumber = (this.#callsByBudgetKey.get(budgetKey) ?? 0) + 1;
    const attemptNumber = this.#calls + 1;
    const callId = `pref-${prefHash({
      serverName: this.#config.serverName,
      correlationId: context.correlationId,
      capability,
      argumentsHash,
      attemptNumber,
    }).slice(0, 24)}`;
    const startedAt = this.#now();
    const auditBase = {
      callId,
      occurredAt: startedAt.toISOString(),
      expeditionId: context.expeditionId,
      correlationId: context.correlationId,
      ...(context.missionId ? { missionId: context.missionId } : {}),
      ...(context.agentId ? { agentId: context.agentId } : {}),
    };
    this.#calls += 1;
    this.#lastCallAt = auditBase.occurredAt;
    this.#emit({
      ...auditBase,
      type: 'pref.call.started',
      capability,
      argumentsHash,
    });

    try {
      if (!this.#config.allowCapabilities.includes(capability)) {
        throw safeError('pref_capability_denied');
      }
      this.#callsByBudgetKey.set(budgetKey, callNumber);
      if (callNumber > this.#config.maxCallsPerMission) {
        throw safeError('pref_call_budget_exceeded');
      }
      const remainingMs = new Date(context.deadlineAt).getTime() - startedAt.getTime();
      if (remainingMs <= 0) throw safeError('pref_deadline_exceeded');

      const cached = this.#cache.get(cacheKey);
      if (cached && startedAt.getTime() - cached.storedAtMs <= this.#freshCacheMs) {
        this.#cacheHits += 1;
        return this.#cachedResult(
          cached,
          capability,
          callId,
          argumentsHash,
          startedAt,
          auditBase,
          'fresh',
        );
      }

      try {
        await this.connect();
        const mapping = this.#mapping(capability);
        const callResult = await this.#connection.callProviderTool(
          mapping.toolRef,
          projectPrefCapabilityInput(mapping, input),
          {
            timeoutMs: Math.min(remainingMs, this.#config.timeoutMs),
            ...(contextValue.signal ? { signal: contextValue.signal } : {}),
          },
        );
        if (callResult.responseBytes > this.#config.maxResponseBytes) {
          throw safeError('pref_response_too_large');
        }
        const responseHash = prefHash({
          structuredContent: callResult.structuredContent ?? null,
          text: callResult.text ?? null,
        });
        const retrievedAt = this.#timestamp();
        const normalized = this.#normalizeMappedResult(
          callResult,
          mapping,
          input,
          callId,
          argumentsHash,
          responseHash,
          retrievedAt,
          cached,
        );
        const entry: LiveCacheEntry = {
          storedAt: retrievedAt,
          storedAtMs: this.#now().getTime(),
          sources: structuredClone(normalized.sources),
          evidence: structuredClone(normalized.evidence),
          responseHash,
          responseBytes: callResult.responseBytes,
        };
        this.#cache.set(cacheKey, entry);
        const durationMs = this.#duration(startedAt);
        this.#completed += 1;
        this.#lastError = undefined;
        this.#emitCompleted(auditBase, entry, durationMs);
        return {
          callId,
          capability,
          sources: structuredClone(entry.sources),
          evidence: structuredClone(entry.evidence),
          argumentsHash,
          responseHash,
          retrievedAt,
          durationMs,
          responseBytes: callResult.responseBytes,
          fromCache: false,
          cache: { status: 'miss', storedAt: entry.storedAt },
        };
      } catch (error: unknown) {
        const normalized = gatewayError(error);
        if (cached && normalized.retryable && normalized.code !== 'pref_canceled') {
          this.#staleFallbacks += 1;
          this.#lastError = { code: normalized.code, message: normalized.message };
          return this.#cachedResult(
            cached,
            capability,
            callId,
            argumentsHash,
            startedAt,
            auditBase,
            'stale',
          );
        }
        throw normalized;
      }
    } catch (error: unknown) {
      const normalized = gatewayError(error);
      const durationMs = this.#duration(startedAt);
      this.#failed += 1;
      this.#lastError = { code: normalized.code, message: normalized.message };
      this.#emit({
        ...auditBase,
        type: 'pref.call.failed',
        occurredAt: this.#timestamp(),
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
        durationMs,
      });
      throw normalized;
    }
  }

  diagnostics(): PrefGatewayDiagnostics {
    return {
      serverName: this.#config.serverName,
      transport: this.#config.transport,
      connected: this.#connection.diagnostics().connected,
      readOnly: true,
      allowCapabilities: [...this.#config.allowCapabilities].sort(),
      limits: {
        timeoutMs: this.#config.timeoutMs,
        maxResponseBytes: this.#config.maxResponseBytes,
        maxCallsPerMission: this.#config.maxCallsPerMission,
      },
      calls: this.#calls,
      completed: this.#completed,
      failed: this.#failed,
      cache: {
        entries: this.#cache.size,
        hits: this.#cacheHits,
        staleFallbacks: this.#staleFallbacks,
      },
      ...(this.#lastCallAt ? { lastCallAt: this.#lastCallAt } : {}),
      ...(this.#lastError ? { lastError: structuredClone(this.#lastError) } : {}),
    };
  }

  #mapping(capability: PrefCanonicalCapability): PrefCapabilityMapping {
    const statuses = this.#connection.diagnostics().mappings;
    const mapping = this.#map.mappings
      .filter((candidate) => candidate.enabled && candidate.canonicalName === capability)
      .sort(
        (left, right) =>
          right.priority - left.priority || left.mappingId.localeCompare(right.mappingId),
      )
      .find((candidate) =>
        statuses.some(
          (status) => status.toolRef === candidate.toolRef && status.status === 'valid',
        ),
      );
    if (!mapping) throw safeError('pref_capability_denied');
    return mapping;
  }

  #parseInput(capability: PrefCanonicalCapability, input: unknown): LiveCanonicalInput {
    switch (capability) {
      case 'search_sources':
        return PrefSearchRequestSchema.parse(input);
      case 'read_source':
        return PrefReadRequestSchema.parse(input);
      case 'local_conditions':
        return PrefLocalConditionsRequestSchema.parse(input);
      case 'search_markets':
        return PrefMarketSearchRequestSchema.parse(input);
      case 'search_resolution_history':
        return PrefResolutionHistoryRequestSchema.parse(input);
      case 'search_economic_series':
        return PrefEconomicSeriesSearchRequestSchema.parse(input);
      case 'read_economic_series':
        return PrefEconomicSeriesReadRequestSchema.parse(input);
    }
  }

  #normalizeMappedResult(
    result: PrefMcpCallResult,
    mapping: PrefCapabilityMapping,
    input: LiveCanonicalInput,
    callId: string,
    argumentsHash: string,
    responseHash: string,
    retrievedAt: string,
    previous: LiveCacheEntry | undefined,
  ): { sources: SourceRecord[]; evidence: PrefCanonicalEvidence[] } {
    switch (mapping.responseAdapter) {
      case 'local_conditions_v1': {
        const normalized = this.#normalizeWeather(
          parseWeatherPayload(result),
          mapping,
          callId,
          argumentsHash,
          responseHash,
          retrievedAt,
          previous,
        );
        return { sources: [normalized.source], evidence: [normalized.evidence] };
      }
      case 'article_search_v1':
        if (mapping.canonicalName !== 'search_sources' || !('query' in input)) {
          throw safeError('pref_invalid_response');
        }
        return this.#normalizeArticleSearch(
          parseArticleSearchPayload(result),
          mapping,
          PrefSearchRequestSchema.parse(input),
          callId,
          argumentsHash,
          responseHash,
          retrievedAt,
        );
      case 'market_search_v1':
        return this.#normalizeMarketSearch(
          mappedPayload(result, MarketSearchPayloadSchema),
          mapping,
          PrefMarketSearchRequestSchema.parse(input),
          callId,
          argumentsHash,
          responseHash,
          retrievedAt,
        );
      case 'resolution_history_v1':
        return this.#normalizeResolutionHistory(
          mappedPayload(result, ResolutionHistoryPayloadSchema),
          mapping,
          PrefResolutionHistoryRequestSchema.parse(input),
          callId,
          argumentsHash,
          responseHash,
          retrievedAt,
        );
      case 'economic_series_search_v1':
        return this.#normalizeEconomicSeriesSearch(
          mappedPayload(result, EconomicSeriesSearchPayloadSchema),
          mapping,
          PrefEconomicSeriesSearchRequestSchema.parse(input),
          callId,
          argumentsHash,
          responseHash,
          retrievedAt,
        );
      case 'economic_series_read_v1':
        return this.#normalizeEconomicSeriesRead(
          mappedPayload(result, EconomicSeriesReadPayloadSchema),
          mapping,
          PrefEconomicSeriesReadRequestSchema.parse(input),
          callId,
          argumentsHash,
          responseHash,
          retrievedAt,
          previous,
        );
    }
  }

  #normalizeArticleSearch(
    payload: z.infer<typeof ArticleSearchPayloadSchema>,
    mapping: PrefCapabilityMapping,
    input: PrefSearchRequest,
    callId: string,
    argumentsHash: string,
    responseHash: string,
    retrievedAt: string,
  ): { sources: SourceRecord[]; evidence: PrefCanonicalEvidence[] } {
    const limit = Math.min(input.limit ?? 20, 50);
    const entries = payload.articles.slice(0, limit).map((article) => {
      const publishedAt = gdeltPublishedAt(article.seendate);
      const source = normalizePrefRawResult(
        {
          primitive: 'tool',
          primitiveName: mapping.toolRef,
          externalId: article.url,
          uri: article.url,
          title: article.title,
          publisher: article.domain,
          sourceClass: 'secondary',
          ...(publishedAt ? { publishedAt } : {}),
          mediaType: 'text/html',
          payload: article,
          rights: {
            display: 'metadata_only',
            notes:
              'The provider did not grant article-content display rights; matched context is hashed but not persisted in the source record.',
          },
          tags: ['article-search', 'gdelt', 'live', article.language.toLowerCase()],
        },
        { config: this.#config, callId, argumentsHash, responseHash, retrievedAt },
      );
      const evidence = PrefArticleMatchEvidenceSchema.parse({
        kind: 'article_match',
        sourceId: source.id,
        matchedSentence: article.sentence.slice(0, 1_000),
        publishedAt: publishedAt ?? null,
      });
      return { source, evidence };
    });
    return {
      sources: entries.map(({ source }) => source),
      evidence: entries.map(({ evidence }) => evidence),
    };
  }

  #normalizeMarketSearch(
    payload: z.infer<typeof MarketSearchPayloadSchema>,
    mapping: PrefCapabilityMapping,
    input: PrefMarketSearchRequest,
    callId: string,
    argumentsHash: string,
    responseHash: string,
    retrievedAt: string,
  ): { sources: SourceRecord[]; evidence: PrefCanonicalEvidence[] } {
    const limit = input.limit ?? 10;
    if (payload.data.length > limit) throw safeError('pref_invalid_response');
    const entries = payload.data.map((market) => {
      const source = normalizePrefRawResult(
        {
          primitive: 'tool',
          primitiveName: mapping.toolRef,
          externalId: market.id,
          uri: `https://polymarket.com/event/${encodeURIComponent(market.slug)}`,
          title: market.question ?? `Prediction market ${market.slug}`,
          publisher: 'Polymarket via Preference',
          sourceClass: 'market',
          mediaType: 'application/json',
          payload: market,
          rights: {
            display: 'metadata_only',
            notes:
              'Market discovery is retained as read-only context and cannot mutate the scenario forecast.',
          },
          tags: ['live', 'market-discovery', 'prediction-market'],
        },
        { config: this.#config, callId, argumentsHash, responseHash, retrievedAt },
      );
      const evidence = PrefMarketSummaryEvidenceSchema.parse({
        kind: 'market_summary',
        sourceId: source.id,
        provider: 'Polymarket via Preference',
        marketId: market.id,
        slug: market.slug,
        question: market.question ?? null,
        outcomes: market.outcomes ?? [],
        active: market.active ?? null,
        closed: market.closed ?? null,
      });
      return { source, evidence };
    });
    return {
      sources: entries.map(({ source }) => source),
      evidence: entries.map(({ evidence }) => evidence),
    };
  }

  #normalizeResolutionHistory(
    payload: z.infer<typeof ResolutionHistoryPayloadSchema>,
    mapping: PrefCapabilityMapping,
    input: ReturnType<typeof PrefResolutionHistoryRequestSchema.parse>,
    callId: string,
    argumentsHash: string,
    responseHash: string,
    retrievedAt: string,
  ): { sources: SourceRecord[]; evidence: PrefCanonicalEvidence[] } {
    if (
      payload.statistics.yes_count + payload.statistics.no_count !== payload.statistics.total ||
      payload.statistics.total < payload.matches.length
    ) {
      throw safeError('pref_invalid_response');
    }
    const sources = payload.matches.slice(0, input.limit ?? 20).map((match) =>
      normalizePrefRawResult(
        {
          primitive: 'tool',
          primitiveName: mapping.toolRef,
          externalId: match.market_id,
          title: match.question,
          publisher: 'Preference Resolution Tracker',
          sourceClass: 'archive',
          publishedAt: providerDateTime(match.resolution_date),
          mediaType: 'application/json',
          payload: match,
          rights: {
            display: 'metadata_only',
            notes: 'Historical resolution metadata is retained without provider-internal payloads.',
          },
          tags: [
            'historical-resolution',
            `resolved-${match.resolution.toLowerCase()}`,
            safeTag(match.reference_class),
            ...match.tags.slice(0, 47).map(safeTag),
          ],
        },
        { config: this.#config, callId, argumentsHash, responseHash, retrievedAt },
      ),
    );
    const evidence = PrefResolutionHistoryEvidenceSchema.parse({
      kind: 'resolution_history',
      sourceIds: sources.map((source) => source.id),
      referenceClass: input.referenceClass,
      total: payload.statistics.total,
      yesCount: payload.statistics.yes_count,
      noCount: payload.statistics.no_count,
      baseRate: payload.statistics.base_rate,
      sampleSizeConfidence: payload.statistics.sample_size_confidence,
    });
    return { sources, evidence: [evidence] };
  }

  #normalizeEconomicSeriesSearch(
    payload: z.infer<typeof EconomicSeriesSearchPayloadSchema>,
    mapping: PrefCapabilityMapping,
    input: ReturnType<typeof PrefEconomicSeriesSearchRequestSchema.parse>,
    callId: string,
    argumentsHash: string,
    responseHash: string,
    retrievedAt: string,
  ): { sources: SourceRecord[]; evidence: PrefCanonicalEvidence[] } {
    if (payload.series.length > input.limit) throw safeError('pref_invalid_response');
    const entries = payload.series.map((series) => {
      const source = normalizePrefRawResult(
        {
          primitive: 'tool',
          primitiveName: mapping.toolRef,
          externalId: series.id,
          uri: `https://fred.stlouisfed.org/series/${encodeURIComponent(series.id)}`,
          title: series.title,
          publisher: 'Federal Reserve Bank of St. Louis',
          sourceClass: 'official_primary',
          mediaType: 'application/json',
          payload: series,
          rights: {
            display: 'metadata_only',
            notes: 'Economic-series discovery retains identifiers and descriptive metadata only.',
          },
          tags: ['economic-series', 'fred', 'official-data'],
        },
        { config: this.#config, callId, argumentsHash, responseHash, retrievedAt },
      );
      const evidence = PrefEconomicSeriesSearchEvidenceSchema.parse({
        kind: 'economic_series_search',
        sourceId: source.id,
        seriesId: series.id,
        title: series.title,
        frequency: series.frequency_short,
        units: series.units_short,
        observationStart: series.observation_start,
        observationEnd: series.observation_end,
      });
      return { source, evidence };
    });
    return {
      sources: entries.map(({ source }) => source),
      evidence: entries.map(({ evidence }) => evidence),
    };
  }

  #normalizeEconomicSeriesRead(
    payload: z.infer<typeof EconomicSeriesReadPayloadSchema>,
    mapping: PrefCapabilityMapping,
    input: ReturnType<typeof PrefEconomicSeriesReadRequestSchema.parse>,
    callId: string,
    argumentsHash: string,
    responseHash: string,
    retrievedAt: string,
    previous: LiveCacheEntry | undefined,
  ): { sources: SourceRecord[]; evidence: PrefCanonicalEvidence[] } {
    if (payload.series_id !== input.seriesId || payload.observations.length > input.limit) {
      throw safeError('pref_invalid_response');
    }
    const observations = payload.observations.map((observation) => ({
      observedAt: providerDateTime(observation.date),
      value: economicValue(observation.value),
    }));
    const latestObservedAt = observations
      .map(({ observedAt }) => observedAt)
      .sort((left, right) => right.localeCompare(left))[0];
    let source = normalizePrefRawResult(
      {
        primitive: 'tool',
        primitiveName: mapping.toolRef,
        externalId: payload.series_id,
        uri: `https://fred.stlouisfed.org/series/${encodeURIComponent(payload.series_id)}`,
        title: payload.title,
        publisher: 'Federal Reserve Bank of St. Louis',
        sourceClass: 'official_primary',
        ...(latestObservedAt ? { observedAt: latestObservedAt } : {}),
        mediaType: 'application/json',
        payload,
        rights: {
          display: 'metadata_only',
          notes: 'Values remain bounded transient evidence linked to this source snapshot.',
        },
        tags: ['economic-series', 'fred', 'official-data', 'series-observations'],
      },
      { config: this.#config, callId, argumentsHash, responseHash, retrievedAt },
    );
    const previousSource = previous?.sources[0];
    if (previousSource && previousSource.contentHash !== source.contentHash) {
      source = SourceRecordSchema.parse({
        ...source,
        version: previousSource.version + 1,
        supersedesSourceId: previousSource.id,
      });
    }
    const evidence = PrefEconomicSeriesEvidenceSchema.parse({
      kind: 'economic_series',
      sourceId: source.id,
      seriesId: payload.series_id,
      title: payload.title,
      frequency: payload.frequency,
      units: payload.units,
      observationStart: payload.observation_start,
      observationEnd: payload.observation_end,
      observations,
    });
    return { sources: [source], evidence: [evidence] };
  }

  #normalizeWeather(
    payload: WeatherPayload,
    mapping: PrefCapabilityMapping,
    callId: string,
    argumentsHash: string,
    responseHash: string,
    retrievedAt: string,
    previous: LiveCacheEntry | undefined,
  ): { source: SourceRecord; evidence: PrefLocalConditionsEvidence } {
    const observationTime = observedAt(payload.timestamp);
    const providerRetrievalTime = providerRetrievedAt(payload.retrieved_at);
    const location = {
      label: payload.location.name,
      latitude: payload.location.lat,
      longitude: payload.location.lon,
    };
    const canonicalPayload = {
      location,
      observedAt: observationTime,
      temperatureC: payload.temperature_c,
      humidityPercent: payload.humidity_percent,
      windSpeedKmh: payload.wind_speed_kmh,
      windDirectionDegrees: payload.wind_direction_degrees,
      weatherCode: payload.weather_code,
      weatherDescription: payload.weather_description,
      weatherCategory: payload.weather_category,
      pressureHpa: payload.pressure_hpa,
    };
    const externalId = `${payload.location.lat.toFixed(5)},${payload.location.lon.toFixed(5)}:${
      observationTime ?? providerRetrievalTime
    }`;
    const baseRaw = {
      primitive: 'tool' as const,
      primitiveName: mapping.toolRef,
      externalId,
      title: `${payload.location.name} live proxy conditions — ${payload.weather_description}`,
      publisher: 'Open-Meteo via Preference weather_toolkit',
      sourceClass: 'sensor' as const,
      observedAt: observationTime,
      location,
      mediaType: 'application/json',
      structuredData: canonicalPayload,
      payload: canonicalPayload,
      rights: {
        display: 'metadata_only' as const,
        notes:
          'Provider display rights were not asserted by Pref; the raw weather payload is not retained.',
      },
      tags: ['context-only', 'live', 'real-world-proxy', 'weather'],
    };
    let source = normalizePrefRawResult(baseRaw, {
      config: this.#config,
      callId,
      argumentsHash,
      responseHash,
      retrievedAt,
    });
    const previousSource = previous?.sources[0];
    if (previousSource && previousSource.contentHash !== source.contentHash) {
      source = normalizePrefRawResult(
        {
          ...baseRaw,
          version: previousSource.version + 1,
          supersedesSourceId: previousSource.id,
        },
        { config: this.#config, callId, argumentsHash, responseHash, retrievedAt },
      );
    } else if (previousSource) {
      source = { ...source, version: previousSource.version };
    }
    const evidence = PrefLocalConditionsEvidenceSchema.parse({
      kind: 'local_conditions',
      sourceId: source.id,
      provider: 'Open-Meteo via Preference weather_toolkit',
      location,
      observedAt: observationTime,
      providerRetrievedAt: providerRetrievalTime,
      temperatureC: payload.temperature_c,
      humidityPercent: payload.humidity_percent,
      windSpeedKmh: payload.wind_speed_kmh,
      windDirectionDegrees: payload.wind_direction_degrees,
      weatherCode: payload.weather_code,
      weatherDescription: payload.weather_description,
      weatherCategory: payload.weather_category,
      pressureHpa: payload.pressure_hpa,
    });
    return { source, evidence };
  }

  #cachedResult(
    cached: LiveCacheEntry,
    capability: PrefCanonicalCapability,
    callId: string,
    argumentsHash: string,
    startedAt: Date,
    auditBase: Omit<
      Extract<PrefAuditEvent, { type: 'pref.call.started' }>,
      'type' | 'capability' | 'argumentsHash'
    >,
    status: 'fresh' | 'stale',
  ): PrefCapabilityResult {
    const durationMs = this.#duration(startedAt);
    const retrievedAt = this.#timestamp();
    this.#completed += 1;
    if (status === 'fresh') this.#lastError = undefined;
    this.#emitCompleted(auditBase, cached, durationMs);
    return {
      callId,
      capability,
      sources: structuredClone(cached.sources),
      evidence: structuredClone(cached.evidence),
      argumentsHash,
      responseHash: cached.responseHash,
      retrievedAt,
      durationMs,
      responseBytes: cached.responseBytes,
      fromCache: true,
      cache: {
        status,
        storedAt: cached.storedAt,
        ...(status === 'stale'
          ? {
              warning:
                'The live provider was unavailable; this result reuses the last validated observation or source result.',
            }
          : {}),
      },
    };
  }

  #emitCompleted(
    auditBase: Omit<
      Extract<PrefAuditEvent, { type: 'pref.call.started' }>,
      'type' | 'capability' | 'argumentsHash'
    >,
    cached: LiveCacheEntry,
    durationMs: number,
  ): void {
    this.#emit({
      ...auditBase,
      type: 'pref.call.completed',
      occurredAt: this.#timestamp(),
      sourceIds: cached.sources.map((source) => source.id),
      responseHash: cached.responseHash,
      responseBytes: cached.responseBytes,
      durationMs,
    });
  }

  #emit(event: PrefAuditEvent): void {
    this.#audit?.(structuredClone(event));
  }

  #duration(startedAt: Date): number {
    return Math.max(0, this.#now().getTime() - startedAt.getTime());
  }

  #timestamp(): string {
    return this.#now().toISOString();
  }
}
