import agentTurnOutputSchema from '../../../schemas/agent-turn-output.codex.schema.json' with { type: 'json' };

import type {
  AgentTurnInput,
  AgentTurnOutput,
  ExpeditionFixture,
  SourceRecord,
} from '@signal-atlas/contracts';
import {
  CodexUnavailableFallbackDriver,
  LocalCodexExecDriver,
  type CodexDriver,
  type CodexProcessRunner,
  type CodexPromptSource,
  type CodexTurnPromptContext,
  type LocalCodexTurnMetadata,
} from '@signal-atlas/codex-runtime';

import {
  createFixtureCodexDriver,
  createScriptedFixtureTurn,
  type FixtureMissionScenario,
  type ScriptedFixtureTurn,
} from './fixture-mission-driver.js';

export type CodexMissionMode = 'scripted' | 'local';

export interface CreateConfiguredMissionDriverOptions {
  mode?: CodexMissionMode;
  executable?: string;
  model?: string;
  runtimeRoot?: string;
  environment?: NodeJS.ProcessEnv;
  processRunner?: CodexProcessRunner;
  isAvailable?: (executable: string, environment: NodeJS.ProcessEnv) => boolean;
}

function promptSource(source: SourceRecord): CodexPromptSource {
  return {
    id: source.id,
    title: source.title,
    sourceClass: source.sourceClass,
    retrievedAt: source.retrievedAt,
    ...(source.publisher ? { publisher: source.publisher } : {}),
    ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
    ...(source.observedAt ? { observedAt: source.observedAt } : {}),
    ...(source.excerpt ? { excerpt: source.excerpt } : {}),
  };
}

function publicBehavior(role: string): string {
  switch (role) {
    case 'scout':
      return 'Be concise, curious, and specific about what was directly observed.';
    case 'archivist':
      return 'Be concise, source-conscious, and explicit about historical comparability.';
    case 'analyst':
      return 'Be concise, quantitative, and careful not to overstate directional evidence.';
    case 'skeptic':
      return 'Be concise, challenge unsupported leaps, and name unresolved alternatives.';
    case 'liaison':
      return 'Be concise, preserve disagreements, and distinguish shared from private knowledge.';
    default:
      return 'Be concise, evidence-linked, and explicit about unknowns.';
  }
}

function contextForTurn(fixture: ExpeditionFixture, input: AgentTurnInput): CodexTurnPromptContext {
  const agent = fixture.agents.find((candidate) => candidate.id === input.agentId);
  const place = fixture.worldManifest.places.find(
    (candidate) => candidate.id === input.effectivePlaceId,
  );
  const scriptKey = `${input.agentId}:${input.mission.verb}:${input.effectivePlaceId}`;
  const script = fixture.scriptedMissionResults[scriptKey];
  const sourceIds = new Set(script?.sourceIds ?? []);
  const sources = fixture.sources.filter((source) => sourceIds.has(source.id)).map(promptSource);
  const knownSignalIds = new Set(input.knownSignalIds);
  const signals = fixture.signals
    .filter((signal) => knownSignalIds.has(signal.id))
    .map((signal) => ({
      id: signal.id,
      headline: signal.headline,
      summary: signal.summary,
      sourceIds: [...signal.sourceIds],
      status: signal.status,
    }));

  return {
    role: {
      name: agent?.displayName ?? input.agentId,
      title: agent?.role ?? 'agent',
      publicBehavior: publicBehavior(agent?.role ?? ''),
    },
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
    sources,
    signals,
  };
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

function materializeLocalTurn(
  fixture: ExpeditionFixture,
  input: AgentTurnInput,
  output: AgentTurnOutput,
  metadata: LocalCodexTurnMetadata,
): ScriptedFixtureTurn {
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
    outputSchema: agentTurnOutputSchema as Record<string, unknown>,
    promptContext: (input) => contextForTurn(fixture, input),
    materializeArtifacts: (input, output, metadata) =>
      materializeLocalTurn(fixture, input, output, metadata),
    validateOutput: (input, output, promptContext) => {
      if (promptContext.sources.length === 0) return [];
      if (output.action.type === 'wait') return [];
      return output.sourceIdsUsed.length === 0
        ? ['sourceIdsUsed: an evidence-producing fixture mission must cite a supplied source.']
        : [];
    },
    ...(options.executable ? { executable: options.executable } : {}),
    ...(options.model ? { model: options.model } : {}),
    ...(options.runtimeRoot ? { runtimeRoot: options.runtimeRoot } : {}),
    ...(options.environment ? { environment: options.environment } : {}),
    ...(options.processRunner ? { processRunner: options.processRunner } : {}),
    ...(options.isAvailable ? { isAvailable: options.isAvailable } : {}),
  });
  return new CodexUnavailableFallbackDriver({ primary: local, fallback: scripted });
}
