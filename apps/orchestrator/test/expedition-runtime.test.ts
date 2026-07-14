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

function skipWeatherCommand() {
  return {
    id: 'cmd-skip-weather-result-1',
    idempotencyKey: 'skip:weather:result:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:32:01Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.skip_travel',
    payload: { agentId: 'mira', missionId: 'mission-mira-weather-1' },
  };
}

function archiveAssignmentCommand() {
  return {
    id: 'cmd-orin-archive-1',
    idempotencyKey: 'mission:orin:archive:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:33:00Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.assign_mission',
    payload: {
      mission: {
        id: 'mission-orin-archive-1',
        expeditionId: 'exp-helios3-demo',
        assignedAgentId: 'orin',
        verb: 'search_history',
        objective: 'Search historical delays in Archive Quarter.',
        destinationPlaceId: 'archive',
        budget: { maxToolCalls: 3, timeoutMs: 30_000 },
        status: 'draft',
        createdBy: { kind: 'player' },
        createdAt: '2027-09-26T18:33:00Z',
      },
    },
  };
}

function skipCommand(agentId: string, missionId: string, index: number) {
  return {
    id: `cmd-skip-${agentId}-${index}`,
    idempotencyKey: `skip:${agentId}:${missionId}:${index}`,
    expeditionId: 'exp-helios3-demo',
    issuedAt: `2027-09-26T18:3${index}:00Z`,
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.skip_travel',
    payload: { agentId, missionId },
  };
}

function runtimeWithRequiredEvidence() {
  const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
  runtime.submit(assignmentCommand());
  runtime.submit(skipWeatherCommand());
  runtime.advance(2_400, '2027-09-26T18:32:03.400Z');
  runtime.submit(archiveAssignmentCommand());
  runtime.submit(skipCommand('orin', 'mission-orin-archive-1', 4));
  runtime.advance(2_800, '2027-09-26T18:34:02.800Z');
  return runtime;
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

  it('emits the complete source-to-belief audit chain after scripted latency', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    runtime.submit(assignmentCommand());
    runtime.submit(skipWeatherCommand());

    expect(runtime.advance(2_399, '2027-09-26T18:32:03.399Z')).toEqual([]);
    const completed = runtime.advance(1, '2027-09-26T18:32:03.400Z');

    expect(completed.map((event) => event.type)).toEqual([
      'pref.call.started',
      'source.recorded',
      'pref.call.completed',
      'claim.created',
      'signal.created',
      'agent.knowledge.acquired',
      'agent.knowledge.acquired',
      'agent.knowledge.acquired',
      'belief.updated',
      'agent.dialogue.emitted',
      'agent.turn.completed',
      'agent.mission.completed',
    ]);
    const snapshot = runtime.snapshot();
    expect(snapshot.sourcesById['src-weather-bulletin-1']).toBeDefined();
    expect(snapshot.claimsById['claim-crosswind']).toBeDefined();
    expect(snapshot.signalsById['sig-crosswind']).toBeDefined();
    expect(snapshot.knowledgeByKey['mira:signal:sig-crosswind']).toBeDefined();
    expect(snapshot.agentsById['mira']?.belief.evidenceSignalIds).toEqual(['sig-crosswind']);
    expect(snapshot.agentsById['mira']?.belief.probabilities['yes']).toBeCloseTo(0.495);
    expect(snapshot.agentsById['mira']?.belief.probabilities['no']).toBeCloseTo(0.505);
    expect(snapshot.missionsById['mission-mira-weather-1']?.status).toBe('completed');
  });

  it('produces the same scripted events for the same seed and command sequence', () => {
    const run = () => {
      const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
      runtime.submit(assignmentCommand());
      runtime.submit(skipWeatherCommand());
      return runtime.advance(2_400, '2027-09-26T18:32:03.400Z');
    };

    expect(run()).toEqual(run());
  });

  it('coordinates a skippable Lantern Square meeting with explicit knowledge transfer', () => {
    const runtime = runtimeWithRequiredEvidence();

    const before = runtime.snapshot();
    expect(before.agentsById['mira']?.knownSignalIds).toEqual(['sig-crosswind']);
    expect(before.agentsById['orin']?.knownSignalIds).toEqual(['sig-base-rate']);
    expect(before.agentsById['kestrel']?.knownSignalIds).toEqual([]);

    const requested = runtime.submit({
      id: 'cmd-meeting-required-journey-1',
      idempotencyKey: 'meeting:required:journey:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt: '2027-09-26T18:35:00Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'meeting.request',
      payload: {
        meetingId: 'meeting-required-journey-1',
        placeId: 'square',
        participantAgentIds: ['mira', 'orin', 'kestrel'],
      },
    });
    expect(requested).toMatchObject({ accepted: true, duplicate: false });
    if (!requested.accepted) throw new Error('Expected meeting request acceptance.');
    expect(requested.events.map((event) => event.type)).toEqual([
      'meeting.requested',
      'agent.mission.queued',
      'agent.mission.assigned',
      'agent.travel.started',
      'agent.mission.queued',
      'agent.mission.assigned',
      'agent.travel.started',
      'agent.mission.queued',
      'agent.mission.assigned',
      'agent.travel.started',
    ]);

    const meetingMission = (agentId: string) =>
      `meeting-mission-meeting-required-journey-1-${agentId}`;
    runtime.submit(skipCommand('mira', meetingMission('mira'), 5));
    runtime.submit(skipCommand('orin', meetingMission('orin'), 6));
    const finalSkip = runtime.submit(skipCommand('kestrel', meetingMission('kestrel'), 7));
    expect(finalSkip).toMatchObject({ accepted: true });
    if (!finalSkip.accepted) throw new Error('Expected final arrival skip acceptance.');
    expect(finalSkip.events.map((event) => event.type)).toEqual([
      'agent.travel.progressed',
      'agent.arrived',
      'agent.mission.completed',
      'meeting.started',
      'meeting.signal_shared',
      'agent.knowledge.acquired',
      'agent.knowledge.acquired',
      'meeting.signal_shared',
      'agent.knowledge.acquired',
      'agent.knowledge.acquired',
      'belief.updated',
      'belief.updated',
      'belief.updated',
      'meeting.memo_created',
      'meeting.ended',
    ]);

    const snapshot = runtime.snapshot();
    expect(snapshot.meetingsById['meeting-required-journey-1']).toMatchObject({
      placeId: 'square',
      sharedSignalIds: ['sig-base-rate', 'sig-crosswind'],
      disagreementTypes: ['evidence', 'model', 'prior'],
      endedAt: '2027-09-26T18:37:00Z',
      memo: {
        disagreements: [
          expect.stringContaining('Evidence:'),
          expect.stringContaining('Model:'),
          expect.stringContaining('Prior:'),
        ],
        followUpMissionProposals: [
          expect.objectContaining({ verb: 'consult_professor', agentId: 'kestrel' }),
        ],
      },
    });
    for (const agentId of ['mira', 'orin', 'kestrel']) {
      expect(snapshot.agentsById[agentId]?.knownSignalIds.sort()).toEqual([
        'sig-base-rate',
        'sig-crosswind',
      ]);
      expect(snapshot.agentsById[agentId]).toMatchObject({
        placeId: 'square',
        publicState: 'idle',
      });
      expect(snapshot.missionsById[meetingMission(agentId)]?.status).toBe('completed');
    }
    expect(snapshot.signalShares).toHaveLength(2);
    expect(snapshot.knowledgeByKey['kestrel:signal:sig-crosswind']).toMatchObject({
      acquisition: {
        kind: 'shared',
        fromAgentId: 'mira',
        meetingId: 'meeting-required-journey-1',
      },
    });
  });

  it('starts the meeting after all natural arrival routes complete', () => {
    const runtime = runtimeWithRequiredEvidence();
    const result = runtime.submit({
      id: 'cmd-meeting-natural-1',
      idempotencyKey: 'meeting:natural:arrival:1',
      expeditionId: 'exp-helios3-demo',
      issuedAt: '2027-09-26T18:35:00Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'meeting.request',
      payload: {
        meetingId: 'meeting-natural-1',
        placeId: 'square',
        participantAgentIds: ['mira', 'orin', 'kestrel'],
      },
    });
    expect(result).toMatchObject({ accepted: true });

    const arrivalEvents = runtime.advance(7_500, '2027-09-26T18:35:07.500Z');

    expect(arrivalEvents.filter((event) => event.type === 'agent.arrived')).toHaveLength(3);
    expect(arrivalEvents.map((event) => event.type)).toContain('meeting.started');
    expect(arrivalEvents.at(-1)?.type).toBe('meeting.ended');
    expect(runtime.snapshot().meetingsById['meeting-natural-1']).toMatchObject({
      placeId: 'square',
      endedAt: '2027-09-26T18:35:07.500Z',
    });
  });

  it.each(['timeout', 'invalid_result'] as const)(
    'records a recoverable %s failure and completes a later successful retry',
    (scenario) => {
      const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
      runtime.setFixtureMissionScenario(scenario);
      runtime.submit(assignmentCommand());
      runtime.submit(skipWeatherCommand());

      const failedEvents = runtime.advance(2_400, '2027-09-26T18:32:03.400Z');
      expect(failedEvents.map((event) => event.type)).toEqual([
        'pref.call.started',
        'pref.call.failed',
        'agent.dialogue.emitted',
        'agent.turn.failed',
        'agent.mission.failed',
      ]);
      const failedTurn = Object.values(runtime.snapshot().agentTurnsById).at(-1);
      expect(failedTurn).toMatchObject({ status: 'failed', recoverable: true });

      runtime.setFixtureMissionScenario('success');
      const retry = runtime.submit({
        id: `cmd-retry-${scenario}-1`,
        idempotencyKey: `retry:${scenario}:1`,
        expeditionId: 'exp-helios3-demo',
        issuedAt: '2027-09-26T18:32:04Z',
        actor: { kind: 'player' },
        schemaVersion: 1,
        type: 'runtime.retry_turn',
        payload: {
          agentId: 'mira',
          missionId: 'mission-mira-weather-1',
          failedTurnId: failedTurn?.turnId ?? '',
        },
      });
      expect(retry).toMatchObject({
        accepted: true,
        events: [{ type: 'agent.work.started' }],
      });

      runtime.advance(2_400, '2027-09-26T18:32:06.400Z');
      expect(runtime.snapshot().missionsById['mission-mira-weather-1']).toMatchObject({
        status: 'completed',
        completedAt: '2027-09-26T18:32:06.400Z',
      });
      expect(runtime.snapshot().signalsById['sig-crosswind']).toBeDefined();
    },
  );

  it('completes a no-result turn without inventing evidence', () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    runtime.setFixtureMissionScenario('no_result');
    runtime.submit(assignmentCommand());
    runtime.submit(skipWeatherCommand());

    const events = runtime.advance(2_400, '2027-09-26T18:32:03.400Z');

    expect(events.map((event) => event.type)).toEqual([
      'pref.call.started',
      'pref.call.completed',
      'agent.dialogue.emitted',
      'agent.turn.completed',
      'agent.mission.completed',
    ]);
    expect(runtime.snapshot().signalsById).toEqual({});
  });
});
