import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';
import { interpretFixtureMission } from '../src/fixture-mission-interpreter.js';

const issuedAt = '2027-09-26T18:32:00Z';

function assignmentCommand(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cmd-mira-weather-1',
    idempotencyKey: 'mission:mira:weather:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt,
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.assign_mission',
    payload: {
      mission: {
        id: 'mission-mira-weather-1',
        expeditionId: 'exp-helios3-demo',
        assignedAgentId: 'mira',
        verb: 'observe_conditions',
        objective: 'Check the latest weather at Galehaven Weather Tower.',
        destinationPlaceId: 'weather-tower',
        budget: { maxToolCalls: 3, timeoutMs: 30_000 },
        status: 'draft',
        createdBy: { kind: 'player' },
        createdAt: issuedAt,
      },
    },
    ...overrides,
  };
}

describe('fixture mission interpretation', () => {
  it('resolves a selected agent and an unambiguous weather destination', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());

    const result = interpretFixtureMission(
      'Check the latest weather at Galehaven Weather Tower',
      runtime.snapshot(),
      'mira',
    );

    expect(result).toMatchObject({
      status: 'ready',
      assignedAgentId: 'mira',
      destinationPlaceId: 'weather-tower',
      verb: 'observe_conditions',
      missing: [],
    });
  });

  it('keeps genuinely underspecified language as a non-authoritative draft', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());

    const result = interpretFixtureMission('Look into the launch question', runtime.snapshot());

    expect(result.status).toBe('ambiguous');
    expect(result.missing).toEqual(['agent', 'destination', 'verb']);
  });
});

describe('ExpeditionRuntime commands', () => {
  it('appends validated mission events and folds them into the projection', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());

    const result = runtime.submit(assignmentCommand());

    expect(result).toMatchObject({ accepted: true, duplicate: false, sequence: 5 });
    if (!result.accepted) throw new Error('Expected command acceptance.');
    expect(result.events.map((event) => event.type)).toEqual([
      'agent.mission.queued',
      'agent.mission.assigned',
      'agent.travel.started',
    ]);
    expect(runtime.snapshot().missionsById['mission-mira-weather-1']).toMatchObject({
      status: 'traveling',
      assignedAgentId: 'mira',
    });
    expect(runtime.snapshot().agentsById['mira']).toMatchObject({
      activeMissionId: 'mission-mira-weather-1',
      publicState: 'traveling',
      movement: { routeId: 'r-observatory-square', progress: 0 },
    });
  });

  it('returns the original result for an exact duplicate without appending events', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    const command = assignmentCommand();

    const first = runtime.submit(command);
    const duplicate = runtime.submit(command);

    expect(first).toMatchObject({ accepted: true, duplicate: false, sequence: 5 });
    expect(duplicate).toMatchObject({ accepted: true, duplicate: true, sequence: 5 });
    expect(runtime.eventsAfter(0)).toHaveLength(5);
  });

  it('rejects reuse of an idempotency key with different command content', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    runtime.submit(assignmentCommand());

    const conflict = runtime.submit(
      assignmentCommand({ id: 'cmd-mira-weather-conflict', issuedAt: '2027-09-26T18:33:00Z' }),
    );

    expect(conflict.accepted).toBe(false);
    if (conflict.accepted) throw new Error('Expected command rejection.');
    expect(conflict.issues).toContainEqual(
      expect.objectContaining({ code: 'idempotency_conflict' }),
    );
    expect(runtime.snapshot().sequence).toBe(5);
  });

  it('reorders and cancels queued missions through explicit events', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    const first = assignmentCommand();
    const firstMission = first.payload.mission;
    const second = assignmentCommand({
      id: 'cmd-mira-weather-2',
      idempotencyKey: 'mission:mira:weather:2',
      payload: {
        mission: {
          ...firstMission,
          id: 'mission-mira-weather-2',
          objective: 'Check whether the tower bulletin has changed.',
        },
      },
    });
    runtime.submit(first);
    runtime.submit(second);
    const third = assignmentCommand({
      id: 'cmd-mira-weather-3',
      idempotencyKey: 'mission:mira:weather:3',
      payload: {
        mission: {
          ...firstMission,
          id: 'mission-mira-weather-3',
          objective: 'Compare the newest tower bulletin with the earlier advisory.',
        },
      },
    });
    runtime.submit(third);

    const reordered = runtime.submit({
      id: 'cmd-reorder-mira-1',
      idempotencyKey: 'reorder:mira:weather:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt,
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'agent.reorder_missions',
      payload: {
        agentId: 'mira',
        orderedMissionIds: ['mission-mira-weather-3', 'mission-mira-weather-2'],
      },
    });
    const canceled = runtime.submit({
      id: 'cmd-cancel-mira-2',
      idempotencyKey: 'cancel:mira:weather:2',
      expeditionId: 'exp-helios3-demo',
      issuedAt,
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'agent.cancel_mission',
      payload: { missionId: 'mission-mira-weather-3', reason: 'Player changed priorities.' },
    });

    expect(reordered).toMatchObject({
      accepted: true,
      events: [{ type: 'agent.mission.reordered' }],
    });
    expect(canceled).toMatchObject({
      accepted: true,
      events: [{ type: 'agent.mission.canceled' }],
    });
    expect(runtime.snapshot().agentsById['mira']?.queuedMissionIds).toEqual([
      'mission-mira-weather-2',
    ]);
    expect(runtime.snapshot().missionsById['mission-mira-weather-3']?.status).toBe('canceled');
    expect(runtime.advance(1_000).some((event) => event.type === 'agent.travel.progressed')).toBe(
      true,
    );
  });

  it('pauses, resumes, accelerates, and skips travel into the work phase', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    runtime.submit(assignmentCommand());
    runtime.advance(2_500, '2027-09-26T18:32:02.500Z');
    expect(runtime.snapshot().agentsById['mira']?.movement?.progress).toBe(0.5);

    runtime.submit({
      id: 'cmd-pause-travel-1',
      idempotencyKey: 'pause:mira:travel:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt: '2027-09-26T18:32:03Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'expedition.pause',
      payload: { reason: 'Player paused the world.' },
    });
    expect(runtime.advance(10_000, '2027-09-26T18:32:13Z')).toEqual([]);
    expect(runtime.snapshot().agentsById['mira']?.movement?.progress).toBe(0.5);

    runtime.submit({
      id: 'cmd-resume-travel-1',
      idempotencyKey: 'resume:mira:travel:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt: '2027-09-26T18:32:14Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'expedition.start',
      payload: {},
    });
    runtime.submit({
      id: 'cmd-speed-travel-1',
      idempotencyKey: 'speed:mira:travel:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt: '2027-09-26T18:32:14Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'expedition.change_speed',
      payload: { speed: 4 },
    });
    const transition = runtime.advance(625, '2027-09-26T18:32:14.625Z');
    expect(transition.slice(-2).map((event) => event.type)).toEqual([
      'agent.arrived',
      'agent.travel.started',
    ]);
    expect(runtime.snapshot().agentsById['mira']?.movement?.routeId).toBe('r-square-weather');

    const skipped = runtime.submit({
      id: 'cmd-skip-travel-1',
      idempotencyKey: 'skip:mira:travel:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt: '2027-09-26T18:32:15Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'agent.skip_travel',
      payload: { agentId: 'mira', missionId: 'mission-mira-weather-1' },
    });

    expect(skipped).toMatchObject({
      accepted: true,
      events: [
        { type: 'agent.travel.progressed' },
        { type: 'agent.arrived' },
        { type: 'agent.work.started' },
      ],
    });
    expect(runtime.snapshot().agentsById['mira']).toMatchObject({
      placeId: 'weather-tower',
      publicState: 'working',
      activeMissionId: 'mission-mira-weather-1',
    });
    expect(runtime.snapshot().missionsById['mission-mira-weather-1']?.status).toBe('running');
  });

  it('preserves the travel event order when simulation speed changes', () => {
    const normal = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    const fast = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    normal.submit(assignmentCommand());
    fast.submit(assignmentCommand());
    fast.submit({
      id: 'cmd-speed-order-1',
      idempotencyKey: 'speed:event:order:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt,
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'expedition.change_speed',
      payload: { speed: 4 },
    });

    const normalTypes = normal.advance(12_500).map((event) => event.type);
    const fastTypes = fast.advance(3_125).map((event) => event.type);

    expect(fastTypes).toEqual(normalTypes);
    expect(normal.snapshot().agentsById['mira']?.publicState).toBe('working');
    expect(fast.snapshot().agentsById['mira']?.publicState).toBe('working');
  });
});
