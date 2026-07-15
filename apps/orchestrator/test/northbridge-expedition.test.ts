import { createNorthbridgeCouncilExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';

interface MissionSpec {
  agentId: 'lumen' | 'mara' | 'sable';
  verb: 'investigate' | 'verify' | 'compare_sources' | 'search_history' | 'find_contradiction';
  destinationPlaceId: string;
  objective: string;
  issuedAt: string;
}

function runMission(runtime: ExpeditionRuntime, index: number, spec: MissionSpec): void {
  const missionId = `mission-northbridge-${index}`;
  const command = {
    id: `cmd-assign-northbridge-${index}`,
    idempotencyKey: `northbridge:mission:${index}`,
    expeditionId: 'exp-northbridge-council-demo',
    issuedAt: spec.issuedAt,
    actor: { kind: 'player' as const },
    schemaVersion: 1 as const,
    type: 'agent.assign_mission' as const,
    payload: {
      mission: {
        id: missionId,
        expeditionId: 'exp-northbridge-council-demo',
        assignedAgentId: spec.agentId,
        verb: spec.verb,
        objective: spec.objective,
        destinationPlaceId: spec.destinationPlaceId,
        budget: { maxToolCalls: 2, timeoutMs: 30_000 },
        status: 'draft' as const,
        createdBy: { kind: 'player' as const },
        createdAt: spec.issuedAt,
      },
    },
  };

  expect(runtime.submit(command)).toMatchObject({ accepted: true, duplicate: false });
  if (runtime.snapshot().missionsById[missionId]?.status === 'traveling') {
    expect(
      runtime.submit({
        id: `cmd-skip-northbridge-${index}`,
        idempotencyKey: `northbridge:skip:${index}`,
        expeditionId: 'exp-northbridge-council-demo',
        issuedAt: new Date(Date.parse(spec.issuedAt) + 1_000).toISOString(),
        actor: { kind: 'player' },
        schemaVersion: 1,
        type: 'agent.skip_travel',
        payload: { agentId: spec.agentId, missionId },
      }),
    ).toMatchObject({ accepted: true });
  }
  runtime.advance(10_000, new Date(Date.parse(spec.issuedAt) + 10_000).toISOString());
  expect(runtime.snapshot().missionsById[missionId]?.status).toBe('completed');
}

describe('Northbridge Monetary Council expedition', () => {
  it('plays a policy evidence journey with revision, correlation, context, and resolution', () => {
    const runtime = new ExpeditionRuntime(createNorthbridgeCouncilExpeditionFixture());

    runMission(runtime, 1, {
      agentId: 'sable',
      verb: 'investigate',
      destinationPlaceId: 'council-hall',
      objective: 'Verify the meeting agenda and decision time.',
      issuedAt: '2029-06-18T09:05:00Z',
    });
    runMission(runtime, 2, {
      agentId: 'lumen',
      verb: 'investigate',
      destinationPlaceId: 'statistics-office',
      objective: 'Read the provisional inflation release.',
      issuedAt: '2029-06-18T09:10:00Z',
    });
    runMission(runtime, 3, {
      agentId: 'mara',
      verb: 'verify',
      destinationPlaceId: 'statistics-office',
      objective: 'Check wage growth against the council staff range.',
      issuedAt: '2029-06-18T09:20:00Z',
    });
    runMission(runtime, 4, {
      agentId: 'mara',
      verb: 'search_history',
      destinationPlaceId: 'decision-archive',
      objective: 'Condition comparable decisions on persistent wage growth.',
      issuedAt: '2029-06-18T09:30:00Z',
    });
    runMission(runtime, 5, {
      agentId: 'lumen',
      verb: 'compare_sources',
      destinationPlaceId: 'forward-exchange',
      objective: 'Compare the evidence with the read-only market expectation.',
      issuedAt: '2029-06-18T09:40:00Z',
    });
    runMission(runtime, 6, {
      agentId: 'sable',
      verb: 'find_contradiction',
      destinationPlaceId: 'copperwire-newsroom',
      objective: 'Trace the cut headline back to primary guidance.',
      issuedAt: '2029-06-18T09:50:00Z',
    });
    runMission(runtime, 7, {
      agentId: 'sable',
      verb: 'compare_sources',
      destinationPlaceId: 'statistics-office',
      objective: 'Retrieve the revised inflation vintage.',
      issuedAt: '2029-06-18T11:45:00Z',
    });
    runMission(runtime, 8, {
      agentId: 'lumen',
      verb: 'verify',
      destinationPlaceId: 'council-hall',
      objective: 'Retrieve the official policy decision statement.',
      issuedAt: '2029-06-18T14:01:00Z',
    });

    const snapshot = runtime.snapshot();
    expect(snapshot.market.outcomes.map(({ id }) => id)).toEqual(['cut', 'hold']);
    expect(snapshot.worldManifest).toMatchObject({
      template: 'ledger-civic-industrial',
      assetPack: 'northbridge-ledger-programmatic-v1',
    });
    expect(snapshot.sourcesById['src-northbridge-inflation-revised-2']).toMatchObject({
      version: 2,
      supersedesSourceId: 'src-northbridge-inflation-flash-1',
    });
    expect(snapshot.signalsById['sig-northbridge-inflation-flash']).toMatchObject({
      status: 'stale',
      freshness: {
        label: 'stale',
        newerSourceId: 'src-northbridge-inflation-revised-2',
      },
    });
    expect(snapshot.signalsById['sig-northbridge-market']).toMatchObject({
      direction: 'context',
      impact: { label: 'unknown' },
    });
    expect(snapshot.signalsById['sig-northbridge-market']?.targetOutcomeId).toBeUndefined();
    expect(snapshot.signalsById['sig-northbridge-wire']?.correlationGroupIds).toHaveLength(2);
    expect(snapshot.signalsById['sig-northbridge-speech']).toMatchObject({
      direction: 'opposes_outcome',
      targetOutcomeId: 'cut',
    });
    expect(snapshot.signalsById['sig-northbridge-decision']).toMatchObject({
      direction: 'supports_outcome',
      targetOutcomeId: 'cut',
      reliability: { label: 'verified_primary' },
    });
    expect(runtime.eventsAfter(0)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'source.superseded' }),
        expect.objectContaining({ type: 'signal.marked_stale' }),
      ]),
    );
    expect(
      snapshot.worldManifest.places.flatMap(({ capabilityBindings }) =>
        capabilityBindings.map(({ canonicalCapability }) => canonicalCapability),
      ),
    ).not.toEqual(expect.arrayContaining(['place_order', 'trade', 'wallet', 'portfolio']));
    expect(JSON.stringify(snapshot)).not.toMatch(
      /Helios|Galehaven|Meridian Coast|Lantern Square|Northlight|harbor|launch/iu,
    );

    const resolved = runtime.resolveFromFixture();
    expect(resolved.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'market.resolved',
          payload: expect.objectContaining({ resolvedOutcomeId: 'cut' }),
        }),
      ]),
    );
    expect(runtime.snapshot().expedition.status).toBe('resolved');
  });
});
