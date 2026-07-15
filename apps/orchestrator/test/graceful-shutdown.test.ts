import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { installGracefulShutdown } from '../src/graceful-shutdown.js';

class TestSignalTarget extends EventEmitter {
  exitCode: number | undefined;
}

function testServer(close: () => Promise<void>) {
  return {
    close,
    log: { error: vi.fn() },
  };
}

describe('graceful orchestrator shutdown', () => {
  it('closes once on a process signal and removes both handlers', async () => {
    const signalTarget = new TestSignalTarget();
    const close = vi.fn(async () => undefined);
    const server = testServer(close);

    installGracefulShutdown(server, signalTarget);
    signalTarget.emit('SIGINT');
    signalTarget.emit('SIGTERM');

    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(signalTarget.listenerCount('SIGINT')).toBe(0);
    expect(signalTarget.listenerCount('SIGTERM')).toBe(0);
    expect(server.log.error).not.toHaveBeenCalled();
  });

  it('reports a safe boundary and sets a failing exit code when close rejects', async () => {
    const signalTarget = new TestSignalTarget();
    const server = testServer(async () => {
      throw new Error('injected close failure');
    });

    installGracefulShutdown(server, signalTarget);
    signalTarget.emit('SIGTERM');

    await vi.waitFor(() => expect(signalTarget.exitCode).toBe(1));
    expect(server.log.error).toHaveBeenCalledWith(
      { error: { name: 'Error', message: 'injected close failure' } },
      'Signal Atlas failed to close cleanly after SIGTERM.',
    );
  });
});
