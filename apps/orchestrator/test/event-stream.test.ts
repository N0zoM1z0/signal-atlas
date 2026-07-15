import { parseEventStreamEnvelope, type EventStreamEnvelope } from '@signal-atlas/contracts';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { ExpeditionRuntime } from '../src/expedition-runtime.js';

const openApps: ReturnType<typeof buildApp>[] = [];
type InjectWebSocketOptions = NonNullable<Parameters<ReturnType<typeof buildApp>['injectWS']>[2]>;

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

function pauseCommand(index: number) {
  return {
    id: `cmd-stream-pause-${index}`,
    idempotencyKey: `stream:pause:${index}:fixture`,
    expeditionId: 'exp-helios3-demo',
    issuedAt: `2027-09-26T18:3${index}:00Z`,
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'expedition.pause',
    payload: { reason: 'Exercise the event stream.' },
  };
}

function privateForecastCommand() {
  return {
    id: 'cmd-stream-private-forecast',
    idempotencyKey: 'stream:private:forecast',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:38:00Z',
    actor: { kind: 'player' as const },
    schemaVersion: 1 as const,
    type: 'forecast.commit' as const,
    payload: {
      commit: {
        id: 'forecast-stream-private',
        expeditionId: 'exp-helios3-demo',
        actor: { kind: 'player' as const },
        previousProbabilities: { yes: 0.55, no: 0.45 },
        newProbabilities: { yes: 0.55, no: 0.45 },
        rationale: 'A public rationale remains available to the event choreography.',
        evidenceSignalIds: [],
        assumptions: ['No new source was added.'],
        createdAt: '2027-09-26T18:38:00Z',
        commitType: 'hold' as const,
        publicNote: 'Public stream note.',
        privateMemo: 'private-stream-sentinel-must-not-leave-local-authority',
        scoringEligible: true,
      },
    },
  };
}

function collectMessages(messages: EventStreamEnvelope[]): InjectWebSocketOptions {
  return {
    onInit(socket) {
      socket.on('message', (data) => {
        messages.push(parseEventStreamEnvelope(JSON.parse(data.toString())));
      });
    },
  };
}

describe('expedition event stream', () => {
  it('catches up, publishes live commits, and resumes exactly after the last sequence', async () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    const app = buildApp({ runtime });
    openApps.push(app);
    await app.ready();

    const initialMessages: EventStreamEnvelope[] = [];
    const initialSocket = await app.injectWS(
      '/api/expeditions/exp-helios3-demo/stream?after=0',
      {},
      collectMessages(initialMessages),
    );
    await vi.waitFor(() => {
      expect(initialMessages).toHaveLength(2);
    });
    expect(initialMessages).toMatchObject([
      {
        type: 'world.events',
        afterSequence: 0,
        sequence: 2,
        events: [{ sequence: 1 }, { sequence: 2 }],
      },
      { type: 'world.ready', sequence: 2 },
    ]);

    const accepted = runtime.submit(pauseCommand(1));
    expect(accepted).toMatchObject({ accepted: true, sequence: 3 });
    await vi.waitFor(() => {
      expect(initialMessages).toHaveLength(3);
    });
    expect(initialMessages[2]).toMatchObject({
      type: 'world.events',
      afterSequence: 2,
      sequence: 3,
      events: [{ sequence: 3, type: 'expedition.paused' }],
    });
    initialSocket.close();

    const resumedMessages: EventStreamEnvelope[] = [];
    const resumedSocket = await app.injectWS(
      '/api/expeditions/exp-helios3-demo/stream?after=3',
      {},
      collectMessages(resumedMessages),
    );
    await vi.waitFor(() => {
      expect(resumedMessages).toHaveLength(1);
    });
    expect(resumedMessages[0]).toMatchObject({ type: 'world.ready', sequence: 3 });
    resumedSocket.close();
  });

  it('returns boundary-specific errors for invalid cursors and client messages', async () => {
    const app = buildApp();
    openApps.push(app);
    await app.ready();

    const invalidCursorMessages: EventStreamEnvelope[] = [];
    const invalidCursorSocket = await app.injectWS(
      '/api/expeditions/exp-helios3-demo/stream?after=999',
      {},
      collectMessages(invalidCursorMessages),
    );
    await vi.waitFor(() => {
      expect(invalidCursorMessages).toHaveLength(1);
    });
    expect(invalidCursorMessages[0]).toMatchObject({
      type: 'world.error',
      boundary: 'event_stream',
      code: 'invalid_cursor',
      sequence: 2,
    });
    invalidCursorSocket.terminate();

    const clientMessageErrors: EventStreamEnvelope[] = [];
    const clientMessageSocket = await app.injectWS(
      '/api/expeditions/exp-helios3-demo/stream?after=2',
      {},
      collectMessages(clientMessageErrors),
    );
    await vi.waitFor(() => {
      expect(clientMessageErrors).toHaveLength(1);
    });
    clientMessageSocket.send('client payload');
    await vi.waitFor(() => {
      expect(clientMessageErrors).toHaveLength(2);
    });
    expect(clientMessageErrors[1]).toMatchObject({
      type: 'world.error',
      boundary: 'event_stream',
      code: 'unsupported_client_message',
    });
    clientMessageSocket.terminate();
  });

  it('rejects foreign browser origins before streaming any local event', async () => {
    const app = buildApp();
    openApps.push(app);
    await app.ready();
    const messages: EventStreamEnvelope[] = [];

    const socket = await app.injectWS(
      '/api/expeditions/exp-helios3-demo/stream?after=0',
      { headers: { origin: 'https://attacker.example' } },
      collectMessages(messages),
    );
    await vi.waitFor(() => expect(socket.readyState).toBeGreaterThanOrEqual(2));

    expect(messages).toEqual([]);
  });

  it('strips private forecast memos from same-origin browser stream events', async () => {
    const runtime = new ExpeditionRuntime(createHelios3ExpeditionFixture());
    const app = buildApp({ runtime });
    openApps.push(app);
    await app.ready();
    const accepted = runtime.submit(privateForecastCommand());
    expect(accepted).toMatchObject({ accepted: true, sequence: 3 });
    const messages: EventStreamEnvelope[] = [];

    const socket = await app.injectWS(
      '/api/expeditions/exp-helios3-demo/stream?after=2',
      { headers: { origin: 'http://127.0.0.1:4173' } },
      collectMessages(messages),
    );
    await vi.waitFor(() => expect(messages).toHaveLength(2));
    const eventEnvelope = messages[0];
    if (eventEnvelope?.type !== 'world.events') {
      throw new Error('Expected the private forecast catch-up batch.');
    }
    const forecastEvent = eventEnvelope.events[0];
    expect(forecastEvent).toMatchObject({
      type: 'forecast.committed',
      payload: { publicNote: 'Public stream note.' },
    });
    expect(JSON.stringify(eventEnvelope)).not.toContain(
      'private-stream-sentinel-must-not-leave-local-authority',
    );
    socket.close();
  });
});
