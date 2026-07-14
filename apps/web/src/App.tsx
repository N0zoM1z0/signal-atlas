import { ComponentDemo } from './ComponentDemo.js';
import { WorldShell } from './world-shell/WorldShell.js';

export function App() {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname;

  if (pathname === '/components') {
    return <ComponentDemo />;
  }

  return <WorldShell />;
}
