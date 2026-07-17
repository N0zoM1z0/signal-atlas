import type { ReactNode } from 'react';

import { RuntimeContext } from './runtime-context.js';
import type { RuntimePort } from './runtime-port.js';

export interface RuntimeProviderProps {
  children: ReactNode;
  runtime: RuntimePort;
}

export function RuntimeProvider({ children, runtime }: RuntimeProviderProps) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}
