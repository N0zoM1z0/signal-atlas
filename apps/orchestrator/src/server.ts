import { buildApp } from './app.js';
import { installGracefulShutdown } from './graceful-shutdown.js';

const host = process.env['HOST'] ?? '127.0.0.1';
const port = Number(process.env['PORT'] ?? 4317);
const app = buildApp();
const uninstallGracefulShutdown = installGracefulShutdown(app);

try {
  await app.listen({ host, port });
} catch (error: unknown) {
  uninstallGracefulShutdown();
  app.log.error({ error }, 'Unable to start the Signal Atlas orchestrator.');
  await app.close().catch(() => undefined);
  process.exitCode = 1;
}
