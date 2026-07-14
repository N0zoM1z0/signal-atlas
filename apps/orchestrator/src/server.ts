import { buildApp } from './app.js';

const host = process.env['HOST'] ?? '127.0.0.1';
const port = Number(process.env['PORT'] ?? 4317);
const app = buildApp();

try {
  await app.listen({ host, port });
} catch (error: unknown) {
  app.log.error({ error }, 'Unable to start the Signal Atlas orchestrator.');
  process.exitCode = 1;
}
