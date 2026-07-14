import type { ProbabilityDistribution } from '@signal-atlas/contracts';

import { IllegalTransitionError } from './errors.js';

export interface BrierScoreResult {
  brierScore: number;
  components: Record<string, number>;
}

/**
 * Calculate the multiclass Brier score used by Signal Atlas.
 *
 * Each outcome contributes `(forecast - observation)²`; the resolved outcome has an
 * observation of one and every other outcome has an observation of zero. The unscaled
 * sum has a best value of 0 and a worst value of 2, matching the event contract.
 */
export function calculateBrierScore(
  probabilities: ProbabilityDistribution,
  resolvedOutcomeId: string,
): BrierScoreResult {
  if (!Object.hasOwn(probabilities, resolvedOutcomeId)) {
    throw new IllegalTransitionError(
      `Resolved outcome ${resolvedOutcomeId} is absent from the forecast distribution.`,
    );
  }

  const components: Record<string, number> = {};
  let brierScore = 0;
  for (const [outcomeId, probability] of Object.entries(probabilities)) {
    const observation = outcomeId === resolvedOutcomeId ? 1 : 0;
    const component = (probability - observation) ** 2;
    components[outcomeId] = component;
    brierScore += component;
  }

  return { brierScore, components };
}
