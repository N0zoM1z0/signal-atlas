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

export interface PrefCapabilityResult {
  callId: string;
  capability: PrefCanonicalCapability;
  sources: SourceRecord[];
  argumentsHash: string;
  responseHash: string;
  retrievedAt: string;
  durationMs: number;
  responseBytes: number;
  fromCache: boolean;
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
