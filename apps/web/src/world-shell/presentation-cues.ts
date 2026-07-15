import type { WorldEvent } from '@signal-atlas/contracts';
import type { WorldPresentationCue } from '@signal-atlas/game-scene';
import type { WorldProjection } from '@signal-atlas/simulation';

export interface ShellPresentationCue extends WorldPresentationCue {
  occurredAt: string;
  sequence: number;
  text: string;
}

function agentName(projection: WorldProjection, agentId: string): string {
  return projection.agentsById[agentId]?.displayName ?? agentId;
}

function missionPlaceId(projection: WorldProjection, missionId: string): string | undefined {
  return projection.missionsById[missionId]?.destinationPlaceId;
}

/** Convert committed world events into bounded, presentation-only cues. */
export function presentationCuesForEvents(
  events: readonly WorldEvent[],
  projection: WorldProjection,
): ShellPresentationCue[] {
  return events.flatMap((event): ShellPresentationCue[] => {
    const base = { id: `cue-${event.id}`, occurredAt: event.occurredAt, sequence: event.sequence };
    switch (event.type) {
      case 'agent.arrived': {
        const name = agentName(projection, event.payload.agentId);
        const place = projection.worldManifest.places.find(
          (candidate) => candidate.id === event.payload.placeId,
        );
        const text = `${name} arrived at ${place?.name ?? event.payload.placeId}.`;
        return [
          {
            ...base,
            agentId: event.payload.agentId,
            kind: 'arrival',
            label: text,
            placeId: event.payload.placeId,
            text,
          },
        ];
      }
      case 'agent.work.started': {
        const name = agentName(projection, event.payload.agentId);
        const mission = projection.missionsById[event.payload.missionId];
        const text = `${name} began ${mission?.objective ?? 'the assigned research'}.`;
        return [
          {
            ...base,
            agentId: event.payload.agentId,
            kind: 'work',
            label: text,
            ...(mission?.destinationPlaceId ? { placeId: mission.destinationPlaceId } : {}),
            text,
          },
        ];
      }
      case 'signal.created': {
        const signal = event.payload.signal;
        const agentId = signal.discoveredByAgentId;
        const sourcePlaceId = signal.sourceIds
          .map((id) => projection.sourcesById[id]?.location?.placeId)
          .find((id): id is string => Boolean(id));
        const text = `Signal recorded: ${signal.headline}.`;
        return [
          {
            ...base,
            ...(agentId ? { agentId } : {}),
            kind: 'signal',
            label: signal.headline,
            ...(sourcePlaceId ? { placeId: sourcePlaceId } : {}),
            text,
          },
        ];
      }
      case 'agent.dialogue.emitted': {
        const name = agentName(projection, event.payload.agentId);
        const text = `${name}: ${event.payload.text}`;
        return [
          {
            ...base,
            agentId: event.payload.agentId,
            kind: 'work',
            label: event.payload.text,
            text,
          },
        ];
      }
      case 'agent.mission.completed': {
        const mission = projection.missionsById[event.payload.missionId];
        const agentId = mission?.assignedAgentId;
        const placeId = missionPlaceId(projection, event.payload.missionId);
        const text = `${agentId ? agentName(projection, agentId) : 'Agent'} completed ${mission?.objective ?? 'the mission'}.`;
        return [
          {
            ...base,
            ...(agentId ? { agentId } : {}),
            kind: 'complete',
            label: text,
            ...(placeId ? { placeId } : {}),
            text,
          },
        ];
      }
      case 'agent.mission.failed': {
        const mission = projection.missionsById[event.payload.missionId];
        const text = `${mission ? agentName(projection, mission.assignedAgentId) : 'Agent'} could not complete the mission. ${event.payload.message}`;
        return [
          {
            ...base,
            ...(mission ? { agentId: mission.assignedAgentId } : {}),
            kind: 'error',
            label: 'Mission needs attention',
            ...(mission?.destinationPlaceId ? { placeId: mission.destinationPlaceId } : {}),
            text,
          },
        ];
      }
      default:
        return [];
    }
  });
}
