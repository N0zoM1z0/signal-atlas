import { parseWorldEvent, SCHEMA_VERSION } from '@signal-atlas/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ExpeditionEventStream,
  type EventStreamSocket,
  type EventStreamStatus,
} from './event-stream-client.js';
import { shellModel } from './model.js';

class FakeSocket {
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  readonly close = vi.fn((code?: number, reason?: string) => {
    void code;
    void reason;
    this.emit('close', {});
  });

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, event: unknown): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  message(payload: unknown): void {
    this.emit('message', { data: JSON.stringify(payload) });
  }
}

const flushMessages = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

function pauseEvent(sequence: number) {
  return parseWorldEvent({
    id: `evt-stream-pause-${sequence}`,
    expeditionId: shellModel.projection.expedition.id,
    sequence,
    type: 'expedition.paused',
    occurredAt: '2027-09-26T18:40:00Z',
    recordedAt: '2027-09-26T18:40:00Z',
    actor: { kind: 'player' },
    schemaVersion: SCHEMA_VERSION,
    payload: { reason: 'Client stream test.' },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ExpeditionEventStream', () => {
  it('advances only after a valid batch is applied and reconnects from that cursor', async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const urls: string[] = [];
    const statuses: EventStreamStatus[] = [];
    const appliedSequences: number[] = [];
    const stream = new ExpeditionEventStream({
      expeditionId: shellModel.projection.expedition.id,
      initialSequence: 2,
      onEvents: async (envelope) => {
        appliedSequences.push(envelope.sequence);
      },
      onStatus: (status) => statuses.push(status),
      retryDelaysMs: [250],
      socketFactory: (url) => {
        urls.push(url);
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as EventStreamSocket;
      },
      urlFactory: (_expeditionId, after) => `ws://fixture/stream?after=${after}`,
    });

    stream.start();
    sockets[0]?.message({
      schemaVersion: SCHEMA_VERSION,
      type: 'world.ready',
      expeditionId: shellModel.projection.expedition.id,
      sequence: 2,
    });
    await flushMessages();
    sockets[0]?.message({
      schemaVersion: SCHEMA_VERSION,
      type: 'world.events',
      expeditionId: shellModel.projection.expedition.id,
      afterSequence: 2,
      sequence: 3,
      events: [pauseEvent(3)],
    });
    await flushMessages();

    expect(stream.cursor).toBe(3);
    expect(appliedSequences).toEqual([3]);
    expect(statuses.at(-1)).toMatchObject({ phase: 'live', cursor: 3 });

    sockets[0]?.emit('close', {});
    expect(statuses.at(-1)).toMatchObject({ phase: 'reconnecting', cursor: 3, attempt: 1 });
    await vi.advanceTimersByTimeAsync(250);
    expect(urls).toEqual(['ws://fixture/stream?after=2', 'ws://fixture/stream?after=3']);
    stream.stop();
  });

  it('preserves the last valid cursor across malformed envelopes', async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const statuses: EventStreamStatus[] = [];
    const boundaryErrors: string[] = [];
    const stream = new ExpeditionEventStream({
      expeditionId: shellModel.projection.expedition.id,
      initialSequence: 2,
      onEvents: () => undefined,
      onStatus: (status) => statuses.push(status),
      onBoundaryError: (message) => boundaryErrors.push(message),
      retryDelaysMs: [250],
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as EventStreamSocket;
      },
      urlFactory: (_expeditionId, after) => `ws://fixture/stream?after=${after}`,
    });

    stream.start();
    sockets[0]?.message({ schemaVersion: 999, type: 'world.events' });
    await flushMessages();

    expect(stream.cursor).toBe(2);
    expect(statuses.at(-1)).toMatchObject({ phase: 'schema_error', cursor: 2 });
    expect(boundaryErrors).toEqual([
      'Event stream schema validation failed. Last valid sequence 2 remains authoritative.',
    ]);
    await vi.advanceTimersByTimeAsync(250);
    expect(sockets).toHaveLength(2);
    expect(statuses.at(-1)).toMatchObject({ phase: 'reconnecting', cursor: 2 });
    stream.stop();
  });

  it('does not advance when the authoritative projection callback fails', async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const statuses: EventStreamStatus[] = [];
    const stream = new ExpeditionEventStream({
      expeditionId: shellModel.projection.expedition.id,
      initialSequence: 2,
      onEvents: async () => {
        throw new Error('Injected snapshot outage.');
      },
      onStatus: (status) => statuses.push(status),
      retryDelaysMs: [250],
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket as unknown as EventStreamSocket;
      },
      urlFactory: (_expeditionId, after) => `ws://fixture/stream?after=${after}`,
    });

    stream.start();
    sockets[0]?.message({
      schemaVersion: SCHEMA_VERSION,
      type: 'world.events',
      expeditionId: shellModel.projection.expedition.id,
      afterSequence: 2,
      sequence: 3,
      events: [pauseEvent(3)],
    });
    await flushMessages();

    expect(stream.cursor).toBe(2);
    expect(statuses.at(-1)).toMatchObject({ phase: 'reconnecting', cursor: 2 });
    await vi.advanceTimersByTimeAsync(250);
    expect(sockets).toHaveLength(2);
    stream.stop();
  });
});
