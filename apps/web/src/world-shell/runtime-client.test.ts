import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchExpeditionSnapshot } from './runtime-client.js';

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

    await expect(fetchExpeditionSnapshot()).rejects.toThrow(
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

    await expect(fetchExpeditionSnapshot()).rejects.toThrow(
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

    const request = expect(fetchExpeditionSnapshot()).rejects.toThrow(
      'Orchestrator request timed out after 10000 ms.',
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await request;
  });
});
