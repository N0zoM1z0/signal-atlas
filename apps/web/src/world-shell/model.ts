import {
  replayFixture,
  selectLatestForecast,
  type WorldProjection,
} from '@signal-atlas/simulation';
import { createWorldSceneDefinition } from '@signal-atlas/game-scene';
import { helios3ExpeditionFixture } from '@signal-atlas/test-fixtures';

const fixture = helios3ExpeditionFixture;
const replay = replayFixture(fixture);

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

export function createShellModel(projection: WorldProjection) {
  const latestForecast = selectLatestForecast(projection);
  const placeById = Object.fromEntries(
    projection.worldManifest.places.map((place) => [place.id, place]),
  );
  const agentById = projection.agentsById;
  const missionRankById = new Map<string, number>();
  let missionRank = 0;
  for (const fixtureAgent of fixture.agents) {
    const agent = agentById[fixtureAgent.id];
    if (!agent) continue;
    if (agent.activeMissionId) missionRankById.set(agent.activeMissionId, missionRank++);
    for (const missionId of agent.queuedMissionIds) {
      missionRankById.set(missionId, missionRank++);
    }
  }
  const recoverableTurnByMissionId = new Map(
    Object.values(projection.agentTurnsById)
      .filter((turn) => turn.status === 'failed' && turn.recoverable)
      .sort((left, right) => left.sequence - right.sequence)
      .map((turn) => [turn.missionId, turn]),
  );

  return {
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
      const movementDestination = agent.movement ? placeById[agent.movement.toPlaceId] : undefined;
      return {
        id: agent.id,
        name: agent.displayName,
        role: roleLabels[agent.role],
        roleKey: agent.role,
        placeName: movementDestination
          ? `En route to ${movementDestination.name}`
          : (place?.name ?? agent.placeId),
        status: sentenceCase(agent.publicState),
        mission:
          activeMission?.objective ??
          (agent.queuedMissionIds.length > 0
            ? `${agent.queuedMissionIds.length} queued mission${agent.queuedMissionIds.length === 1 ? '' : 's'}`
            : 'Awaiting mission'),
        forecast: percentage(agent.belief.probabilities['yes']),
        knowledgeCount: agent.knownSignalIds.length,
        movement: agent.movement
          ? {
              missionId: agent.activeMissionId,
              progress: agent.movement.progress,
              routeId: agent.movement.routeId,
              destinationName: movementDestination?.name ?? agent.movement.toPlaceId,
            }
          : undefined,
      };
    }),
    missions: Object.values(projection.missionsById)
      .filter(
        (mission) =>
          !['completed', 'failed', 'canceled'].includes(mission.status) ||
          (mission.status === 'failed' && recoverableTurnByMissionId.has(mission.id)),
      )
      .sort(
        (left, right) =>
          (missionRankById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
            (missionRankById.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
          left.createdAt.localeCompare(right.createdAt),
      )
      .map((mission) => {
        const failedTurn =
          mission.status === 'failed' ? recoverableTurnByMissionId.get(mission.id) : undefined;
        return {
          id: mission.id,
          agentId: mission.assignedAgentId,
          agentName: agentById[mission.assignedAgentId]?.displayName ?? mission.assignedAgentId,
          destinationPlaceId: mission.destinationPlaceId,
          destinationName: mission.destinationPlaceId
            ? (placeById[mission.destinationPlaceId]?.name ?? mission.destinationPlaceId)
            : 'No destination',
          objective: mission.objective,
          status: mission.status,
          verb: mission.verb,
          ...(failedTurn
            ? {
                failedTurnId: failedTurn.turnId,
                failureMessage: failedTurn.message ?? 'The mission turn failed.',
              }
            : {}),
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
    signals: Object.values(projection.signalsById).map((signal) => {
      const source = projection.sourcesById[signal.sourceIds[0] ?? ''];
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
  };
}

export const shellModel = createShellModel(replay.projection);

export type ShellAgent = (typeof shellModel.agents)[number];
export type ShellPlace = (typeof shellModel.places)[number];
export type ShellSignal = (typeof shellModel.signals)[number];
export type ShellMission = (typeof shellModel.missions)[number];
