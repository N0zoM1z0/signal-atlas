import type { AgentTurnInput, AgentTurnOutput, ExpeditionFixture } from '@signal-atlas/contracts';
import { AgentTurnOutputSchema } from '@signal-atlas/contracts';
import { ScriptedCodexDriver, type CodexDriver } from '@signal-atlas/codex-runtime';
import {
  createScriptedFixtureTurn,
  type FixtureMissionScenario,
  type ScriptedFixtureTurn,
} from '@signal-atlas/fixture-runtime';

export {
  createScriptedFixtureTurn,
  fixtureMissionScenarios,
  type CreateScriptedFixtureTurnOptions,
  type FixtureMissionScenario,
  type ScriptedFixtureTurn,
} from '@signal-atlas/fixture-runtime';

function agentTurnOutput(input: AgentTurnInput, turn: ScriptedFixtureTurn): AgentTurnOutput {
  const claimIndexById = new Map(turn.claims.map((claim, index) => [claim.id, index]));
  const output = {
    schemaVersion: 1,
    agentId: input.agentId,
    missionId: input.mission.id,
    action:
      turn.scenario === 'success'
        ? {
            type: 'investigate' as const,
            capability: input.allowedCapabilities[0] ?? turn.capability,
            query: input.mission.objective,
          }
        : {
            type: 'wait' as const,
            reason: turn.dialogue,
          },
    publicDialogue: turn.dialogue,
    sourceIdsUsed: turn.sources.map((source) => source.id),
    proposedClaims: turn.claims.map((claim) => ({
      text: claim.text,
      sourceIds: [...claim.sourceIds],
      qualifiers: [...claim.qualifiers],
    })),
    proposedSignals: turn.signals.map((signal) => ({
      headline: signal.headline,
      summary: signal.summary,
      claimIndexes: signal.claimIds.flatMap((claimId) => {
        const index = claimIndexById.get(claimId);
        return index === undefined ? [] : [index];
      }),
      sourceIds: [...signal.sourceIds],
      direction: signal.direction,
      ...(signal.targetOutcomeId ? { targetOutcomeId: signal.targetOutcomeId } : {}),
      impactLabel: signal.impact.label,
    })),
    rationale:
      turn.scenario === 'success'
        ? `Used the authored ${turn.scriptKey} fixture result within the mission boundary.`
        : 'No validated fixture evidence was available, so the turn chose a safe wait.',
    assumptions:
      turn.scenario === 'success'
        ? ['Fixture evidence remains subject to its recorded freshness and reliability limits.']
        : [],
    unknowns:
      turn.scenario === 'success'
        ? ['The authored evidence is directional and does not establish the market outcome.']
        : ['No validated evidence entered the world from this turn.'],
    ...(turn.suggestedFollowUp
      ? { suggestedFollowUp: structuredClone(turn.suggestedFollowUp) }
      : {}),
  };
  return AgentTurnOutputSchema.parse(output);
}

/** Build the offline driver used by the orchestrator through the replaceable Codex boundary. */
export function createFixtureCodexDriver(
  fixture: ExpeditionFixture,
  scenario: () => FixtureMissionScenario,
): CodexDriver<AgentTurnInput, ScriptedFixtureTurn> {
  return new ScriptedCodexDriver({
    id: 'fixture-scripted-codex',
    description: 'Deterministic authored-scenario mission driver.',
    run: (input, context) => {
      if (context.signal.aborted) throw context.signal.reason;
      const turn = createScriptedFixtureTurn(fixture, {
        mission: input.mission,
        effectivePlaceId: input.effectivePlaceId,
        attempt: input.attempt,
        scenario: scenario(),
        turnId: input.turnId,
      });
      context.emit({
        phase: 'script_selected',
        scenario: turn.scenario,
        scriptKey: turn.scriptKey,
      });
      return { output: agentTurnOutput(input, turn), artifacts: turn };
    },
  });
}
