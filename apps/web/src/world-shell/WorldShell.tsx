import {
  SCHEMA_VERSION,
  binaryMarketOutcomes,
  type MissionVerb,
  type ProfessorResponse,
  type WorldCommand,
  type WorldEvent,
} from '@signal-atlas/contracts';
import type { WorldProjection } from '@signal-atlas/simulation';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

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
import { ExpeditionEventStream, type EventStreamStatus } from './event-stream-client.js';
import { MarketRibbon } from './MarketRibbon.js';
import { MeetingWorkspace } from './MeetingWorkspace.js';
import { ForecastWorkspace, type ForecastCommitInput } from './ForecastWorkspace.js';
import { createShellModel } from './model.js';
import { OnboardingGuide } from './OnboardingGuide.js';
import { enablePresentationAudio, playPresentationTone } from './presentation-audio.js';
import { presentationCuesForEvents, type ShellPresentationCue } from './presentation-cues.js';
import { chooseLatestProjection } from './projection-state.js';
import { ProfessorWorkspace, type ProfessorQuestionInput } from './ProfessorWorkspace.js';
import { ReplayWorkspace } from './ReplayWorkspace.js';
import { RuntimeDiagnosticsDialog } from './RuntimeDiagnosticsDialog.js';
import {
  createClientId,
  fetchExpeditionEvents,
  fetchExpeditionSnapshot,
  fetchFixtureConfiguration,
  fetchPrefDiagnostics,
  fetchRuntimeDiagnostics,
  interpretMissionDraft,
  submitWorldCommand,
  updateFixtureMissionScenario,
  type FixtureMissionScenario,
  type MissionDraft,
} from './runtime-client.js';
import { SignalRail } from './SignalRail.js';
import { readSkipTravelPreference, writeSkipTravelPreference } from './skip-travel-preference.js';
import { SourceInspector } from './SourceInspector.js';
import { WorldStageHost } from './WorldStageHost.js';

type RuntimeState = 'ready' | 'loading' | 'disconnected';
type MobilePanel = 'agents' | 'signals' | null;
type Workspace = 'world' | 'archive' | 'meeting' | 'professor' | 'replay';

interface CueState {
  active: ShellPresentationCue | undefined;
  queue: ShellPresentationCue[];
}

type CueAction =
  { type: 'append'; cues: ShellPresentationCue[] } | { type: 'advance'; activeId: string };

function cueReducer(state: CueState, action: CueAction): CueState {
  if (action.type === 'append') {
    if (action.cues.length === 0) return state;
    if (state.active) {
      return { ...state, queue: [...state.queue, ...action.cues].slice(-24) };
    }
    const [active, ...queue] = action.cues;
    return { active, queue: queue.slice(-24) };
  }
  if (state.active?.id !== action.activeId) return state;
  const [active, ...queue] = state.queue;
  return { active, queue };
}

function forcedRuntimeStateFromLocation(): RuntimeState | undefined {
  if (typeof window === 'undefined') return undefined;
  const state = new URLSearchParams(window.location.search).get('state');
  return state === 'loading' || state === 'disconnected' ? state : undefined;
}

function captureModeFromLocation(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('capture') === '1'
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function commandEnvelope(
  expeditionId: string,
  id: string,
  idempotencyKey: string,
  issuedAt: string,
) {
  return {
    id,
    idempotencyKey,
    expeditionId,
    issuedAt,
    actor: { kind: 'player' as const },
    schemaVersion: SCHEMA_VERSION,
  };
}

function nextRecordedTimestamp(events: readonly { occurredAt: string }[]): string {
  const latestRecorded = events.reduce(
    (latest, event) => Math.max(latest, Date.parse(event.occurredAt)),
    Number.NEGATIVE_INFINITY,
  );
  return new Date(
    Number.isFinite(latestRecorded) ? Math.max(Date.now(), latestRecorded + 1_000) : Date.now(),
  ).toISOString();
}

function shortDateLabel(value: string | undefined): string {
  if (!value) return 'Open';
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function defaultMissionPrompt(projection: WorldProjection): string {
  const place =
    projection.worldManifest.places.find((candidate) =>
      candidate.capabilityBindings.some(
        (binding) => binding.canonicalCapability === 'local_conditions',
      ),
    ) ??
    projection.worldManifest.places.find((candidate) => candidate.archetype === 'newsroom') ??
    projection.worldManifest.places.find(
      (candidate) => candidate.id !== projection.worldManifest.defaultSpawnPlaceId,
    );
  return place ? `Check the latest evidence at ${place.name}` : 'Check the latest market evidence';
}

export interface WorldShellProps {
  initialProjection: WorldProjection;
  onOpenLobby?: () => void;
}

export function WorldShell({ initialProjection, onOpenLobby }: WorldShellProps) {
  const [projection, setProjection] = useState(initialProjection);
  const model = useMemo(() => createShellModel(projection), [projection]);
  const [agentDockCollapsed, setAgentDockCollapsed] = useState(false);
  const [signalRailCollapsed, setSignalRailCollapsed] = useState(false);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [selectedAgentId, setSelectedAgentId] = useState(model.agents[0]?.id ?? 'agent');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>(
    initialProjection.worldManifest.defaultSpawnPlaceId,
  );
  const [mode, setMode] = useState<'director' | 'observatory'>('director');
  const [command, setCommand] = useState(() => defaultMissionPrompt(initialProjection));
  const [announcement, setAnnouncement] = useState('Fixture projection ready.');
  const [reducedMotion, setReducedMotion] = useState(false);
  const forcedRuntimeState = forcedRuntimeStateFromLocation();
  const captureMode = captureModeFromLocation();
  const [runtimeState, setRuntimeState] = useState<RuntimeState>(forcedRuntimeState ?? 'loading');
  const [prefConnected, setPrefConnected] = useState(false);
  const [prefMode, setPrefMode] = useState<'fixture' | 'live' | 'unknown'>('unknown');
  const [prefConnectionState, setPrefConnectionState] = useState('checking');
  const [eventStreamStatus, setEventStreamStatus] = useState<EventStreamStatus>({
    attempt: 0,
    cursor: initialProjection.sequence,
    message: `Connecting from sequence ${initialProjection.sequence}.`,
    phase: forcedRuntimeState ? 'stopped' : 'connecting',
  });
  const [streamBoundaryError, setStreamBoundaryError] = useState<string>();
  const [workspacePersistenceIssue, setWorkspacePersistenceIssue] = useState<string>();
  const [missionDraft, setMissionDraft] = useState<MissionDraft>();
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandError, setCommandError] = useState<string>();
  const [skipTravel, setSkipTravel] = useState(() =>
    readSkipTravelPreference(initialProjection.expedition.id),
  );
  const [fixtureScenario, setFixtureScenario] = useState<FixtureMissionScenario>('success');
  const [workspace, setWorkspace] = useState<Workspace>('world');
  const [replayInitialSequence, setReplayInitialSequence] = useState<number>();
  const [forecastOpen, setForecastOpen] = useState(false);
  const [runtimeDiagnosticsOpen, setRuntimeDiagnosticsOpen] = useState(false);
  const [archiveEvents, setArchiveEvents] = useState<WorldEvent[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [activeMeetingId, setActiveMeetingId] = useState<string>();
  const [meetingEvents, setMeetingEvents] = useState<WorldEvent[]>([]);
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [evidencePreferences, setEvidencePreferences] = useState<EvidencePreferences>(() =>
    readEvidencePreferences(initialProjection.expedition.id),
  );
  const [inspectedSignalId, setInspectedSignalId] = useState<string>();
  const [followRequest, setFollowRequest] = useState<
    { agentId: string; requestId: number } | undefined
  >();
  const [cueState, dispatchCue] = useReducer(cueReducer, { active: undefined, queue: [] });
  const activeCue = cueState.active;
  const [soundEnabled, setSoundEnabled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startupCompleteRef = useRef(false);
  const autoSkippedTravelRef = useRef(new Set<string>());
  const sourceInspectorTriggerRef = useRef<HTMLElement | undefined>(undefined);
  const mobilePanelReturnRef = useRef<HTMLElement | undefined>(undefined);
  const previousMobilePanelRef = useRef<MobilePanel>(null);
  const workspaceFocusCycleRef = useRef(false);
  const workspaceReturnTargetRef = useRef<Exclude<Workspace, 'world'>>('archive');
  const paused = projection.expedition.status === 'paused';
  const { primary: primaryOutcome, secondary: secondaryOutcome } = binaryMarketOutcomes(
    projection.market,
  );
  const projectionSpeed = projection.expedition.simulationSpeed;
  const speed: 1 | 2 | 4 = projectionSpeed === 2 || projectionSpeed === 4 ? projectionSpeed : 1;
  const meetingPlace =
    projection.worldManifest.places.find((place) => place.archetype === 'town_square') ??
    projection.worldManifest.places.find((place) => place.tags.includes('meeting'));
  const meetingDisabled =
    !meetingPlace ||
    Object.values(projection.agentsById).some(
      (agent) =>
        Boolean(agent.activeMissionId || agent.movement) || agent.queuedMissionIds.length > 0,
    );
  const installAuthoritativeProjection = useCallback((candidate: typeof projection) => {
    setProjection((current) => chooseLatestProjection(current, candidate));
  }, []);

  const selectedAgent = useMemo(
    () => model.agents.find((agent) => agent.id === selectedAgentId) ?? model.agents[0],
    [model.agents, selectedAgentId],
  );
  const inspectedSignal = model.signals.find((signal) => signal.id === inspectedSignalId);

  const useProfessorMission = (mission: NonNullable<ProfessorResponse['suggestedMission']>) => {
    const assignedAgentId =
      Object.values(projection.agentsById).find((agent) => agent.role === 'skeptic')?.id ??
      selectedAgentId;
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
      writeEvidencePreferences(projection.expedition.id, next);
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
    sourceInspectorTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
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
    const nextProjection = await fetchExpeditionSnapshot(projection.expedition.id);
    installAuthoritativeProjection(nextProjection);
    setRuntimeState('ready');
    return nextProjection;
  }, [installAuthoritativeProjection, projection.expedition.id]);

  const openArchiveWorkspace = useCallback(async () => {
    workspaceFocusCycleRef.current = true;
    workspaceReturnTargetRef.current = 'archive';
    setWorkspace('archive');
    setTrayExpanded(false);
    setMobilePanel(null);
    setArchiveLoading(true);
    try {
      const [nextProjection, eventLog] = await Promise.all([
        fetchExpeditionSnapshot(projection.expedition.id),
        fetchExpeditionEvents(projection.expedition.id),
      ]);
      installAuthoritativeProjection(nextProjection);
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
  }, [installAuthoritativeProjection, projection.expedition.id]);

  const conveneMeeting = useCallback(async () => {
    if (!meetingPlace) {
      setAnnouncement('This world does not define a meeting place.');
      return;
    }
    const participantAgentIds = Object.keys(projection.agentsById);
    const issuedAt = new Date().toISOString();
    const meetingId = createClientId('meeting');
    const commandId = createClientId('cmd-meeting');
    const worldCommand = {
      ...commandEnvelope(projection.expedition.id, commandId, `meeting:${meetingId}`, issuedAt),
      type: 'meeting.request',
      payload: {
        meetingId,
        placeId: meetingPlace.id,
        participantAgentIds,
      },
    } satisfies WorldCommand;
    setMeetingBusy(true);
    setCommandError(undefined);
    try {
      await submitWorldCommand(worldCommand);
      const [nextProjection, eventLog] = await Promise.all([
        fetchExpeditionSnapshot(projection.expedition.id),
        fetchExpeditionEvents(projection.expedition.id),
      ]);
      installAuthoritativeProjection(nextProjection);
      setMeetingEvents(eventLog.events);
      setActiveMeetingId(meetingId);
      workspaceFocusCycleRef.current = true;
      workspaceReturnTargetRef.current = 'meeting';
      setWorkspace('meeting');
      setTrayExpanded(false);
      setMobilePanel(null);
      setRuntimeState('ready');
      setAnnouncement(`The team is gathering at ${meetingPlace.name}.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Meeting request failed.';
      setCommandError(message);
      setAnnouncement(`Meeting request failed: ${message}`);
    } finally {
      setMeetingBusy(false);
    }
  }, [
    installAuthoritativeProjection,
    meetingPlace,
    projection.agentsById,
    projection.expedition.id,
  ]);

  const skipMeetingArrivals = useCallback(async () => {
    if (!activeMeetingId) return;
    setMeetingBusy(true);
    setCommandError(undefined);
    try {
      let nextProjection = await fetchExpeditionSnapshot(projection.expedition.id);
      for (const agent of Object.values(nextProjection.agentsById)) {
        const missionId = agent.activeMissionId;
        if (!agent.movement || !missionId?.startsWith(`meeting-mission-${activeMeetingId}-`)) {
          continue;
        }
        const issuedAt = new Date().toISOString();
        const commandId = createClientId('cmd-skip-meeting');
        await submitWorldCommand({
          ...commandEnvelope(
            projection.expedition.id,
            commandId,
            `skip-meeting:${activeMeetingId}:${agent.id}:${commandId}`,
            issuedAt,
          ),
          type: 'agent.skip_travel',
          payload: { agentId: agent.id, missionId },
        });
        nextProjection = await fetchExpeditionSnapshot(projection.expedition.id);
      }
      const eventLog = await fetchExpeditionEvents(projection.expedition.id);
      installAuthoritativeProjection(nextProjection);
      setMeetingEvents(eventLog.events);
      setAnnouncement('Arrivals skipped with every route and arrival event preserved.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Meeting skip failed.';
      setCommandError(message);
      setAnnouncement(`Meeting skip failed: ${message}`);
    } finally {
      setMeetingBusy(false);
    }
  }, [activeMeetingId, installAuthoritativeProjection, projection.expedition.id]);

  const openProfessorWorkspace = useCallback(async () => {
    workspaceFocusCycleRef.current = true;
    workspaceReturnTargetRef.current = 'professor';
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

  const openForecastWorkspace = useCallback(async () => {
    setForecastOpen(true);
    setInspectedSignalId(undefined);
    setTrayExpanded(false);
    setMobilePanel(null);
    try {
      await refreshProjection();
      const homePlace = projection.worldManifest.places.find(
        (place) => place.id === projection.worldManifest.defaultSpawnPlaceId,
      );
      setAnnouncement(`${homePlace?.name ?? 'Expedition'} forecast desk opened.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Forecast desk failed to load.';
      setCommandError(message);
      setAnnouncement(`Forecast desk failed to load: ${message}`);
    }
  }, [projection.worldManifest, refreshProjection]);

  const openReplayWorkspace = useCallback((sequence?: number) => {
    workspaceFocusCycleRef.current = true;
    workspaceReturnTargetRef.current = 'replay';
    setReplayInitialSequence(sequence);
    setWorkspace('replay');
    setInspectedSignalId(undefined);
    setTrayExpanded(false);
    setMobilePanel(null);
    setAnnouncement(
      sequence === undefined
        ? 'Expedition case-file replay opened at the latest sequence.'
        : `Expedition case-file replay opened at sequence ${sequence}.`,
    );
  }, []);

  const commitForecast = useCallback(
    async (input: ForecastCommitInput) => {
      const createdAt = nextRecordedTimestamp(projection.appliedEvents);
      const commitId = createClientId('forecast');
      const commandId = createClientId('cmd-forecast');
      const previousProbabilities = projection.forecasts.at(-1)?.newProbabilities ?? {
        [primaryOutcome.id]:
          projection.market.currentPublicProbabilities?.[primaryOutcome.id] ?? 0.5,
        [secondaryOutcome.id]:
          projection.market.currentPublicProbabilities?.[secondaryOutcome.id] ?? 0.5,
      };
      const newProbabilities = {
        [primaryOutcome.id]: input.primaryProbability,
        [secondaryOutcome.id]: 1 - input.primaryProbability,
      };
      const unchanged =
        previousProbabilities[primaryOutcome.id] === newProbabilities[primaryOutcome.id] &&
        previousProbabilities[secondaryOutcome.id] === newProbabilities[secondaryOutcome.id];
      const worldCommand = {
        ...commandEnvelope(projection.expedition.id, commandId, `forecast:${commitId}`, createdAt),
        type: 'forecast.commit',
        payload: {
          commit: {
            id: commitId,
            expeditionId: projection.expedition.id,
            actor: { kind: 'player' },
            previousProbabilities: structuredClone(previousProbabilities),
            newProbabilities,
            ...(input.uncertainty ? { uncertainty: input.uncertainty } : {}),
            rationale: input.publicNote,
            evidenceSignalIds: input.evidenceSignalIds,
            assumptions: [],
            createdAt,
            commitType: unchanged ? 'hold' : 'revision',
            publicNote: input.publicNote,
            ...(input.privateMemo ? { privateMemo: input.privateMemo } : {}),
            scoringEligible: true,
          },
        },
      } satisfies WorldCommand;
      await submitWorldCommand(worldCommand);
      await refreshProjection();
      setAnnouncement(
        `${unchanged ? 'Forecast hold' : 'Forecast revision'} committed at ${Math.round(input.primaryProbability * 100)} percent ${primaryOutcome.shortLabel}.`,
      );
    },
    [
      primaryOutcome.id,
      primaryOutcome.shortLabel,
      projection.appliedEvents,
      projection.expedition.id,
      projection.forecasts,
      projection.market.currentPublicProbabilities,
      refreshProjection,
      secondaryOutcome.id,
    ],
  );

  const askProfessor = useCallback(
    async (input: ProfessorQuestionInput): Promise<ProfessorResponse> => {
      const createdAt = new Date().toISOString();
      const queryId = createClientId('professor-query');
      const commandId = createClientId('cmd-professor');
      const worldCommand = {
        ...commandEnvelope(projection.expedition.id, commandId, `professor:${queryId}`, createdAt),
        type: 'professor.query',
        payload: {
          query: {
            id: queryId,
            expeditionId: projection.expedition.id,
            mode: input.mode,
            question: input.question,
            selectedSourceIds: input.selectedSourceIds,
            selectedSignalIds: input.selectedSignalIds,
            createdAt,
          },
        },
      } satisfies WorldCommand;
      await submitWorldCommand(worldCommand);
      const deadline = Date.now() + 125_000;
      while (Date.now() < deadline) {
        const nextProjection = await refreshProjection();
        const response = nextProjection.professorResponsesByQueryId[queryId];
        if (response) {
          setAnnouncement(
            response.runtime?.mode === 'local_exec'
              ? 'Professor Vale completed a local Codex evidence review.'
              : response.runtime?.mode === 'scripted_fallback'
                ? 'Professor Vale recorded a bounded scripted fallback.'
                : 'Professor Vale recorded a scripted evidence-bound response.',
          );
          return response;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      throw new Error('Professor agent did not finish within its bounded runtime window.');
    },
    [projection.expedition.id, refreshProjection],
  );

  const openPanel = useCallback(
    (panel: 'agents' | 'signals' | 'archive' | 'professor' | 'forecast' | 'replay') => {
      if (panel === 'agents' || panel === 'signals') {
        mobilePanelReturnRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
        setMobilePanel((current) => (current === panel ? null : panel));
        return;
      }
      if (panel === 'archive') {
        void openArchiveWorkspace();
        return;
      }
      if (panel === 'forecast') {
        void openForecastWorkspace();
        return;
      }
      if (panel === 'replay') {
        openReplayWorkspace();
        return;
      }
      void openProfessorWorkspace();
    },
    [openArchiveWorkspace, openForecastWorkspace, openProfessorWorkspace, openReplayWorkspace],
  );

  const changePauseState = useCallback(async () => {
    const issuedAt = new Date().toISOString();
    const id = createClientId(paused ? 'cmd-resume' : 'cmd-pause');
    const worldCommand: WorldCommand = paused
      ? {
          ...commandEnvelope(projection.expedition.id, id, `resume:${id}`, issuedAt),
          type: 'expedition.start',
          payload: {},
        }
      : {
          ...commandEnvelope(projection.expedition.id, id, `pause:${id}`, issuedAt),
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
  }, [paused, projection.expedition.id, refreshProjection]);

  const changeSpeed = useCallback(
    async (direction: -1 | 1 = 1) => {
      const speeds = [1, 2, 4] as const;
      const index = speeds.indexOf(speed);
      const nextSpeed = speeds[(index + direction + speeds.length) % speeds.length] ?? 1;
      const issuedAt = new Date().toISOString();
      const id = createClientId('cmd-speed');
      const worldCommand = {
        ...commandEnvelope(projection.expedition.id, id, `speed:${id}`, issuedAt),
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
    [projection.expedition.id, refreshProjection, speed],
  );

  const skipTravelForAgent = useCallback(
    async (agentId: string, missionId: string, automatic = false) => {
      const issuedAt = new Date().toISOString();
      const id = createClientId('cmd-skip');
      const worldCommand = {
        ...commandEnvelope(
          projection.expedition.id,
          id,
          `skip:${agentId}:${missionId}:${id}`,
          issuedAt,
        ),
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
    [projection.expedition.id, refreshProjection],
  );

  useEffect(() => {
    if (forcedRuntimeStateFromLocation()) return;

    let active = true;
    void Promise.allSettled([
      fetchExpeditionSnapshot(projection.expedition.id),
      fetchFixtureConfiguration(projection.expedition.id),
      fetchPrefDiagnostics(),
    ]).then(([snapshotResult, configurationResult, prefResult]) => {
      if (!active) return;
      if (snapshotResult.status === 'rejected' || configurationResult.status === 'rejected') {
        startupCompleteRef.current = true;
        setRuntimeState('disconnected');
        setAnnouncement('Orchestrator disconnected. The last valid projection remains visible.');
        return;
      }
      installAuthoritativeProjection(snapshotResult.value);
      setFixtureScenario(configurationResult.value.missionScenario);
      if (prefResult.status === 'fulfilled') {
        setPrefConnected(prefResult.value.connected);
        setPrefMode(prefResult.value.mode);
        setPrefConnectionState(prefResult.value.state);
      } else {
        setPrefConnected(false);
        setPrefMode('unknown');
        setPrefConnectionState('unavailable');
      }
      startupCompleteRef.current = true;
      setRuntimeState('ready');
    });
    return () => {
      active = false;
    };
  }, [installAuthoritativeProjection, projection.expedition.id]);

  useEffect(() => {
    if (forcedRuntimeStateFromLocation()) return;

    let active = true;
    let timer: number | undefined;
    const checkWorkspace = async () => {
      try {
        const diagnostics = await fetchRuntimeDiagnostics(projection.expedition.id);
        if (!active) return;
        setWorkspacePersistenceIssue(
          diagnostics.workspace.state === 'degraded'
            ? (diagnostics.workspace.issue?.message ??
                'The local workspace cannot durably record new events.')
            : undefined,
        );
      } catch {
        // Connectivity is represented by the existing runtime and event-stream boundaries.
      } finally {
        if (active) timer = window.setTimeout(() => void checkWorkspace(), 5_000);
      }
    };

    void checkWorkspace();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [projection.expedition.id]);

  useEffect(() => {
    if (forcedRuntimeStateFromLocation()) return;
    let active = true;
    const stream = new ExpeditionEventStream({
      expeditionId: projection.expedition.id,
      initialSequence: initialProjection.sequence,
      onEvents: async (envelope) => {
        const nextProjection = await fetchExpeditionSnapshot(projection.expedition.id);
        if (
          nextProjection.expedition.id !== envelope.expeditionId ||
          nextProjection.sequence < envelope.sequence
        ) {
          throw new Error('The authoritative projection does not cover the event batch.');
        }
        if (!active) return;
        installAuthoritativeProjection(nextProjection);
        if (startupCompleteRef.current) setRuntimeState('ready');
        const cues = presentationCuesForEvents(envelope.events, nextProjection);
        dispatchCue({ type: 'append', cues });
      },
      onStatus: (status) => {
        if (!active) return;
        setEventStreamStatus(status);
        if (status.phase === 'live' && startupCompleteRef.current) setRuntimeState('ready');
        if (status.phase === 'reconnecting') setAnnouncement(status.message);
      },
      onBoundaryError: (message) => {
        if (!active) return;
        setStreamBoundaryError(message);
        setAnnouncement(`Event stream boundary failed. ${message}`);
      },
    });
    stream.start();
    return () => {
      active = false;
      stream.stop();
    };
  }, [initialProjection.sequence, installAuthoritativeProjection, projection.expedition.id]);

  useEffect(() => {
    if (!activeCue) return;
    if (soundEnabled) {
      void playPresentationTone(activeCue.kind).catch(() => {
        setSoundEnabled(false);
        setAnnouncement('Presentation sound became unavailable and was disabled.');
      });
    }
    const timer = window.setTimeout(
      () => dispatchCue({ type: 'advance', activeId: activeCue.id }),
      reducedMotion ? 1_400 : 2_400,
    );
    return () => window.clearTimeout(timer);
  }, [activeCue, reducedMotion, soundEnabled]);

  useEffect(() => {
    if (!workspaceFocusCycleRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (workspace === 'world') {
        const target = document.querySelector<HTMLButtonElement>(
          `[data-workspace-target="${workspaceReturnTargetRef.current}"]`,
        );
        if (target && !target.disabled) target.focus();
        else document.querySelector<HTMLElement>('#world-stage')?.focus();
        workspaceFocusCycleRef.current = false;
        return;
      }
      document.querySelector<HTMLElement>(`.atlas-${workspace}-workspace`)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspace]);

  useEffect(() => {
    const previous = previousMobilePanelRef.current;
    previousMobilePanelRef.current = mobilePanel;
    if (mobilePanel) {
      const frame = window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            mobilePanel === 'agents'
              ? '.atlas-agent-dock .atlas-agent-card'
              : '.atlas-signal-rail [role="tab"]',
          )
          ?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (previous) {
      const frame = window.requestAnimationFrame(() => {
        if (mobilePanelReturnRef.current?.isConnected) mobilePanelReturnRef.current.focus();
        mobilePanelReturnRef.current = undefined;
      });
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [mobilePanel]);

  useEffect(() => {
    if (workspace !== 'meeting' || !activeMeetingId) return;
    let active = true;
    void fetchExpeditionEvents(projection.expedition.id)
      .then((eventLog) => {
        if (active) setMeetingEvents(eventLog.events);
      })
      .catch(() => {
        if (active) setAnnouncement('Meeting events could not be refreshed.');
      });
    return () => {
      active = false;
    };
  }, [activeMeetingId, projection.expedition.id, projection.sequence, workspace]);

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
        if (runtimeDiagnosticsOpen) {
          setRuntimeDiagnosticsOpen(false);
          setAnnouncement('Runtime diagnostics closed.');
          return;
        }
        if (forecastOpen) {
          setForecastOpen(false);
          setAnnouncement('Forecast desk closed without changing the projection.');
          return;
        }
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
      if (
        runtimeDiagnosticsOpen ||
        forecastOpen ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      ) {
        return;
      }

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

      if (event.key.toLocaleLowerCase('en-US') === 'c') {
        event.preventDefault();
        void openForecastWorkspace();
        return;
      }

      if (event.key.toLocaleLowerCase('en-US') === 'm') {
        event.preventDefault();
        if (meetingDisabled) {
          setAnnouncement('Finish active and queued missions before convening the team.');
        } else {
          void conveneMeeting();
        }
        return;
      }

      if (event.key.toLocaleLowerCase('en-US') === 'r') {
        event.preventDefault();
        openReplayWorkspace();
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
  }, [
    changePauseState,
    changeSpeed,
    conveneMeeting,
    forecastOpen,
    model.agents,
    meetingDisabled,
    openArchiveWorkspace,
    openForecastWorkspace,
    openPanel,
    openReplayWorkspace,
    runtimeDiagnosticsOpen,
    workspace,
  ]);

  if (!selectedAgent) {
    return <main role="alert">The fixture does not define an expedition team.</main>;
  }

  const prepareMissionDraft = async (objective = command) => {
    setCommand(objective);
    setTrayExpanded(true);
    setCommandBusy(true);
    setCommandError(undefined);
    try {
      const draft = await interpretMissionDraft(
        projection.expedition.id,
        objective,
        selectedAgent.id,
      );
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
      ...commandEnvelope(
        projection.expedition.id,
        commandId,
        missionDraft.submissionId,
        missionDraft.createdAt,
      ),
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
      ...commandEnvelope(projection.expedition.id, id, `cancel:${id}`, issuedAt),
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
      ...commandEnvelope(projection.expedition.id, id, `reorder:${id}`, issuedAt),
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
      const configuration = await updateFixtureMissionScenario(projection.expedition.id, scenario);
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
      ...commandEnvelope(
        projection.expedition.id,
        id,
        `retry:${mission.id}:${mission.failedTurnId}:${id}`,
        issuedAt,
      ),
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

  const resolvedOutcomeLabel = projection.market.outcomes.find(
    (outcome) => outcome.id === projection.market.resolvedOutcomeId,
  )?.shortLabel;
  const marketKindLabel = projection.market.tags.includes('fictional')
    ? 'Fictional sandbox market'
    : projection.expedition.settings.fixtureMode
      ? 'Offline research scenario'
      : 'Read-only market research';
  const commandDisabledReason = workspacePersistenceIssue
    ? 'Workspace persistence paused; commands are closed.'
    : ['resolved', 'archived'].includes(projection.expedition.status)
      ? `Expedition ${projection.expedition.status}; commands are closed.`
      : undefined;

  return (
    <div
      className="signal-atlas-shell"
      data-agent-collapsed={agentDockCollapsed}
      data-event-stream-sequence={eventStreamStatus.cursor}
      data-event-stream-state={eventStreamStatus.phase}
      data-capture-mode={captureMode}
      data-signal-collapsed={signalRailCollapsed}
      data-tray-expanded={trayExpanded}
    >
      <a className="atlas-skip-link" href="#world-stage">
        Skip to world stage
      </a>

      <MarketRibbon
        deadlineLabel={shortDateLabel(model.market.closesAt)}
        expeditionName={model.market.expeditionName}
        marketKindLabel={marketKindLabel}
        mode={mode}
        onModeChange={() =>
          setMode((current) => (current === 'director' ? 'observatory' : 'director'))
        }
        {...(onOpenLobby ? { onOpenLobby } : {})}
        onPauseChange={() => void changePauseState()}
        onOpenForecast={() => void openForecastWorkspace()}
        onSpeedChange={() => void changeSpeed()}
        paused={paused}
        publicProbability={model.market.publicProbability}
        primaryOutcomeLabel={model.market.primaryOutcome.shortLabel}
        question={model.market.question}
        prefConnected={prefConnected}
        prefConnectionState={prefConnectionState}
        prefMode={prefMode}
        {...(resolvedOutcomeLabel ? { resolvedOutcomeLabel } : {})}
        runtimeState={runtimeState}
        secondaryOutcomeLabel={model.market.secondaryOutcome.shortLabel}
        speed={speed}
        streamStatus={eventStreamStatus}
        teamProbability={model.market.teamProbability}
      />

      {streamBoundaryError && (
        <div className="atlas-stream-boundary-alert" role="alert">
          <span aria-hidden="true">△</span>
          <p>
            <strong>Event stream boundary</strong>
            {streamBoundaryError}
          </p>
          <button
            aria-label="Dismiss event stream error"
            onClick={() => setStreamBoundaryError(undefined)}
            type="button"
          >
            ×
          </button>
        </div>
      )}

      {workspacePersistenceIssue && (
        <div
          className="atlas-stream-boundary-alert atlas-persistence-boundary-alert"
          data-boundary="persistence"
          role="alert"
        >
          <span aria-hidden="true">!</span>
          <p>
            <strong>Workspace persistence paused</strong>
            <span>
              {workspacePersistenceIssue} The last durable world remains visible; new commands are
              disabled.
            </span>
          </p>
        </div>
      )}

      <AgentDock
        agents={model.agents}
        collapsed={agentDockCollapsed}
        mobileOpen={mobilePanel === 'agents'}
        onFollowAgent={(agentId) => {
          setFollowRequest((current) => ({
            agentId,
            requestId: (current?.requestId ?? 0) + 1,
          }));
          const agent = model.agents.find((candidate) => candidate.id === agentId);
          setAnnouncement(`Camera following ${agent?.name ?? 'agent'}.`);
        }}
        onOpenRuntimeDiagnostics={() => {
          setRuntimeDiagnosticsOpen(true);
          setAnnouncement('Codex runtime diagnostics opened.');
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
        prefConnectionLabel={
          prefMode === 'live'
            ? prefConnected
              ? 'Live'
              : prefConnectionState === 'auth_required'
                ? 'Auth needed'
                : 'Unavailable'
            : prefMode === 'fixture'
              ? prefConnected
                ? 'Fixture'
                : 'Unavailable'
              : 'Checking'
        }
        prefWarning={!prefConnected && prefConnectionState !== 'checking'}
        places={model.places}
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
          onOpenReplay={openReplayWorkspace}
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
      ) : workspace === 'replay' ? (
        <ReplayWorkspace
          expeditionId={projection.expedition.id}
          {...(replayInitialSequence === undefined
            ? {}
            : { initialSequence: replayInitialSequence })}
          onAuthoritativeProjectionChange={(nextProjection) => {
            installAuthoritativeProjection(nextProjection);
            setRuntimeState('ready');
            setAnnouncement('Fixture resolution recorded and final projection verified.');
          }}
          onClose={() => {
            setWorkspace('world');
            setReplayInitialSequence(undefined);
            void refreshProjection().catch((error: unknown) => {
              const message =
                error instanceof Error ? error.message : 'World projection failed to refresh.';
              setCommandError(message);
              setRuntimeState('disconnected');
            });
            setAnnouncement('Returned to the world atlas.');
          }}
        />
      ) : (
        <WorldStageHost
          activeCue={activeCue}
          agentsDrawerOpen={mobilePanel === 'agents'}
          agents={model.agents}
          autoCamera={model.projection.expedition.settings.autoCamera}
          captureMode={captureMode}
          followRequest={followRequest}
          guide={
            captureMode ? null : (
              <OnboardingGuide
                inspectedSignalId={inspectedSignalId}
                onOpenArchive={() => void openArchiveWorkspace()}
                onOpenForecast={() => void openForecastWorkspace()}
                onOpenSignals={() => {
                  mobilePanelReturnRef.current =
                    document.activeElement instanceof HTMLElement
                      ? document.activeElement
                      : undefined;
                  setMobilePanel('signals');
                }}
                onSelectGuideAgent={(agentId) => {
                  const agent = projection.agentsById[agentId];
                  setSelectedAgentId(agentId);
                  setAnnouncement(
                    `${agent?.displayName ?? 'Agent'} selected for the first expedition step.`,
                  );
                }}
                projection={projection}
                selectedAgentId={selectedAgentId}
              />
            )
          }
          loading={runtimeState === 'loading'}
          meetingBusy={meetingBusy}
          meetingDisabled={meetingDisabled}
          meetingPlaceName={meetingPlace?.name}
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
          onSoundToggle={() => {
            if (soundEnabled) {
              setSoundEnabled(false);
              return;
            }
            void enablePresentationAudio()
              .then(() => setSoundEnabled(true))
              .catch(() => {
                setSoundEnabled(false);
                setAnnouncement('Presentation sound is unavailable in this browser.');
              });
          }}
          onSkipTravelChange={(enabled) => {
            setSkipTravel(enabled);
            writeSkipTravelPreference(projection.expedition.id, enabled);
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
          soundEnabled={soundEnabled}
          weather={model.weather}
          worldName={projection.expedition.title}
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
        onClose={() => {
          setInspectedSignalId(undefined);
          window.requestAnimationFrame(() => {
            if (sourceInspectorTriggerRef.current?.isConnected) {
              sourceInspectorTriggerRef.current.focus();
            } else {
              document
                .querySelector<HTMLElement>('.atlas-signal-tabs [aria-selected="true"]')
                ?.focus();
            }
          });
        }}
        onPin={togglePinnedSignal}
        pinned={Boolean(
          inspectedSignalId && evidencePreferences.pinnedSignalIds.includes(inspectedSignalId),
        )}
        signal={inspectedSignal}
      />

      {forecastOpen && (
        <ForecastWorkspace
          onClose={() => {
            setForecastOpen(false);
            setAnnouncement('Forecast desk closed.');
          }}
          onCommit={commitForecast}
          open
          preferredSignalIds={[
            ...evidencePreferences.pinnedSignalIds,
            ...evidencePreferences.caseFileEntryIds
              .filter((id) => id.startsWith('signal:'))
              .map((id) => id.slice('signal:'.length)),
          ]}
          projection={projection}
        />
      )}

      <RuntimeDiagnosticsDialog
        expeditionId={projection.expedition.id}
        onClose={() => {
          setRuntimeDiagnosticsOpen(false);
          setAnnouncement('Runtime diagnostics closed.');
        }}
        onPrefConnectionChange={setPrefConnected}
        open={runtimeDiagnosticsOpen}
      />

      <CommandTray
        agents={model.agents}
        busy={commandBusy}
        command={command}
        {...(commandDisabledReason ? { disabledReason: commandDisabledReason } : {})}
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
        sequence={projection.sequence}
      />

      <p aria-live="polite" className="atlas-visually-hidden" role="status">
        {announcement}
      </p>
    </div>
  );
}
