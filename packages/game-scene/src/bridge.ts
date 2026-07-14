import type { WorldSceneBridge, WorldSceneCommand, WorldSceneEvent } from './types.js';

const MAX_PENDING_COMMANDS = 32;

export function createWorldSceneBridge(): WorldSceneBridge {
  const commandHandlers = new Set<(command: WorldSceneCommand) => void>();
  const eventHandlers = new Set<(event: WorldSceneEvent) => void>();
  const pendingCommands: WorldSceneCommand[] = [];

  return {
    connect(handler) {
      commandHandlers.add(handler);
      const queuedCommands = pendingCommands.splice(0);
      queuedCommands.forEach((command) => handler(command));
      return () => commandHandlers.delete(handler);
    },
    emit(event) {
      eventHandlers.forEach((handler) => handler(event));
    },
    send(command) {
      if (commandHandlers.size === 0) {
        pendingCommands.push(command);
        if (pendingCommands.length > MAX_PENDING_COMMANDS) pendingCommands.shift();
        return;
      }
      commandHandlers.forEach((handler) => handler(command));
    },
    subscribe(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
  };
}
