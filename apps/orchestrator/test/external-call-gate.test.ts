import { CodexDriverError } from '@signal-atlas/codex-runtime';
import { describe, expect, it, vi } from 'vitest';

import { ExternalCallGate } from '../src/external-call-gate.js';

describe('global external-call gate', () => {
  it('shares one concurrency limit across independent callers', async () => {
    const gate = new ExternalCallGate({ maxConcurrency: 1, maxQueued: 2 });
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = gate.run(new AbortController().signal, async () => {
      order.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push('first:end');
      return 'first';
    });
    const second = gate.run(new AbortController().signal, () => {
      order.push('second:start');
      return 'second';
    });

    await vi.waitFor(() => {
      expect(gate.diagnostics()).toMatchObject({ activeCount: 1, queuedCount: 1 });
    });
    expect(order).toEqual(['first:start']);
    releaseFirst?.();

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
    expect(gate.diagnostics()).toEqual({
      maxConcurrency: 1,
      maxQueued: 2,
      activeCount: 0,
      queuedCount: 0,
      admittedCount: 2,
      rejectedCount: 0,
    });
  });

  it('removes a canceled queued caller without consuming an admission', async () => {
    const gate = new ExternalCallGate({ maxConcurrency: 1, maxQueued: 2 });
    let releaseActive: (() => void) | undefined;
    const active = gate.run(
      new AbortController().signal,
      () => new Promise<void>((resolve) => (releaseActive = resolve)),
    );
    const queuedController = new AbortController();
    const queued = gate.run(queuedController.signal, () => 'must-not-run');
    await vi.waitFor(() => expect(gate.diagnostics().queuedCount).toBe(1));

    const reason = new CodexDriverError('runtime_canceled', 'Canceled while queued.');
    queuedController.abort(reason);
    await expect(queued).rejects.toBe(reason);
    expect(gate.diagnostics()).toMatchObject({ activeCount: 1, queuedCount: 0 });

    releaseActive?.();
    await active;
    expect(gate.diagnostics()).toMatchObject({ activeCount: 0, admittedCount: 1 });
  });

  it('fails closed when the bounded queue is full', async () => {
    const gate = new ExternalCallGate({ maxConcurrency: 1, maxQueued: 0 });
    let releaseActive: (() => void) | undefined;
    const active = gate.run(
      new AbortController().signal,
      () => new Promise<void>((resolve) => (releaseActive = resolve)),
    );
    await vi.waitFor(() => expect(gate.diagnostics().activeCount).toBe(1));

    await expect(gate.run(new AbortController().signal, () => 'rejected')).rejects.toMatchObject({
      code: 'runtime_overloaded',
      recoverable: true,
    });
    expect(gate.diagnostics()).toMatchObject({ queuedCount: 0, rejectedCount: 1 });

    releaseActive?.();
    await active;
  });
});
