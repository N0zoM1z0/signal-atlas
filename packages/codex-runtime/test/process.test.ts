import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runCodexProcess } from '../src/index.js';

describe('runCodexProcess', () => {
  it('terminates a process group that ignores graceful cancellation', async () => {
    const controller = new AbortController();
    const fixturePath = fileURLToPath(
      new URL('./fixtures/ignore-termination.mjs', import.meta.url),
    );
    const cancellation = setTimeout(
      () => controller.abort(new Error('bounded test cancellation')),
      100,
    );

    const result = await runCodexProcess({
      executable: process.execPath,
      args: [fixturePath],
      cwd: process.cwd(),
      env: process.env,
      stdin: '',
      signal: controller.signal,
      killGraceMs: 50,
    });
    clearTimeout(cancellation);

    expect(result.aborted).toBe(true);
    expect(result.signal).toBe('SIGKILL');
  });
});
