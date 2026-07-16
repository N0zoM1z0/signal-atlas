import type { WorldProjection } from '@signal-atlas/simulation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ComponentDemo } from './ComponentDemo.js';
import { ExpeditionLobby } from './ExpeditionLobby.js';
import { remoteRuntime } from './app-runtime/remote-runtime.js';
import { RuntimeProvider } from './app-runtime/RuntimeProvider.js';
import { useRuntime } from './app-runtime/runtime-context.js';
import type { RuntimePort } from './app-runtime/runtime-port.js';
import type { ExpeditionListItem, ScenarioListItem } from './world-shell/runtime-client.js';
import { WorldShell } from './world-shell/WorldShell.js';

export interface AppProps {
  initialProjection?: WorldProjection;
  runtime?: RuntimePort;
}

interface ExpeditionBootstrapProps {
  initialProjection?: WorldProjection;
}

type AtlasView = 'loading' | 'lobby' | 'world';

function requestedExpeditionId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('expedition') ?? undefined;
}

function lobbyRequested(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === '/lobby';
}

function worldUrl(expeditionId: string): string {
  return `/?expedition=${encodeURIComponent(expeditionId)}`;
}

function ExpeditionBootstrap({ initialProjection }: ExpeditionBootstrapProps) {
  const runtime = useRuntime();
  const [projection, setProjection] = useState(initialProjection);
  const [view, setView] = useState<AtlasView>(initialProjection ? 'world' : 'loading');
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [expeditions, setExpeditions] = useState<ExpeditionListItem[]>([]);
  const [busyScenarioId, setBusyScenarioId] = useState<string>();
  const [error, setError] = useState<string>();
  const navigationEpochRef = useRef(0);

  const refreshCatalog = useCallback(async () => {
    const [nextScenarios, nextExpeditions] = await Promise.all([
      runtime.fetchScenarios(),
      runtime.fetchExpeditions(),
    ]);
    setScenarios(nextScenarios);
    setExpeditions(nextExpeditions);
    return { scenarios: nextScenarios, expeditions: nextExpeditions };
  }, [runtime]);

  const openExpedition = useCallback(
    async (expeditionId: string, updateHistory = true) => {
      const navigationEpoch = ++navigationEpochRef.current;
      const expedition = expeditions.find((candidate) => candidate.id === expeditionId);
      setBusyScenarioId(expedition?.scenarioId ?? expeditionId);
      setError(undefined);
      try {
        const nextProjection = await runtime.fetchExpeditionSnapshot(expeditionId);
        if (navigationEpoch !== navigationEpochRef.current) return;
        setProjection(nextProjection);
        setView('world');
        if (updateHistory) window.history.pushState({}, '', worldUrl(expeditionId));
      } catch (caught: unknown) {
        if (navigationEpoch !== navigationEpochRef.current) return;
        setError(caught instanceof Error ? caught.message : 'The expedition could not be opened.');
        setView('lobby');
      } finally {
        if (navigationEpoch === navigationEpochRef.current) setBusyScenarioId(undefined);
      }
    },
    [expeditions, runtime],
  );

  const openLobby = useCallback(
    (updateHistory = true) => {
      navigationEpochRef.current += 1;
      setProjection(undefined);
      setView('lobby');
      setBusyScenarioId(undefined);
      if (updateHistory) window.history.pushState({}, '', '/lobby');
      if (scenarios.length === 0) {
        void refreshCatalog().catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : 'The catalog could not be loaded.');
        });
      }
    },
    [refreshCatalog, scenarios.length],
  );

  useEffect(() => {
    if (initialProjection) return;
    let active = true;
    const navigationEpoch = ++navigationEpochRef.current;
    void Promise.all([runtime.fetchScenarios(), runtime.fetchExpeditions()])
      .then(async ([availableScenarios, availableExpeditions]) => {
        if (!active || navigationEpoch !== navigationEpochRef.current) return;
        setScenarios(availableScenarios);
        setExpeditions(availableExpeditions);
        if (lobbyRequested()) {
          setView('lobby');
          return;
        }
        const requestedId = requestedExpeditionId();
        const selected = requestedId
          ? availableExpeditions.find((expedition) => expedition.id === requestedId)
          : availableExpeditions[0];
        if (!selected) {
          setView('lobby');
          if (requestedId) setError(`Expedition ${requestedId} is not available locally.`);
          return;
        }
        const nextProjection = await runtime.fetchExpeditionSnapshot(selected.id);
        if (!active || navigationEpoch !== navigationEpochRef.current) return;
        setProjection(nextProjection);
        setView('world');
      })
      .catch((caught: unknown) => {
        if (!active || navigationEpoch !== navigationEpochRef.current) return;
        setError(
          caught instanceof Error ? caught.message : 'The local workspace could not be opened.',
        );
        setView('lobby');
      });
    return () => {
      active = false;
    };
  }, [initialProjection, runtime]);

  useEffect(() => {
    if (initialProjection) return;
    const onPopState = () => {
      if (lobbyRequested()) {
        openLobby(false);
        return;
      }
      const expeditionId = requestedExpeditionId() ?? expeditions[0]?.id;
      if (expeditionId) void openExpedition(expeditionId, false);
      else openLobby(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [expeditions, initialProjection, openExpedition, openLobby]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const destination =
        view === 'lobby'
          ? document.querySelector<HTMLElement>('[data-atlas-view="lobby"]')
          : view === 'world'
            ? document.querySelector<HTMLElement>('#world-stage')
            : undefined;
      destination?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [projection?.expedition.id, view]);

  const createScenarioExpedition = async (scenario: ScenarioListItem) => {
    const navigationEpoch = ++navigationEpochRef.current;
    setBusyScenarioId(scenario.id);
    setError(undefined);
    try {
      const result = await runtime.createExpedition(
        scenario.id,
        scenario.version,
        runtime.createClientId(`create-${scenario.id}`),
      );
      const nextExpeditions = await runtime.fetchExpeditions();
      if (navigationEpoch !== navigationEpochRef.current) return;
      setExpeditions(nextExpeditions);
      const nextProjection = await runtime.fetchExpeditionSnapshot(result.expedition.id);
      if (navigationEpoch !== navigationEpochRef.current) return;
      setProjection(nextProjection);
      setView('world');
      window.history.pushState({}, '', worldUrl(result.expedition.id));
    } catch (caught: unknown) {
      if (navigationEpoch !== navigationEpochRef.current) return;
      setError(caught instanceof Error ? caught.message : 'The expedition could not be created.');
    } finally {
      if (navigationEpoch === navigationEpochRef.current) setBusyScenarioId(undefined);
    }
  };

  if (view === 'loading') {
    return (
      <main aria-busy="true" className="atlas-bootstrap-boundary" role="status">
        <strong>Opening Signal Atlas…</strong>
        <span>Loading the local expedition catalog and authoritative snapshot.</span>
      </main>
    );
  }

  if (view === 'lobby' || !projection) {
    return (
      <ExpeditionLobby
        {...(busyScenarioId ? { busyScenarioId } : {})}
        {...(error ? { error } : {})}
        expeditions={expeditions}
        onCreate={(scenario) => void createScenarioExpedition(scenario)}
        onOpen={(expeditionId) => void openExpedition(expeditionId)}
        onRetry={() => {
          setError(undefined);
          void refreshCatalog().catch((caught: unknown) => {
            setError(
              caught instanceof Error ? caught.message : 'The catalog could not be refreshed.',
            );
          });
        }}
        scenarios={scenarios}
      />
    );
  }

  return (
    <WorldShell
      initialProjection={projection}
      key={projection.expedition.id}
      onOpenLobby={() => openLobby()}
    />
  );
}

function AppContent({ initialProjection }: ExpeditionBootstrapProps) {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname;

  if (pathname === '/components') return <ComponentDemo />;

  return <ExpeditionBootstrap {...(initialProjection ? { initialProjection } : {})} />;
}

export function App({ initialProjection, runtime = remoteRuntime }: AppProps = {}) {
  return (
    <RuntimeProvider runtime={runtime}>
      <AppContent {...(initialProjection ? { initialProjection } : {})} />
    </RuntimeProvider>
  );
}
