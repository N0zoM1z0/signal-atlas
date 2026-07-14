import {
  SCHEMA_VERSION,
  type MissionVerb,
  type ProfessorResponse,
  type WorldCommand,
  type WorldEvent,
} from '@signal-atlas/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AgentDock } from './AgentDock.js';
import { ArchiveWorkspace } from './ArchiveWorkspace.js';
import { CommandTray } from './CommandTray.js';
import {
  appendSignalId,
  readEvidencePreferences,
  toggleSignalId,
  writeEvidencePreferences,
  type EvidencePreferences,
} from './evidence-preferences.js';
import { MarketRibbon } from './MarketRibbon.js';
import { MeetingWorkspace } from './MeetingWorkspace.js';
import { createShellModel, shellModel } from './model.js';
import { ProfessorWorkspace, type ProfessorQuestionInput } from './ProfessorWorkspace.js';
import {
  createClientId,
  fetchExpeditionEvents,
  fetchExpeditionSnapshot,
  fetchFixtureConfiguration,
  interpretMissionDraft,
  submitWorldCommand,
  updateFixtureMissionScenario,
  type FixtureMissionScenario,
  type MissionDraft,
} from './runtime-client.js';
import { SignalRail } from './SignalRail.js';
import { SourceInspector } from './SourceInspector.js';
import { WorldStageHost } from './WorldStageHost.js';

type RuntimeState = 'ready' | 'loading' | 'disconnected';
type MobilePanel = 'agents' | 'signals' | null;
type Workspace = 'world' | 'archive' | 'meeting' | 'professor';

function runtimeStateFromLocation(): RuntimeState {
  if (typeof window === 'undefined') return 'ready';
  const state = new URLSearchParams(window.location.search).get('state');
  return state === 'loading' || state === 'disconnected' ? state : 'ready';
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function commandEnvelope(id: string, idempotencyKey: string, issuedAt: string) {
  return {
    id,
    idempotencyKey,
    expeditionId: shellModel.projection.expedition.id,
    issuedAt,
    actor: { kind: 'player' as const },
    schemaVersion: SCHEMA_VERSION,
  };
}

function skipTravelPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('signal-atlas:skip-travel') === 'true';
}

export function WorldShell() {
  const [projection, setProjection] = useState(shellModel.projection);
  const model = useMemo(() => createShellModel(projection), [projection]);
  const [agentDockCollapsed, setAgentDockCollapsed] = useState(false);
  const [signalRailCollapsed, setSignalRailCollapsed] = useState(false);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [selectedAgentId, setSelectedAgentId] = useState(model.agents[0]?.id ?? 'mira');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>('observatory');
  const [mode, setMode] = useState<'director' | 'observatory'>('director');
  const [command, setCommand] = useState('Check latest weather at Galehaven Weather Tower');
  const [announcement, setAnnouncement] = useState('Fixture projection ready.');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>(runtimeStateFromLocation);
  const [missionDraft, setMissionDraft] = useState<MissionDraft>();
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandError, setCommandError] = useState<string>();
  const [skipTravel, setSkipTravel] = useState(skipTravelPreference);
  const [fixtureScenario, setFixtureScenario] = useState<FixtureMissionScenario>('success');
  const [workspace, setWorkspace] = useState<Workspace>('world');
  const [archiveEvents, setArchiveEvents] = useState<WorldEvent[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [activeMeetingId, setActiveMeetingId] = useState<string>();
  const [meetingEvents, setMeetingEvents] = useState<WorldEvent[]>([]);
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [evidencePreferences, setEvidencePreferences] =
    useState<EvidencePreferences>(readEvidencePreferences);
  const [inspectedSignalId, setInspectedSignalId] = useState<string>();
  const [followRequest, setFollowRequest] = useState<
    { agentId: string; requestId: number } | undefined
  >();
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSkippedTravelRef = useRef(new Set<string>());
  const paused = projection.expedition.status === 'paused';
  const projectionSpeed = projection.expedition.simulationSpeed;
  const speed: 1 | 2 | 4 = projectionSpeed === 2 || projectionSpeed === 4 ? projectionSpeed : 1;
  const runtimeActive = Object.values(projection.agentsById).some((agent) =>
    ['traveling', 'working', 'meeting'].includes(agent.publicState),
  );
  const meetingDisabled = Object.values(projection.agentsById).some(
    (agent) =>
      Boolean(agent.activeMissionId || agent.movement) || agent.queuedMissionIds.length > 0,
  );

  const selectedAgent = useMemo(
    () => model.agents.find((agent) => agent.id === selectedAgentId) ?? model.agents[0],
    [model.agents, selectedAgentId],
  );
  const inspectedSignal = model.signals.find((signal) => signal.id === inspectedSignalId);

  const useProfessorMission = (mission: NonNullable<ProfessorResponse['suggestedMission']>) => {
    const assignedAgentId = projection.agentsById['kestrel'] ? 'kestrel' : selectedAgentId;
    const missing: MissionDraft['missing'] = mission.destinationPlaceId ? [] : ['destination'];
    setSelectedAgentId(assignedAgentId);
    setCommand(mission.objective);
    setMissionDraft({
      status: missing.length === 0 ? 'ready' : 'ambiguous',
      objective: mission.objective,
      assignedAgentId,
      destinationPlaceId: mission.destinationPlaceId,
      verb: mission.verb,
      candidateAgentIds: [assignedAgentId],
      candidatePlaceIds: mission.destinationPlaceId ? [mission.destinationPlaceId] : [],
      missing,
      explanation: 'Prepared from Professor Vale’s explicit suggested mission.',
      submissionId: createClientId('professor-handoff'),
      createdAt: new Date().toISOString(),
    });
    setWorkspace('world');
    setTrayExpanded(true);
    setAnnouncement('Professor Vale’s suggested mission is ready for confirmation.');
  };

  const saveEvidencePreferences = (
    update: (current: EvidencePreferences) => EvidencePreferences,
  ) => {
    setEvidencePreferences((current) => {
      const next = update(current);
      writeEvidencePreferences(next);
      return next;
    });
  };

  const togglePinnedSignal = (signalId: string) => {
    const wasPinned = evidencePreferences.pinnedSignalIds.includes(signalId);
    saveEvidencePreferences((current) => ({
      ...current,
      pinnedSignalIds: wasPinned
        ? current.pinnedSignalIds.filter((id) => id !== signalId)
        : appendSignalId(current.pinnedSignalIds, signalId),
      caseFileEntryIds: wasPinned
        ? current.caseFileEntryIds.filter((id) => id !== `signal:${signalId}`)
        : appendSignalId(current.caseFileEntryIds, `signal:${signalId}`),
    }));
    setAnnouncement(
      `${wasPinned ? 'Removed' : 'Pinned'} signal ${wasPinned ? 'from' : 'to'} the case file.`,
    );
  };

  const toggleCaseFileEntry = (archiveId: string) => {
    const wasSelected = evidencePreferences.caseFileEntryIds.includes(archiveId);
    const signalId = archiveId.startsWith('signal:')
      ? archiveId.slice('signal:'.length)
      : undefined;
    saveEvidencePreferences((current) => ({
      ...current,
      caseFileEntryIds: wasSelected
        ? current.caseFileEntryIds.filter((id) => id !== archiveId)
        : appendSignalId(current.caseFileEntryIds, archiveId),
      pinnedSignalIds: signalId
        ? wasSelected
          ? current.pinnedSignalIds.filter((id) => id !== signalId)
          : appendSignalId(current.pinnedSignalIds, signalId)
        : current.pinnedSignalIds,
    }));
    setAnnouncement(
      wasSelected
        ? 'Removed archive record from the case file.'
        : 'Added archive record to the case file.',
    );
  };

  const inspectSignal = (signalId: string) => {
    saveEvidencePreferences((current) => ({
      ...current,
      seenSignalIds: appendSignalId(current.seenSignalIds, signalId),
    }));
    setInspectedSignalId(signalId);
    const signal = model.signals.find((candidate) => candidate.id === signalId);
    setAnnouncement(
      `Inspecting ${signal?.sourceCount ?? 0} source record${signal?.sourceCount === 1 ? '' : 's'}.`,
    );
  };

  const toggleArchivedSignal = (signalId: string) => {
    const wasArchived = evidencePreferences.archivedSignalIds.includes(signalId);
    saveEvidencePreferences((current) => ({
      ...current,
      archivedSignalIds: toggleSignalId(current.archivedSignalIds, signalId),
      seenSignalIds: wasArchived
        ? current.seenSignalIds.filter((id) => id !== signalId)
        : appendSignalId(current.seenSignalIds, signalId),
    }));
    setAnnouncement(
      wasArchived
        ? 'Signal restored to the New view.'
        : 'Signal archived; it remains available under All.',
    );
  };

  const refreshProjection = useCallback(async () => {
    const nextProjection = await fetchExpeditionSnapshot();
    setProjection(nextProjection);
    setRuntimeState('ready');
    return nextProjection;
  }, []);

  const openArchiveWorkspace = useCallback(async () => {
    setWorkspace('archive');
    setTrayExpanded(false);
    setMobilePanel(null);
    setArchiveLoading(true);
    try {
      const [nextProjection, eventLog] = await Promise.all([
        fetchExpeditionSnapshot(),
        fetchExpeditionEvents(),
      ]);
      setProjection(nextProjection);
      setArchiveEvents(eventLog.events);
      setRuntimeState('ready');
      setAnnouncement('Archive Quarter opened with the current expedition index.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Archive index failed to load.';
      setCommandError(message);
      setAnnouncement(`Archive loading failed: ${message}`);
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  const conveneMeeting = useCallback(async () => {
    const participantAgentIds = Object.keys(projection.agentsById);
    const issuedAt = new Date().toISOString();
    const meetingId = createClientId('meeting');
    const commandId = createClientId('cmd-meeting');
    const worldCommand = {
      ...commandEnvelope(commandId, `meeting:${meetingId}`, issuedAt),
      type: 'meeting.request',
      payload: {
        meetingId,
        placeId: 'square',
        participantAgentIds,
      },
    } satisfies WorldCommand;
    setMeetingBusy(true);
    setCommandError(undefined);
    try {
      await submitWorldCommand(worldCommand);
      const [nextProjection, eventLog] = await Promise.all([
        fetchExpeditionSnapshot(),
        fetchExpeditionEvents(),
      ]);
      setProjection(nextProjection);
      setMeetingEvents(eventLog.events);
      setActiveMeetingId(meetingId);
      setWorkspace('meeting');
      setTrayExpanded(false);
      setMobilePanel(null);
      setRuntimeState('ready');
      setAnnouncement('The team is gathering at Lantern Square.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Meeting request failed.';
      setCommandError(message);
      setAnnouncement(`Meeting request failed: ${message}`);
    } finally {
      setMeetingBusy(false);
    }
  }, [projection.agentsById]);

  const skipMeetingArrivals = useCallback(async () => {
    if (!activeMeetingId) return;
    setMeetingBusy(true);
    setCommandError(undefined);
    try {
      let nextProjection = await fetchExpeditionSnapshot();
      for (const agent of Object.values(nextProjection.agentsById)) {
        const missionId = agent.activeMissionId;
        if (!agent.movement || !missionId?.startsWith(`meeting-mission-${activeMeetingId}-`)) {
          continue;
        }
        const issuedAt = new Date().toISOString();
        const commandId = createClientId('cmd-skip-meeting');
        await submitWorldCommand({
          ...commandEnvelope(
            commandId,
            `skip-meeting:${activeMeetingId}:${agent.id}:${commandId}`,
            issuedAt,
          ),
          type: 'agent.skip_travel',
          payload: { agentId: agent.id, missionId },
        });
        nextProjection = await fetchExpeditionSnapshot();
      }
      const eventLog = await fetchExpeditionEvents();
      setProjection(nextProjection);
      setMeetingEvents(eventLog.events);
      setAnnouncement('Arrivals skipped with every route and arrival event preserved.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Meeting skip failed.';
      setCommandError(message);
      setAnnouncement(`Meeting skip failed: ${message}`);
    } finally {
      setMeetingBusy(false);
    }
  }, [activeMeetingId]);

  const openProfessorWorkspace = useCallback(async () => {
    setWorkspace('professor');
    setTrayExpanded(false);
    setMobilePanel(null);
    try {
      await refreshProjection();
      setAnnouncement("Professor Vale's evidence-bound study opened.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Professor study failed to load.';
      setCommandError(message);
      setAnnouncement(`Professor study failed to load: ${message}`);
    }
  }, [refreshProjection]);

  const askProfessor = useCallback(
    async (input: ProfessorQuestionInput): Promise<ProfessorResponse> => {
      const createdAt = new Date().toISOString();
      const queryId = createClientId('professor-query');
      const commandId = createClientId('cmd-professor');
      const worldCommand = {
        ...commandEnvelope(commandId, `professor:${queryId}`, createdAt),
        type: 'professor.query',
        payload: {
          query: {
            id: queryId,
            expeditionId: shellModel.projection.expedition.id,
            mode: input.mode,
            question: input.question,
            selectedSourceIds: input.selectedSourceIds,
            selectedSignalIds: input.selectedSignalIds,
            createdAt,
          },
        },
      } satisfies WorldCommand;
      await submitWorldCommand(worldCommand);
      const nextProjection = await refreshProjection();
      const response = nextProjection.professorResponsesByQueryId[queryId];
      if (!response) throw new Error('Professor response was not recorded in the projection.');
      setAnnouncement('Professor Vale recorded an evidence-bound response.');
      return response;
    },
    [refreshProjection],
  );

  const openPanel = useCallback(
    (panel: 'agents' | 'signals' | 'archive' | 'professor') => {
      if (panel === 'agents' || panel === 'signals') {
        setMobilePanel((current) => (current === panel ? null : panel));
        return;
      }
      if (panel === 'archive') {
        void openArchiveWorkspace();
        return;
      }
      void openProfessorWorkspace();
    },
    [openArchiveWorkspace, openProfessorWorkspace],
  );

  const changePauseState = useCallback(async () => {
    const issuedAt = new Date().toISOString();
    const id = createClientId(paused ? 'cmd-resume' : 'cmd-pause');
    const worldCommand: WorldCommand = paused
      ? {
          ...commandEnvelope(id, `resume:${id}`, issuedAt),
          type: 'expedition.start',
          payload: {},
        }
      : {
          ...commandEnvelope(id, `pause:${id}`, issuedAt),
          type: 'expedition.pause',
          payload: { reason: 'Paused by player.' },
        };
    try {
      await submitWorldCommand(worldCommand);
      await refreshProjection();
      setAnnouncement(paused ? 'Expedition resumed.' : 'Expedition paused.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Pause control failed.';
      setCommandError(message);
      setAnnouncement(`Simulation control failed: ${message}`);
    }
  }, [paused, refreshProjection]);

  const changeSpeed = useCallback(
    async (direction: -1 | 1 = 1) => {
      const speeds = [1, 2, 4] as const;
      const index = speeds.indexOf(speed);
      const nextSpeed = speeds[(index + direction + speeds.length) % speeds.length] ?? 1;
      const issuedAt = new Date().toISOString();
      const id = createClientId('cmd-speed');
      const worldCommand = {
        ...commandEnvelope(id, `speed:${id}`, issuedAt),
        type: 'expedition.change_speed',
        payload: { speed: nextSpeed },
      } satisfies WorldCommand;
      try {
        await submitWorldCommand(worldCommand);
        await refreshProjection();
        setAnnouncement(`Simulation speed changed to ${nextSpeed} times.`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Speed control failed.';
        setCommandError(message);
        setAnnouncement(`Simulation control failed: ${message}`);
      }
    },
    [refreshProjection, speed],
  );

  const skipTravelForAgent = useCallback(
    async (agentId: string, missionId: string, automatic = false) => {
      const issuedAt = new Date().toISOString();
      const id = createClientId('cmd-skip');
      const worldCommand = {
        ...commandEnvelope(id, `skip:${agentId}:${missionId}:${id}`, issuedAt),
        type: 'agent.skip_travel',
        payload: { agentId, missionId },
      } satisfies WorldCommand;
      try {
        await submitWorldCommand(worldCommand);
        await refreshProjection();
        setAnnouncement(
          automatic
            ? 'Skip-travel preference applied; arrival events were preserved.'
            : 'Travel skipped; the agent has begun location work.',
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Skip-travel control failed.';
        if (!automatic) {
          setCommandError(message);
          setAnnouncement(`Skip travel failed: ${message}`);
        }
      }
    },
    [refreshProjection],
  );

  useEffect(() => {
    const forcedState = runtimeStateFromLocation();
    if (forcedState !== 'ready') {
      return;
    }

    let active = true;
    void Promise.all([fetchExpeditionSnapshot(), fetchFixtureConfiguration()])
      .then(([nextProjection, configuration]) => {
        if (!active) return;
        setProjection(nextProjection);
        setFixtureScenario(configuration.missionScenario);
        setRuntimeState('ready');
      })
      .catch(() => {
        if (!active) return;
        setRuntimeState('disconnected');
        setAnnouncement('Orchestrator disconnected. The last valid projection remains visible.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!runtimeActive || runtimeStateFromLocation() !== 'ready') return;
    let requestRunning = false;
    const timer = setInterval(() => {
      if (requestRunning) return;
      requestRunning = true;
      void refreshProjection()
        .catch(() => {
          setRuntimeState('disconnected');
          setAnnouncement('Orchestrator disconnected. The last valid projection remains visible.');
        })
        .finally(() => {
          requestRunning = false;
        });
    }, 250);
    return () => clearInterval(timer);
  }, [refreshProjection, runtimeActive]);

  useEffect(() => {
    if (workspace !== 'meeting' || !activeMeetingId) return;
    let active = true;
    void fetchExpeditionEvents()
      .then((eventLog) => {
        if (active) setMeetingEvents(eventLog.events);
      })
      .catch(() => {
        if (active) setAnnouncement('Meeting events could not be refreshed.');
      });
    return () => {
      active = false;
    };
  }, [activeMeetingId, projection.sequence, workspace]);

  useEffect(() => {
    if (!skipTravel) return;
    for (const agent of Object.values(projection.agentsById)) {
      if (!agent.movement || !agent.activeMissionId) continue;
      const key = `${agent.id}:${agent.activeMissionId}:${agent.movement.startedAt}`;
      if (autoSkippedTravelRef.current.has(key)) continue;
      autoSkippedTravelRef.current.add(key);
      void skipTravelForAgent(agent.id, agent.activeMissionId, true);
    }
  }, [projection.agentsById, skipTravel, skipTravelForAgent]);

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
        if (workspace !== 'world') {
          setWorkspace('world');
          setAnnouncement('Returned to the world atlas.');
        }
        setMobilePanel(null);
        setMissionDraft(undefined);
        setTrayExpanded(false);
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (event.key === '/') {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (event.key.toLocaleLowerCase('en-US') === 'a') {
        event.preventDefault();
        void openArchiveWorkspace();
        return;
      }

      if (event.key.toLocaleLowerCase('en-US') === 'p') {
        event.preventDefault();
        openPanel('professor');
        return;
      }

      const agentIndex = Number(event.key) - 1;
      const shortcutAgent = model.agents[agentIndex];
      if (shortcutAgent) {
        setSelectedAgentId(shortcutAgent.id);
        setAnnouncement(`${shortcutAgent.name} selected.`);
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        void changePauseState();
        return;
      }

      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        void changeSpeed(event.key === ']' ? 1 : -1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changePauseState, changeSpeed, model.agents, openArchiveWorkspace, openPanel, workspace]);

  if (!selectedAgent) {
    return <main role="alert">The fixture does not define an expedition team.</main>;
  }

  const prepareMissionDraft = async (objective = command) => {
    setCommand(objective);
    setTrayExpanded(true);
    setCommandBusy(true);
    setCommandError(undefined);
    try {
      const draft = await interpretMissionDraft(objective, selectedAgent.id);
      setMissionDraft(draft);
      setAnnouncement(
        draft.status === 'ready'
          ? `Mission draft prepared for ${selectedAgent.name}. Confirm to append it.`
          : `Mission draft needs ${draft.missing.join(', ')} before confirmation.`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Mission interpretation failed.';
      setCommandError(message);
      setAnnouncement(`Mission parser failed: ${message}`);
      setRuntimeState('disconnected');
    } finally {
      setCommandBusy(false);
    }
  };

  const updateMissionDraft = (patch: Partial<MissionDraft>) => {
    setMissionDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      const place = model.places.find((candidate) => candidate.id === next.destinationPlaceId);
      const missing: MissionDraft['missing'] = [];
      if (!next.assignedAgentId) missing.push('agent');
      if (!next.destinationPlaceId) missing.push('destination');
      if (!next.verb || !place?.missionVerbs.includes(next.verb)) missing.push('verb');
      return {
        ...next,
        status: missing.length === 0 ? 'ready' : 'ambiguous',
        missing,
        explanation:
          missing.length === 0
            ? 'All mission fields are explicit and supported at this location.'
            : `Confirmation is blocked until these fields are resolved: ${missing.join(', ')}.`,
      };
    });
  };

  const confirmMission = async () => {
    if (!missionDraft?.assignedAgentId || !missionDraft.destinationPlaceId || !missionDraft.verb) {
      return;
    }
    setCommandBusy(true);
    setCommandError(undefined);
    const missionId = `mission-${missionDraft.submissionId}`;
    const commandId = `cmd-${missionDraft.submissionId}`;
    const worldCommand = {
      ...commandEnvelope(commandId, missionDraft.submissionId, missionDraft.createdAt),
      type: 'agent.assign_mission',
      payload: {
        mission: {
          id: missionId,
          expeditionId: model.projection.expedition.id,
          assignedAgentId: missionDraft.assignedAgentId,
          verb: missionDraft.verb,
          objective: missionDraft.objective,
          destinationPlaceId: missionDraft.destinationPlaceId,
          budget: { maxToolCalls: 3, timeoutMs: 30_000 },
          status: 'draft',
          createdBy: { kind: 'player' },
          createdAt: missionDraft.createdAt,
        },
      },
    } satisfies WorldCommand;

    try {
      const accepted = await submitWorldCommand(worldCommand);
      await refreshProjection();
      setMissionDraft(undefined);
      setAnnouncement(
        accepted.duplicate
          ? 'The original mission is already queued; no duplicate was created.'
          : `Mission queued for ${selectedAgent.name} at sequence ${accepted.sequence}.`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Mission submission failed.';
      setCommandError(message);
      setAnnouncement(`Mission was not accepted: ${message}`);
    } finally {
      setCommandBusy(false);
    }
  };

  const cancelMission = async (missionId: string) => {
    const issuedAt = new Date().toISOString();
    const id = createClientId('cmd-cancel');
    const worldCommand = {
      ...commandEnvelope(id, `cancel:${id}`, issuedAt),
      type: 'agent.cancel_mission',
      payload: { missionId, reason: 'Canceled by player from the mission queue.' },
    } satisfies WorldCommand;
    setCommandBusy(true);
    setCommandError(undefined);
    try {
      await submitWorldCommand(worldCommand);
      await refreshProjection();
      setAnnouncement('Mission canceled. The event remains in expedition history.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Mission cancellation failed.';
      setCommandError(message);
      setAnnouncement(`Mission cancellation failed: ${message}`);
    } finally {
      setCommandBusy(false);
    }
  };

  const moveMission = async (missionId: string, direction: -1 | 1) => {
    const mission = model.missions.find((candidate) => candidate.id === missionId);
    const agent = mission ? model.projection.agentsById[mission.agentId] : undefined;
    if (!mission || !agent) return;
    const orderedMissionIds = [...agent.queuedMissionIds];
    const index = orderedMissionIds.indexOf(missionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= orderedMissionIds.length) return;
    [orderedMissionIds[index], orderedMissionIds[target]] = [
      orderedMissionIds[target] as string,
      orderedMissionIds[index] as string,
    ];
    const issuedAt = new Date().toISOString();
    const id = createClientId('cmd-reorder');
    const worldCommand = {
      ...commandEnvelope(id, `reorder:${id}`, issuedAt),
      type: 'agent.reorder_missions',
      payload: { agentId: agent.id, orderedMissionIds },
    } satisfies WorldCommand;
    setCommandBusy(true);
    setCommandError(undefined);
    try {
      await submitWorldCommand(worldCommand);
      await refreshProjection();
      setAnnouncement('Mission priority updated from an authoritative reorder event.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Mission reorder failed.';
      setCommandError(message);
      setAnnouncement(`Mission reorder failed: ${message}`);
    } finally {
      setCommandBusy(false);
    }
  };

  const changeFixtureScenario = async (scenario: FixtureMissionScenario) => {
    setCommandBusy(true);
    setCommandError(undefined);
    try {
      const configuration = await updateFixtureMissionScenario(scenario);
      setFixtureScenario(configuration.missionScenario);
      setAnnouncement(`Offline mission result set to ${scenario.replace('_', ' ')}.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Result scenario update failed.';
      setCommandError(message);
      setAnnouncement(`Offline result control failed: ${message}`);
    } finally {
      setCommandBusy(false);
    }
  };

  const retryMission = async (mission: (typeof model.missions)[number]) => {
    if (!mission.failedTurnId) return;
    const issuedAt = new Date().toISOString();
    const id = createClientId('cmd-retry');
    const worldCommand = {
      ...commandEnvelope(id, `retry:${mission.id}:${mission.failedTurnId}:${id}`, issuedAt),
      type: 'runtime.retry_turn',
      payload: {
        agentId: mission.agentId,
        missionId: mission.id,
        failedTurnId: mission.failedTurnId,
      },
    } satisfies WorldCommand;
    setCommandBusy(true);
    setCommandError(undefined);
    try {
      await submitWorldCommand(worldCommand);
      await refreshProjection();
      setAnnouncement(`Retry started for ${mission.agentName}.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Mission retry failed.';
      setCommandError(message);
      setAnnouncement(`Mission retry failed: ${message}`);
    } finally {
      setCommandBusy(false);
    }
  };

  const directDraft = () => {
    const createdAt = new Date().toISOString();
    const place = model.places.find((candidate) => candidate.id === selectedPlaceId);
    const verb = place?.missionVerbs[0] as MissionVerb | undefined;
    setMissionDraft({
      status: place && verb ? 'ready' : 'ambiguous',
      objective:
        command.trim() || `Research the latest evidence at ${place?.name ?? 'a location'}.`,
      assignedAgentId: selectedAgent.id,
      ...(place ? { destinationPlaceId: place.id } : {}),
      ...(verb ? { verb } : {}),
      candidateAgentIds: [selectedAgent.id],
      candidatePlaceIds: place ? [place.id] : [],
      missing: [
        ...(!place ? (['destination'] as const) : []),
        ...(!verb ? (['verb'] as const) : []),
      ],
      explanation: place
        ? 'Review the explicit fields before confirming this direct mission.'
        : 'Choose a destination and supported mission type.',
      submissionId: createClientId('submission'),
      createdAt,
    });
    setTrayExpanded(true);
    setCommandError(undefined);
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
        onPauseChange={() => void changePauseState()}
        onSpeedChange={() => void changeSpeed()}
        paused={paused}
        runtimeState={runtimeState}
        speed={speed}
      />

      <AgentDock
        agents={model.agents}
        collapsed={agentDockCollapsed}
        disconnected={runtimeState === 'disconnected'}
        mobileOpen={mobilePanel === 'agents'}
        onFollowAgent={(agentId) => {
          setFollowRequest((current) => ({
            agentId,
            requestId: (current?.requestId ?? 0) + 1,
          }));
          const agent = model.agents.find((candidate) => candidate.id === agentId);
          setAnnouncement(`Camera following ${agent?.name ?? 'agent'}.`);
        }}
        onPrepareMission={(objective) => {
          if (objective) void prepareMissionDraft(objective);
          else directDraft();
        }}
        onSelectAgent={(agentId) => {
          const agent = model.agents.find((candidate) => candidate.id === agentId);
          setSelectedAgentId(agentId);
          setAnnouncement(`${agent?.name ?? 'Agent'} selected.`);
        }}
        onSkipTravel={(agentId, missionId) => void skipTravelForAgent(agentId, missionId)}
        onToggleCollapsed={() => setAgentDockCollapsed((current) => !current)}
        selectedAgentId={selectedAgentId}
      />

      {workspace === 'archive' ? (
        <ArchiveWorkspace
          caseFileEntryIds={evidencePreferences.caseFileEntryIds}
          events={archiveEvents}
          loading={archiveLoading}
          onClose={() => {
            setWorkspace('world');
            setAnnouncement('Returned to the world atlas.');
          }}
          onToggleCaseFile={toggleCaseFileEntry}
          projection={projection}
        />
      ) : workspace === 'meeting' && activeMeetingId ? (
        <MeetingWorkspace
          busy={meetingBusy}
          events={meetingEvents}
          loading={runtimeState === 'loading'}
          meetingId={activeMeetingId}
          onClose={() => {
            setWorkspace('world');
            setAnnouncement('Returned to the world atlas.');
          }}
          onSkipArrivals={() => void skipMeetingArrivals()}
          projection={projection}
        />
      ) : workspace === 'professor' ? (
        <ProfessorWorkspace
          caseFileEntryIds={evidencePreferences.caseFileEntryIds}
          onAsk={askProfessor}
          onClose={() => {
            setWorkspace('world');
            setAnnouncement('Returned to the world atlas.');
          }}
          onUseSuggestedMission={useProfessorMission}
          projection={projection}
        />
      ) : (
        <WorldStageHost
          agentsDrawerOpen={mobilePanel === 'agents'}
          autoCamera={model.projection.expedition.settings.autoCamera}
          followRequest={followRequest}
          loading={runtimeState === 'loading'}
          meetingBusy={meetingBusy}
          meetingDisabled={meetingDisabled}
          onConveneMeeting={() => void conveneMeeting()}
          onOpenPanel={openPanel}
          onSelectAgent={(agentId) => {
            const agent = model.agents.find((candidate) => candidate.id === agentId);
            setSelectedAgentId(agentId);
            setAnnouncement(`${agent?.name ?? 'Agent'} selected from the world.`);
          }}
          onSelectPlace={(placeId) => {
            const place = model.places.find((candidate) => candidate.id === placeId);
            setSelectedPlaceId(placeId);
            setAnnouncement(`${place?.name ?? 'Place'} selected.`);
          }}
          onSkipTravelChange={(enabled) => {
            setSkipTravel(enabled);
            window.localStorage.setItem('signal-atlas:skip-travel', String(enabled));
            setAnnouncement(`Skip-travel preference ${enabled ? 'enabled' : 'disabled'}.`);
          }}
          places={model.places}
          reducedMotion={reducedMotion}
          routes={model.routes}
          sceneDefinition={model.sceneDefinition}
          selectedAgentId={selectedAgentId}
          selectedAgentName={selectedAgent.name}
          selectedPlaceId={selectedPlaceId}
          signalsDrawerOpen={mobilePanel === 'signals'}
          skipTravel={skipTravel}
        />
      )}

      <SignalRail
        archivedSignalIds={evidencePreferences.archivedSignalIds}
        collapsed={signalRailCollapsed}
        mobileOpen={mobilePanel === 'signals'}
        onInspect={inspectSignal}
        onPin={togglePinnedSignal}
        onToggleCollapsed={() => setSignalRailCollapsed((current) => !current)}
        pinnedSignalIds={evidencePreferences.pinnedSignalIds}
        seenSignalIds={evidencePreferences.seenSignalIds}
        signals={model.signals}
      />

      <SourceInspector
        archived={Boolean(
          inspectedSignalId && evidencePreferences.archivedSignalIds.includes(inspectedSignalId),
        )}
        onArchive={toggleArchivedSignal}
        onClose={() => setInspectedSignalId(undefined)}
        onPin={togglePinnedSignal}
        pinned={Boolean(
          inspectedSignalId && evidencePreferences.pinnedSignalIds.includes(inspectedSignalId),
        )}
        signal={inspectedSignal}
      />

      <CommandTray
        agents={model.agents}
        busy={commandBusy}
        command={command}
        draft={missionDraft}
        error={commandError}
        expanded={trayExpanded}
        inputRef={inputRef}
        missions={model.missions}
        onCancelDraft={() => {
          setMissionDraft(undefined);
          setCommandError(undefined);
        }}
        onCancelMission={(missionId) => void cancelMission(missionId)}
        onCommandChange={setCommand}
        onConfirmDraft={() => void confirmMission()}
        onDirectDraft={directDraft}
        onDispatch={() => void prepareMissionDraft()}
        onDraftChange={updateMissionDraft}
        onExpandedChange={() => setTrayExpanded((current) => !current)}
        onMoveMission={(missionId, direction) => void moveMission(missionId, direction)}
        onRetryMission={(mission) => void retryMission(mission)}
        onScenarioChange={(scenario) => void changeFixtureScenario(scenario)}
        places={model.places}
        scenario={fixtureScenario}
        selectedAgent={selectedAgent}
      />

      <p aria-live="polite" className="atlas-visually-hidden" role="status">
        {announcement}
      </p>
    </div>
  );
}
