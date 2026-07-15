import type { ProfessorResponse } from '@signal-atlas/contracts';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';
import type {
  ProfessorDriver,
  ProfessorDriverDiagnostics,
  ProfessorTurnInput,
  ProfessorTurnResult,
} from '../src/professor-driver.js';

function queryCommand(id = 'async-1') {
  return {
    id: `cmd-professor-${id}`,
    idempotencyKey: `professor:${id}`,
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:40:00Z',
    actor: { kind: 'player' as const },
    schemaVersion: 1 as const,
    type: 'professor.query' as const,
    payload: {
      query: {
        id: `query-professor-${id}`,
        expeditionId: 'exp-helios3-demo',
        mode: 'missing_evidence' as const,
        question: 'What evidence is still missing?',
        selectedSourceIds: [],
        selectedSignalIds: [],
        createdAt: '2027-09-26T18:40:00Z',
      },
    },
  };
}

function diagnostics(runs: number): ProfessorDriverDiagnostics {
  return {
    id: 'test-local-professor',
    kind: 'local_exec',
    configuredMode: 'local',
    available: true,
    description: 'Test asynchronous Professor driver.',
    runs,
    activeMode: 'local_exec',
    fallbackCount: 0,
    repairCount: 0,
    recentEvents: [],
  };
}

class AsyncProfessorDriver implements ProfessorDriver {
  readonly id = 'test-local-professor';
  readonly kind = 'local_exec' as const;
  #runs = 0;

  async runTurn(input: ProfessorTurnInput): Promise<ProfessorTurnResult> {
    this.#runs += 1;
    await Promise.resolve();
    const response: ProfessorResponse = {
      queryId: input.query.id,
      mode: input.query.mode,
      selectedSignalIds: input.query.selectedSignalIds,
      answer: 'The selected packet still lacks a direct operational timing source.',
      evidenceUsed: [],
      assumptions: ['Timing is decision-relevant.'],
      limitations: ['No evidence was selected for this query.'],
      runtime: {
        mode: 'local_exec',
        driverId: this.id,
        durationMs: 4,
        repairAttempts: 0,
      },
    };
    return { response };
  }

  diagnostics(): ProfessorDriverDiagnostics {
    return diagnostics(this.#runs);
  }
}

class AbortableProfessorDriver implements ProfessorDriver {
  readonly id = 'test-abortable-professor';
  readonly kind = 'local_exec' as const;

  runTurn(
    _input: ProfessorTurnInput,
    context: Parameters<ProfessorDriver['runTurn']>[1],
  ): Promise<ProfessorTurnResult> {
    return new Promise((_resolve, reject) => {
      const abort = () => reject(context.signal.reason ?? new Error('aborted'));
      if (context.signal.aborted) abort();
      else context.signal.addEventListener('abort', abort, { once: true });
    });
  }

  diagnostics(): ProfessorDriverDiagnostics {
    return { ...diagnostics(1), id: this.id };
  }
}

describe('asynchronous Professor world projection', () => {
  it('commits query start immediately and appends the local response after completion', async () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture(), {
      professorDriver: new AsyncProfessorDriver(),
    });

    const result = runtime.submit(queryCommand());

    expect(result).toMatchObject({ accepted: true });
    if (!result.accepted) throw new Error('Expected Professor query acceptance.');
    expect(result.events.map((event) => event.type)).toEqual(['professor.query.started']);
    expect(
      runtime.snapshot().professorResponsesByQueryId['query-professor-async-1'],
    ).toBeUndefined();

    await runtime.waitForRuntimeIdle();

    expect(runtime.snapshot().professorResponsesByQueryId['query-professor-async-1']).toMatchObject(
      {
        answer: expect.stringContaining('operational timing source'),
        runtime: { mode: 'local_exec', driverId: 'test-local-professor' },
      },
    );
    expect(runtime.eventsAfter(result.sequence).map((event) => event.type)).toEqual([
      'professor.response.created',
    ]);
    expect(runtime.runtimeDiagnostics().professor).toMatchObject({
      configuredMode: 'local',
      runs: 1,
    });
  });

  it('cancels a pending Professor turn on fixture reset without a late authoritative event', async () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture(), {
      professorDriver: new AbortableProfessorDriver(),
    });
    expect(runtime.submit(queryCommand('reset'))).toMatchObject({ accepted: true });

    runtime.resetToFixture();
    await runtime.waitForRuntimeIdle();

    expect(runtime.snapshot().professorResponsesByQueryId).toEqual({});
    expect(
      runtime.eventsAfter(0).some((event) => event.type === 'professor.response.created'),
    ).toBe(false);
  });
});
