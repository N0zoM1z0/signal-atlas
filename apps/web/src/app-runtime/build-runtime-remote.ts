import { remoteRuntime } from './remote-runtime.js';
import type { RuntimePort } from './runtime-port.js';

export function createBuildRuntime(): RuntimePort {
  return remoteRuntime;
}
