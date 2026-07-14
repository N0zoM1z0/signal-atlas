import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentTurnInput, AgentTurnOutput } from '@signal-atlas/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CodexTurnCanceledError,
  CodexTurnScheduler,
  CodexTurnTimeoutError,
  JsonlRuntimeTurnStore,
  ScriptedCodexDriver,
} from '../src/index.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function turnInput(index: number): AgentTurnInput {
  const agentId = index % 2 === 0 ? 'mira' : 'orin';
  return {
    schemaVersion: 1,
    turnId: `turn-${index}`,
    expeditionId: 'exp-helios3-demo',
    agentId,
    mission: {
      id: `mission-${index}`,
      expeditionId: 'exp-helios3-demo',
      assignedAgentId: agentId,
      verb: 'investigate',
      objective: `Investigate fixture evidence ${index}.`,
      destinationPlaceId: 'weather-tower',
      budget: { maxToolCalls: 2, timeoutMs: 1_000 },
      status: 'draft',
      createdBy: { kind: 'system' },
      createdAt: '2027-09-26T18:00:00Z',
    },
    effectivePlaceId: 'weather-tower',
    attempt: 1,
    knownSourceIds: [],
    knownSignalIds: [],
    allowedCapabilities: ['fixture.weather'],
    requestedAt: `2027-09-26T18:00:0${index}Z`,
    timeoutMs: 1_000,
  };
}

function turnOutput(input: AgentTurnInput): AgentTurnOutput {
  return {
    schemaVersion: 1,
    agentId: input.agentId,
    missionId: input.mission.id,
    action: { type: 'wait', reason: 'The deterministic test turn is complete.' },
    publicDialogue: 'I checked the bounded fixture and recorded no unsupported claims.',
    sourceIdsUsed: [],
    proposedClaims: [],
    proposedSignals: [],
    rationale: 'This test output stays inside the supplied turn packet.',
    assumptions: [],
    unknowns: ['No live information source was called.'],
  };
}

async function allowSchedulerToPump() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CodexTurnScheduler', () => {
  it('runs two turns concurrently and queues the third by configuration', async () => {
    const active = new Set<string>();
    const releases = new Map<string, () => void>();
    const driver = new ScriptedCodexDriver({
      id: 'scripted-concurrency-test',
      run: async (input: AgentTurnInput) => {
        active.add(input.turnId);
        await new Promise<void>((resolve) => releases.set(input.turnId, resolve));
        active.delete(input.turnId);
        return { output: turnOutput(input) };
      },
    });
    const scheduler = new CodexTurnScheduler({ driver, maxConcurrency: 2 });

    const first = scheduler.submit(turnInput(1));
    const second = scheduler.submit(turnInput(2));
    const third = scheduler.submit(turnInput(3));
    await allowSchedulerToPump();

    expect(active.size).toBe(2);
    expect(scheduler.diagnostics().scheduler).toMatchObject({
      maxConcurrency: 2,
      activeCount: 2,
      queuedCount: 1,
    });

    releases.get(first.turnId)?.();
    await first.completion;
    await allowSchedulerToPump();
    expect(active).toContain(third.turnId);
    releases.get(second.turnId)?.();
    releases.get(third.turnId)?.();
    await Promise.all([second.completion, third.completion]);
    expect(scheduler.diagnostics().totals.completed).toBe(3);
  });

  it('records an explicit timeout even when a driver ignores cancellation', async () => {
    const driver = new ScriptedCodexDriver({
      run: async () => new Promise<never>(() => undefined),
    });
    const scheduler = new CodexTurnScheduler({ driver, defaultTimeoutMs: 20 });
    const input = { ...turnInput(1), timeoutMs: 20 };
    const turn = scheduler.submit(input);

    await expect(turn.completion).rejects.toBeInstanceOf(CodexTurnTimeoutError);
    expect(scheduler.diagnostics()).toMatchObject({
      totals: { timed_out: 1 },
      turns: [
        {
          turnId: input.turnId,
          status: 'timed_out',
          error: { code: 'runtime_timeout', recoverable: true },
        },
      ],
      recentEvents: expect.arrayContaining([
        expect.objectContaining({ type: 'turn.timed_out', turnId: input.turnId }),
      ]),
    });
  });

  it('cancels queued and active turns with terminal diagnostic events', async () => {
    const driver = new ScriptedCodexDriver({
      run: async () => new Promise<never>(() => undefined),
    });
    const scheduler = new CodexTurnScheduler({ driver, maxConcurrency: 1 });
    const active = scheduler.submit(turnInput(1));
    const queued = scheduler.submit(turnInput(2));
    const queuedRejection = expect(queued.completion).rejects.toBeInstanceOf(
      CodexTurnCanceledError,
    );

    expect(scheduler.cancel(queued.turnId, 'Queue priority changed.')).toBe(true);
    await queuedRejection;
    const activeRejection = expect(active.completion).rejects.toBeInstanceOf(
      CodexTurnCanceledError,
    );
    expect(scheduler.cancel(active.turnId, 'Operator canceled the active turn.')).toBe(true);
    await activeRejection;
    expect(scheduler.diagnostics().totals.canceled).toBe(2);
    expect(
      scheduler.diagnostics().recentEvents.filter((event) => event.type === 'turn.canceled'),
    ).toHaveLength(2);
  });

  it('fails closed when output identity does not match the scheduled input', async () => {
    const driver = new ScriptedCodexDriver({
      run: (input: AgentTurnInput) => ({
        output: { ...turnOutput(input), missionId: 'mission-hidden' },
      }),
    });
    const scheduler = new CodexTurnScheduler({ driver });
    const turn = scheduler.submit(turnInput(1));

    await expect(turn.completion).rejects.toMatchObject({
      code: 'runtime_identity_mismatch',
      recoverable: false,
    });
    expect(scheduler.diagnostics().totals.failed).toBe(1);
  });

  it('reloads the latest terminal turn state from append-only JSONL persistence', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'signal-atlas-codex-runtime-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'turns.jsonl');
    const store = new JsonlRuntimeTurnStore(path);
    const driver = new ScriptedCodexDriver({
      run: (input: AgentTurnInput) => ({ output: turnOutput(input), sessionId: 'session-mira-1' }),
    });
    const scheduler = new CodexTurnScheduler({ driver, store });

    await scheduler.submit(turnInput(1)).completion;

    expect(new JsonlRuntimeTurnStore(path).list()).toEqual([
      expect.objectContaining({
        turnId: 'turn-1',
        status: 'completed',
        sessionId: 'session-mira-1',
      }),
    ]);
  });

  it('resolves the idle barrier after the final active turn releases its slot', async () => {
    let release!: () => void;
    const driver = new ScriptedCodexDriver({
      run: async (input: AgentTurnInput) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { output: turnOutput(input) };
      },
    });
    const scheduler = new CodexTurnScheduler({ driver });
    const turn = scheduler.submit(turnInput(1));
    await allowSchedulerToPump();
    const idle = scheduler.waitForIdle();

    release();
    await Promise.all([turn.completion, idle]);

    expect(scheduler.diagnostics().scheduler.activeCount).toBe(0);
  });
});
