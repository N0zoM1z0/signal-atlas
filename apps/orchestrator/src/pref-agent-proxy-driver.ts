import {
  AgentTurnOutputSchema,
  ClaimSchema,
  SignalSchema,
  type AgentTurnInput,
  type AgentTurnOutput,
  type ExpeditionFixture,
  type Signal,
} from '@signal-atlas/contracts';
import {
  CodexDriverError,
  isPromiseLike,
  type CodexDriver,
  type CodexDriverContext,
  type CodexDriverDiagnostics,
  type CodexTurnResult,
  type MaybePromise,
} from '@signal-atlas/codex-runtime';
import {
  PrefGatewayError,
  prefHash,
  type PrefCapabilityResult,
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

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Resolve the explicit real-world proxy mapping authored on the weather-tower binding. */
export function resolvePrefWeatherProxyConfiguration(
  fixture: ExpeditionFixture,
): PrefWeatherProxyConfiguration {
  const place = fixture.worldManifest.places.find((candidate) => candidate.id === 'weather-tower');
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
      'not an observation of fictional Galehaven or Helios-3',
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
    }Real-world ${proxy.displayLabel} context only; it does not measure fictional Galehaven and supports neither market outcome.`,
    direction: 'context',
    impact: { label: 'unknown' },
    reliability: {
      label: 'unverified',
      reasons: [
        'The payload matched the approved Preference weather contract.',
        'The observation is for a disclosed real-world proxy, not fictional Galehaven.',
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
    ? `I could only recover a stale cached observation for the ${proxy.displayLabel}. It is real-world proxy context, not Galehaven evidence, so I made no market-direction claim.`
    : `I checked the ${proxy.displayLabel}: ${conditionsSentence(evidence)}. This is a disclosed real-world proxy, not Galehaven evidence, so it carries no market direction or probability impact.`;
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
      'Recorded the validated live weather result as disclosed proxy context without changing the fictional market forecast.',
    assumptions: [
      `${proxy.displayLabel} is configured only as an interface-testing proxy for ${proxy.fictionalPlaceName}.`,
    ],
    unknowns: [
      'Actual conditions at fictional Galehaven remain unknown.',
      'This real-world observation establishes no direction or probability impact for Helios-3.',
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
      capability: source.provenance.primitiveName,
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
  readonly #proxy: PrefWeatherProxyConfiguration;
  #runs = 0;
  #lastRunAt: string | undefined;
  #lastError: string | undefined;

  constructor(options: CreatePrefAgentProxyDriverOptions) {
    this.#fixture = structuredClone(options.fixture);
    this.#gateway = options.gateway;
    this.#fallback = options.fallback;
    this.#proxy = structuredClone(
      options.proxy ?? resolvePrefWeatherProxyConfiguration(options.fixture),
    );
  }

  runTurn(
    input: AgentTurnInput,
    context: CodexDriverContext,
  ): MaybePromise<CodexTurnResult<ScriptedFixtureTurn>> {
    this.#runs += 1;
    this.#lastRunAt = new Date().toISOString();
    this.#lastError = undefined;
    if (
      input.mission.verb !== 'observe_conditions' ||
      !input.allowedCapabilities.includes('local_conditions')
    ) {
      return this.#track(this.#fallback.runTurn(input, context));
    }
    return this.#track(this.#runLiveWeather(input, context));
  }

  diagnostics(): CodexDriverDiagnostics {
    return {
      id: this.id,
      kind: this.kind,
      available: true,
      description:
        'Approved Pref evidence proxy with a delegated Codex or fixture fallback for non-weather missions.',
      runs: this.#runs,
      ...(this.#lastRunAt ? { lastRunAt: this.#lastRunAt } : {}),
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
    };
  }

  async #runLiveWeather(
    input: AgentTurnInput,
    context: CodexDriverContext,
  ): Promise<CodexTurnResult<ScriptedFixtureTurn>> {
    context.emit({
      phase: 'pref_proxy_started',
      canonicalCapability: 'local_conditions',
      proxyLabel: this.#proxy.displayLabel,
    });
    try {
      const result = await this.#gateway.invokeCanonicalCapability(
        'local_conditions',
        { location: { label: this.#proxy.providerLocation } },
        {
          expeditionId: input.expeditionId,
          missionId: input.mission.id,
          agentId: input.agentId,
          correlationId: input.turnId,
          deadlineAt: context.deadlineAt,
          signal: context.signal,
        },
      );
      const turn = materializeLiveWeatherTurn(this.#fixture, input, result, this.#proxy);
      context.emit({
        phase: 'pref_proxy_completed',
        canonicalCapability: 'local_conditions',
        primitive: turn.artifacts?.capability ?? 'unknown',
        cacheStatus: result.cache.status,
        sourceCount: result.sources.length,
      });
      return turn;
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
  }

  #track(
    result: MaybePromise<CodexTurnResult<ScriptedFixtureTurn>>,
  ): MaybePromise<CodexTurnResult<ScriptedFixtureTurn>> {
    if (isPromiseLike(result)) {
      return result.catch((error: unknown) => {
        this.#lastError = error instanceof Error ? error.message : 'The agent proxy failed.';
        throw error;
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
