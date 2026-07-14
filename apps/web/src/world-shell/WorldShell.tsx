import { useEffect, useMemo, useRef, useState } from 'react';

import { AgentDock } from './AgentDock.js';
import { CommandTray } from './CommandTray.js';
import { MarketRibbon } from './MarketRibbon.js';
import { shellModel } from './model.js';
import { SignalRail } from './SignalRail.js';
import { WorldStageHost } from './WorldStageHost.js';

type RuntimeState = 'ready' | 'loading' | 'disconnected';
type MobilePanel = 'agents' | 'signals' | null;

function runtimeStateFromLocation(): RuntimeState {
  if (typeof window === 'undefined') return 'ready';
  const state = new URLSearchParams(window.location.search).get('state');
  return state === 'loading' || state === 'disconnected' ? state : 'ready';
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function WorldShell() {
  const [agentDockCollapsed, setAgentDockCollapsed] = useState(false);
  const [signalRailCollapsed, setSignalRailCollapsed] = useState(false);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [selectedAgentId, setSelectedAgentId] = useState(shellModel.agents[0]?.id ?? 'mira');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>('observatory');
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [mode, setMode] = useState<'director' | 'observatory'>('director');
  const [command, setCommand] = useState(
    'Check whether the weather advisory is newer than the launch notice',
  );
  const [announcement, setAnnouncement] = useState('Fixture projection ready.');
  const [reducedMotion, setReducedMotion] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runtimeState = runtimeStateFromLocation();

  const selectedAgent = useMemo(
    () => shellModel.agents.find((agent) => agent.id === selectedAgentId) ?? shellModel.agents[0],
    [selectedAgentId],
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener('change', updatePreference);
    return () => media.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobilePanel(null);
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (event.key === '/') {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      const agentIndex = Number(event.key) - 1;
      const shortcutAgent = shellModel.agents[agentIndex];
      if (shortcutAgent) {
        setSelectedAgentId(shortcutAgent.id);
        setAnnouncement(`${shortcutAgent.name} selected.`);
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        setPaused((current) => !current);
        return;
      }

      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        setSpeed((current) => {
          const speeds = [1, 2, 4] as const;
          const index = speeds.indexOf(current);
          const delta = event.key === ']' ? 1 : -1;
          return speeds[(index + delta + speeds.length) % speeds.length] ?? 1;
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!selectedAgent) {
    return <main role="alert">The fixture does not define an expedition team.</main>;
  }

  const openPanel = (panel: 'agents' | 'signals' | 'archive' | 'professor') => {
    if (panel === 'agents' || panel === 'signals') {
      setMobilePanel((current) => (current === panel ? null : panel));
      return;
    }

    setAnnouncement(
      panel === 'archive'
        ? 'Archive workspace arrives in the investigation journey.'
        : 'Professor Vale arrives in the collaboration journey.',
    );
  };

  return (
    <div
      className="signal-atlas-shell"
      data-agent-collapsed={agentDockCollapsed}
      data-signal-collapsed={signalRailCollapsed}
      data-tray-expanded={trayExpanded}
    >
      <a className="atlas-skip-link" href="#world-stage">
        Skip to world stage
      </a>

      <MarketRibbon
        mode={mode}
        onModeChange={() =>
          setMode((current) => (current === 'director' ? 'observatory' : 'director'))
        }
        onPauseChange={() => setPaused((current) => !current)}
        onSpeedChange={() => setSpeed((current) => (current === 1 ? 2 : current === 2 ? 4 : 1))}
        paused={paused}
        runtimeState={runtimeState}
        speed={speed}
      />

      <AgentDock
        agents={shellModel.agents}
        collapsed={agentDockCollapsed}
        disconnected={runtimeState === 'disconnected'}
        mobileOpen={mobilePanel === 'agents'}
        onSelectAgent={(agentId) => {
          const agent = shellModel.agents.find((candidate) => candidate.id === agentId);
          setSelectedAgentId(agentId);
          setAnnouncement(`${agent?.name ?? 'Agent'} selected.`);
        }}
        onToggleCollapsed={() => setAgentDockCollapsed((current) => !current)}
        selectedAgentId={selectedAgentId}
      />

      <WorldStageHost
        agentsDrawerOpen={mobilePanel === 'agents'}
        loading={runtimeState === 'loading'}
        onOpenPanel={openPanel}
        onSelectAgent={(agentId) => {
          const agent = shellModel.agents.find((candidate) => candidate.id === agentId);
          setSelectedAgentId(agentId);
          setAnnouncement(`${agent?.name ?? 'Agent'} selected from the world.`);
        }}
        onSelectPlace={(placeId) => {
          const place = shellModel.places.find((candidate) => candidate.id === placeId);
          setSelectedPlaceId(placeId);
          setAnnouncement(`${place?.name ?? 'Place'} selected.`);
        }}
        places={shellModel.places}
        reducedMotion={reducedMotion}
        routes={shellModel.routes}
        sceneDefinition={shellModel.sceneDefinition}
        selectedAgentId={selectedAgentId}
        selectedAgentName={selectedAgent.name}
        selectedPlaceId={selectedPlaceId}
        signalsDrawerOpen={mobilePanel === 'signals'}
      />

      <SignalRail
        collapsed={signalRailCollapsed}
        mobileOpen={mobilePanel === 'signals'}
        onToggleCollapsed={() => setSignalRailCollapsed((current) => !current)}
        signals={shellModel.stagedSignals}
      />

      <CommandTray
        command={command}
        expanded={trayExpanded}
        inputRef={inputRef}
        onCommandChange={setCommand}
        onDispatch={() => {
          setTrayExpanded(true);
          setAnnouncement(
            `Mission draft prepared for ${selectedAgent.name}. Confirmation is required.`,
          );
        }}
        onExpandedChange={() => setTrayExpanded((current) => !current)}
        selectedAgent={selectedAgent}
      />

      <p aria-live="polite" className="atlas-visually-hidden" role="status">
        {announcement}
      </p>
    </div>
  );
}
