import { z } from 'zod';

import {
  DateTimeSchema,
  EntityIdSchema,
  GeoSemanticLocationSchema,
  SourceRecordSchema,
  SourceRightsSchema,
  type SourceRecord,
} from '@signal-atlas/contracts';

export const PrefTransportSchema = z.enum(['stdio', 'streamable_http', 'fixture']);
export const PrefCanonicalCapabilitySchema = z.enum([
  'search_sources',
  'read_source',
  'local_conditions',
  'search_markets',
  'search_resolution_history',
  'search_economic_series',
  'read_economic_series',
]);

export const PrefGatewayConfigSchema = z.strictObject({
  serverName: EntityIdSchema,
  transport: PrefTransportSchema,
  readOnly: z.literal(true),
  allowCapabilities: z
    .array(PrefCanonicalCapabilitySchema)
    .min(1)
    .refine((values) => new Set(values).size === values.length, {
      message: 'Allowed Pref capabilities must be unique.',
    }),
  timeoutMs: z.number().int().positive().max(120_000),
  maxResponseBytes: z.number().int().positive().max(10_000_000),
  maxCallsPerMission: z.number().int().positive().max(100),
  cacheMode: z.enum(['disabled', 'metadata_only', 'full_when_permitted']),
});

export const PrefSearchRequestSchema = z
  .strictObject({
    query: z.string().trim().min(1).max(1_000),
    location: GeoSemanticLocationSchema.optional(),
    since: DateTimeSchema.optional(),
    until: DateTimeSchema.optional(),
    limit: z.number().int().positive().max(50).optional(),
    sourceClasses: z.array(SourceRecordSchema.shape.sourceClass).max(8).optional(),
  })
  .superRefine((request, context) => {
    if (
      request.since &&
      request.until &&
      new Date(request.since).getTime() > new Date(request.until).getTime()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['since'],
        message: 'Search since must not be later than until.',
      });
    }
  });

export const PrefReadRequestSchema = z
  .strictObject({
    externalId: z.string().trim().min(1).max(2_048).optional(),
    uri: z.string().trim().min(1).max(4_096).optional(),
  })
  .superRefine((request, context) => {
    if (!request.externalId && !request.uri) {
      context.addIssue({
        code: 'custom',
        message: 'A read_source request requires externalId or uri.',
      });
    }
  });

export const PrefLocalConditionsRequestSchema = z.strictObject({
  location: GeoSemanticLocationSchema,
  at: DateTimeSchema.optional(),
});

export const PrefMarketSearchRequestSchema = z.strictObject({
  query: z.string().trim().min(1).max(1_000),
  limit: z.number().int().positive().max(25).optional(),
});

export const PrefResolutionHistoryRequestSchema = z.strictObject({
  referenceClass: z.string().trim().min(1).max(256),
  outcome: z.enum(['YES', 'NO']).optional(),
  minSampleSize: z.number().int().positive().max(10_000).optional(),
  limit: z.number().int().positive().max(50).optional(),
});

export const PrefEconomicSeriesSearchRequestSchema = z.strictObject({
  query: z.string().trim().min(1).max(1_000),
  limit: z.number().int().positive().max(50).default(20),
});

export const PrefEconomicSeriesReadRequestSchema = z
  .strictObject({
    seriesId: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._-]+$/u),
    since: DateTimeSchema.optional(),
    until: DateTimeSchema.optional(),
    limit: z.number().int().positive().max(500).default(250),
  })
  .superRefine((request, context) => {
    if (
      request.since &&
      request.until &&
      new Date(request.since).getTime() > new Date(request.until).getTime()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['since'],
        message: 'Economic-series since must not be later than until.',
      });
    }
  });

export const PrefCallContextSchema = z.strictObject({
  expeditionId: EntityIdSchema,
  missionId: EntityIdSchema.optional(),
  agentId: EntityIdSchema.optional(),
  correlationId: EntityIdSchema,
  deadlineAt: DateTimeSchema,
});

export const PrefRawResultSchema = z.strictObject({
  primitive: z.enum(['tool', 'resource', 'prompt', 'fixture']),
  primitiveName: z
    .string()
    .min(1)
    .max(320)
    .refine(
      (value) =>
        [...value].every((character) => {
          const code = character.codePointAt(0) ?? 0;
          return code >= 0x20 && code !== 0x7f;
        }),
      'Primitive names must not contain control characters.',
    ),
  sourceId: EntityIdSchema.optional(),
  version: z.number().int().positive().optional(),
  externalId: z.string().min(1).max(2_048).optional(),
  uri: z.string().min(1).max(4_096).optional(),
  title: z.string().min(1).max(1_000).optional(),
  publisher: z.string().min(1).max(500).optional(),
  author: z.string().min(1).max(500).optional(),
  sourceClass: SourceRecordSchema.shape.sourceClass.optional(),
  publishedAt: DateTimeSchema.optional(),
  observedAt: DateTimeSchema.nullable().optional(),
  location: GeoSemanticLocationSchema.optional(),
  mediaType: z.string().min(1).max(255).optional(),
  excerpt: z.string().min(1).max(20_000).optional(),
  structuredData: z.unknown().optional(),
  payload: z.unknown(),
  rights: SourceRightsSchema.optional(),
  supersedesSourceId: EntityIdSchema.optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
});

export const FixturePrefResponseSchema = z.strictObject({
  capability: PrefCanonicalCapabilitySchema,
  input: z.unknown(),
  results: z.array(PrefRawResultSchema).max(50),
  latencyMs: z.number().int().nonnegative().max(120_000).optional(),
});

export type PrefTransport = z.infer<typeof PrefTransportSchema>;
export type PrefCanonicalCapability = z.infer<typeof PrefCanonicalCapabilitySchema>;
export type PrefGatewayConfig = z.infer<typeof PrefGatewayConfigSchema>;
export type PrefSearchRequest = z.infer<typeof PrefSearchRequestSchema>;
export type PrefReadRequest = z.infer<typeof PrefReadRequestSchema>;
export type PrefLocalConditionsRequest = z.infer<typeof PrefLocalConditionsRequestSchema>;
export type PrefMarketSearchRequest = z.infer<typeof PrefMarketSearchRequestSchema>;
export type PrefResolutionHistoryRequest = z.infer<typeof PrefResolutionHistoryRequestSchema>;
export type PrefEconomicSeriesSearchRequest = z.infer<typeof PrefEconomicSeriesSearchRequestSchema>;
export type PrefEconomicSeriesReadRequest = z.infer<typeof PrefEconomicSeriesReadRequestSchema>;
export type PrefRawResult = z.infer<typeof PrefRawResultSchema>;
export type FixturePrefResponse = z.infer<typeof FixturePrefResponseSchema>;
export type PrefCallContext = z.infer<typeof PrefCallContextSchema> & { signal?: AbortSignal };

export interface PrefCapabilityDescriptor {
  canonicalName: PrefCanonicalCapability;
  primitive: 'tool' | 'resource' | 'prompt' | 'fixture';
  primitiveName: string;
  description?: string;
  inputSchema?: unknown;
  readOnly: true;
  locationAware?: boolean;
  temporal?: boolean;
}

export interface PrefGatewayHealth {
  connected: boolean;
  checkedAt: string;
  message?: string;
}

export const PrefCacheStatusSchema = z.enum(['miss', 'fresh', 'stale']);

export const PrefLocalConditionsEvidenceSchema = z.strictObject({
  kind: z.literal('local_conditions'),
  sourceId: EntityIdSchema,
  provider: z.string().trim().min(1).max(256),
  location: GeoSemanticLocationSchema,
  observedAt: DateTimeSchema.nullable(),
  providerRetrievedAt: DateTimeSchema,
  temperatureC: z.number().finite().nullable(),
  humidityPercent: z.number().finite().nullable(),
  windSpeedKmh: z.number().finite().nullable(),
  windDirectionDegrees: z.number().finite().nullable(),
  weatherCode: z.number().finite().nullable(),
  weatherDescription: z.string().trim().min(1).max(256),
  weatherCategory: z.string().trim().min(1).max(128),
  pressureHpa: z.number().finite().nullable(),
});

export const PrefArticleMatchEvidenceSchema = z.strictObject({
  kind: z.literal('article_match'),
  sourceId: EntityIdSchema,
  matchedSentence: z.string().trim().min(1).max(1_000),
  publishedAt: DateTimeSchema.nullable(),
});

export const PrefMarketSummaryEvidenceSchema = z.strictObject({
  kind: z.literal('market_summary'),
  sourceId: EntityIdSchema,
  provider: z.string().trim().min(1).max(256),
  marketId: z.string().trim().min(1).max(500),
  slug: z.string().trim().min(1).max(500),
  question: z.string().trim().min(1).max(1_000).nullable(),
  outcomes: z.array(z.string().trim().min(1).max(256)).max(20),
  active: z.boolean().nullable(),
  closed: z.boolean().nullable(),
});

export const PrefResolutionHistoryEvidenceSchema = z.strictObject({
  kind: z.literal('resolution_history'),
  sourceIds: z.array(EntityIdSchema).max(50),
  referenceClass: z.string().trim().min(1).max(256),
  total: z.number().int().nonnegative(),
  yesCount: z.number().int().nonnegative(),
  noCount: z.number().int().nonnegative(),
  baseRate: z.number().min(0).max(1).nullable(),
  sampleSizeConfidence: z.enum(['low', 'medium', 'high']),
});

export const PrefEconomicSeriesSearchEvidenceSchema = z.strictObject({
  kind: z.literal('economic_series_search'),
  sourceId: EntityIdSchema,
  seriesId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(1_000),
  frequency: z.string().trim().min(1).max(256),
  units: z.string().trim().min(1).max(256),
  observationStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  observationEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
});

export const PrefEconomicSeriesEvidenceSchema = z.strictObject({
  kind: z.literal('economic_series'),
  sourceId: EntityIdSchema,
  seriesId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(1_000),
  frequency: z.string().trim().min(1).max(256),
  units: z.string().trim().min(1).max(256),
  observationStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  observationEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  observations: z
    .array(
      z.strictObject({
        observedAt: DateTimeSchema,
        value: z.number().finite().nullable(),
      }),
    )
    .max(500),
});

export const PrefCanonicalEvidenceSchema = z.discriminatedUnion('kind', [
  PrefLocalConditionsEvidenceSchema,
  PrefArticleMatchEvidenceSchema,
  PrefMarketSummaryEvidenceSchema,
  PrefResolutionHistoryEvidenceSchema,
  PrefEconomicSeriesSearchEvidenceSchema,
  PrefEconomicSeriesEvidenceSchema,
]);

export interface PrefCacheInfo {
  status: z.infer<typeof PrefCacheStatusSchema>;
  storedAt?: string;
  warning?: string;
}

export type PrefLocalConditionsEvidence = z.infer<typeof PrefLocalConditionsEvidenceSchema>;
export type PrefArticleMatchEvidence = z.infer<typeof PrefArticleMatchEvidenceSchema>;
export type PrefMarketSummaryEvidence = z.infer<typeof PrefMarketSummaryEvidenceSchema>;
export type PrefResolutionHistoryEvidence = z.infer<typeof PrefResolutionHistoryEvidenceSchema>;
export type PrefEconomicSeriesSearchEvidence = z.infer<
  typeof PrefEconomicSeriesSearchEvidenceSchema
>;
export type PrefEconomicSeriesEvidence = z.infer<typeof PrefEconomicSeriesEvidenceSchema>;
export type PrefCanonicalEvidence = z.infer<typeof PrefCanonicalEvidenceSchema>;

export interface PrefCapabilityResult {
  callId: string;
  capability: PrefCanonicalCapability;
  sources: SourceRecord[];
  evidence: PrefCanonicalEvidence[];
  argumentsHash: string;
  responseHash: string;
  retrievedAt: string;
  durationMs: number;
  responseBytes: number;
  fromCache: boolean;
  cache: PrefCacheInfo;
}

interface PrefAuditBase {
  callId: string;
  occurredAt: string;
  expeditionId: string;
  correlationId: string;
  missionId?: string;
  agentId?: string;
}

export type PrefAuditEvent =
  | (PrefAuditBase & {
      type: 'pref.call.started';
      capability: PrefCanonicalCapability;
      argumentsHash: string;
    })
  | (PrefAuditBase & {
      type: 'pref.call.completed';
      sourceIds: string[];
      responseHash: string;
      responseBytes: number;
      durationMs: number;
    })
  | (PrefAuditBase & {
      type: 'pref.call.failed';
      code: PrefGatewayErrorCode;
      message: string;
      retryable: boolean;
      durationMs: number;
    });

export type PrefAuditSink = (event: PrefAuditEvent) => void;

export type PrefGatewayErrorCode =
  | 'pref_invalid_request'
  | 'pref_disconnected'
  | 'pref_capability_denied'
  | 'pref_call_budget_exceeded'
  | 'pref_deadline_exceeded'
  | 'pref_timeout'
  | 'pref_canceled'
  | 'pref_response_too_large'
  | 'pref_upstream_error'
  | 'pref_fixture_miss'
  | 'pref_invalid_response';

export class PrefGatewayError extends Error {
  readonly code: PrefGatewayErrorCode;
  readonly retryable: boolean;

  constructor(code: PrefGatewayErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'PrefGatewayError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface PrefGatewayDiagnostics {
  serverName: string;
  transport: PrefTransport;
  connected: boolean;
  readOnly: true;
  allowCapabilities: PrefCanonicalCapability[];
  limits: {
    timeoutMs: number;
    maxResponseBytes: number;
    maxCallsPerMission: number;
  };
  calls: number;
  completed: number;
  failed: number;
  cache?: {
    entries: number;
    hits: number;
    staleFallbacks: number;
  };
  lastCallAt?: string;
  lastError?: {
    code: PrefGatewayErrorCode;
    message: string;
  };
}

export interface PrefGateway {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<PrefGatewayHealth>;
  discoverCapabilities(): Promise<PrefCapabilityDescriptor[]>;
  search(request: PrefSearchRequest, context: PrefCallContext): Promise<PrefCapabilityResult>;
  read(request: PrefReadRequest, context: PrefCallContext): Promise<PrefCapabilityResult>;
  invokeCanonicalCapability(
    capability: string,
    input: unknown,
    context: PrefCallContext,
  ): Promise<PrefCapabilityResult>;
  diagnostics(): PrefGatewayDiagnostics;
}

export const PrefConnectionStateSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'auth_required',
  'error',
]);
export const PrefCredentialStateSchema = z.enum(['configured', 'missing', 'not_required']);

const PrefPublicDescriptionSchema = z.string().trim().min(1).max(500);
const PrefPublicNameSchema = z.string().trim().min(1).max(256);

export const PrefToolPrimitiveSchema = z.strictObject({
  name: PrefPublicNameSchema,
  title: PrefPublicNameSchema.optional(),
  description: PrefPublicDescriptionSchema.optional(),
  inputFields: z.array(PrefPublicNameSchema).max(64),
  readOnly: z.boolean().nullable(),
});

export const PrefResourcePrimitiveSchema = z.strictObject({
  name: PrefPublicNameSchema,
  uri: z.string().trim().min(1).max(2_048),
  description: PrefPublicDescriptionSchema.optional(),
  mimeType: z.string().trim().min(1).max(255).optional(),
});

export const PrefResourceTemplatePrimitiveSchema = z.strictObject({
  name: PrefPublicNameSchema,
  uriTemplate: z.string().trim().min(1).max(2_048),
  description: PrefPublicDescriptionSchema.optional(),
  mimeType: z.string().trim().min(1).max(255).optional(),
});

export const PrefPromptPrimitiveSchema = z.strictObject({
  name: PrefPublicNameSchema,
  description: PrefPublicDescriptionSchema.optional(),
  argumentNames: z.array(PrefPublicNameSchema).max(32),
});

export const PrefPrimitiveInventorySchema = z.strictObject({
  tools: z.array(PrefToolPrimitiveSchema).max(256),
  resources: z.array(PrefResourcePrimitiveSchema).max(256),
  resourceTemplates: z.array(PrefResourceTemplatePrimitiveSchema).max(256),
  prompts: z.array(PrefPromptPrimitiveSchema).max(256),
});

export const PrefCapabilityMappingStatusSchema = z.strictObject({
  canonicalName: PrefCanonicalCapabilitySchema,
  toolRef: PrefPublicNameSchema,
  providerServer: PrefPublicNameSchema,
  status: z.enum(['unverified', 'valid', 'invalid', 'disabled']),
  message: PrefPublicDescriptionSchema.optional(),
});

export const PrefMcpConnectionErrorCodeSchema = z.enum([
  'pref_auth_required',
  'pref_connection_failed',
  'pref_discovery_failed',
  'pref_server_denied',
  'pref_tool_denied',
  'pref_mapping_invalid',
  'pref_response_too_large',
  'pref_timeout',
  'pref_canceled',
  'pref_disconnected',
  'pref_upstream_error',
]);

export const PrefMcpConnectionDiagnosticsSchema = z.strictObject({
  mode: z.enum(['fixture', 'live']),
  serverName: PrefPublicNameSchema,
  transport: PrefTransportSchema,
  state: PrefConnectionStateSchema,
  connected: z.boolean(),
  credentialState: PrefCredentialStateSchema,
  endpointHost: z.string().trim().min(1).max(253).optional(),
  readOnly: z.literal(true),
  lastTransitionAt: DateTimeSchema,
  lastCheckedAt: DateTimeSchema.optional(),
  serverVersion: PrefPublicNameSchema.optional(),
  protocolVersion: PrefPublicNameSchema.optional(),
  catalogVersion: PrefPublicNameSchema.optional(),
  indexedCapabilityCount: z.number().int().nonnegative().optional(),
  inventory: PrefPrimitiveInventorySchema,
  mappings: z.array(PrefCapabilityMappingStatusSchema).max(16),
  lastError: z
    .strictObject({
      code: PrefMcpConnectionErrorCodeSchema,
      message: PrefPublicDescriptionSchema,
    })
    .optional(),
});

export type PrefConnectionState = z.infer<typeof PrefConnectionStateSchema>;
export type PrefCredentialState = z.infer<typeof PrefCredentialStateSchema>;
export type PrefToolPrimitive = z.infer<typeof PrefToolPrimitiveSchema>;
export type PrefResourcePrimitive = z.infer<typeof PrefResourcePrimitiveSchema>;
export type PrefResourceTemplatePrimitive = z.infer<typeof PrefResourceTemplatePrimitiveSchema>;
export type PrefPromptPrimitive = z.infer<typeof PrefPromptPrimitiveSchema>;
export type PrefPrimitiveInventory = z.infer<typeof PrefPrimitiveInventorySchema>;
export type PrefCapabilityMappingStatus = z.infer<typeof PrefCapabilityMappingStatusSchema>;
export type PrefMcpConnectionErrorCode = z.infer<typeof PrefMcpConnectionErrorCodeSchema>;
export type PrefMcpConnectionDiagnostics = z.infer<typeof PrefMcpConnectionDiagnosticsSchema>;

export class PrefMcpConnectionError extends Error {
  readonly code: PrefMcpConnectionErrorCode;
  readonly retryable: boolean;

  constructor(code: PrefMcpConnectionErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'PrefMcpConnectionError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface PrefMcpCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface PrefMcpCallResult {
  structuredContent?: Record<string, unknown>;
  text?: string;
  responseBytes: number;
}

export interface PrefMcpConnection {
  connect(): Promise<PrefMcpConnectionDiagnostics>;
  disconnect(): Promise<void>;
  diagnostics(): PrefMcpConnectionDiagnostics;
  callProviderTool(
    toolRef: string,
    argumentsValue: Record<string, unknown>,
    options?: PrefMcpCallOptions,
  ): Promise<PrefMcpCallResult>;
}
