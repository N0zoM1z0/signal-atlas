import { SourceRecordSchema, type SourceRecord } from '@signal-atlas/contracts';

import { prefHash } from './hash.js';
import { PrefRawResultSchema, type PrefGatewayConfig, type PrefRawResult } from './types.js';

export interface NormalizePrefResultOptions {
  config: PrefGatewayConfig;
  callId: string;
  argumentsHash: string;
  responseHash: string;
  retrievedAt: string;
}

function effectiveRights(raw: PrefRawResult): NonNullable<SourceRecord['rights']> {
  return (
    raw.rights ?? {
      display: 'metadata_only',
      notes: 'Pref did not supply display rights; content was conservatively omitted.',
    }
  );
}

function storedContent(
  raw: PrefRawResult,
  config: PrefGatewayConfig,
  display: NonNullable<SourceRecord['rights']>['display'],
): Pick<SourceRecord, 'excerpt' | 'structuredData'> {
  if (config.cacheMode === 'disabled' || config.cacheMode === 'metadata_only') return {};
  if (display === 'metadata_only' || display === 'link_only') return {};
  if (display === 'excerpt') return raw.excerpt ? { excerpt: raw.excerpt } : {};
  return {
    ...(raw.excerpt ? { excerpt: raw.excerpt } : {}),
    ...(raw.structuredData === undefined
      ? {}
      : { structuredData: structuredClone(raw.structuredData) }),
  };
}

function externalUri(raw: PrefRawResult, config: PrefGatewayConfig): string | undefined {
  if (raw.uri) return raw.uri;
  if (!raw.externalId) return undefined;
  return `pref://${encodeURIComponent(config.serverName)}/${encodeURIComponent(raw.primitiveName)}/${encodeURIComponent(raw.externalId)}`;
}

/** Normalize one mapped Pref item; raw payload remains untrusted data and is never treated as instructions. */
export function normalizePrefRawResult(
  value: unknown,
  options: NormalizePrefResultOptions,
): SourceRecord {
  const raw = PrefRawResultSchema.parse(value);
  const rights = effectiveRights(raw);
  const contentHash = prefHash({
    excerpt: raw.excerpt ?? null,
    structuredData: raw.structuredData ?? null,
    payload: raw.payload,
  });
  const identityHash = prefHash({
    serverName: options.config.serverName,
    primitive: raw.primitive,
    primitiveName: raw.primitiveName,
    externalId: raw.externalId ?? null,
    uri: raw.uri ?? null,
    title: raw.title ?? null,
    contentHash,
  });
  const canonicalExternalUri = externalUri(raw, options.config);
  const source = {
    id: raw.sourceId ?? `src-pref-${identityHash.slice(0, 24)}`,
    version: raw.version ?? 1,
    ...(canonicalExternalUri ? { externalUri: canonicalExternalUri } : {}),
    title: raw.title ?? raw.externalId ?? raw.uri ?? 'Untitled Pref source',
    ...(raw.publisher ? { publisher: raw.publisher } : {}),
    ...(raw.author ? { author: raw.author } : {}),
    sourceClass: raw.sourceClass ?? 'secondary',
    ...(raw.publishedAt ? { publishedAt: raw.publishedAt } : {}),
    ...('observedAt' in raw ? { observedAt: raw.observedAt } : {}),
    retrievedAt: options.retrievedAt,
    ...(raw.location ? { location: structuredClone(raw.location) } : {}),
    ...(raw.mediaType ? { mediaType: raw.mediaType } : {}),
    ...storedContent(raw, options.config, rights.display),
    contentHash,
    provenance: {
      serverName: options.config.serverName,
      transport: options.config.transport,
      primitive: raw.primitive,
      primitiveName: raw.primitiveName,
      argumentsHash: options.argumentsHash,
      responseHash: options.responseHash,
      callId: options.callId,
    },
    rights,
    ...(raw.supersedesSourceId ? { supersedesSourceId: raw.supersedesSourceId } : {}),
    tags: [...new Set(raw.tags ?? [])].sort(),
  };
  return SourceRecordSchema.parse(source);
}
