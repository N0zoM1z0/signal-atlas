import {
  replayFixture,
  selectLatestForecast,
  type WorldProjection,
} from '@signal-atlas/simulation';
import { createWorldSceneDefinition } from '@signal-atlas/game-scene';
import { helios3ExpeditionFixture } from '@signal-atlas/test-fixtures';

const fixture = helios3ExpeditionFixture;
const replay = replayFixture(fixture);
const projection = replay.projection;
const latestForecast = selectLatestForecast(projection);

const roleLabels = {
  scout: 'Field scout',
  archivist: 'Archivist',
  analyst: 'Analyst',
  skeptic: 'Skeptical analyst',
  liaison: 'Liaison',
} as const;

const archetypeLabels = {
  observatory: 'Home base',
  newsroom: 'Fresh reports',
  weather_tower: 'Wind advisory',
  exchange: 'Market data',
  archive: 'Case files',
  professor: 'Professor available',
  town_square: 'Meeting point',
  field_site: 'Field site',
} as const;

function percentage(value: number | undefined): number {
  return Math.round((value ?? 0) * 100);
}

function sentenceCase(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

const placeById = Object.fromEntries(
  projection.worldManifest.places.map((place) => [place.id, place]),
);
const sourceById = Object.fromEntries(fixture.sources.map((source) => [source.id, source]));
const agentById = projection.agentsById;

export const shellModel = {
  fixture,
  projection,
  replayHash: replay.hash,
  market: {
    expeditionName: fixture.expedition.title,
    question: projection.market.question,
    publicProbability: percentage(projection.market.currentPublicProbabilities?.['yes']),
    teamProbability: percentage(latestForecast?.newProbabilities['yes']),
    closesAt: projection.market.resolvesAt ?? projection.market.closesAt,
  },
  agents: fixture.agents.map((fixtureAgent) => {
    const agent = agentById[fixtureAgent.id] ?? fixtureAgent;
    const place = placeById[agent.placeId];
    const activeMission = agent.activeMissionId
      ? projection.missionsById[agent.activeMissionId]
      : undefined;
    return {
      id: agent.id,
      name: agent.displayName,
      role: roleLabels[agent.role],
      roleKey: agent.role,
      placeName: place?.name ?? agent.placeId,
      status: sentenceCase(agent.publicState),
      mission:
        activeMission?.objective ??
        (agent.queuedMissionIds.length > 0
          ? `${agent.queuedMissionIds.length} queued mission${agent.queuedMissionIds.length === 1 ? '' : 's'}`
          : 'Awaiting mission'),
      forecast: percentage(agent.belief.probabilities['yes']),
      knowledgeCount: agent.knownSignalIds.length,
    };
  }),
  places: projection.worldManifest.places.map((place) => ({
    id: place.id,
    name: place.name,
    archetype: place.archetype,
    label: archetypeLabels[place.archetype],
    x: (place.position.x / projection.worldManifest.logicalWidth) * 100,
    y: (place.position.y / projection.worldManifest.logicalHeight) * 100,
    missionVerbs: place.missionVerbs,
  })),
  routes: projection.worldManifest.routes,
  sceneDefinition: createWorldSceneDefinition(
    projection.worldManifest,
    fixture.agents.map((agent) => agentById[agent.id] ?? agent),
  ),
  stagedSignals: fixture.signals.map((signal) => {
    const source = sourceById[signal.sourceIds[0] ?? ''];
    const discoverer = signal.discoveredByAgentId
      ? agentById[signal.discoveredByAgentId]
      : undefined;
    const direction =
      signal.direction === 'context'
        ? 'Context'
        : signal.direction === 'supports_outcome'
          ? 'YES support'
          : 'NO support';
    return {
      id: signal.id,
      headline: signal.headline,
      summary: signal.summary,
      direction,
      tone:
        signal.direction === 'context'
          ? ('context' as const)
          : signal.direction === 'supports_outcome'
            ? ('yes' as const)
            : ('no' as const),
      impact: sentenceCase(signal.impact.label),
      reliability: sentenceCase(signal.reliability.label),
      freshness: sentenceCase(signal.freshness.label),
      sourceClass: source ? sentenceCase(source.sourceClass) : 'Unknown source',
      sourceLocation: source?.location?.placeId
        ? (placeById[source.location.placeId]?.name ?? source.location.label)
        : source?.location?.label,
      sourceCount: signal.sourceIds.length,
      discovererName: discoverer?.displayName ?? 'Team',
    };
  }),
} satisfies {
  fixture: typeof fixture;
  projection: WorldProjection;
  replayHash: string;
  market: object;
  agents: object[];
  places: object[];
  routes: object[];
  sceneDefinition: object;
  stagedSignals: object[];
};

export type ShellAgent = (typeof shellModel.agents)[number];
export type ShellPlace = (typeof shellModel.places)[number];
export type ShellSignal = (typeof shellModel.stagedSignals)[number];
