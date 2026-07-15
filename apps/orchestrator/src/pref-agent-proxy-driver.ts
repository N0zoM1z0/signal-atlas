import {
  AgentTurnEvidencePacketSchema,
  AgentTurnEvidenceRoleSchema,
  AgentTurnInputSchema,
  AgentTurnOutputSchema,
  ClaimSchema,
  MissionVerbSchema,
  SignalSchema,
  type AgentTurnEvidenceFact,
  type AgentTurnEvidenceRole,
  type AgentTurnInput,
  type AgentTurnOutput,
  type ExpeditionFixture,
  type MissionVerb,
  type Signal,
} from '@signal-atlas/contracts';
import {
  CodexDriverError,
  isPromiseLike,
  publicCodexError,
  type CodexDriver,
  type CodexDriverContext,
  type CodexDriverDiagnostics,
  type CodexTurnResult,
  type MaybePromise,
} from '@signal-atlas/codex-runtime';
import {
  PrefGatewayError,
  PrefCanonicalCapabilitySchema,
  prefHash,
  type PrefCapabilityResult,
  type PrefCanonicalCapability,
  type PrefCanonicalEvidence,
  type PrefGateway,
  type PrefLocalConditionsEvidence,
} from '@signal-atlas/pref-gateway';

import type { ScriptedFixtureTurn } from './fixture-mission-driver.js';

export interface PrefWeatherProxyConfiguration {
  providerLocation: string;
  displayLabel: string;
  marketRelevance: 'context_only';
  fictionalPlaceId: string;
  fictionalPlaceName: string;
}

export interface CreatePrefAgentProxyDriverOptions {
  fixture: ExpeditionFixture;
  gateway: PrefGateway;
  fallback: CodexDriver<AgentTurnInput, ScriptedFixtureTurn>;
  proxy?: PrefWeatherProxyConfiguration;
  now?: () => Date;
}

export interface PrefMissionRoute {
  capability: PrefCanonicalCapability;
  evidenceRole: AgentTurnEvidenceRole;
  scopeNote?: string;
  input: unknown;
  weatherProxy?: PrefWeatherProxyConfiguration;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}

function configuredMissionVerbs(value: unknown): MissionVerb[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((candidate) => MissionVerbSchema.safeParse(candidate));
  if (parsed.some((candidate) => !candidate.success)) return undefined;
  return [...new Set(parsed.map((candidate) => candidate.data!))];
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value);
}

function searchWindow(configuration: Record<string, unknown>) {
  const since = optionalString(configuration['since']);
  const until = optionalString(configuration['until']);
  return { ...(since ? { since } : {}), ...(until ? { until } : {}) };
}

function routeForBinding(
  fixture: ExpeditionFixture,
  input: AgentTurnInput,
  binding: ExpeditionFixture['worldManifest']['places'][number]['capabilityBindings'][number],
  proxyOverride: PrefWeatherProxyConfiguration | undefined,
): PrefMissionRoute | undefined {
  const configuration = binding.configuration ?? {};
  const explicitVerbs = configuredMissionVerbs(configuration['missionVerbs']);
  if (binding.canonicalCapability !== 'local_conditions') {
    if (!explicitVerbs?.includes(input.mission.verb)) return undefined;
  } else if (!(explicitVerbs ?? ['observe_conditions']).includes(input.mission.verb)) {
    return undefined;
  }
  const objectiveQuery =
    configuration['queryMode'] === 'mission_objective' ? input.mission.objective : undefined;
  const configuredQuery = optionalString(configuration['query']);
  const query = configuredQuery ?? objectiveQuery;
  const configuredRole = AgentTurnEvidenceRoleSchema.safeParse(configuration['evidenceRole']);
  const evidenceRole = configuredRole.success ? configuredRole.data : undefined;
  const scopeNote = optionalString(configuration['scopeNote']);
  if (binding.canonicalCapability !== 'local_conditions' && !evidenceRole) return undefined;
  if (evidenceRole === 'context_only' && !scopeNote) return undefined;

  switch (binding.canonicalCapability) {
    case 'local_conditions': {
      const place = fixture.worldManifest.places.find(
        (candidate) => candidate.id === input.effectivePlaceId,
      );
      const providerLocation = optionalString(configuration['providerLocation']);
      const displayLabel = optionalString(configuration['displayLabel']);
      const marketRelevance = configuration['marketRelevance'];
      const proxy =
        proxyOverride?.fictionalPlaceId === input.effectivePlaceId
          ? proxyOverride
          : place && providerLocation && displayLabel && marketRelevance === 'context_only'
            ? {
                providerLocation,
                displayLabel,
                marketRelevance: 'context_only' as const,
                fictionalPlaceId: place.id,
                fictionalPlaceName: place.name,
              }
            : undefined;
      return proxy
        ? {
            capability: 'local_conditions',
            evidenceRole: 'context_only',
            scopeNote: `${proxy.displayLabel} is a disclosed real-world interface proxy for fictional ${proxy.fictionalPlaceName}; it is not a direct observation of the scenario market.`,
            input: { location: { label: proxy.providerLocation } },
            weatherProxy: proxy,
          }
        : undefined;
    }
    case 'search_sources':
      return query
        ? {
            capability: 'search_sources',
            evidenceRole: evidenceRole!,
            ...(scopeNote ? { scopeNote } : {}),
            input: {
              query,
              limit: positiveInteger(configuration['limit'], 3, 20),
              ...searchWindow(configuration),
            },
          }
        : undefined;
    case 'search_markets':
      return query
        ? {
            capability: 'search_markets',
            evidenceRole: evidenceRole!,
            ...(scopeNote ? { scopeNote } : {}),
            input: { query, limit: positiveInteger(configuration['limit'], 5, 20) },
          }
        : undefined;
    case 'search_resolution_history': {
      const referenceClass = optionalString(configuration['referenceClass']);
      const outcome = configuration['outcome'];
      return referenceClass
        ? {
            capability: 'search_resolution_history',
            evidenceRole: evidenceRole!,
            ...(scopeNote ? { scopeNote } : {}),
            input: {
              referenceClass,
              limit: positiveInteger(configuration['limit'], 5, 20),
              ...(outcome === 'YES' || outcome === 'NO' ? { outcome } : {}),
              ...(configuration['minSampleSize'] === undefined
                ? {}
                : {
                    minSampleSize: positiveInteger(configuration['minSampleSize'], 1, 10_000),
                  }),
            },
          }
        : undefined;
    }
    case 'search_economic_series':
      return query
        ? {
            capability: 'search_economic_series',
            evidenceRole: evidenceRole!,
            ...(scopeNote ? { scopeNote } : {}),
            input: { query, limit: positiveInteger(configuration['limit'], 10, 20) },
          }
        : undefined;
    case 'read_economic_series': {
      const seriesId = optionalString(configuration['seriesId']);
      return seriesId
        ? {
            capability: 'read_economic_series',
            evidenceRole: evidenceRole!,
            ...(scopeNote ? { scopeNote } : {}),
            input: {
              seriesId,
              limit: positiveInteger(configuration['limit'], 120, 500),
              ...searchWindow(configuration),
            },
          }
        : undefined;
    }
    case 'read_source':
      return undefined;
  }
}

/** Select one explicit provider-neutral binding without exposing provider tool refs to agents. */
export function resolvePrefMissionRoute(
  fixture: ExpeditionFixture,
  input: AgentTurnInput,
  availableCapabilities: readonly PrefCanonicalCapability[],
  proxyOverride?: PrefWeatherProxyConfiguration,
): PrefMissionRoute | undefined {
  const place = fixture.worldManifest.places.find(
    (candidate) => candidate.id === input.effectivePlaceId,
  );
  if (!place) return undefined;
  const available = new Set(availableCapabilities);
  for (const binding of place.capabilityBindings) {
    const parsedCapability = PrefCanonicalCapabilitySchema.safeParse(binding.canonicalCapability);
    if (
      !parsedCapability.success ||
      !available.has(parsedCapability.data) ||
      !input.allowedCapabilities.includes(parsedCapability.data)
    ) {
      continue;
    }
    const route = routeForBinding(fixture, input, binding, proxyOverride);
    if (route) return route;
  }
  return undefined;
}

/** Resolve the explicit real-world proxy mapping authored on a local-conditions binding. */
export function resolvePrefWeatherProxyConfiguration(
  fixture: ExpeditionFixture,
): PrefWeatherProxyConfiguration {
  const place = fixture.worldManifest.places.find((candidate) =>
    candidate.capabilityBindings.some(
      (binding) => binding.canonicalCapability === 'local_conditions',
    ),
  );
  const binding = place?.capabilityBindings.find(
    (candidate) => candidate.canonicalCapability === 'local_conditions',
  );
  const providerLocation = nonEmptyString(binding?.configuration?.['providerLocation']);
  const displayLabel = nonEmptyString(binding?.configuration?.['displayLabel']);
  const marketRelevance = binding?.configuration?.['marketRelevance'];
  if (!place || !providerLocation || !displayLabel || marketRelevance !== 'context_only') {
    throw new Error(
      'Live Pref weather requires an explicit providerLocation, displayLabel, and context_only relevance mapping.',
    );
  }
  return {
    providerLocation,
    displayLabel,
    marketRelevance,
    fictionalPlaceId: place.id,
    fictionalPlaceName: place.name,
  };
}

function metric(value: number | null, unit: string, digits = 1): string | undefined {
  return value === null ? undefined : `${value.toFixed(digits)}${unit}`;
}

function conditionsSentence(evidence: PrefLocalConditionsEvidence): string {
  const measurements = [
    metric(evidence.temperatureC, '°C'),
    metric(evidence.windSpeedKmh, ' km/h'),
    metric(evidence.humidityPercent, '%', 0),
  ].filter((value): value is string => value !== undefined);
  return measurements.length > 0
    ? `${evidence.weatherDescription}; ${measurements.join(', ')}`
    : evidence.weatherDescription;
}

function freshness(
  result: PrefCapabilityResult,
  evidence: PrefLocalConditionsEvidence,
): Pick<Signal, 'freshness' | 'status'> {
  const referenceTime = evidence.observedAt ?? result.sources[0]?.retrievedAt ?? result.retrievedAt;
  if (result.cache.status === 'stale') {
    return { freshness: { referenceTime, label: 'stale' }, status: 'stale' };
  }
  if (!evidence.observedAt) {
    return { freshness: { referenceTime, label: 'unknown' }, status: 'active' };
  }
  const ageMs = new Date(result.retrievedAt).getTime() - new Date(evidence.observedAt).getTime();
  const usefulUntil = new Date(new Date(evidence.observedAt).getTime() + 90 * 60_000).toISOString();
  if (ageMs > 3 * 60 * 60_000) {
    return { freshness: { referenceTime, usefulUntil, label: 'stale' }, status: 'stale' };
  }
  return {
    freshness: {
      referenceTime,
      usefulUntil,
      label: ageMs > 90 * 60_000 ? 'aging' : 'fresh',
    },
    status: 'active',
  };
}

function compactStatement(value: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  return compact.length <= 1_200 ? compact : `${compact.slice(0, 1_199)}…`;
}

function evidenceFact(evidence: PrefCanonicalEvidence): AgentTurnEvidenceFact | undefined {
  switch (evidence.kind) {
    case 'local_conditions': {
      const locationLabel = evidence.location.label ?? 'the configured location';
      return {
        kind: evidence.kind,
        sourceIds: [evidence.sourceId],
        statement: compactStatement(
          `${evidence.provider} reported ${conditionsSentence(evidence)} for ${locationLabel}.`,
        ),
        attributes: {
          provider: evidence.provider,
          location: locationLabel,
          observedAt: evidence.observedAt,
          providerRetrievedAt: evidence.providerRetrievedAt,
          temperatureC: evidence.temperatureC,
          humidityPercent: evidence.humidityPercent,
          windSpeedKmh: evidence.windSpeedKmh,
          pressureHpa: evidence.pressureHpa,
        },
      };
    }
    case 'article_match':
      return {
        kind: evidence.kind,
        sourceIds: [evidence.sourceId],
        statement: compactStatement(evidence.matchedSentence),
        attributes: { publishedAt: evidence.publishedAt },
      };
    case 'market_summary':
      return {
        kind: evidence.kind,
        sourceIds: [evidence.sourceId],
        statement: compactStatement(
          evidence.question
            ? `Read-only market context: ${evidence.question}`
            : `Read-only market context for ${evidence.slug}.`,
        ),
        attributes: {
          provider: evidence.provider,
          marketId: evidence.marketId,
          slug: evidence.slug,
          active: evidence.active,
          closed: evidence.closed,
        },
      };
    case 'resolution_history': {
      if (evidence.sourceIds.length === 0) return undefined;
      const rate = evidence.baseRate === null ? 'unavailable' : evidence.baseRate.toFixed(3);
      return {
        kind: evidence.kind,
        sourceIds: [...evidence.sourceIds],
        statement: compactStatement(
          `The ${evidence.referenceClass} reference class contains ${evidence.total} resolved markets: ${evidence.yesCount} YES and ${evidence.noCount} NO, with base rate ${rate}.`,
        ),
        attributes: {
          referenceClass: evidence.referenceClass,
          total: evidence.total,
          yesCount: evidence.yesCount,
          noCount: evidence.noCount,
          baseRate: evidence.baseRate,
          sampleSizeConfidence: evidence.sampleSizeConfidence,
        },
      };
    }
    case 'economic_series_search':
      return {
        kind: evidence.kind,
        sourceIds: [evidence.sourceId],
        statement: compactStatement(
          `${evidence.seriesId}: ${evidence.title} (${evidence.frequency}, ${evidence.units}).`,
        ),
        attributes: {
          seriesId: evidence.seriesId,
          observationStart: evidence.observationStart,
          observationEnd: evidence.observationEnd,
        },
      };
    case 'economic_series': {
      const latest = evidence.observations[0];
      return {
        kind: evidence.kind,
        sourceIds: [evidence.sourceId],
        statement: compactStatement(
          `${evidence.seriesId}: ${evidence.title}; ${evidence.observations.length} bounded observations${latest ? `, latest packet value ${latest.value ?? 'missing'} at ${latest.observedAt}` : ''}.`,
        ),
        attributes: {
          seriesId: evidence.seriesId,
          frequency: evidence.frequency,
          units: evidence.units,
          observationCount: evidence.observations.length,
          latestObservedAt: latest?.observedAt ?? null,
          latestValue: latest?.value ?? null,
        },
      };
    }
  }
}

function currentTurnEvidencePacket(result: PrefCapabilityResult, route: PrefMissionRoute) {
  const sourceIds = new Set(result.sources.map((source) => source.id));
  const facts = result.evidence
    .map(evidenceFact)
    .filter((fact) => fact !== undefined)
    .filter((fact) => fact.sourceIds.every((sourceId) => sourceIds.has(sourceId)));
  return AgentTurnEvidencePacketSchema.parse({
    capability: result.capability,
    evidenceRole: route.evidenceRole,
    ...(route.scopeNote ? { scopeNote: route.scopeNote } : {}),
    callId: result.callId,
    argumentsHash: result.argumentsHash,
    retrievedAt: result.retrievedAt,
    durationMs: result.durationMs,
    cacheStatus: result.cache.status,
    sources: result.sources,
    facts,
  });
}

function materializeRetrievalOnlyTurn(
  input: AgentTurnInput,
  result: PrefCapabilityResult,
  reason: string,
): CodexTurnResult<ScriptedFixtureTurn> {
  const sourceCount = result.sources.length;
  const dialogue =
    sourceCount > 0
      ? `I retrieved ${sourceCount} canonical source${sourceCount === 1 ? '' : 's'}, but no validated agent interpretation was accepted. The sources are recorded for later review.`
      : 'The approved source lookup completed, but returned no canonical evidence to analyze.';
  const output = AgentTurnOutputSchema.parse({
    schemaVersion: 1,
    agentId: input.agentId,
    missionId: input.mission.id,
    action: { type: 'wait', reason },
    publicDialogue: dialogue,
    sourceIdsUsed: [],
    proposedClaims: [],
    proposedSignals: [],
    rationale:
      'Recorded only orchestrator-validated source identities; no model-derived claim was accepted.',
    assumptions: [],
    unknowns: ['The retrieved sources have not yet received a validated agent interpretation.'],
  });
  return {
    output,
    artifacts: {
      scenario: sourceCount > 0 ? 'success' : 'no_result',
      scriptKey: `${input.agentId}:pref:${result.capability}:${input.effectivePlaceId}`,
      attempt: input.attempt,
      latencyMs: result.durationMs,
      callId: result.callId,
      turnId: input.turnId,
      capability: result.capability,
      argumentsHash: result.argumentsHash,
      sources: structuredClone(result.sources),
      claims: [],
      signals: [],
      dialogue,
    },
  };
}

function materializeLiveWeatherTurn(
  fixture: ExpeditionFixture,
  input: AgentTurnInput,
  result: PrefCapabilityResult,
  proxy: PrefWeatherProxyConfiguration,
): CodexTurnResult<ScriptedFixtureTurn> {
  const source = result.sources[0];
  const evidence = result.evidence.find(
    (candidate): candidate is PrefLocalConditionsEvidence => candidate.kind === 'local_conditions',
  );
  if (!source || !evidence || evidence.sourceId !== source.id) {
    throw new CodexDriverError(
      'pref_invalid_response',
      'The Pref weather result did not contain one linked canonical observation.',
      false,
    );
  }

  const identity = prefHash({
    sourceId: source.id,
    agentId: input.agentId,
    marketId: fixture.market.id,
    interpretation: 'real_world_proxy_context',
    cacheInterpretation: result.cache.status === 'stale' ? 'stale_cache' : 'current',
  }).slice(0, 24);
  const claimId = `claim-pref-${identity}`;
  const signalId = `sig-pref-${identity}`;
  const cacheQualifier =
    result.cache.status === 'stale'
      ? `stale cached result stored at ${result.cache.storedAt ?? 'an unknown time'}`
      : `${result.cache.status} gateway result`;
  const claim = ClaimSchema.parse({
    id: claimId,
    text: `At the ${proxy.displayLabel}, ${evidence.provider} reported ${conditionsSentence(evidence)}.`,
    sourceIds: [source.id],
    extractor: { kind: 'agent', id: input.agentId },
    qualifiers: [
      `real-world proxy for ${proxy.fictionalPlaceName}`,
      `not a direct observation of the scenario market: ${fixture.market.question}`,
      'context only; no directional market inference',
      `provider retrieved at ${evidence.providerRetrievedAt}`,
      cacheQualifier,
    ],
    ...(evidence.observedAt ? { temporalScope: { startsAt: evidence.observedAt } } : {}),
    status: 'active',
    createdAt: result.retrievedAt,
  });
  const state = freshness(result, evidence);
  const stale = state.status === 'stale';
  const signal = SignalSchema.parse({
    id: signalId,
    marketId: fixture.market.id,
    claimIds: [claim.id],
    sourceIds: [source.id],
    headline: `${stale ? 'Stale cached proxy weather' : 'Live proxy weather'} — ${evidence.weatherDescription}`,
    summary: `${
      stale ? 'This cached observation is stale. ' : ''
    }Real-world ${proxy.displayLabel} context only; it does not directly observe the authored scenario and supports neither market outcome.`,
    direction: 'context',
    impact: { label: 'unknown' },
    reliability: {
      label: 'unverified',
      reasons: [
        'The payload matched the approved Preference weather contract.',
        `The observation is for a disclosed real-world proxy, not ${proxy.fictionalPlaceName} itself.`,
        ...(stale
          ? ['The live provider was unavailable, so the last validated result was reused.']
          : []),
      ],
      assessedBy: { kind: 'system' },
    },
    freshness: state.freshness,
    correlationGroupIds: [],
    discoveredByAgentId: input.agentId,
    createdAt: result.retrievedAt,
    status: state.status,
  });
  const dialogue = stale
    ? `I could only recover a stale cached observation for the ${proxy.displayLabel}. It is real-world proxy context, not direct evidence from ${proxy.fictionalPlaceName}, so I made no market-direction claim.`
    : `I checked the ${proxy.displayLabel}: ${conditionsSentence(evidence)}. This is a disclosed real-world proxy, not direct evidence from ${proxy.fictionalPlaceName}, so it carries no market direction or probability impact.`;
  const output: AgentTurnOutput = AgentTurnOutputSchema.parse({
    schemaVersion: 1,
    agentId: input.agentId,
    missionId: input.mission.id,
    action: {
      type: 'investigate',
      capability: 'local_conditions',
      query: proxy.providerLocation,
    },
    publicDialogue: dialogue,
    sourceIdsUsed: [source.id],
    proposedClaims: [
      { text: claim.text, sourceIds: [source.id], qualifiers: [...claim.qualifiers] },
    ],
    proposedSignals: [
      {
        headline: signal.headline,
        summary: signal.summary,
        claimIndexes: [0],
        sourceIds: [source.id],
        direction: 'context',
        impactLabel: 'unknown',
      },
    ],
    rationale:
      'Recorded the validated live conditions result as disclosed proxy context without changing the scenario forecast.',
    assumptions: [
      `${proxy.displayLabel} is configured only as an interface-testing proxy for ${proxy.fictionalPlaceName}.`,
    ],
    unknowns: [
      `Actual conditions at ${proxy.fictionalPlaceName} remain unknown.`,
      `This real-world observation establishes no direction or probability impact for "${fixture.market.question}".`,
    ],
  });
  return {
    output,
    artifacts: {
      scenario: 'success',
      scriptKey: `${input.agentId}:live_pref:${input.effectivePlaceId}`,
      attempt: input.attempt,
      latencyMs: result.durationMs,
      callId: result.callId,
      turnId: input.turnId,
      capability: 'local_conditions',
      argumentsHash: result.argumentsHash,
      sources: [source],
      claims: [claim],
      signals: [signal],
      dialogue,
    },
  };
}

/** Route approved live evidence through the same bounded agent-turn boundary as other drivers. */
export class PrefAgentProxyDriver implements CodexDriver<AgentTurnInput, ScriptedFixtureTurn> {
  readonly id = 'pref-agent-proxy';
  readonly kind = 'pref_proxy' as const;
  readonly #fixture: ExpeditionFixture;
  readonly #gateway: PrefGateway;
  readonly #fallback: CodexDriver<AgentTurnInput, ScriptedFixtureTurn>;
  readonly #proxy: PrefWeatherProxyConfiguration | undefined;
  #runs = 0;
  #lastRunAt: string | undefined;
  #lastError: string | undefined;

  constructor(options: CreatePrefAgentProxyDriverOptions) {
    this.#fixture = structuredClone(options.fixture);
    this.#gateway = options.gateway;
    this.#fallback = options.fallback;
    this.#proxy = options.proxy ? structuredClone(options.proxy) : undefined;
  }

  runTurn(
    input: AgentTurnInput,
    context: CodexDriverContext,
  ): MaybePromise<CodexTurnResult<ScriptedFixtureTurn>> {
    this.#runs += 1;
    this.#lastRunAt = new Date().toISOString();
    this.#lastError = undefined;
    const route = resolvePrefMissionRoute(
      this.#fixture,
      input,
      this.#gateway.diagnostics().allowCapabilities,
      this.#proxy,
    );
    if (!route) {
      return this.#track(this.#fallback.runTurn(input, context));
    }
    return this.#track(this.#runPrefRoute(input, context, route));
  }

  diagnostics(): CodexDriverDiagnostics {
    return {
      id: this.id,
      kind: this.kind,
      available: true,
      description:
        'Provider-neutral Pref mission router with bounded current-turn evidence and delegated schema-constrained synthesis.',
      runs: this.#runs,
      ...(this.#lastRunAt ? { lastRunAt: this.#lastRunAt } : {}),
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
    };
  }

  async #runPrefRoute(
    input: AgentTurnInput,
    context: CodexDriverContext,
    route: PrefMissionRoute,
  ): Promise<CodexTurnResult<ScriptedFixtureTurn>> {
    context.emit({
      phase: 'pref_proxy_started',
      canonicalCapability: route.capability,
      ...(route.weatherProxy ? { proxyLabel: route.weatherProxy.displayLabel } : {}),
    });
    let result: PrefCapabilityResult;
    try {
      result = await this.#gateway.invokeCanonicalCapability(route.capability, route.input, {
        expeditionId: input.expeditionId,
        missionId: input.mission.id,
        agentId: input.agentId,
        correlationId: input.turnId,
        deadlineAt: context.deadlineAt,
        signal: context.signal,
      });
      context.emit({
        phase: 'pref_proxy_completed',
        canonicalCapability: route.capability,
        cacheStatus: result.cache.status,
        sourceCount: result.sources.length,
      });
    } catch (error: unknown) {
      if (error instanceof CodexDriverError) throw error;
      if (error instanceof PrefGatewayError) {
        throw new CodexDriverError(error.code, error.message, error.retryable);
      }
      throw new CodexDriverError(
        'pref_proxy_failed',
        'The Pref agent proxy failed before accepting evidence.',
        true,
      );
    }

    if (
      route.capability === 'local_conditions' &&
      route.weatherProxy &&
      this.#fallback.kind === 'scripted'
    ) {
      return materializeLiveWeatherTurn(this.#fixture, input, result, route.weatherProxy);
    }
    if (result.sources.length === 0) {
      return materializeRetrievalOnlyTurn(
        input,
        result,
        'The approved Pref lookup returned no canonical sources.',
      );
    }

    const packet = currentTurnEvidencePacket(result, route);
    const delegatedInput = AgentTurnInputSchema.parse({ ...input, currentTurnEvidence: packet });
    try {
      const delegated = await this.#fallback.runTurn(delegatedInput, context);
      const packetSourceIds = new Set(packet.sources.map((source) => source.id));
      const acceptedSourceIds = delegated.output.sourceIdsUsed.filter((sourceId) =>
        packetSourceIds.has(sourceId),
      );
      const artifactSourceIds = new Set(
        delegated.artifacts?.sources.map((source) => source.id) ?? [],
      );
      if (
        acceptedSourceIds.length > 0 &&
        acceptedSourceIds.every((sourceId) => artifactSourceIds.has(sourceId))
      ) {
        context.emit({
          phase: 'pref_proxy_synthesized',
          canonicalCapability: route.capability,
          acceptedSourceCount: acceptedSourceIds.length,
        });
        return delegated;
      }
      context.emit({
        phase: 'pref_proxy_retrieval_only',
        canonicalCapability: route.capability,
        reason: 'agent_evidence_not_accepted',
      });
      return materializeRetrievalOnlyTurn(
        input,
        result,
        'No schema-valid agent interpretation cited the current-turn sources.',
      );
    } catch (error: unknown) {
      if (context.signal.aborted) {
        throw context.signal.reason instanceof Error ? context.signal.reason : error;
      }
      const publicError = publicCodexError(error);
      context.emit({
        phase: 'pref_proxy_retrieval_only',
        canonicalCapability: route.capability,
        reason: publicError.code,
      });
      return materializeRetrievalOnlyTurn(
        input,
        result,
        'The agent synthesis boundary failed after canonical source retrieval.',
      );
    }
  }

  #track(
    result: MaybePromise<CodexTurnResult<ScriptedFixtureTurn>>,
  ): MaybePromise<CodexTurnResult<ScriptedFixtureTurn>> {
    if (isPromiseLike(result)) {
      return result.catch((error: unknown) => {
        const publicError = publicCodexError(error);
        this.#lastError = publicError.message;
        throw publicError;
      });
    }
    return result;
  }
}

export function createPrefAgentProxyDriver(
  options: CreatePrefAgentProxyDriverOptions,
): PrefAgentProxyDriver {
  return new PrefAgentProxyDriver(options);
}
