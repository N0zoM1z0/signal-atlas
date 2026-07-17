import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBuildRuntime } from '@signal-atlas/build-runtime';

import { App } from './App.js';
import '@signal-atlas/ui/styles.css';
import './styles.css';

const root = document.getElementById('root');
const runtime = createBuildRuntime();

if (!root) {
  throw new Error('Signal Atlas could not find the application root.');
}

createRoot(root).render(
  <StrictMode>
    <App runtime={runtime} />
  </StrictMode>,
);
