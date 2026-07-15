type ShutdownSignal = 'SIGINT' | 'SIGTERM';

interface ShutdownSignalTarget {
  exitCode?: string | number | null | undefined;
  once(signal: ShutdownSignal, listener: () => void): unknown;
  removeListener(signal: ShutdownSignal, listener: () => void): unknown;
}

interface CloseableServer {
  close(): Promise<unknown>;
  log: {
    error(context: unknown, message: string): unknown;
  };
}

export function installGracefulShutdown(
  server: CloseableServer,
  signalTarget: ShutdownSignalTarget = process,
): () => void {
  let closing = false;
  const handlers = new Map<ShutdownSignal, () => void>();
  const uninstall = () => {
    for (const [signal, handler] of handlers) {
      signalTarget.removeListener(signal, handler);
    }
    handlers.clear();
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = () => {
      if (closing) return;
      closing = true;
      uninstall();
      void server.close().catch((error: unknown) => {
        signalTarget.exitCode = 1;
        server.log.error(
          {
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { name: 'UnknownError', message: 'Unknown shutdown failure.' },
          },
          `Signal Atlas failed to close cleanly after ${signal}.`,
        );
      });
    };
    handlers.set(signal, handler);
    signalTarget.once(signal, handler);
  }

  return uninstall;
}
