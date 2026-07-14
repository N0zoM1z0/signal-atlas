import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import '@signal-atlas/ui/styles.css';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Signal Atlas could not find the application root.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
