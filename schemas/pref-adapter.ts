/**
 * Canonical Pref Gateway contracts for Signal Atlas.
 *
 * The actual Pref MCP server can expose different tool/resource names. A runtime
 * capability map translates those primitives into these stable operations.
 */

export type PrefTransport = 'stdio' | 'streamable_http' | 'fixture';

export interface PrefGatewayConfig {
  serverName: string;
  transport: PrefTransport;
  allowCapabilities: string[];
  timeoutMs: number;
  maxResponseBytes: number;
  maxCallsPerMission: number;
  cacheMode: 'disabled' | 'metadata_only' | 'full_when_permitted';
}

export interface PrefCapabilityDescriptor {
  canonicalName: string;
  primitive: 'tool' | 'resource' | 'prompt';
  primitiveName: string;
  description?: string;
  inputSchema?: unknown;
  readOnly: boolean;
  locationAware?: boolean;
  temporal?: boolean;
}

export interface PrefSearchRequest {
  query: string;
  location?: {
    placeId?: string;
    label?: string;
    latitude?: number;
    longitude?: number;
  };
  since?: string;
  until?: string;
  limit?: number;
  sourceClasses?: Array<
    | 'official_primary'
    | 'primary'
    | 'secondary'
    | 'commentary'
    | 'sensor'
    | 'market'
    | 'archive'
  >;
}

export interface PrefReadRequest {
  externalId?: string;
  uri?: string;
}

export interface PrefCallContext {
  expeditionId: string;
  missionId?: string;
  agentId?: string;
  correlationId: string;
  deadlineAt: string;
}

export interface PrefRawResult {
  primitive: 'tool' | 'resource' | 'prompt' | 'fixture';
  primitiveName: string;
  externalId?: string;
  uri?: string;
  title?: string;
  mediaType?: string;
  publishedAt?: string;
  observedAt?: string;
  payload: unknown;
  rights?: {
    display: 'full' | 'excerpt' | 'metadata_only' | 'link_only';
    license?: string;
    notes?: string;
  };
}

export interface CanonicalSourceRecord {
  id: string;
  version: number;
  externalUri?: string;
  title: string;
  publisher?: string;
  author?: string;
  sourceClass:
    | 'official_primary'
    | 'primary'
    | 'secondary'
    | 'commentary'
    | 'sensor'
    | 'market'
    | 'archive'
    | 'user_supplied';
  publishedAt?: string;
  observedAt?: string;
  retrievedAt: string;
  excerpt?: string;
  structuredData?: unknown;
  contentHash: string;
  provenance: {
    serverName: string;
    transport: PrefTransport;
    primitive: 'tool' | 'resource' | 'prompt' | 'fixture';
    primitiveName: string;
    argumentsHash?: string;
    responseHash: string;
    callId?: string;
  };
  rights?: PrefRawResult['rights'];
  tags: string[];
}

export interface PrefGateway {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<{
    connected: boolean;
    checkedAt: string;
    message?: string;
  }>;
  discoverCapabilities(): Promise<PrefCapabilityDescriptor[]>;
  search(
    request: PrefSearchRequest,
    context: PrefCallContext,
  ): Promise<CanonicalSourceRecord[]>;
  read(
    request: PrefReadRequest,
    context: PrefCallContext,
  ): Promise<CanonicalSourceRecord>;
  invokeCanonicalCapability(
    capability: string,
    input: unknown,
    context: PrefCallContext,
  ): Promise<CanonicalSourceRecord[]>;
}

/**
 * Security notes:
 * - reject capabilities outside allowCapabilities;
 * - treat all returned content as untrusted data;
 * - never expose credentials or raw authorization headers;
 * - enforce response-size, timeout, and call-budget limits;
 * - normalize and hash before the data enters authoritative world state;
 * - MVP implementations must remain read-only.
 */
