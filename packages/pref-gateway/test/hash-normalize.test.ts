import { describe, expect, it } from 'vitest';

import {
  canonicalPrefJson,
  normalizePrefRawResult,
  prefHash,
  PrefSerializationError,
  type PrefGatewayConfig,
  type PrefRawResult,
} from '../src/index.js';

const config: PrefGatewayConfig = {
  serverName: 'pref-fixture',
  transport: 'fixture',
  readOnly: true,
  allowCapabilities: ['read_source'],
  timeoutMs: 1_000,
  maxResponseBytes: 10_000,
  maxCallsPerMission: 2,
  cacheMode: 'full_when_permitted',
};

const baseRaw: PrefRawResult = {
  primitive: 'fixture',
  primitiveName: 'fixture.read',
  externalId: 'record-1',
  title: 'Rights-aware fixture record',
  sourceClass: 'archive',
  excerpt: 'A short permitted excerpt.',
  structuredData: { count: 20 },
  payload: { count: 20, body: 'full raw body' },
  rights: { display: 'full' },
  tags: ['history'],
};

function normalize(raw: PrefRawResult, override: Partial<PrefGatewayConfig> = {}) {
  return normalizePrefRawResult(raw, {
    config: { ...config, ...override },
    callId: 'pref-call-normalize-1',
    argumentsHash: 'a'.repeat(64),
    responseHash: 'b'.repeat(64),
    retrievedAt: '2027-09-26T18:30:00Z',
  });
}

describe('canonical Pref hashing', () => {
  it('is deterministic across object key ordering', () => {
    const left = { query: 'weather', filters: { place: 'tower', limit: 3 } };
    const right = { filters: { limit: 3, place: 'tower' }, query: 'weather' };

    expect(canonicalPrefJson(left)).toBe(canonicalPrefJson(right));
    expect(prefHash(left)).toBe(prefHash(right));
    expect(prefHash(left)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects cyclic and non-JSON-like values instead of hashing ambiguously', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    expect(() => prefHash(cyclic)).toThrow(PrefSerializationError);
    expect(() => prefHash({ invalid: BigInt(1) })).toThrow(PrefSerializationError);
  });
});

describe('Pref source normalization and rights', () => {
  it('generates a stable local ID and complete canonical provenance', () => {
    const source = normalize(baseRaw);
    const repeated = normalize(structuredClone(baseRaw));

    expect(source.id).toMatch(/^src-pref-[a-f0-9]{24}$/u);
    expect(source.id).toBe(repeated.id);
    expect(source.contentHash).toBe(repeated.contentHash);
    expect(source.externalUri).toBe('pref://pref-fixture/fixture.read/record-1');
    expect(source).toMatchObject({
      excerpt: baseRaw.excerpt,
      structuredData: baseRaw.structuredData,
      provenance: {
        serverName: 'pref-fixture',
        transport: 'fixture',
        primitiveName: 'fixture.read',
        argumentsHash: 'a'.repeat(64),
        responseHash: 'b'.repeat(64),
        callId: 'pref-call-normalize-1',
      },
    });
  });

  it('omits content conservatively when rights or cache policy do not permit storage', () => {
    const metadataOnly = normalize({ ...baseRaw, rights: { display: 'metadata_only' } });
    const linkOnly = normalize({ ...baseRaw, rights: { display: 'link_only' } });
    const excerptOnly = normalize({ ...baseRaw, rights: { display: 'excerpt' } });
    const unknownRights = normalize({ ...baseRaw, rights: undefined });
    const metadataCache = normalize(baseRaw, { cacheMode: 'metadata_only' });

    expect(metadataOnly).not.toHaveProperty('excerpt');
    expect(metadataOnly).not.toHaveProperty('structuredData');
    expect(linkOnly).not.toHaveProperty('excerpt');
    expect(linkOnly).not.toHaveProperty('structuredData');
    expect(excerptOnly.excerpt).toBe(baseRaw.excerpt);
    expect(excerptOnly).not.toHaveProperty('structuredData');
    expect(unknownRights.rights).toMatchObject({ display: 'metadata_only' });
    expect(unknownRights).not.toHaveProperty('excerpt');
    expect(metadataCache).not.toHaveProperty('excerpt');
    expect(metadataCache).not.toHaveProperty('structuredData');
  });
});
