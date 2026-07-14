globalThis.process.on('SIGTERM', () => {
  // Exercise the wrapper's grace period and SIGKILL escalation.
});

globalThis.setInterval(() => undefined, 1_000);
