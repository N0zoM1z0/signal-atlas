import type { RuntimePort } from './runtime-port.js';
import { createStaticDemoRuntime } from './static-demo-runtime.js';

export function createBuildRuntime(): RuntimePort {
  return createStaticDemoRuntime();
}
