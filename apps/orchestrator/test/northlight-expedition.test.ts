import { createNorthlightHarborExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';

interface MissionSpec {
  agentId: 'tern' | 'cora' | 'brin';
  verb: 'observe_conditions' | 'investigate' | 'verify' | 'search_history' | 'find_contradiction';
  destinationPlaceId: string;
  objective: string;
}

function assignmentCommand(index: number, spec: MissionSpec) {
  const missionId = `mission-northlight-${index}`;
  const issuedAt = `2028-11-12T15:${index.toString().padStart(2, '0')}:00Z`;
  return {
    missionId,
    command: {
      id: `cmd-assign-northlight-${index}`,
      idempotencyKey: `northlight:mission:${index}`,
      expeditionId: 'exp-northlight-harbor-demo',
      issuedAt,
      actor: { kind: 'player' as const },
      schemaVersion: 1 as const,
      type: 'agent.assign_mission' as const,
      payload: {
        mission: {
          id: missionId,
          expeditionId: 'exp-northlight-harbor-demo',
          assignedAgentId: spec.agentId,
          verb: spec.verb,
          objective: spec.objective,
          destinationPlaceId: spec.destinationPlaceId,
          budget: { maxToolCalls: 2, timeoutMs: 30_000 },
          status: 'draft' as const,
          createdBy: { kind: 'player' as const },
          createdAt: issuedAt,
        },
      },
    },
  };
}

function runMission(runtime: ExpeditionRuntime, index: number, spec: MissionSpec): void {
  const { command, missionId } = assignmentCommand(index, spec);
  expect(runtime.submit(command)).toMatchObject({ accepted: true, duplicate: false });
  const assigned = runtime.snapshot().missionsById[missionId];
  if (assigned?.status === 'traveling') {
    expect(
      runtime.submit({
        id: `cmd-skip-northlight-${index}`,
        idempotencyKey: `northlight:skip:${index}`,
        expeditionId: 'exp-northlight-harbor-demo',
        issuedAt: `2028-11-12T15:${index.toString().padStart(2, '0')}:01Z`,
        actor: { kind: 'player' },
        schemaVersion: 1,
        type: 'agent.skip_travel',
        payload: { agentId: spec.agentId, missionId },
      }),
    ).toMatchObject({ accepted: true });
  }
  runtime.advance(10_000, `2028-11-12T15:${index.toString().padStart(2, '0')}:10Z`);
  expect(runtime.snapshot().missionsById[missionId]?.status).toBe('completed');
}

describe('Northlight Harbor expedition', () => {
  it('plays a distinct evidence journey with correlation, contradiction, and supersession', () => {
    const fixture = createNorthlightHarborExpeditionFixture();
    const runtime = new ExpeditionRuntime(fixture);

    runMission(runtime, 1, {
      agentId: 'tern',
      verb: 'observe_conditions',
      destinationPlaceId: 'signal-station',
      objective: 'Read the current gale and sea-state report.',
    });
    runMission(runtime, 2, {
      agentId: 'cora',
      verb: 'search_history',
      destinationPlaceId: 'records-office',
      objective: 'Find comparable outbound suspension decisions.',
    });
    runMission(runtime, 3, {
      agentId: 'brin',
      verb: 'find_contradiction',
      destinationPlaceId: 'harbor-office',
      objective: 'Compare closure reporting with primary stakeholder statements.',
    });
    runMission(runtime, 4, {
      agentId: 'tern',
      verb: 'verify',
      destinationPlaceId: 'outer-breakwater',
      objective: 'Verify the first channel-marker inspection notice.',
    });
    runMission(runtime, 5, {
      agentId: 'brin',
      verb: 'verify',
      destinationPlaceId: 'outer-breakwater',
      objective: 'Find a newer channel-marker inspection notice.',
    });

    const snapshot = runtime.snapshot();
    expect(snapshot.market.outcomes.map(({ id }) => id)).toEqual(['suspended', 'operating']);
    expect(snapshot.worldManifest).toMatchObject({
      template: 'coastal-harbor',
      assetPack: 'northlight-harbor-programmatic-v1',
    });
    expect(snapshot.sourcesById['src-northlight-marker-2']).toMatchObject({
      version: 2,
      supersedesSourceId: 'src-northlight-marker-1',
    });
    expect(snapshot.signalsById['sig-northlight-marker-intermittent']).toMatchObject({
      status: 'stale',
      freshness: {
        label: 'stale',
        newerSourceId: 'src-northlight-marker-2',
      },
    });
    expect(snapshot.signalsById['sig-northlight-wire']?.correlationGroupIds).toHaveLength(2);
    expect(snapshot.signalsById['sig-northlight-pilots']).toMatchObject({
      direction: 'opposes_outcome',
      targetOutcomeId: 'suspended',
    });
    expect(runtime.eventsAfter(0)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'source.superseded' }),
        expect.objectContaining({ type: 'signal.marked_stale' }),
      ]),
    );
    expect(JSON.stringify(snapshot)).not.toMatch(/Helios|Galehaven|Meridian Coast|launch/iu);

    const resolved = runtime.resolveFromFixture();
    expect(resolved.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'market.resolved',
          payload: expect.objectContaining({ resolvedOutcomeId: 'suspended' }),
        }),
      ]),
    );
    expect(runtime.snapshot().expedition.status).toBe('resolved');
  });
});
