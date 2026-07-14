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

    expect(result).toMatchObject({ accepted: true, duplicate: false, sequence: 4 });
    if (!result.accepted) throw new Error('Expected command acceptance.');
    expect(result.events.map((event) => event.type)).toEqual([
      'agent.mission.queued',
      'agent.mission.assigned',
    ]);
    expect(runtime.snapshot().missionsById['mission-mira-weather-1']).toMatchObject({
      status: 'queued',
      assignedAgentId: 'mira',
    });
    expect(runtime.snapshot().agentsById['mira']?.queuedMissionIds).toEqual([
      'mission-mira-weather-1',
    ]);
  });

  it('returns the original result for an exact duplicate without appending events', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    const command = assignmentCommand();

    const first = runtime.submit(command);
    const duplicate = runtime.submit(command);

    expect(first).toMatchObject({ accepted: true, duplicate: false, sequence: 4 });
    expect(duplicate).toMatchObject({ accepted: true, duplicate: true, sequence: 4 });
    expect(runtime.eventsAfter(0)).toHaveLength(4);
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
    expect(runtime.snapshot().sequence).toBe(4);
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
        orderedMissionIds: ['mission-mira-weather-2', 'mission-mira-weather-1'],
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
      payload: { missionId: 'mission-mira-weather-2', reason: 'Player changed priorities.' },
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
      'mission-mira-weather-1',
    ]);
    expect(runtime.snapshot().missionsById['mission-mira-weather-2']?.status).toBe('canceled');
  });
});
