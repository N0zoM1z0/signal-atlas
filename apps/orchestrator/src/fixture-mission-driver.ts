import type {
  Claim,
  ExpeditionFixture,
  Mission,
  ScriptedMissionResult,
  Signal,
  SourceRecord,
} from '@signal-atlas/contracts';
import { canonicalHash } from '@signal-atlas/simulation';

export const fixtureMissionScenarios = [
  'success',
  'no_result',
  'timeout',
  'invalid_result',
] as const;

export type FixtureMissionScenario = (typeof fixtureMissionScenarios)[number];

export interface ScriptedFixtureTurn {
  scenario: FixtureMissionScenario;
  scriptKey: string;
  attempt: number;
  latencyMs: number;
  callId: string;
  turnId: string;
  capability: string;
  argumentsHash: string;
  sources: SourceRecord[];
  claims: Claim[];
  signals: Signal[];
  dialogue: string;
  suggestedFollowUp?: ScriptedMissionResult['suggestedFollowUp'];
}

export interface CreateScriptedFixtureTurnOptions {
  mission: Mission;
  effectivePlaceId: string;
  attempt: number;
  scenario: FixtureMissionScenario;
}

function cloneByIds<T extends { id: string }>(values: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(values.map((value) => [value.id, value]));
  return ids.flatMap((id) => {
    const value = byId.get(id);
    return value ? [structuredClone(value)] : [];
  });
}

function failureDialogue(scenario: Exclude<FixtureMissionScenario, 'success'>): string {
  switch (scenario) {
    case 'no_result':
      return 'I completed the search, but found no source strong enough to record. A narrower follow-up may help.';
    case 'timeout':
      return 'The source request timed out before I could verify evidence. This turn can be retried.';
    case 'invalid_result':
      return 'The source response failed validation, so I recorded no evidence. This turn can be retried safely.';
  }
}

/**
 * Resolve one offline fixture turn without invoking Codex or Pref.
 *
 * The fixture seed and mission identity influence stable audit identifiers, while the authored
 * script supplies latency and evidence. A missing authored script degrades to a valid no-result
 * turn instead of leaking fixture-specific branching into the application UI.
 */
export function createScriptedFixtureTurn(
  fixture: ExpeditionFixture,
  options: CreateScriptedFixtureTurnOptions,
): ScriptedFixtureTurn {
  const { mission, effectivePlaceId, attempt } = options;
  const scriptKey = `${mission.assignedAgentId}:${mission.verb}:${effectivePlaceId}`;
  const scripted = fixture.scriptedMissionResults[scriptKey];
  const scenario = scripted ? options.scenario : 'no_result';
  const identity = canonicalHash({
    seed: fixture.seed,
    missionId: mission.id,
    scriptKey,
    attempt,
  }).slice('sha256:'.length);
  const idSuffix = identity.slice(0, 16);
  const sources =
    scenario === 'success' && scripted ? cloneByIds(fixture.sources, scripted.sourceIds) : [];
  const claims =
    scenario === 'success' && scripted ? cloneByIds(fixture.claims, scripted.claimIds) : [];
  const signals =
    scenario === 'success' && scripted ? cloneByIds(fixture.signals, scripted.signalIds) : [];

  return {
    scenario,
    scriptKey,
    attempt,
    latencyMs: scripted?.latencyMs ?? 800,
    callId: `call-fixture-${idSuffix}`,
    turnId: `turn-fixture-${idSuffix}`,
    capability: sources[0]?.provenance.primitiveName ?? `fixture.mission.${mission.verb}`,
    argumentsHash: identity,
    sources,
    claims,
    signals,
    dialogue:
      scenario === 'success'
        ? (scripted?.dialogue ?? failureDialogue('no_result'))
        : failureDialogue(scenario),
    ...(scenario === 'success' && scripted?.suggestedFollowUp
      ? { suggestedFollowUp: structuredClone(scripted.suggestedFollowUp) }
      : {}),
  };
}
