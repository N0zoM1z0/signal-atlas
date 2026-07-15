import { homedir } from 'node:os';
import { join } from 'node:path';

import agentTurnOutputSchema from '../../../schemas/agent-turn-output.codex.schema.json' with { type: 'json' };

import {
  ClaimSchema,
  SignalSchema,
  binaryMarketOutcomes,
  type AgentTurnInput,
  type AgentTurnOutput,
  type ExpeditionFixture,
  type Market,
} from '@signal-atlas/contracts';
import {
  buildKnowledgePacket,
  CodexUnavailableFallbackDriver,
  getAgentRoleProfile,
  JsonlAgentSessionRegistry,
  LocalCodexExecDriver,
  type AgentSessionRegistry,
  type CodexDriver,
  type CodexProcessRunner,
  type CodexTurnPromptContext,
  type LocalCodexTurnMetadata,
} from '@signal-atlas/codex-runtime';
import { canonicalHash } from '@signal-atlas/simulation';

import {
  createFixtureCodexDriver,
  createScriptedFixtureTurn,
  type FixtureMissionScenario,
  type ScriptedFixtureTurn,
} from './fixture-mission-driver.js';

export type CodexMissionMode = 'scripted' | 'local';

export function defaultCodexRuntimeRoot(): string {
  return join(homedir(), '.local', 'state', 'signal-atlas', 'codex-runtime');
}

export interface CreateConfiguredMissionDriverOptions {
  mode?: CodexMissionMode;
  executable?: string;
  model?: string;
  runtimeRoot?: string;
  environment?: NodeJS.ProcessEnv;
  processRunner?: CodexProcessRunner;
  isAvailable?: (executable: string, environment: NodeJS.ProcessEnv) => boolean;
  sessionRegistry?: AgentSessionRegistry;
}

function schemaRecord(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`The Codex output schema is missing ${context}.`);
  }
  return value as Record<string, unknown>;
}

/** Create a strict binary transport schema using the market's exact authored outcome IDs. */
export function codexAgentTurnOutputSchemaForMarket(market: Market): Record<string, unknown> {
  const schema = structuredClone(agentTurnOutputSchema) as Record<string, unknown>;
  const definitions = schemaRecord(schema['$defs'], '$defs');
  const distribution = schemaRecord(
    definitions['probabilityDistribution'],
    '$defs.probabilityDistribution',
  );
  const uncertainty = schemaRecord(definitions['uncertainty'], '$defs.uncertainty');
  const { primary, secondary } = binaryMarketOutcomes(market);
  const outcomeIds = [primary.id, secondary.id];
  distribution['properties'] = Object.fromEntries(
    outcomeIds.map((outcomeId) => [outcomeId, { $ref: '#/$defs/probability' }]),
  );
  distribution['required'] = outcomeIds;
  uncertainty['properties'] = Object.fromEntries(
    outcomeIds.map((outcomeId) => [outcomeId, { $ref: '#/$defs/probabilityRange' }]),
  );
  uncertainty['required'] = outcomeIds;
  return schema;
}

export function buildFixtureCodexPromptContext(
  fixture: ExpeditionFixture,
  input: AgentTurnInput,
): CodexTurnPromptContext {
  const agent = fixture.agents.find((candidate) => candidate.id === input.agentId);
  if (!agent) throw new Error(`Cannot build a Codex packet for unknown agent ${input.agentId}.`);
  const place = fixture.worldManifest.places.find(
    (candidate) => candidate.id === input.effectivePlaceId,
  );
  const scriptKey = `${input.agentId}:${input.mission.verb}:${input.effectivePlaceId}`;
  const script = fixture.scriptedMissionResults[scriptKey];
  const currentTurnEvidence = input.currentTurnEvidence;
  const archiveAccess =
    !currentTurnEvidence &&
    place?.archetype === 'archive' &&
    (input.mission.verb === 'search_history' || input.mission.verb === 'compare_sources');
  const archiveSourceIds = archiveAccess
    ? fixture.sources
        .filter((source) => source.sourceClass === 'archive')
        .map((source) => source.id)
    : [];
  const archiveSourceIdSet = new Set(archiveSourceIds);
  const archiveSignalIds = archiveAccess
    ? fixture.signals
        .filter((signal) => signal.sourceIds.some((sourceId) => archiveSourceIdSet.has(sourceId)))
        .map((signal) => signal.id)
    : [];
  const sourceById = new Map(fixture.sources.map((source) => [source.id, source]));
  for (const source of currentTurnEvidence?.sources ?? []) {
    const existing = sourceById.get(source.id);
    if (existing && canonicalHash(existing) !== canonicalHash(source)) {
      throw new Error(`Current-turn source ${source.id} conflicts with authored source identity.`);
    }
    sourceById.set(source.id, source);
  }
  const knowledge = buildKnowledgePacket({
    sources: [...sourceById.values()],
    signals: fixture.signals,
    knownSourceIds: input.knownSourceIds,
    knownSignalIds: input.knownSignalIds,
    currentTurnSourceIds:
      currentTurnEvidence?.sources.map((source) => source.id) ?? script?.sourceIds ?? [],
    ...(currentTurnEvidence ? { currentTurnEvidenceFacts: currentTurnEvidence.facts } : {}),
    ...(archiveAccess
      ? {
          archiveGrant: {
            placeId: input.effectivePlaceId,
            missionVerb: input.mission.verb,
            sourceIds: archiveSourceIds,
            signalIds: archiveSignalIds,
          },
        }
      : {}),
  });

  return {
    role: { name: agent.displayName },
    profile: getAgentRoleProfile(agent.role, agent.profileVersion),
    market: {
      question: fixture.market.question,
      outcomeIds: fixture.market.outcomes.map((outcome) => outcome.id),
      resolutionRules: fixture.market.resolutionRules,
    },
    place: {
      id: input.effectivePlaceId,
      name: place?.name ?? input.effectivePlaceId,
      description: place?.description ?? 'No additional place description is available.',
    },
    knowledge,
  };
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

function validateFixtureEvidence(
  fixture: ExpeditionFixture,
  input: AgentTurnInput,
  output: AgentTurnOutput,
  promptContext: CodexTurnPromptContext,
): string[] {
  if (input.currentTurnEvidence) {
    const currentSourceIds = new Set(
      input.currentTurnEvidence.sources
        .map((source) => source.id)
        .filter((sourceId) =>
          promptContext.knowledge.sources.some((source) => source.id === sourceId),
        ),
    );
    if (currentSourceIds.size === 0) return [];
    const errors: string[] = [];
    if (output.action.type === 'wait') {
      errors.push(
        `action.type: current-turn ${input.currentTurnEvidence.capability} evidence was supplied; analyze a usable source instead of waiting.`,
      );
    }
    if (!output.sourceIdsUsed.some((sourceId) => currentSourceIds.has(sourceId))) {
      errors.push('sourceIdsUsed: cite at least one supplied current-turn source.');
    }
    const usedSourceIds = new Set(output.sourceIdsUsed);
    for (const sourceId of output.sourceIdsUsed) {
      if (!currentSourceIds.has(sourceId)) {
        errors.push(
          `sourceIdsUsed: ${sourceId} is not part of the supplied current-turn evidence packet.`,
        );
      }
    }
    for (const [index, claim] of output.proposedClaims.entries()) {
      for (const sourceId of claim.sourceIds) {
        if (!currentSourceIds.has(sourceId)) {
          errors.push(
            `proposedClaims.${index}.sourceIds: ${sourceId} is not part of the supplied current-turn evidence packet.`,
          );
        }
        if (!usedSourceIds.has(sourceId)) {
          errors.push(
            `proposedClaims.${index}.sourceIds: ${sourceId} must also appear in sourceIdsUsed.`,
          );
        }
      }
    }
    for (const [index, signal] of output.proposedSignals.entries()) {
      for (const sourceId of signal.sourceIds) {
        if (!currentSourceIds.has(sourceId)) {
          errors.push(
            `proposedSignals.${index}.sourceIds: ${sourceId} is not part of the supplied current-turn evidence packet.`,
          );
        }
        if (!usedSourceIds.has(sourceId)) {
          errors.push(
            `proposedSignals.${index}.sourceIds: ${sourceId} must also appear in sourceIdsUsed.`,
          );
        }
      }
      for (const claimIndex of signal.claimIndexes) {
        if (!output.proposedClaims[claimIndex]) {
          errors.push(
            `proposedSignals.${index}.claimIndexes: ${claimIndex} does not identify a proposed claim.`,
          );
        }
      }
    }
    if (
      !output.proposedClaims.some((claim) =>
        claim.sourceIds.some((sourceId) => currentSourceIds.has(sourceId)),
      )
    ) {
      errors.push('proposedClaims: ground at least one claim in current-turn evidence.');
    }
    if (
      !output.proposedSignals.some((signal) =>
        signal.sourceIds.some((sourceId) => currentSourceIds.has(sourceId)),
      )
    ) {
      errors.push('proposedSignals: propose at least one source-linked signal.');
    }
    return errors;
  }
  const expected = createScriptedFixtureTurn(fixture, {
    mission: input.mission,
    effectivePlaceId: input.effectivePlaceId,
    attempt: input.attempt,
    scenario: 'success',
    turnId: input.turnId,
  });
  const availableSourceIds = new Set(promptContext.knowledge.sources.map((source) => source.id));
  const requiredSourceIds = expected.sources
    .map((source) => source.id)
    .filter((sourceId) => availableSourceIds.has(sourceId));
  if (requiredSourceIds.length === 0) return [];

  const errors: string[] = [];
  if (output.action.type === 'wait') {
    errors.push(
      `action.type: this authored fixture mission supplied current-turn evidence (${requiredSourceIds.join(', ')}); analyze it instead of waiting.`,
    );
  }
  for (const sourceId of requiredSourceIds) {
    if (!output.sourceIdsUsed.includes(sourceId)) {
      errors.push(`sourceIdsUsed: cite the supplied current-turn source ${sourceId}.`);
    }
  }
  for (const claim of expected.claims) {
    if (!output.proposedClaims.some((candidate) => sameIds(candidate.sourceIds, claim.sourceIds))) {
      errors.push(
        `proposedClaims: include a claim supported by source set ${claim.sourceIds.join(', ')}.`,
      );
    }
  }
  for (const signal of expected.signals) {
    if (
      !output.proposedSignals.some((candidate) => sameIds(candidate.sourceIds, signal.sourceIds))
    ) {
      errors.push(
        `proposedSignals: include a signal supported by source set ${signal.sourceIds.join(', ')}.`,
      );
    }
  }
  return errors;
}

function dynamicArtifactId(prefix: string, value: unknown): string {
  return `${prefix}-${canonicalHash(value).slice('sha256:'.length, 'sha256:'.length + 24)}`;
}

function materializeCurrentTurnEvidence(
  fixture: ExpeditionFixture,
  input: AgentTurnInput,
  output: AgentTurnOutput,
  metadata: LocalCodexTurnMetadata,
): ScriptedFixtureTurn {
  const packet = input.currentTurnEvidence;
  if (!packet) throw new Error('Cannot materialize absent current-turn evidence.');
  const base = {
    scriptKey: `${input.agentId}:pref:${packet.capability}:${input.effectivePlaceId}`,
    attempt: input.attempt,
    latencyMs: packet.durationMs + metadata.durationMs,
    callId: packet.callId,
    turnId: input.turnId,
    capability: packet.capability,
    argumentsHash: packet.argumentsHash,
    dialogue: output.publicDialogue,
    ...(output.suggestedFollowUp
      ? { suggestedFollowUp: structuredClone(output.suggestedFollowUp) }
      : {}),
  };
  if (metadata.safeFallback || output.action.type === 'wait') {
    return {
      ...base,
      scenario: 'no_result',
      sources: [],
      claims: [],
      signals: [],
    };
  }

  const usedSourceIds = new Set(output.sourceIdsUsed);
  const sources = packet.sources.filter((source) => usedSourceIds.has(source.id));
  const claims = output.proposedClaims.map((proposed, index) =>
    ClaimSchema.parse({
      id: dynamicArtifactId('claim-codex', {
        turnId: input.turnId,
        index,
        text: proposed.text,
        sourceIds: proposed.sourceIds,
      }),
      text: proposed.text,
      sourceIds: proposed.sourceIds,
      extractor: { kind: 'agent', id: input.agentId },
      qualifiers: [...proposed.qualifiers, `canonical capability: ${packet.capability}`],
      status: 'active',
      createdAt: packet.retrievedAt,
    }),
  );
  const signals = output.proposedSignals.map((proposed, index) => {
    const linkedClaims = proposed.claimIndexes.map((claimIndex) => claims[claimIndex]!);
    const linkedSources = proposed.sourceIds
      .map((sourceId) => sources.find((source) => source.id === sourceId))
      .filter((source) => source !== undefined);
    const referenceTime =
      linkedSources
        .flatMap((source) => [source.observedAt, source.publishedAt, source.retrievedAt])
        .find((value): value is string => Boolean(value)) ?? packet.retrievedAt;
    return SignalSchema.parse({
      id: dynamicArtifactId('sig-codex', {
        turnId: input.turnId,
        index,
        headline: proposed.headline,
        sourceIds: proposed.sourceIds,
      }),
      marketId: fixture.market.id,
      claimIds: linkedClaims.map((claim) => claim.id),
      sourceIds: proposed.sourceIds,
      headline: proposed.headline,
      summary: proposed.summary,
      direction: proposed.direction,
      ...(proposed.targetOutcomeId ? { targetOutcomeId: proposed.targetOutcomeId } : {}),
      impact: { label: proposed.impactLabel },
      reliability: {
        label: 'unverified',
        reasons: [
          'A schema-constrained agent interpreted orchestrator-selected canonical Pref evidence.',
          'No deterministic impact range was assigned from model output.',
        ],
        assessedBy: { kind: 'system' },
      },
      freshness: {
        referenceTime,
        label: packet.cacheStatus === 'stale' ? 'stale' : 'unknown',
      },
      correlationGroupIds: [],
      discoveredByAgentId: input.agentId,
      createdAt: packet.retrievedAt,
      status: packet.cacheStatus === 'stale' ? 'stale' : 'active',
    });
  });

  return {
    ...base,
    scenario: 'success',
    sources,
    claims,
    signals,
  };
}

function materializeLocalTurn(
  fixture: ExpeditionFixture,
  input: AgentTurnInput,
  output: AgentTurnOutput,
  metadata: LocalCodexTurnMetadata,
): ScriptedFixtureTurn {
  if (input.currentTurnEvidence) {
    return materializeCurrentTurnEvidence(fixture, input, output, metadata);
  }
  const base = createScriptedFixtureTurn(fixture, {
    mission: input.mission,
    effectivePlaceId: input.effectivePlaceId,
    attempt: input.attempt,
    scenario: 'success',
    turnId: input.turnId,
  });
  if (metadata.safeFallback || output.action.type === 'wait') {
    return {
      ...base,
      scenario: 'no_result',
      latencyMs: metadata.durationMs,
      sources: [],
      claims: [],
      signals: [],
      dialogue: output.publicDialogue,
      ...(output.suggestedFollowUp
        ? { suggestedFollowUp: structuredClone(output.suggestedFollowUp) }
        : {}),
    };
  }

  const usedSourceIds = new Set(output.sourceIdsUsed);
  const proposedClaimSourceSets = output.proposedClaims.map((claim) => claim.sourceIds);
  const proposedSignalSourceSets = output.proposedSignals.map((signal) => signal.sourceIds);
  const sources = base.sources.filter((source) => usedSourceIds.has(source.id));
  const claims = base.claims.filter(
    (claim) =>
      claim.sourceIds.every((sourceId) => usedSourceIds.has(sourceId)) &&
      proposedClaimSourceSets.some((sourceIds) => sameIds(sourceIds, claim.sourceIds)),
  );
  const claimIds = new Set(claims.map((claim) => claim.id));
  const signals = base.signals.filter(
    (signal) =>
      signal.sourceIds.every((sourceId) => usedSourceIds.has(sourceId)) &&
      signal.claimIds.every((claimId) => claimIds.has(claimId)) &&
      proposedSignalSourceSets.some((sourceIds) => sameIds(sourceIds, signal.sourceIds)),
  );

  return {
    ...base,
    latencyMs: metadata.durationMs,
    capability: output.action.type === 'investigate' ? output.action.capability : base.capability,
    sources,
    claims,
    signals,
    dialogue: output.publicDialogue,
    ...(output.suggestedFollowUp
      ? { suggestedFollowUp: structuredClone(output.suggestedFollowUp) }
      : {}),
  };
}

/** Select the requested runtime while retaining deterministic behavior when Codex is absent. */
export function createConfiguredMissionDriver(
  fixture: ExpeditionFixture,
  scenario: () => FixtureMissionScenario,
  options: CreateConfiguredMissionDriverOptions = {},
): CodexDriver<AgentTurnInput, ScriptedFixtureTurn> {
  const scripted = createFixtureCodexDriver(fixture, scenario);
  if ((options.mode ?? 'scripted') === 'scripted') return scripted;

  const local = new LocalCodexExecDriver<ScriptedFixtureTurn>({
    id: 'local-codex-cli',
    outputSchema: codexAgentTurnOutputSchemaForMarket(fixture.market),
    promptContext: (input) => buildFixtureCodexPromptContext(fixture, input),
    materializeArtifacts: (input, output, metadata) =>
      materializeLocalTurn(fixture, input, output, metadata),
    validateOutput: (input, output, promptContext) =>
      validateFixtureEvidence(fixture, input, output, promptContext),
    ...(options.executable ? { executable: options.executable } : {}),
    ...(options.model ? { model: options.model } : {}),
    ...(options.runtimeRoot ? { runtimeRoot: options.runtimeRoot } : {}),
    ...(options.environment ? { environment: options.environment } : {}),
    ...(options.processRunner ? { processRunner: options.processRunner } : {}),
    ...(options.isAvailable ? { isAvailable: options.isAvailable } : {}),
    ...(options.sessionRegistry
      ? { sessionRegistry: options.sessionRegistry }
      : options.runtimeRoot
        ? {
            sessionRegistry: new JsonlAgentSessionRegistry(
              join(options.runtimeRoot, 'agent-sessions.jsonl'),
            ),
          }
        : {}),
  });
  return new CodexUnavailableFallbackDriver({ primary: local, fallback: scripted });
}
