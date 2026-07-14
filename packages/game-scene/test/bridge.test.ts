import { describe, expect, it, vi } from 'vitest';

import { createWorldSceneBridge } from '../src/bridge.js';

describe('world scene bridge', () => {
  it('queues commands until the scene connects and then preserves order', () => {
    const bridge = createWorldSceneBridge();
    const handler = vi.fn();

    bridge.send({ type: 'camera.zoom', delta: 1 });
    bridge.send({ type: 'place.select', placeId: 'archive' });
    bridge.connect(handler);

    expect(handler.mock.calls).toEqual([
      [{ type: 'camera.zoom', delta: 1 }],
      [{ type: 'place.select', placeId: 'archive' }],
    ]);
  });

  it('unsubscribes command and event listeners without cross-channel leakage', () => {
    const bridge = createWorldSceneBridge();
    const commandHandler = vi.fn();
    const eventHandler = vi.fn();
    const disconnect = bridge.connect(commandHandler);
    const unsubscribe = bridge.subscribe(eventHandler);

    bridge.send({ type: 'camera.home' });
    bridge.emit({ type: 'performance.sample', framesPerSecond: 60 });
    disconnect();
    unsubscribe();
    bridge.send({ type: 'camera.home' });
    bridge.emit({ type: 'performance.sample', framesPerSecond: 30 });

    expect(commandHandler).toHaveBeenCalledTimes(1);
    expect(eventHandler).toHaveBeenCalledTimes(1);
  });
});
