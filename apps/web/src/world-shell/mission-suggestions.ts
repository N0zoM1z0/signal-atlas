import type { MissionVerb } from '@signal-atlas/contracts';

import type { ShellPlace } from './model.js';

export interface MissionSuggestion {
  objective: string;
  placeName: string;
  title: string;
}

const verbPriority: Record<MissionVerb, number> = {
  observe_conditions: 0,
  investigate: 1,
  search_history: 2,
  verify: 3,
  compare_sources: 4,
  find_contradiction: 5,
  consult_professor: 6,
  meet_agent: 7,
  deliver_signal: 8,
  reassess_forecast: 9,
};

function preferredVerb(place: ShellPlace): MissionVerb | undefined {
  return [...place.missionVerbs].sort((left, right) => verbPriority[left] - verbPriority[right])[0];
}

function suggestionCopy(
  verb: MissionVerb,
  placeName: string,
): Omit<MissionSuggestion, 'placeName'> {
  switch (verb) {
    case 'investigate':
      return {
        objective: `Investigate the latest evidence at ${placeName}`,
        title: 'Investigate latest evidence',
      };
    case 'verify':
      return {
        objective: `Verify the strongest available claim at ${placeName}`,
        title: 'Verify a claim',
      };
    case 'search_history':
      return {
        objective: `Search historical records at ${placeName}`,
        title: 'Search historical records',
      };
    case 'find_contradiction':
      return {
        objective: `Find contradictory reporting at ${placeName}`,
        title: 'Find contradictions',
      };
    case 'compare_sources':
      return {
        objective: `Compare independent sources at ${placeName}`,
        title: 'Compare sources',
      };
    case 'observe_conditions':
      return {
        objective: `Check current conditions at ${placeName}`,
        title: 'Check current conditions',
      };
    case 'meet_agent':
      return { objective: `Convene the team at ${placeName}`, title: 'Convene the team' };
    case 'deliver_signal':
      return {
        objective: `Deliver the strongest signal to ${placeName}`,
        title: 'Deliver a signal',
      };
    case 'reassess_forecast':
      return {
        objective: `Reassess the team forecast at ${placeName}`,
        title: 'Reassess forecast',
      };
    case 'consult_professor':
      return {
        objective: `Request an independent evidence review at ${placeName}`,
        title: 'Request evidence review',
      };
  }
}

export function missionSuggestionsForPlaces(places: readonly ShellPlace[]): MissionSuggestion[] {
  return places
    .flatMap((place) => {
      const verb = preferredVerb(place);
      return verb ? [{ ...suggestionCopy(verb, place.name), placeName: place.name, verb }] : [];
    })
    .sort((left, right) => verbPriority[left.verb] - verbPriority[right.verb])
    .map(({ verb: _verb, ...suggestion }) => suggestion);
}
