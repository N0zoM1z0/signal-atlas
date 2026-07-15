import {
  knowledgeKey,
  signalDirectionRelativeToOutcome,
  selectLatestForecast,
  type WorldProjection,
} from '@signal-atlas/simulation';
import { binaryMarketOutcomes } from '@signal-atlas/contracts';
import {
  createWorldSceneDefinition,
  weatherFromAmbientLayers,
  type WorldWeatherPresentation,
  type WorldWeatherState,
} from '@signal-atlas/game-scene';

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
  weather_tower: 'Conditions feed',
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

function signedPercentagePoints(value: number): string {
  const points = Math.round(value * 100);
  if (points > 0) return `+${points}`;
  if (points < 0) return `−${Math.abs(points)}`;
  return '0';
}

function weatherStateFromText(value: string): WorldWeatherState {
  if (value.includes('heavy rain') || value.includes('rain')) return 'rain';
  if (value.includes('fog') || value.includes('mist')) return 'fog';
  if (value.includes('crosswind') || value.includes('gust') || value.includes('wind')) {
    return 'crosswind';
  }
  if (value.includes('clear')) return 'clear';
  return 'breezy';
}

export function weatherPresentationForProjection(
  projection: WorldProjection,
): WorldWeatherPresentation {
  const weatherPlaceIds = new Set(
    projection.worldManifest.places
      .filter(
        (place) =>
          place.archetype === 'weather_tower' ||
          place.capabilityBindings.some(
            (binding) => binding.canonicalCapability === 'local_conditions',
          ),
      )
      .map((place) => place.id),
  );
  const latestWeatherSource = Object.values(projection.sourcesById)
    .filter(
      (source) =>
        source.tags.some((tag) => tag.toLowerCase().includes('weather')) &&
        Boolean(source.location?.placeId && weatherPlaceIds.has(source.location.placeId)) &&
        source.sourceClass === 'official_primary' &&
        !source.tags.some((tag) =>
          ['context-only', 'real-world-proxy'].includes(tag.toLowerCase()),
        ),
    )
    .sort((left, right) => {
      const leftTime = left.observedAt ?? left.publishedAt ?? left.retrievedAt;
      const rightTime = right.observedAt ?? right.publishedAt ?? right.retrievedAt;
      return rightTime.localeCompare(leftTime);
    })[0];
  if (!latestWeatherSource) return weatherFromAmbientLayers(projection.worldManifest);

  const searchable = [
    latestWeatherSource.title,
    latestWeatherSource.excerpt,
    ...latestWeatherSource.tags,
  ]
    .join(' ')
    .toLowerCase();
  const state = weatherStateFromText(searchable);
  const intensityByState: Record<WorldWeatherState, number> = {
    clear: 0,
    breezy: 0.42,
    crosswind: 0.92,
    rain: 0.78,
    fog: 0.68,
  };
  const labelByState: Record<WorldWeatherState, string> = {
    clear: 'Clear conditions',
    breezy: 'Breezy conditions',
    crosswind: 'Crosswind advisory',
    rain: 'Rain near the research sites',
    fog: 'Fog near the research sites',
  };
  return {
    intensity: intensityByState[state],
    label: labelByState[state],
    observedAt:
      latestWeatherSource.observedAt ??
      latestWeatherSource.publishedAt ??
      latestWeatherSource.retrievedAt,
    sourceTitle: latestWeatherSource.title,
    state,
  };
}

export function createShellModel(projection: WorldProjection) {
  const outcomes = binaryMarketOutcomes(projection.market);
  const primaryOutcomeId = outcomes.primary.id;
  const latestForecast = selectLatestForecast(projection);
  const latestTeamForecast = [...projection.forecasts]
    .reverse()
    .find((forecast) => forecast.actor.kind === 'team');
  const latestPlayerForecast = [...projection.forecasts]
    .reverse()
    .find((forecast) => forecast.actor.kind === 'player');
  const placeById = Object.fromEntries(
    projection.worldManifest.places.map((place) => [place.id, place]),
  );
  const agentById = projection.agentsById;
  const missionRankById = new Map<string, number>();
  let missionRank = 0;
  const agents = Object.values(agentById);
  for (const agent of agents) {
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
  const weather = weatherPresentationForProjection(projection);

  return {
    projection,
    market: {
      expeditionName: projection.expedition.title,
      question: projection.market.question,
      primaryOutcome: outcomes.primary,
      secondaryOutcome: outcomes.secondary,
      publicProbability: percentage(
        projection.market.currentPublicProbabilities?.[primaryOutcomeId],
      ),
      teamProbability: percentage(
        latestTeamForecast?.newProbabilities[primaryOutcomeId] ??
          latestForecast?.newProbabilities[primaryOutcomeId],
      ),
      playerProbability: latestPlayerForecast
        ? percentage(latestPlayerForecast.newProbabilities[primaryOutcomeId])
        : undefined,
      closesAt: projection.market.resolvesAt ?? projection.market.closesAt,
    },
    agents: agents.map((agent) => {
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
        forecast: percentage(agent.belief.probabilities[primaryOutcomeId]),
        knowledgeCount: agent.knownSignalIds.length,
        x: place ? (place.position.x / projection.worldManifest.logicalWidth) * 100 : 50,
        y: place ? (place.position.y / projection.worldManifest.logicalHeight) * 100 : 50,
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
    sceneDefinition: createWorldSceneDefinition(projection.worldManifest, agents, weather),
    weather,
    signals: Object.values(projection.signalsById).map((signal) => {
      const sources = signal.sourceIds.flatMap((id) => {
        const source = projection.sourcesById[id];
        return source ? [source] : [];
      });
      const source = sources[0];
      const claims = signal.claimIds.flatMap((id) => {
        const claim = projection.claimsById[id];
        return claim ? [claim] : [];
      });
      const discoverer = signal.discoveredByAgentId
        ? agentById[signal.discoveredByAgentId]
        : undefined;
      const knownBy = Object.values(agentById)
        .filter(
          (agent) =>
            agent.knownSignalIds.includes(signal.id) ||
            Boolean(projection.knowledgeByKey[knowledgeKey(agent.id, 'signal', signal.id)]),
        )
        .map((agent) => ({
          id: agent.id,
          name: agent.displayName,
          acquisition:
            projection.knowledgeByKey[knowledgeKey(agent.id, 'signal', signal.id)]?.acquisition
              .kind ?? 'system',
        }));
      const correlations = Object.values(projection.correlationsById).filter((correlation) =>
        correlation.signalIds.includes(signal.id),
      );
      const targetOutcome = projection.market.outcomes.find(
        (outcome) => outcome.id === signal.targetOutcomeId,
      );
      const relativeDirection = signalDirectionRelativeToOutcome(
        signal,
        primaryOutcomeId,
        projection.market,
      );
      const direction =
        signal.direction === 'context'
          ? 'Context'
          : `${signal.direction === 'supports_outcome' ? 'Supports' : 'Opposes'} ${
              targetOutcome?.shortLabel ?? targetOutcome?.label ?? 'outcome'
            }`;
      return {
        id: signal.id,
        headline: signal.headline,
        summary: signal.summary,
        direction,
        tone:
          signal.direction === 'context'
            ? ('context' as const)
            : relativeDirection === 'supports'
              ? ('support' as const)
              : ('oppose' as const),
        impact: sentenceCase(signal.impact.label),
        impactRange: signal.impact.probabilityPointRange
          ? `${signedPercentagePoints(signal.impact.probabilityPointRange.low)} to ${signedPercentagePoints(signal.impact.probabilityPointRange.high)} pp`
          : 'Range not estimated',
        reliability: sentenceCase(signal.reliability.label),
        reliabilityReasons: [...signal.reliability.reasons],
        freshness: sentenceCase(signal.freshness.label),
        freshnessReferenceTime: signal.freshness.referenceTime,
        usefulUntil: signal.freshness.usefulUntil,
        sourceClass: source ? sentenceCase(source.sourceClass) : 'Unknown source',
        sourceLocation: source?.location?.placeId
          ? (placeById[source.location.placeId]?.name ?? source.location.label)
          : source?.location?.label,
        sourceCount: signal.sourceIds.length,
        discovererName: discoverer?.displayName ?? 'Team',
        discovererId: discoverer?.id,
        status: signal.status,
        statusLabel: sentenceCase(signal.status),
        correlationGroupIds: [...signal.correlationGroupIds],
        correlations,
        claims,
        sources,
        knownBy,
        linkedBeliefUpdates: projection.beliefUpdates.filter((update) =>
          update.evidenceSignalIds.includes(signal.id),
        ),
      };
    }),
  };
}

export type ShellModel = ReturnType<typeof createShellModel>;
export type ShellAgent = ShellModel['agents'][number];
export type ShellPlace = ShellModel['places'][number];
export type ShellSignal = ShellModel['signals'][number];
export type ShellMission = ShellModel['missions'][number];
