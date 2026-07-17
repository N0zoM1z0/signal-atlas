import type { WorldProjection } from '@signal-atlas/simulation';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { RuntimeProvider } from './app-runtime/RuntimeProvider.js';
import { useRuntime } from './app-runtime/runtime-context.js';
import type { RuntimePort } from './app-runtime/runtime-port.js';
import type { ExpeditionListItem, ScenarioListItem } from './world-shell/runtime-client.js';

const ComponentDemo = lazy(async () => {
  const module = await import('./ComponentDemo.js');
  return { default: module.ComponentDemo };
});

const ExpeditionLobby = lazy(async () => {
  const module = await import('./ExpeditionLobby.js');
  return { default: module.ExpeditionLobby };
});

const WorldShell = lazy(async () => {
  const module = await import('./world-shell/WorldShell.js');
  return { default: module.WorldShell };
});

export interface AppProps {
  initialProjection?: WorldProjection;
  runtime: RuntimePort;
}

interface ExpeditionBootstrapProps {
  initialProjection?: WorldProjection;
}

type AtlasView = 'loading' | 'lobby' | 'world';

function AtlasViewLoadingBoundary({
  description = 'Loading the local expedition catalog and authoritative snapshot.',
}: {
  description?: string;
}) {
  return (
    <main aria-busy="true" className="atlas-bootstrap-boundary" role="status">
      <strong>Opening Signal Atlas…</strong>
      <span>{description}</span>
    </main>
  );
}

function FocusWhenMounted({ children, selector }: { children: ReactNode; selector: string }) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(selector)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selector]);

  return children;
}

function requestedExpeditionId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('expedition') ?? undefined;
}

function basePath(): string {
  const configured = import.meta.env.BASE_URL || '/';
  return configured.endsWith('/') ? configured : `${configured}/`;
}

function lobbyRequested(runtimeKind: RuntimePort['kind']): boolean {
  if (typeof window === 'undefined') return false;
  return runtimeKind === 'static-demo'
    ? new URLSearchParams(window.location.search).get('view') === 'lobby'
    : window.location.pathname === '/lobby';
}

function lobbyUrl(runtimeKind: RuntimePort['kind']): string {
  return runtimeKind === 'static-demo' ? `${basePath()}?view=lobby` : '/lobby';
}

function worldUrl(expeditionId: string, runtimeKind: RuntimePort['kind']): string {
  const root = runtimeKind === 'static-demo' ? basePath() : '/';
  return `${root}?expedition=${encodeURIComponent(expeditionId)}`;
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
        if (updateHistory) {
          window.history.pushState({}, '', worldUrl(expeditionId, runtime.kind));
        }
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
      if (updateHistory) window.history.pushState({}, '', lobbyUrl(runtime.kind));
      if (scenarios.length === 0) {
        void refreshCatalog().catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : 'The catalog could not be loaded.');
        });
      }
    },
    [refreshCatalog, runtime.kind, scenarios.length],
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
        if (lobbyRequested(runtime.kind)) {
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
      if (lobbyRequested(runtime.kind)) {
        openLobby(false);
        return;
      }
      const expeditionId = requestedExpeditionId() ?? expeditions[0]?.id;
      if (expeditionId) void openExpedition(expeditionId, false);
      else openLobby(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [expeditions, initialProjection, openExpedition, openLobby, runtime.kind]);

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
      window.history.pushState({}, '', worldUrl(result.expedition.id, runtime.kind));
    } catch (caught: unknown) {
      if (navigationEpoch !== navigationEpochRef.current) return;
      setError(caught instanceof Error ? caught.message : 'The expedition could not be created.');
    } finally {
      if (navigationEpoch === navigationEpochRef.current) setBusyScenarioId(undefined);
    }
  };

  const resetStaticDemo = async () => {
    if (!runtime.resetDemoWorkspace) return;
    navigationEpochRef.current += 1;
    setBusyScenarioId('static-demo-reset');
    setError(undefined);
    try {
      await runtime.resetDemoWorkspace();
      setProjection(undefined);
      setExpeditions([]);
      setView('lobby');
      window.history.replaceState({}, '', lobbyUrl(runtime.kind));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The static demo could not be reset.');
    } finally {
      setBusyScenarioId(undefined);
    }
  };

  if (view === 'loading') {
    return <AtlasViewLoadingBoundary />;
  }

  if (view === 'lobby' || !projection) {
    return (
      <Suspense
        fallback={<AtlasViewLoadingBoundary description="Loading the selected Atlas workspace." />}
      >
        <FocusWhenMounted selector="[data-atlas-view='lobby']">
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
            {...(runtime.kind === 'static-demo'
              ? { onReset: () => void resetStaticDemo(), runtimeKind: runtime.kind }
              : { runtimeKind: runtime.kind })}
            scenarios={scenarios}
          />
        </FocusWhenMounted>
      </Suspense>
    );
  }

  return (
    <Suspense
      fallback={<AtlasViewLoadingBoundary description="Loading the selected Atlas workspace." />}
    >
      <FocusWhenMounted selector="#world-stage">
        <WorldShell
          initialProjection={projection}
          key={projection.expedition.id}
          onOpenLobby={() => openLobby()}
        />
      </FocusWhenMounted>
    </Suspense>
  );
}

function AppContent({ initialProjection }: ExpeditionBootstrapProps) {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname;

  if (pathname === '/components' || pathname.endsWith('/components')) {
    return (
      <Suspense
        fallback={<AtlasViewLoadingBoundary description="Loading the selected Atlas workspace." />}
      >
        <ComponentDemo />
      </Suspense>
    );
  }

  return <ExpeditionBootstrap {...(initialProjection ? { initialProjection } : {})} />;
}

export function App({ initialProjection, runtime }: AppProps) {
  return (
    <RuntimeProvider runtime={runtime}>
      <AppContent {...(initialProjection ? { initialProjection } : {})} />
    </RuntimeProvider>
  );
}
