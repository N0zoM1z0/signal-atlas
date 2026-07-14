import { z } from 'zod';

import type { SourceRecord } from '@signal-atlas/contracts';

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
  PrefGatewayConfigSchema,
  PrefLocalConditionsEvidenceSchema,
  PrefLocalConditionsRequestSchema,
  PrefGatewayError,
  PrefMcpConnectionError,
  type PrefAuditEvent,
  type PrefAuditSink,
  type PrefCallContext,
  type PrefCanonicalCapability,
  type PrefCapabilityDescriptor,
  type PrefCapabilityResult,
  type PrefGateway,
  type PrefGatewayConfig,
  type PrefGatewayDiagnostics,
  type PrefGatewayErrorCode,
  type PrefGatewayHealth,
  type PrefLocalConditionsEvidence,
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

interface LiveCacheEntry {
  storedAt: string;
  storedAtMs: number;
  source: SourceRecord;
  evidence: PrefLocalConditionsEvidence;
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
    return this.#map.mappings
      .filter(
        (mapping) =>
          mapping.enabled &&
          this.#config.allowCapabilities.includes(mapping.canonicalName) &&
          statuses.some(
            (status) => status.toolRef === mapping.toolRef && status.status === 'valid',
          ),
      )
      .map((mapping) => ({
        canonicalName: mapping.canonicalName,
        primitive: 'tool' as const,
        primitiveName: mapping.toolRef,
        readOnly: true as const,
        locationAware: mapping.canonicalName === 'local_conditions',
        temporal: mapping.canonicalName === 'local_conditions',
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
    let input: ReturnType<typeof PrefLocalConditionsRequestSchema.parse>;
    try {
      capability = parsedCapability.data;
      if (capability !== 'local_conditions') throw safeError('pref_capability_denied');
      context = PrefCallContextSchema.parse(contextWithoutSignal(contextValue));
      input = PrefLocalConditionsRequestSchema.parse(inputValue);
      if (input.at) throw safeError('pref_invalid_request');
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
        const payload = parseWeatherPayload(callResult);
        const responseHash = prefHash({
          structuredContent: callResult.structuredContent ?? null,
          text: callResult.text ?? null,
        });
        const retrievedAt = this.#timestamp();
        const normalized = this.#normalizeWeather(
          payload,
          mapping,
          callId,
          argumentsHash,
          responseHash,
          retrievedAt,
          cached,
        );
        const entry: LiveCacheEntry = {
          storedAt: retrievedAt,
          storedAtMs: this.#now().getTime(),
          source: structuredClone(normalized.source),
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
          sources: [structuredClone(entry.source)],
          evidence: [structuredClone(entry.evidence)],
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
    const mapping = this.#map.mappings.find(
      (candidate) => candidate.enabled && candidate.canonicalName === capability,
    );
    const status = this.#connection
      .diagnostics()
      .mappings.find((candidate) => candidate.toolRef === mapping?.toolRef);
    if (!mapping || status?.status !== 'valid') throw safeError('pref_capability_denied');
    return mapping;
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
    if (previous && previous.source.contentHash !== source.contentHash) {
      source = normalizePrefRawResult(
        {
          ...baseRaw,
          version: previous.source.version + 1,
          supersedesSourceId: previous.source.id,
        },
        { config: this.#config, callId, argumentsHash, responseHash, retrievedAt },
      );
    } else if (previous) {
      source = { ...source, version: previous.source.version };
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
      sources: [structuredClone(cached.source)],
      evidence: [structuredClone(cached.evidence)],
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
                'The live provider was unavailable; this result reuses the last validated observation.',
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
      sourceIds: [cached.source.id],
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
