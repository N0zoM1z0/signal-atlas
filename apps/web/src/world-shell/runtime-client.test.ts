import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createExpedition,
  fetchExpeditionSnapshot,
  fetchRuntimeDiagnostics,
} from './runtime-client.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('browser runtime boundary', () => {
  it('rejects a snapshot that does not satisfy the minimum projection envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ projection: { sequence: 2 } }))),
    );

    await expect(fetchExpeditionSnapshot('exp-helios3-demo')).rejects.toThrow(
      'The orchestrator returned an invalid world projection.',
    );
  });

  it('rejects an object-like snapshot with arrays in entity-map positions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              projection: {
                projectionSchemaVersion: 1,
                sequence: 999,
                expedition: { id: 'exp-helios3-demo' },
                agentsById: [],
                worldManifest: {},
              },
            }),
          ),
      ),
    );

    await expect(fetchExpeditionSnapshot('exp-helios3-demo')).rejects.toThrow(
      'The orchestrator returned an invalid world projection.',
    );
  });

  it('aborts a stalled orchestrator request after the fixed browser timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('The request was aborted.', 'AbortError')),
              { once: true },
            );
          }),
      ),
    );

    const request = expect(fetchExpeditionSnapshot('exp-helios3-demo')).rejects.toThrow(
      'Orchestrator request timed out after 10000 ms.',
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await request;
  });

  it('sends a strict idempotent scenario creation request', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            created: true,
            duplicate: false,
            expedition: { id: 'exp-northlight-demo' },
          }),
          { status: 201 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createExpedition('northlight-harbor', 1, 'create:northlight:test:1'),
    ).resolves.toMatchObject({ created: true, expedition: { id: 'exp-northlight-demo' } });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/expeditions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          scenarioId: 'northlight-harbor',
          scenarioVersion: 1,
          idempotencyKey: 'create:northlight:test:1',
        }),
      }),
    );
  });

  it('requests diagnostics for the selected expedition', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ workspace: {} })));
    vi.stubGlobal('fetch', fetchMock);

    await fetchRuntimeDiagnostics('exp-one:with-safe-id');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/runtime/diagnostics?expeditionId=exp-one%3Awith-safe-id',
      expect.any(Object),
    );
  });
});
