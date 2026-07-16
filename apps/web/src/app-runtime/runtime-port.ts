import type { SignalAtlasCaseFile } from '@signal-atlas/archive';
import type { WorldCommand, WorldEvent } from '@signal-atlas/contracts';
import type { PrefMcpConnectionDiagnostics } from '@signal-atlas/pref-gateway';
import type { WorldProjection } from '@signal-atlas/simulation';

import type {
  ExpeditionEventStreamOptions,
  EventStreamStatus,
} from '../world-shell/event-stream-client.js';
import type {
  CreateExpeditionResponse,
  ExpeditionListItem,
  FixtureConfiguration,
  FixtureMissionScenario,
  MissionDraft,
  ReplayProjectionResponse,
  ScenarioListItem,
  SignalAtlasRuntimeDiagnostics,
} from '../world-shell/runtime-client.js';

export interface RuntimeEventSubscription {
  start(): void;
  stop(): void;
}

export interface RuntimePort {
  readonly kind: 'remote' | 'static-demo';
  readonly supportsConnectionControls: boolean;
  createClientId(prefix: string): string;
  fetchExpeditions(): Promise<ExpeditionListItem[]>;
  fetchScenarios(): Promise<ScenarioListItem[]>;
  createExpedition(
    scenarioId: string,
    scenarioVersion: number,
    idempotencyKey: string,
  ): Promise<CreateExpeditionResponse>;
  fetchExpeditionSnapshot(expeditionId: string): Promise<WorldProjection>;
  fetchRuntimeDiagnostics(expeditionId?: string): Promise<SignalAtlasRuntimeDiagnostics>;
  fetchPrefDiagnostics(): Promise<PrefMcpConnectionDiagnostics>;
  testPrefConnection(): Promise<PrefMcpConnectionDiagnostics>;
  disconnectPrefConnection(): Promise<PrefMcpConnectionDiagnostics>;
  fetchExpeditionEvents(
    expeditionId: string,
    after?: number,
  ): Promise<{ events: WorldEvent[]; sequence: number }>;
  fetchReplayProjection(
    expeditionId: string,
    sequence?: number,
  ): Promise<ReplayProjectionResponse>;
  resolveFixtureCase(expeditionId: string): Promise<{
    resolved: true;
    duplicate: boolean;
    events: WorldEvent[];
    sequence: number;
    projectionHash: string;
  }>;
  fetchCaseFile(expeditionId: string): Promise<SignalAtlasCaseFile>;
  fetchFixtureConfiguration(expeditionId: string): Promise<FixtureConfiguration>;
  updateFixtureMissionScenario(
    expeditionId: string,
    missionScenario: FixtureMissionScenario,
  ): Promise<FixtureConfiguration>;
  interpretMissionDraft(
    expeditionId: string,
    text: string,
    selectedAgentId: string,
  ): Promise<MissionDraft>;
  submitWorldCommand(command: WorldCommand): Promise<{
    accepted: true;
    duplicate: boolean;
    commandId: string;
    sequence: number;
  }>;
  createEventSubscription(options: ExpeditionEventStreamOptions): RuntimeEventSubscription;
  eventStreamStatusLabel?(status: EventStreamStatus): string;
  resetDemoWorkspace?(): Promise<void>;
}
