import type { MissionVerb, Place } from '@signal-atlas/contracts';
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

interface MissionArchetypeRule {
  archetype: Place['archetype'];
  terms: readonly string[];
  defaultVerb: MissionVerb;
}

const archetypeRules: readonly MissionArchetypeRule[] = [
  {
    archetype: 'weather_tower',
    terms: ['weather', 'wind', 'forecast', 'advisory', 'conditions', 'weather tower'],
    defaultVerb: 'observe_conditions',
  },
  {
    archetype: 'archive',
    terms: ['archive', 'history', 'historical', 'base rate', 'prior cases', 'case file'],
    defaultVerb: 'search_history',
  },
  {
    archetype: 'newsroom',
    terms: ['newsroom', 'news', 'notice', 'bulletin', 'reporting'],
    defaultVerb: 'verify',
  },
  {
    archetype: 'professor',
    terms: ['professor', 'correlation', 'scholar', 'challenge evidence'],
    defaultVerb: 'consult_professor',
  },
  {
    archetype: 'town_square',
    terms: ['town square', 'public square', 'meeting', 'meet', 'exchange evidence'],
    defaultVerb: 'meet_agent',
  },
  {
    archetype: 'observatory',
    terms: ['observatory', 'home base'],
    defaultVerb: 'reassess_forecast',
  },
  {
    archetype: 'exchange',
    terms: ['exchange', 'market board', 'market data', 'market context'],
    defaultVerb: 'investigate',
  },
  {
    archetype: 'field_site',
    terms: ['field site', 'site visit', 'on site', 'inspection'],
    defaultVerb: 'investigate',
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
 * Deliberately small, browser-safe fixture adapter. It never submits a mission and therefore
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

  const namedPlaceIds = projection.worldManifest.places
    .filter((place) => {
      const name = place.name.toLocaleLowerCase('en-US');
      return includesTerm(text, name) || includesTerm(text, place.id.replaceAll('-', ' '));
    })
    .map((place) => place.id);
  const semanticPlaceIds = projection.worldManifest.places
    .filter((place) => {
      const rule = archetypeRules.find((candidate) => candidate.archetype === place.archetype);
      if (!rule) return false;
      return (
        rule.terms.some((term) => includesTerm(text, term)) ||
        place.tags.some((tag) => includesTerm(text, tag.toLocaleLowerCase('en-US')))
      );
    })
    .map((place) => place.id);
  const candidatePlaceIds = unique([...namedPlaceIds, ...semanticPlaceIds]);

  const assignedAgentId = candidateAgentIds.length === 1 ? candidateAgentIds[0] : undefined;
  const destinationPlaceId = candidatePlaceIds.length === 1 ? candidatePlaceIds[0] : undefined;
  const destination = destinationPlaceId
    ? projection.worldManifest.places.find((place) => place.id === destinationPlaceId)
    : undefined;
  const destinationRule = destination
    ? archetypeRules.find((rule) => rule.archetype === destination.archetype)
    : undefined;
  const defaultVerb = destinationRule?.defaultVerb ?? destination?.missionVerbs[0];
  const verb = inferVerb(text, defaultVerb);
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
