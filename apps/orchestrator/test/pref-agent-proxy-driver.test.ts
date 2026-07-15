import type {
  AgentTurnInput,
  AgentTurnOutput,
  ExpeditionFixture,
  Mission,
  SourceRecord,
} from '@signal-atlas/contracts';
import type { CodexDriver, CodexDriverContext } from '@signal-atlas/codex-runtime';
import {
  normalizePrefRawResult,
  type PrefCallContext,
  type PrefCanonicalCapability,
  type PrefCapabilityDescriptor,
  type PrefCapabilityResult,
  type PrefGateway,
  type PrefGatewayDiagnostics,
  type PrefGatewayHealth,
  type PrefLocalConditionsEvidence,
  type PrefReadRequest,
  type PrefSearchRequest,
} from '@signal-atlas/pref-gateway';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';
import {
  createFixtureCodexDriver,
  type ScriptedFixtureTurn,
} from '../src/fixture-mission-driver.js';
import {
  createPrefAgentProxyDriver,
  resolvePrefMissionRoute,
  resolvePrefWeatherProxyConfiguration,
} from '../src/pref-agent-proxy-driver.js';

const sourceConfig = {
  serverName: 'pref',
  transport: 'streamable_http' as const,
  readOnly: true as const,
  allowCapabilities: ['local_conditions'] as const,
  timeoutMs: 10_000,
  maxResponseBytes: 100_000,
  maxCallsPerMission: 3,
  cacheMode: 'full_when_permitted' as const,
};

function liveSource(
  callId: string,
  weatherDescription: string,
  temperatureC: number,
  options: { version?: number; supersedesSourceId?: string; retrievedAt?: string } = {},
): SourceRecord {
  return normalizePrefRawResult(
    {
      primitive: 'tool',
      primitiveName: 'weather.get_current_conditions',
      externalId: '28.45136,-80.52831:2026-07-14T23:15:00.000Z',
      title: `Cape Canaveral live proxy conditions — ${weatherDescription}`,
      publisher: 'Open-Meteo via Preference weather_toolkit',
      sourceClass: 'sensor',
      observedAt: '2026-07-14T23:15:00.000Z',
      location: {
        label: 'Cape Canaveral, Brevard County, Florida, United States',
        latitude: 28.4513556,
        longitude: -80.5283059,
      },
      mediaType: 'application/json',
      payload: { weatherDescription, temperatureC, windSpeedKmh: 13.3 },
      rights: {
        display: 'metadata_only',
        notes: 'Provider display rights were not asserted.',
      },
      tags: ['context-only', 'live', 'real-world-proxy', 'weather'],
      ...(options.version ? { version: options.version } : {}),
      ...(options.supersedesSourceId ? { supersedesSourceId: options.supersedesSourceId } : {}),
    },
    {
      config: { ...sourceConfig, allowCapabilities: [...sourceConfig.allowCapabilities] },
      callId,
      argumentsHash: 'a'.repeat(64),
      responseHash: weatherDescription === 'Heavy rain' ? 'b'.repeat(64) : 'c'.repeat(64),
      retrievedAt: options.retrievedAt ?? '2026-07-15T00:00:00.000Z',
    },
  );
}

function evidence(
  source: SourceRecord,
  weatherDescription: string,
  temperatureC: number,
): PrefLocalConditionsEvidence {
  return {
    kind: 'local_conditions',
    sourceId: source.id,
    provider: 'Open-Meteo via Preference weather_toolkit',
    location: {
      label: 'Cape Canaveral, Brevard County, Florida, United States',
      latitude: 28.4513556,
      longitude: -80.5283059,
    },
    observedAt: '2026-07-14T23:15:00.000Z',
    providerRetrievedAt: '2026-07-14T23:27:53.000Z',
    temperatureC,
    humidityPercent: 95,
    windSpeedKmh: 13.3,
    windDirectionDegrees: 2,
    weatherCode: weatherDescription === 'Heavy rain' ? 65 : 61,
    weatherDescription,
    weatherCategory: 'rain',
    pressureHpa: 1019.7,
  };
}

function capabilityResult(
  callId: string,
  source: SourceRecord,
  weatherDescription: string,
  temperatureC: number,
  cache: PrefCapabilityResult['cache'] = { status: 'miss' },
): PrefCapabilityResult {
  return {
    callId,
    capability: 'local_conditions',
    sources: [source],
    evidence: [evidence(source, weatherDescription, temperatureC)],
    argumentsHash: 'a'.repeat(64),
    responseHash: source.provenance.responseHash,
    retrievedAt: cache.status === 'stale' ? '2026-07-15T00:10:00.000Z' : source.retrievedAt,
    durationMs: 12,
    responseBytes: 512,
    fromCache: cache.status !== 'miss',
    cache,
  };
}

class QueueGateway implements PrefGateway {
  readonly calls: Array<{ capability: string; input: unknown; context: PrefCallContext }> = [];
  readonly #results: PrefCapabilityResult[];
  readonly #allowCapabilities: PrefCanonicalCapability[];
  #connected = false;

  constructor(
    results: PrefCapabilityResult[],
    allowCapabilities: PrefCanonicalCapability[] = ['local_conditions'],
  ) {
    this.#results = [...results];
    this.#allowCapabilities = [...allowCapabilities];
  }

  async connect(): Promise<void> {
    this.#connected = true;
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
  }

  async health(): Promise<PrefGatewayHealth> {
    return { connected: this.#connected, checkedAt: '2026-07-15T00:00:00Z' };
  }

  async discoverCapabilities(): Promise<PrefCapabilityDescriptor[]> {
    return [
      {
        canonicalName: 'local_conditions',
        primitive: 'tool',
        primitiveName: 'weather.get_current_conditions',
        readOnly: true,
        locationAware: true,
        temporal: true,
      },
    ];
  }

  search(_request: PrefSearchRequest, context: PrefCallContext): Promise<PrefCapabilityResult> {
    return this.invokeCanonicalCapability('search_sources', {}, context);
  }

  read(_request: PrefReadRequest, context: PrefCallContext): Promise<PrefCapabilityResult> {
    return this.invokeCanonicalCapability('read_source', {}, context);
  }

  async invokeCanonicalCapability(
    capability: string,
    input: unknown,
    context: PrefCallContext,
  ): Promise<PrefCapabilityResult> {
    this.calls.push({ capability, input: structuredClone(input), context: { ...context } });
    const result = this.#results.shift();
    if (!result) throw new Error('Pref result queue exhausted.');
    return structuredClone(result);
  }

  diagnostics(): PrefGatewayDiagnostics {
    return {
      serverName: 'pref',
      transport: 'streamable_http',
      connected: this.#connected,
      readOnly: true,
      allowCapabilities: [...this.#allowCapabilities],
      limits: { timeoutMs: 10_000, maxResponseBytes: 100_000, maxCallsPerMission: 3 },
      calls: this.calls.length,
      completed: this.calls.length,
      failed: 0,
    };
  }
}

function articleResult(callId = 'call-gdelt-1'): PrefCapabilityResult {
  const retrievedAt = '2026-07-15T00:00:00.000Z';
  const source = normalizePrefRawResult(
    {
      primitive: 'tool',
      primitiveName: 'gdelt.gdelt_search',
      externalId: 'https://example.test/helios-readiness-review',
      uri: 'https://example.test/helios-readiness-review',
      title: 'Helios readiness review remains scheduled',
      publisher: 'Example Newswire',
      sourceClass: 'secondary',
      publishedAt: '2026-07-14T23:00:00.000Z',
      mediaType: 'text/html',
      payload: { result: 'bounded search match' },
      rights: {
        display: 'metadata_only',
        notes: 'Article content display rights were not asserted.',
      },
      tags: ['article-search', 'gdelt', 'live'],
    },
    {
      config: {
        ...sourceConfig,
        allowCapabilities: ['search_sources'],
      },
      callId,
      argumentsHash: 'd'.repeat(64),
      responseHash: 'e'.repeat(64),
      retrievedAt,
    },
  );
  return {
    callId,
    capability: 'search_sources',
    sources: [source],
    evidence: [
      {
        kind: 'article_match',
        sourceId: source.id,
        matchedSentence: 'The operator said the readiness review remains scheduled for Friday.',
        publishedAt: '2026-07-14T23:00:00.000Z',
      },
    ],
    argumentsHash: 'd'.repeat(64),
    responseHash: 'e'.repeat(64),
    retrievedAt,
    durationMs: 18,
    responseBytes: 768,
    fromCache: false,
    cache: { status: 'miss' },
  };
}

function mission(id = 'mission-live-pref-1', agentId = 'mira'): Mission {
  return {
    id,
    expeditionId: 'exp-helios3-demo',
    assignedAgentId: agentId,
    verb: 'observe_conditions',
    objective: 'Check the latest conditions at Galehaven Weather Tower.',
    destinationPlaceId: 'weather-tower',
    budget: { maxToolCalls: 1, timeoutMs: 10_000 },
    status: 'running',
    createdBy: { kind: 'player' },
    createdAt: '2027-09-26T18:32:00Z',
    startedAt: '2027-09-26T18:32:01Z',
  };
}

function turnInput(fixture: ExpeditionFixture): AgentTurnInput {
  const agent = fixture.agents.find(({ id }) => id === 'mira');
  return {
    schemaVersion: 1,
    turnId: 'turn-live-pref-1',
    expeditionId: fixture.expedition.id,
    agentId: 'mira',
    mission: mission(),
    effectivePlaceId: 'weather-tower',
    attempt: 1,
    knownSourceIds: agent?.knownSourceIds ?? [],
    knownSignalIds: agent?.knownSignalIds ?? [],
    allowedCapabilities: ['local_conditions'],
    requestedAt: '2027-09-26T18:32:01Z',
    timeoutMs: 10_000,
  };
}

function driverContext(): CodexDriverContext {
  return {
    signal: new AbortController().signal,
    deadlineAt: '2027-09-26T18:33:00Z',
    emit: () => undefined,
  };
}

function assignmentCommand(missionId: string, issuedAt: string) {
  const draftMission = mission(missionId);
  delete draftMission.startedAt;
  return {
    id: `cmd-assign-${missionId}`,
    idempotencyKey: `assign:${missionId}`,
    expeditionId: 'exp-helios3-demo',
    issuedAt,
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.assign_mission',
    payload: {
      mission: {
        ...draftMission,
        status: 'draft',
        createdAt: issuedAt,
      },
    },
  };
}

function skipCommand(missionId: string, issuedAt: string) {
  return {
    id: `cmd-skip-${missionId}`,
    idempotencyKey: `skip:${missionId}`,
    expeditionId: 'exp-helios3-demo',
    issuedAt,
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.skip_travel',
    payload: { agentId: 'mira', missionId },
  };
}

async function finishAsyncTurn(runtime: ExpeditionRuntime, occurredAt: string): Promise<void> {
  await runtime.waitForRuntimeIdle();
  runtime.advance(1, occurredAt);
}

describe('Pref agent proxy driver', () => {
  it('selects only explicitly authored provider-neutral mission routes', () => {
    const fixture = createHelios3ExpeditionFixture();
    const input = turnInput(fixture);
    input.effectivePlaceId = 'newsroom';
    input.mission.verb = 'investigate';
    input.mission.objective = 'Find recent reporting about the Helios readiness review.';
    input.mission.destinationPlaceId = 'newsroom';
    input.allowedCapabilities = ['search_sources'];

    expect(resolvePrefMissionRoute(fixture, input, ['search_sources'])).toBeUndefined();

    const newsroom = fixture.worldManifest.places.find(({ id }) => id === 'newsroom');
    const searchBinding = newsroom?.capabilityBindings.find(
      ({ canonicalCapability }) => canonicalCapability === 'search_sources',
    );
    if (!searchBinding) throw new Error('The fixture newsroom search binding is missing.');
    searchBinding.configuration = {
      missionVerbs: ['investigate'],
      queryMode: 'mission_objective',
      limit: 2,
    };

    expect(resolvePrefMissionRoute(fixture, input, ['search_sources'])).toEqual({
      capability: 'search_sources',
      input: {
        query: 'Find recent reporting about the Helios readiness review.',
        limit: 2,
      },
    });

    const archive = fixture.worldManifest.places.find(({ id }) => id === 'archive');
    archive?.capabilityBindings.push({
      canonicalCapability: 'search_resolution_history',
      configuration: {
        missionVerbs: ['search_history'],
        referenceClass: 'rocket_maiden_flight',
        outcome: 'NO',
        limit: 3,
      },
    });
    input.effectivePlaceId = 'archive';
    input.mission.verb = 'search_history';
    input.mission.destinationPlaceId = 'archive';
    input.allowedCapabilities = ['search_resolution_history'];

    expect(resolvePrefMissionRoute(fixture, input, ['search_resolution_history'])).toEqual({
      capability: 'search_resolution_history',
      input: { referenceClass: 'rocket_maiden_flight', outcome: 'NO', limit: 3 },
    });
  });

  it('delegates bounded canonical Pref evidence to an agent turn', async () => {
    const fixture = createHelios3ExpeditionFixture();
    const newsroom = fixture.worldManifest.places.find(({ id }) => id === 'newsroom');
    const searchBinding = newsroom?.capabilityBindings.find(
      ({ canonicalCapability }) => canonicalCapability === 'search_sources',
    );
    if (!searchBinding) throw new Error('The fixture newsroom search binding is missing.');
    searchBinding.configuration = {
      missionVerbs: ['investigate'],
      queryMode: 'mission_objective',
      limit: 2,
    };
    const input = turnInput(fixture);
    input.effectivePlaceId = 'newsroom';
    input.mission.verb = 'investigate';
    input.mission.objective = 'Find recent reporting about the Helios readiness review.';
    input.mission.destinationPlaceId = 'newsroom';
    input.allowedCapabilities = ['search_sources'];
    const result = articleResult();
    const source = result.sources[0];
    if (!source) throw new Error('The article fixture did not produce a source.');
    const receivedInputs: AgentTurnInput[] = [];
    const output: AgentTurnOutput = {
      schemaVersion: 1,
      agentId: input.agentId,
      missionId: input.mission.id,
      action: {
        type: 'investigate',
        capability: 'search_sources',
        query: input.mission.objective,
      },
      publicDialogue: 'The current report says the readiness review remains scheduled.',
      sourceIdsUsed: [source.id],
      proposedClaims: [
        {
          text: 'A current report says the readiness review remains scheduled.',
          sourceIds: [source.id],
          qualifiers: ['single secondary report'],
        },
      ],
      proposedSignals: [
        {
          headline: 'Readiness review remains scheduled',
          summary: 'One recent report describes the review as still scheduled.',
          claimIndexes: [0],
          sourceIds: [source.id],
          direction: 'context',
          impactLabel: 'unknown',
        },
      ],
      rationale: 'Used only the bounded current-turn article match.',
      assumptions: [],
      unknowns: ['The report does not establish the market outcome.'],
    };
    const fallback: CodexDriver<AgentTurnInput, ScriptedFixtureTurn> = {
      id: 'recording-local-agent',
      kind: 'local_exec',
      diagnostics: () => ({
        id: 'recording-local-agent',
        kind: 'local_exec',
        available: true,
        description: 'Test agent boundary.',
        runs: receivedInputs.length,
      }),
      runTurn: (delegatedInput) => {
        receivedInputs.push(structuredClone(delegatedInput));
        return {
          output,
          artifacts: {
            scenario: 'success',
            scriptKey: 'mira:pref:search_sources:newsroom',
            attempt: input.attempt,
            latencyMs: 24,
            callId: result.callId,
            turnId: input.turnId,
            capability: 'search_sources',
            argumentsHash: result.argumentsHash,
            sources: [source],
            claims: [],
            signals: [],
            dialogue: output.publicDialogue,
          },
        };
      },
    };
    const gateway = new QueueGateway([result], ['search_sources']);
    const driver = createPrefAgentProxyDriver({ fixture, gateway, fallback });

    const turn = await driver.runTurn(input, driverContext());

    expect(gateway.calls[0]).toMatchObject({
      capability: 'search_sources',
      input: { query: input.mission.objective, limit: 2 },
    });
    expect(receivedInputs).toHaveLength(1);
    expect(receivedInputs[0]?.currentTurnEvidence).toMatchObject({
      capability: 'search_sources',
      callId: result.callId,
      sources: [{ id: source.id }],
      facts: [
        {
          kind: 'article_match',
          sourceIds: [source.id],
          statement: 'The operator said the readiness review remains scheduled for Friday.',
        },
      ],
    });
    expect(turn.output.sourceIdsUsed).toEqual([source.id]);
    expect(turn.artifacts?.capability).toBe('search_sources');
  });

  it('records retrieved sources without accepting an unrelated scripted answer', async () => {
    const fixture = createHelios3ExpeditionFixture();
    const newsroom = fixture.worldManifest.places.find(({ id }) => id === 'newsroom');
    const searchBinding = newsroom?.capabilityBindings.find(
      ({ canonicalCapability }) => canonicalCapability === 'search_sources',
    );
    if (!searchBinding) throw new Error('The fixture newsroom search binding is missing.');
    searchBinding.configuration = {
      missionVerbs: ['investigate'],
      queryMode: 'mission_objective',
      limit: 1,
    };
    const input = turnInput(fixture);
    input.effectivePlaceId = 'newsroom';
    input.mission.verb = 'investigate';
    input.mission.destinationPlaceId = 'newsroom';
    input.allowedCapabilities = ['search_sources'];
    const result = articleResult('call-gdelt-retrieval-only');
    const driver = createPrefAgentProxyDriver({
      fixture,
      gateway: new QueueGateway([result], ['search_sources']),
      fallback: createFixtureCodexDriver(fixture, () => 'success'),
    });

    const turn = await driver.runTurn(input, driverContext());

    expect(turn.output.action.type).toBe('wait');
    expect(turn.output.sourceIdsUsed).toEqual([]);
    expect(turn.artifacts).toMatchObject({
      capability: 'search_sources',
      sources: [{ id: result.sources[0]?.id }],
      claims: [],
      signals: [],
    });
  });

  it('materializes a live source, claim, and non-directional signal through the agent boundary', async () => {
    const fixture = createHelios3ExpeditionFixture();
    const source = liveSource('call-live-pref-1', 'Heavy rain', 24.1);
    const gateway = new QueueGateway([
      capabilityResult('call-live-pref-1', source, 'Heavy rain', 24.1),
    ]);
    const driver = createPrefAgentProxyDriver({
      fixture,
      gateway,
      fallback: createFixtureCodexDriver(fixture, () => 'success'),
    });

    const turn = await driver.runTurn(turnInput(fixture), driverContext());

    expect(gateway.calls).toHaveLength(1);
    expect(gateway.calls[0]).toMatchObject({
      capability: 'local_conditions',
      input: { location: { label: 'Cape Canaveral, Florida' } },
      context: {
        expeditionId: 'exp-helios3-demo',
        missionId: 'mission-live-pref-1',
        agentId: 'mira',
      },
    });
    expect(turn.output).toMatchObject({
      action: { type: 'investigate', capability: 'local_conditions' },
      sourceIdsUsed: [source.id],
      proposedSignals: [{ direction: 'context', impactLabel: 'unknown' }],
      unknowns: [
        'Actual conditions at Galehaven Weather Tower remain unknown.',
        expect.stringContaining('no direction'),
      ],
    });
    expect(turn.artifacts).toMatchObject({
      capability: 'local_conditions',
      sources: [{ id: source.id }],
      claims: [
        {
          sourceIds: [source.id],
          qualifiers: expect.arrayContaining([
            `not a direct observation of the scenario market: ${fixture.market.question}`,
            'context only; no directional market inference',
            'provider retrieved at 2026-07-14T23:27:53.000Z',
          ]),
        },
      ],
      signals: [
        {
          direction: 'context',
          impact: { label: 'unknown' },
          freshness: { label: 'fresh' },
          status: 'active',
        },
      ],
    });
    expect(driver.diagnostics()).toMatchObject({
      id: 'pref-agent-proxy',
      kind: 'pref_proxy',
      runs: 1,
    });
  });

  it('labels a stale cache result in the claim, signal, and public dialogue', async () => {
    const fixture = createHelios3ExpeditionFixture();
    const source = liveSource('call-live-pref-1', 'Heavy rain', 24.1);
    const gateway = new QueueGateway([
      capabilityResult('call-live-pref-stale', source, 'Heavy rain', 24.1, {
        status: 'stale',
        storedAt: source.retrievedAt,
        warning: 'The live provider was unavailable.',
      }),
    ]);
    const driver = createPrefAgentProxyDriver({
      fixture,
      gateway,
      fallback: createFixtureCodexDriver(fixture, () => 'success'),
    });

    const turn = await driver.runTurn(turnInput(fixture), driverContext());

    expect(turn.output.publicDialogue).toContain('stale cached observation');
    expect(turn.artifacts?.claims[0]?.qualifiers).toContain(
      `stale cached result stored at ${source.retrievedAt}`,
    );
    expect(turn.artifacts?.signals[0]).toMatchObject({
      headline: expect.stringContaining('Stale cached'),
      summary: expect.stringContaining('cached observation is stale'),
      freshness: { label: 'stale' },
      status: 'stale',
    });
  });

  it('records fresh, stale-cache, and superseding source turns without moving market belief', async () => {
    const fixture = createHelios3ExpeditionFixture();
    const firstSource = liveSource('call-live-pref-1', 'Heavy rain', 24.1);
    const secondSource = liveSource('call-live-pref-3', 'Light rain', 25.2, {
      version: 2,
      supersedesSourceId: firstSource.id,
      retrievedAt: '2026-07-15T00:20:00.000Z',
    });
    const gateway = new QueueGateway([
      capabilityResult('call-live-pref-1', firstSource, 'Heavy rain', 24.1),
      capabilityResult('call-live-pref-2', firstSource, 'Heavy rain', 24.1, {
        status: 'stale',
        storedAt: firstSource.retrievedAt,
        warning: 'The live provider was unavailable.',
      }),
      capabilityResult('call-live-pref-3', secondSource, 'Light rain', 25.2),
    ]);
    const runtime = new ExpeditionRuntime(fixture, {
      missionDriver: createPrefAgentProxyDriver({
        fixture,
        gateway,
        fallback: createFixtureCodexDriver(fixture, () => 'success'),
      }),
    });
    const initialBelief = structuredClone(runtime.snapshot().agentsById['mira']?.belief);

    expect(
      runtime.submit(assignmentCommand('mission-live-pref-1', '2027-09-26T18:32:00Z')),
    ).toMatchObject({ accepted: true });
    expect(
      runtime.submit(skipCommand('mission-live-pref-1', '2027-09-26T18:32:01Z')),
    ).toMatchObject({ accepted: true });
    await finishAsyncTurn(runtime, '2027-09-26T18:32:02Z');
    const firstSignal = Object.values(runtime.snapshot().signalsById).find((signal) =>
      signal.sourceIds.includes(firstSource.id),
    );
    expect(firstSignal).toMatchObject({ direction: 'context', status: 'active' });

    expect(
      runtime.submit(assignmentCommand('mission-live-pref-2', '2027-09-26T18:33:00Z')),
    ).toMatchObject({ accepted: true });
    await finishAsyncTurn(runtime, '2027-09-26T18:33:01Z');
    expect(runtime.snapshot().signalsById[firstSignal?.id ?? '']).toMatchObject({
      status: 'stale',
      freshness: { label: 'stale' },
    });
    expect(
      Object.values(runtime.snapshot().signalsById).some(
        (signal) =>
          signal.sourceIds.includes(firstSource.id) &&
          signal.summary.includes('cached observation is stale'),
      ),
    ).toBe(true);

    expect(
      runtime.submit(assignmentCommand('mission-live-pref-3', '2027-09-26T18:34:00Z')),
    ).toMatchObject({ accepted: true });
    await finishAsyncTurn(runtime, '2027-09-26T18:34:01Z');
    const snapshot = runtime.snapshot();
    const secondSignal = Object.values(snapshot.signalsById).find((signal) =>
      signal.sourceIds.includes(secondSource.id),
    );

    expect(snapshot.sourcesById[secondSource.id]).toMatchObject({
      version: 2,
      supersedesSourceId: firstSource.id,
    });
    expect(secondSignal).toMatchObject({
      direction: 'context',
      impact: { label: 'unknown' },
      status: 'active',
    });
    expect(snapshot.agentsById['mira']?.belief).toEqual(initialBelief);
    expect(runtime.eventsAfter(0)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'source.superseded',
          payload: expect.objectContaining({
            previousSourceId: firstSource.id,
            source: expect.objectContaining({ id: secondSource.id }),
          }),
        }),
        expect.objectContaining({
          type: 'pref.call.started',
          payload: expect.objectContaining({
            capability: 'local_conditions',
          }),
        }),
      ]),
    );
    expect(runtime.runtimeDiagnostics()).toMatchObject({
      driver: { id: 'pref-agent-proxy', kind: 'pref_proxy' },
      totals: { completed: 3 },
    });
  });

  it('rejects a live fixture without an explicit context-only proxy mapping', () => {
    const fixture = createHelios3ExpeditionFixture();
    const tower = fixture.worldManifest.places.find(({ id }) => id === 'weather-tower');
    const binding = tower?.capabilityBindings.find(
      ({ canonicalCapability }) => canonicalCapability === 'local_conditions',
    );
    if (binding) delete binding.configuration;

    expect(() => resolvePrefWeatherProxyConfiguration(fixture)).toThrow(
      'requires an explicit providerLocation',
    );
  });
});
