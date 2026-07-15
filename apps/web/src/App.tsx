import type { WorldProjection } from '@signal-atlas/simulation';
import { useEffect, useState } from 'react';

import { ComponentDemo } from './ComponentDemo.js';
import { fetchExpeditions, fetchExpeditionSnapshot } from './world-shell/runtime-client.js';
import { WorldShell } from './world-shell/WorldShell.js';

export interface AppProps {
  initialProjection?: WorldProjection;
}

function ExpeditionBootstrap({ initialProjection }: AppProps) {
  const [projection, setProjection] = useState(initialProjection);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (initialProjection) return;
    let active = true;
    void fetchExpeditions()
      .then(async (expeditions) => {
        const requestedId = new URLSearchParams(window.location.search).get('expedition');
        const selected =
          expeditions.find((expedition) => expedition.id === requestedId) ?? expeditions[0];
        if (!selected) throw new Error('No local expedition is available.');
        return fetchExpeditionSnapshot(selected.id);
      })
      .then((nextProjection) => {
        if (active) setProjection(nextProjection);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : 'The expedition could not be opened.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [initialProjection]);

  if (error) {
    return (
      <main className="atlas-bootstrap-boundary" role="alert">
        <strong>Signal Atlas could not open the local workspace.</strong>
        <span>{error}</span>
      </main>
    );
  }
  if (!projection) {
    return (
      <main aria-busy="true" className="atlas-bootstrap-boundary" role="status">
        <strong>Opening Signal Atlas…</strong>
        <span>Loading the local expedition catalog and authoritative snapshot.</span>
      </main>
    );
  }
  return <WorldShell initialProjection={projection} />;
}

export function App({ initialProjection }: AppProps = {}) {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname;

  if (pathname === '/components') {
    return <ComponentDemo />;
  }

  return <ExpeditionBootstrap {...(initialProjection ? { initialProjection } : {})} />;
}
