import type { MissionVerb, WorldCommand } from '@signal-atlas/contracts';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StaticDemoRuntime } from './static-demo-runtime.js';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function envelope(
  type: WorldCommand['type'],
  payload: unknown,
  serial: number,
): Omit<WorldCommand, 'type' | 'payload'> & { type: WorldCommand['type']; payload: unknown } {
  return {
    id: `cmd-static-test-${serial}`,
    idempotencyKey: `static-test-${serial}`,
    expeditionId: 'exp-helios3-demo',
    issuedAt: `2027-09-26T18:${String(serial).padStart(2, '0')}:00Z`,
    actor: { kind: 'player' },
    schemaVersion: 1,
    type,
    payload,
  };
}

function missionCommand(
  serial: number,
  agentId: string,
  verb: MissionVerb,
  destinationPlaceId: string,
): WorldCommand {
  const missionId = `mission-static-test-${serial}`;
  const base = envelope(
    'agent.assign_mission',
    {
      mission: {
        id: missionId,
        expeditionId: 'exp-helios3-demo',
        assignedAgentId: agentId,
        verb,
        objective: `Run authored static mission ${serial}.`,
        destinationPlaceId,
        budget: { maxToolCalls: 1, timeoutMs: 30_000 },
        status: 'draft',
        createdBy: { kind: 'player' },
        createdAt: `2027-09-26T18:${String(serial).padStart(2, '0')}:00Z`,
      },
    },
    serial,
  );
  return base as WorldCommand;
}

async function createHelios(runtime: StaticDemoRuntime) {
  return runtime.createExpedition('helios-3-launch-window', 1, 'create-helios');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('StaticDemoRuntime', () => {
  it('creates and restores all authored scenarios without a service dependency', async () => {
    const storage = new MemoryStorage();
    const runtime = new StaticDemoRuntime({ storage });
    const scenarios = await runtime.fetchScenarios();

    expect(scenarios).toHaveLength(3);
    expect(await runtime.fetchExpeditions()).toEqual([]);
    for (const scenario of scenarios) {
      await runtime.createExpedition(scenario.id, scenario.version, `create-${scenario.id}`);
    }
    expect(await runtime.fetchExpeditions()).toHaveLength(3);

    const restored = new StaticDemoRuntime({ storage });
    expect((await restored.fetchExpeditions()).map((item) => item.scenarioId).sort()).toEqual(
      scenarios.map((scenario) => scenario.id).sort(),
    );
    expect((await restored.fetchExpeditionSnapshot('exp-helios3-demo')).sequence).toBe(2);
  });

  it('rejects malformed or incompatible browser state instead of applying partial events', async () => {
    const storage = new MemoryStorage();
    storage.setItem('signal-atlas:static-demo:workspace:v1', '{not-json');
    expect(await new StaticDemoRuntime({ storage }).fetchExpeditions()).toEqual([]);

    storage.setItem(
      'signal-atlas:static-demo:workspace:v1',
      JSON.stringify({
        version: 1,
        expeditions: [
          {
            scenarioId: 'helios-3-launch-window',
            scenarioVersion: 1,
            missionScenario: 'success',
            events: [{ id: 'invented-event' }],
          },
        ],
      }),
    );
    expect(await new StaticDemoRuntime({ storage }).fetchExpeditions()).toEqual([]);
  });

  it('runs the complete sourced research, synthesis, forecast, resolution, and replay loop', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const runtime = new StaticDemoRuntime({
      storage,
      travelDelayMs: 10,
      workDelayMs: 10,
      now: () => new Date('2027-09-26T19:00:00Z'),
    });
    await createHelios(runtime);

    await runtime.submitWorldCommand(
      missionCommand(1, 'mira', 'observe_conditions', 'weather-tower'),
    );
    await vi.runAllTimersAsync();
    await runtime.submitWorldCommand(missionCommand(2, 'orin', 'search_history', 'archive'));
    await vi.runAllTimersAsync();

    let projection = await runtime.fetchExpeditionSnapshot('exp-helios3-demo');
    expect(Object.keys(projection.sourcesById)).toEqual(
      expect.arrayContaining(['src-weather-bulletin-1', 'src-archive-crosswind-1']),
    );
    expect(Object.keys(projection.signalsById)).toEqual(
      expect.arrayContaining(['sig-crosswind', 'sig-base-rate']),
    );
    const eventLog = await runtime.fetchExpeditionEvents('exp-helios3-demo');
    expect(eventLog.events.every((event) => event.expeditionId === projection.expedition.id)).toBe(
      true,
    );

    const professor = envelope(
      'professor.query',
      {
        query: {
          id: 'professor-query-static-test',
          expeditionId: 'exp-helios3-demo',
          mode: 'correlation_check',
          question: 'Are these selected signals independent?',
          selectedSourceIds: ['src-weather-bulletin-1', 'src-archive-crosswind-1'],
          selectedSignalIds: ['sig-crosswind', 'sig-base-rate'],
          createdAt: '2027-09-26T19:03:00Z',
        },
      },
      3,
    ) as WorldCommand;
    await runtime.submitWorldCommand(professor);
    projection = await runtime.fetchExpeditionSnapshot('exp-helios3-demo');
    expect(
      projection.professorResponsesByQueryId['professor-query-static-test']?.runtime?.mode,
    ).toBe('scripted');
    expect(
      projection.professorResponsesByQueryId['professor-query-static-test']?.evidenceUsed,
    ).toHaveLength(4);

    const meeting = envelope(
      'meeting.request',
      {
        meetingId: 'meeting-static-test',
        placeId: 'square',
        participantAgentIds: ['mira', 'orin', 'kestrel'],
      },
      4,
    ) as WorldCommand;
    await runtime.submitWorldCommand(meeting);
    projection = await runtime.fetchExpeditionSnapshot('exp-helios3-demo');
    expect(projection.meetingsById['meeting-static-test']?.endedAt).toBeDefined();
    expect(projection.meetingMemosById['meeting-static-test']?.memo.summary).toContain('authored');

    const previousProbabilities = projection.forecasts.at(-1)?.newProbabilities;
    expect(previousProbabilities).toBeDefined();
    await runtime.submitWorldCommand(
      envelope(
        'forecast.commit',
        {
          commit: {
            id: 'forecast-static-test',
            expeditionId: 'exp-helios3-demo',
            actor: { kind: 'player' },
            previousProbabilities,
            newProbabilities: { yes: 0.48, no: 0.52 },
            rationale: 'The selected source-linked evidence lowers the launch estimate.',
            evidenceSignalIds: ['sig-crosswind', 'sig-base-rate'],
            assumptions: [],
            createdAt: '2027-09-26T19:05:00Z',
            commitType: 'revision',
            publicNote: 'Weather and the conditional base rate lower my estimate to 48%.',
            privateMemo: 'This memo must never enter the public case file.',
            scoringEligible: true,
          },
        },
        5,
      ) as WorldCommand,
    );

    const resolution = await runtime.resolveFixtureCase('exp-helios3-demo');
    expect(resolution.duplicate).toBe(false);
    const replay = await runtime.fetchReplayProjection('exp-helios3-demo');
    expect(replay.hash).toBe(replay.authoritativeHash);
    expect(replay.projection.market.status).toBe('resolved');

    const caseFile = await runtime.fetchCaseFile('exp-helios3-demo');
    expect(caseFile.resolution?.outcomeId).toBe('no');
    expect(JSON.stringify(caseFile)).not.toContain(
      'This memo must never enter the public case file.',
    );
    expect(caseFile.turningPoints.map((point) => point.kind)).toEqual(
      expect.arrayContaining(['source', 'signal', 'forecast', 'resolution', 'score']),
    );
  });

  it('publishes contiguous in-process event envelopes without opening a WebSocket', async () => {
    vi.useFakeTimers();
    const runtime = new StaticDemoRuntime({ travelDelayMs: 10, workDelayMs: 10 });
    await createHelios(runtime);
    const fixture = createHelios3ExpeditionFixture();
    const envelopes: Array<{ afterSequence: number; sequence: number }> = [];
    const statuses: string[] = [];
    const subscription = runtime.createEventSubscription({
      expeditionId: fixture.expedition.id,
      initialSequence: fixture.initialEvents.length,
      onEvents: (event) => {
        envelopes.push({
          afterSequence: event.afterSequence,
          sequence: event.sequence,
        });
      },
      onStatus: (status) => statuses.push(status.phase),
    });
    subscription.start();
    await runtime.submitWorldCommand(
      missionCommand(6, 'mira', 'observe_conditions', 'weather-tower'),
    );
    await vi.runAllTimersAsync();
    await Promise.resolve();
    subscription.stop();

    expect(envelopes.length).toBeGreaterThanOrEqual(3);
    expect(
      envelopes.every(
        (event, index) => index === 0 || event.afterSequence === envelopes[index - 1]?.sequence,
      ),
    ).toBe(true);
    expect(statuses).toEqual(expect.arrayContaining(['connecting', 'live', 'stopped']));
  });
});
