import { SourceRecordSchema } from '@signal-atlas/contracts';
import { describe, expect, it } from 'vitest';

import {
  FixturePrefGateway,
  PrefGatewayError,
  type FixturePrefResponse,
  type PrefAuditEvent,
  type PrefCallContext,
  type PrefGatewayConfig,
  type PrefRawResult,
} from '../src/index.js';

const now = '2027-09-26T18:30:00.000Z';
const searchInput = {
  query: 'crosswind advisory',
  location: { placeId: 'weather-tower' },
  limit: 3,
};

function config(overrides: Partial<PrefGatewayConfig> = {}): PrefGatewayConfig {
  return {
    serverName: 'pref-fixture',
    transport: 'fixture',
    readOnly: true,
    allowCapabilities: ['search_sources'],
    timeoutMs: 1_000,
    maxResponseBytes: 100_000,
    maxCallsPerMission: 3,
    cacheMode: 'full_when_permitted',
    ...overrides,
  };
}

function rawResult(overrides: Partial<PrefRawResult> = {}): PrefRawResult {
  return {
    primitive: 'fixture',
    primitiveName: 'fixture.weather.search',
    sourceId: 'src-weather-gateway-1',
    version: 1,
    externalId: 'weather-gateway-1',
    uri: 'fixture://weather-gateway-1',
    title: 'Galehaven Crosswind Advisory',
    publisher: 'Galehaven Weather Service',
    sourceClass: 'official_primary',
    publishedAt: '2027-09-26T18:10:00Z',
    observedAt: '2027-09-26T18:09:00Z',
    location: { placeId: 'weather-tower', label: 'Galehaven launch corridor' },
    mediaType: 'application/json',
    excerpt: 'Crosswinds overlap the opening portion of the fictional launch window.',
    structuredData: { gustKnots: 28 },
    payload: { gust_knots: 28, status: 'advisory' },
    rights: { display: 'full', license: 'Original test fixture' },
    tags: ['weather', 'crosswind'],
    ...overrides,
  };
}

function recorded(
  overrides: Partial<FixturePrefResponse> = {},
  resultOverrides: Partial<PrefRawResult> = {},
): FixturePrefResponse {
  return {
    capability: 'search_sources',
    input: searchInput,
    results: [rawResult(resultOverrides)],
    ...overrides,
  };
}

function context(overrides: Partial<PrefCallContext> = {}): PrefCallContext {
  return {
    expeditionId: 'exp-pref-test',
    missionId: 'mission-pref-test',
    agentId: 'mira',
    correlationId: 'corr-pref-test',
    deadlineAt: '2027-09-26T18:31:00Z',
    ...overrides,
  };
}

function gateway(
  options: {
    config?: PrefGatewayConfig;
    responses?: FixturePrefResponse[];
    audit?: (event: PrefAuditEvent) => void;
  } = {},
): FixturePrefGateway {
  return new FixturePrefGateway({
    config: options.config ?? config(),
    responses: options.responses ?? [recorded()],
    now: () => new Date(now),
    ...(options.audit ? { audit: options.audit } : {}),
  });
}

describe('FixturePrefGateway', () => {
  it('normalizes a recorded response through the canonical gateway with complete provenance', async () => {
    const events: PrefAuditEvent[] = [];
    const pref = gateway({ audit: (event) => events.push(event) });
    await pref.connect();

    const capabilities = await pref.discoverCapabilities();
    const result = await pref.search(searchInput, context());
    const source = SourceRecordSchema.parse(result.sources[0]);

    expect(capabilities).toEqual([
      expect.objectContaining({
        canonicalName: 'search_sources',
        primitive: 'fixture',
        readOnly: true,
      }),
    ]);
    expect(source).toMatchObject({
      id: 'src-weather-gateway-1',
      title: 'Galehaven Crosswind Advisory',
      publishedAt: '2027-09-26T18:10:00Z',
      observedAt: '2027-09-26T18:09:00Z',
      retrievedAt: now,
      provenance: {
        serverName: 'pref-fixture',
        transport: 'fixture',
        primitive: 'fixture',
        primitiveName: 'fixture.weather.search',
        callId: result.callId,
        argumentsHash: result.argumentsHash,
        responseHash: result.responseHash,
      },
    });
    expect(source.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.argumentsHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.responseHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(events.map(({ type }) => type)).toEqual(['pref.call.started', 'pref.call.completed']);
    expect(pref.diagnostics()).toMatchObject({
      connected: true,
      readOnly: true,
      calls: 1,
      completed: 1,
      failed: 0,
    });
  });

  it('fails closed for unknown and non-allow-listed capabilities', async () => {
    const pref = gateway();
    await pref.connect();

    await expect(
      pref.invokeCanonicalCapability('place_market_order', {}, context()),
    ).rejects.toMatchObject({ code: 'pref_capability_denied' });
    await expect(
      pref.invokeCanonicalCapability(
        'local_conditions',
        { location: { placeId: 'weather-tower' } },
        context(),
      ),
    ).rejects.toMatchObject({ code: 'pref_capability_denied' });
    expect(pref.diagnostics()).toMatchObject({ calls: 1, failed: 1 });
  });

  it('rejects ambiguous policy and temporal inputs at the runtime boundary', async () => {
    expect(
      () =>
        new FixturePrefGateway({
          config: config({ allowCapabilities: ['search_sources', 'search_sources'] }),
          responses: [recorded()],
        }),
    ).toThrow('Allowed Pref capabilities must be unique');
    expect(
      () =>
        new FixturePrefGateway({
          config: config({ transport: 'stdio' }),
          responses: [recorded()],
        }),
    ).toThrow('requires the fixture transport');
    const pref = gateway();
    await pref.connect();
    await expect(
      pref.search(
        {
          ...searchInput,
          since: '2027-09-27T00:00:00+00:00',
          until: '2027-09-26T00:00:00+00:00',
        },
        context(),
      ),
    ).rejects.toMatchObject({ code: 'pref_invalid_request' });
  });

  it('requires a connection and an exact recorded canonical request', async () => {
    const pref = gateway();
    await expect(pref.search(searchInput, context())).rejects.toMatchObject({
      code: 'pref_disconnected',
    });
    await pref.connect();
    await expect(
      pref.search({ ...searchInput, query: 'a request that was not recorded' }, context()),
    ).rejects.toMatchObject({ code: 'pref_fixture_miss' });
  });

  it('enforces the per-mission call budget before returning another fixture', async () => {
    const pref = gateway({ config: config({ maxCallsPerMission: 1 }) });
    await pref.connect();
    await pref.search(searchInput, context());

    await expect(pref.search(searchInput, context())).rejects.toMatchObject({
      code: 'pref_call_budget_exceeded',
      retryable: false,
    });
    expect(pref.diagnostics()).toMatchObject({ calls: 2, completed: 1, failed: 1 });
  });

  it('enforces deadline, timeout, cancellation, and response byte ceilings', async () => {
    const pastDeadline = gateway();
    await pastDeadline.connect();
    await expect(
      pastDeadline.search(searchInput, context({ deadlineAt: '2027-09-26T18:29:59Z' })),
    ).rejects.toMatchObject({ code: 'pref_deadline_exceeded' });

    const timedOut = gateway({
      config: config({ timeoutMs: 5 }),
      responses: [recorded({ latencyMs: 30 })],
    });
    await timedOut.connect();
    await expect(timedOut.search(searchInput, context())).rejects.toMatchObject({
      code: 'pref_timeout',
    });

    const controller = new AbortController();
    controller.abort();
    const canceled = gateway({ responses: [recorded({ latencyMs: 30 })] });
    await canceled.connect();
    await expect(
      canceled.search(searchInput, context({ signal: controller.signal })),
    ).rejects.toMatchObject({ code: 'pref_canceled' });

    const oversized = gateway({
      config: config({ maxResponseBytes: 100 }),
      responses: [recorded({}, { payload: { body: 'x'.repeat(1_000) } })],
    });
    await oversized.connect();
    await expect(oversized.search(searchInput, context())).rejects.toMatchObject({
      code: 'pref_response_too_large',
    });
  });

  it('keeps raw requests, response content, and secrets out of audit events and errors', async () => {
    const events: PrefAuditEvent[] = [];
    const secret = 'Bearer secret-pref-token-value';
    const secretInput = { ...searchInput, query: secret };
    const pref = gateway({
      responses: [recorded({ input: secretInput }, { payload: { authorization: secret } })],
      audit: (event) => events.push(event),
    });
    await pref.connect();
    await pref.search(secretInput, context());

    const serializedAudit = JSON.stringify(events);
    const serializedDiagnostics = JSON.stringify(pref.diagnostics());
    expect(serializedAudit).not.toContain(secret);
    expect(serializedAudit).not.toContain('authorization');
    expect(serializedDiagnostics).not.toContain(secret);
    expect(events[0]).toMatchObject({
      type: 'pref.call.started',
      argumentsHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(PrefGatewayError).toBeDefined();
  });
});
