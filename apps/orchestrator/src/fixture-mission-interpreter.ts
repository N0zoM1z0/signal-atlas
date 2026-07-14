import type { MissionVerb } from '@signal-atlas/contracts';
import type { WorldProjection } from '@signal-atlas/simulation';

export interface MissionDraftInterpretation {
  status: 'ready' | 'ambiguous';
  objective: string;
  assignedAgentId?: string;
  destinationPlaceId?: string;
  verb?: MissionVerb;
  candidateAgentIds: string[];
  candidatePlaceIds: string[];
  missing: Array<'agent' | 'destination' | 'verb'>;
  explanation: string;
}

interface MissionAliasRule {
  placeId: string;
  terms: readonly string[];
  defaultVerb: MissionVerb;
}

const fixtureAliasRules: readonly MissionAliasRule[] = [
  {
    placeId: 'weather-tower',
    terms: ['weather', 'wind', 'crosswind', 'forecast', 'advisory', 'weather tower', 'galehaven'],
    defaultVerb: 'observe_conditions',
  },
  {
    placeId: 'archive',
    terms: ['archive', 'history', 'historical', 'base rate', 'prior delay', 'case file'],
    defaultVerb: 'search_history',
  },
  {
    placeId: 'newsroom',
    terms: ['newsroom', 'news', 'operations notice', 'launch notice', 'reporting'],
    defaultVerb: 'verify',
  },
  {
    placeId: 'professor',
    terms: ['professor', 'correlation', 'scholar', 'challenge evidence'],
    defaultVerb: 'consult_professor',
  },
  {
    placeId: 'square',
    terms: ['lantern square', 'town square', 'meeting', 'meet'],
    defaultVerb: 'meet_agent',
  },
  {
    placeId: 'observatory',
    terms: ['observatory', 'home base'],
    defaultVerb: 'reassess_forecast',
  },
] as const;

function includesTerm(text: string, term: string): boolean {
  return text.includes(term);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function inferVerb(text: string, placeVerb: MissionVerb | undefined): MissionVerb | undefined {
  if (includesTerm(text, 'contradiction') || includesTerm(text, 'dispute')) {
    return 'find_contradiction';
  }
  if (includesTerm(text, 'compare')) return 'compare_sources';
  if (includesTerm(text, 'deliver') || includesTerm(text, 'share')) return 'deliver_signal';
  if (includesTerm(text, 'reassess') || includesTerm(text, 'update forecast')) {
    return 'reassess_forecast';
  }
  if (includesTerm(text, 'verify')) return 'verify';
  if (includesTerm(text, 'investigate')) return 'investigate';
  return placeVerb;
}

/**
 * Deliberately small, deterministic fixture adapter. It never submits a mission and therefore
 * cannot turn an uncertain phrase into authoritative state without player confirmation.
 */
export function interpretFixtureMission(
  textInput: string,
  projection: WorldProjection,
  selectedAgentId?: string,
): MissionDraftInterpretation {
  const objective = textInput.trim().replace(/\s+/g, ' ');
  const text = objective.toLocaleLowerCase('en-US');

  const mentionedAgentIds = Object.values(projection.agentsById)
    .filter((agent) => includesTerm(text, agent.displayName.toLocaleLowerCase('en-US')))
    .map((agent) => agent.id);
  const hintedAgentId =
    selectedAgentId && projection.agentsById[selectedAgentId] ? selectedAgentId : undefined;
  const candidateAgentIds = unique(
    mentionedAgentIds.length > 0 ? mentionedAgentIds : hintedAgentId ? [hintedAgentId] : [],
  );

  const knownPlaceIds = new Set(projection.worldManifest.places.map((place) => place.id));
  const namedPlaceIds = projection.worldManifest.places
    .filter((place) => {
      const name = place.name.toLocaleLowerCase('en-US');
      return includesTerm(text, name) || includesTerm(text, place.id.replaceAll('-', ' '));
    })
    .map((place) => place.id);
  const aliasedRules = fixtureAliasRules.filter(
    (rule) =>
      knownPlaceIds.has(rule.placeId) && rule.terms.some((term) => includesTerm(text, term)),
  );
  const candidatePlaceIds = unique([...namedPlaceIds, ...aliasedRules.map((rule) => rule.placeId)]);

  const assignedAgentId = candidateAgentIds.length === 1 ? candidateAgentIds[0] : undefined;
  const destinationPlaceId = candidatePlaceIds.length === 1 ? candidatePlaceIds[0] : undefined;
  const destinationRule = aliasedRules.find((rule) => rule.placeId === destinationPlaceId);
  const verb = inferVerb(text, destinationRule?.defaultVerb);
  const destination = destinationPlaceId
    ? projection.worldManifest.places.find((place) => place.id === destinationPlaceId)
    : undefined;
  const supportedVerb = verb && destination?.missionVerbs.includes(verb) ? verb : undefined;

  const missing: MissionDraftInterpretation['missing'] = [];
  if (!assignedAgentId) missing.push('agent');
  if (!destinationPlaceId) missing.push('destination');
  if (!supportedVerb) missing.push('verb');
  const status = missing.length === 0 ? 'ready' : 'ambiguous';

  return {
    status,
    objective,
    ...(assignedAgentId ? { assignedAgentId } : {}),
    ...(destinationPlaceId ? { destinationPlaceId } : {}),
    ...(supportedVerb ? { verb: supportedVerb } : {}),
    candidateAgentIds,
    candidatePlaceIds,
    missing,
    explanation:
      status === 'ready'
        ? 'The fixture parser found one agent, one supported destination, and one mission verb.'
        : `Confirmation is blocked until these fields are resolved: ${missing.join(', ')}.`,
  };
}
