import { createContext, useContext } from 'react';

import type { RuntimePort } from './runtime-port.js';

export const RuntimeContext = createContext<RuntimePort | undefined>(undefined);

export function useRuntime(): RuntimePort {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('Signal Atlas runtime provider is missing.');
  return runtime;
}
