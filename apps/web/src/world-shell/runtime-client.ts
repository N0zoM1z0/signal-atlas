import {
  parseWorldEvent,
  type MissionVerb,
  type WorldCommand,
  type WorldEvent,
} from '@signal-atlas/contracts';
import type { CodexRuntimeDiagnostics } from '@signal-atlas/codex-runtime';
import type { SignalAtlasCaseFile } from '@signal-atlas/archive';
import type { PrefMcpConnectionDiagnostics } from '@signal-atlas/pref-gateway';
import { parseWorldProjection, type WorldProjection } from '@signal-atlas/simulation';

export interface MissionDraft {
  status: 'ready' | 'ambiguous';
  objective: string;
  assignedAgentId?: string | undefined;
  destinationPlaceId?: string | undefined;
  verb?: MissionVerb | undefined;
  candidateAgentIds: string[];
  candidatePlaceIds: string[];
  missing: Array<'agent' | 'destination' | 'verb'>;
  explanation: string;
  submissionId: string;
  createdAt: string;
}

export const fixtureMissionScenarios = [
  'success',
  'no_result',
  'timeout',
  'invalid_result',
] as const;

export type FixtureMissionScenario = (typeof fixtureMissionScenarios)[number];

export interface FixtureConfiguration {
  seed: string;
  missionScenario: FixtureMissionScenario;
}

export interface ExpeditionListItem {
  id: string;
  latestSequence: number;
  marketQuestion: string;
  status: string;
  title: string;
}

interface CommandResponse {
  accepted: true;
  duplicate: boolean;
  commandId: string;
  sequence: number;
}

interface RejectedCommandResponse {
  accepted: false;
  issues: Array<{ code: string; message: string; path: Array<string | number> }>;
}

export interface ReplayProjectionResponse {
  sequence: number;
  latestSequence: number;
  projection: WorldProjection;
  hash: string;
  authoritativeHash: string;
  selectedEvent?: WorldEvent;
}

export interface FixtureResolutionResponse {
  resolved: true;
  duplicate: boolean;
  events: WorldEvent[];
  sequence: number;
  projectionHash: string;
}

export interface ProfessorRuntimeDiagnostics {
  id: string;
  kind: 'scripted' | 'local_exec';
  configuredMode: 'scripted' | 'local';
  activeMode: 'scripted' | 'local_exec' | 'scripted_fallback';
  available: boolean;
  description: string;
  runs: number;
  fallbackCount: number;
  repairCount: number;
  lastRunAt?: string;
  lastError?: string;
  command?: { executable: string; args: string[]; display: string };
}

export interface WorkspaceRuntimeDiagnostics {
  mode: 'memory' | 'sqlite';
  state: 'ready' | 'degraded' | 'closed';
  eventCount: number;
  latestSequence: number;
  checkpointInterval: number;
  replayBaseSequence: number;
  invalidCheckpointCount: number;
  store?: {
    mode: 'sqlite';
    state: 'ready' | 'closed';
    schemaVersion: number;
    location: string;
    eventCount: number;
    latestSequence: number;
    checkpointCount: number;
    latestCheckpointSequence?: number;
  };
  issue?: {
    code: 'workspace_persistence_failed';
    message: string;
  };
}

export interface SignalAtlasRuntimeDiagnostics extends CodexRuntimeDiagnostics {
  professor: ProfessorRuntimeDiagnostics;
  workspace: WorkspaceRuntimeDiagnostics;
}

const requestTimeoutMs = 10_000;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(init?.signal?.reason);
  init?.signal?.addEventListener('abort', forwardAbort, { once: true });
  const timeout = globalThis.setTimeout(
    () => controller.abort('request_timeout'),
    requestTimeoutMs,
  );
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const rejected = payload as Partial<RejectedCommandResponse> & { error?: string };
      const detail = rejected.issues?.map((issue) => issue.message).join(' ') ?? rejected.error;
      throw new Error(detail ?? `Orchestrator request failed with status ${response.status}.`);
    }
    return payload as T;
  } catch (error: unknown) {
    if (controller.signal.reason === 'request_timeout') {
      throw new Error(`Orchestrator request timed out after ${requestTimeoutMs} ms.`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    init?.signal?.removeEventListener('abort', forwardAbort);
  }
}

export function createClientId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${random}`;
}

export async function fetchExpeditions(): Promise<ExpeditionListItem[]> {
  const response = await requestJson<{ expeditions: ExpeditionListItem[] }>('/api/expeditions');
  if (!Array.isArray(response.expeditions)) {
    throw new Error('The orchestrator returned an invalid expedition list.');
  }
  return response.expeditions;
}

export async function fetchExpeditionSnapshot(expeditionId: string): Promise<WorldProjection> {
  const response = await requestJson<{ projection: unknown }>(
    `/api/expeditions/${expeditionId}/snapshot`,
  );
  let projection: WorldProjection;
  try {
    projection = parseWorldProjection(response.projection);
  } catch {
    throw new Error('The orchestrator returned an invalid world projection.');
  }
  if (projection.expedition.id !== expeditionId) {
    throw new Error('The orchestrator returned an invalid world projection.');
  }
  return projection;
}

export async function fetchRuntimeDiagnostics(): Promise<SignalAtlasRuntimeDiagnostics> {
  return requestJson<SignalAtlasRuntimeDiagnostics>('/api/runtime/diagnostics');
}

export async function fetchPrefDiagnostics(): Promise<PrefMcpConnectionDiagnostics> {
  return requestJson<PrefMcpConnectionDiagnostics>('/api/runtime/pref');
}

export async function testPrefConnection(): Promise<PrefMcpConnectionDiagnostics> {
  return requestJson<PrefMcpConnectionDiagnostics>('/api/runtime/pref/test', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function disconnectPrefConnection(): Promise<PrefMcpConnectionDiagnostics> {
  return requestJson<PrefMcpConnectionDiagnostics>('/api/runtime/pref/disconnect', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchExpeditionEvents(
  expeditionId: string,
  after = 0,
): Promise<{
  events: WorldEvent[];
  sequence: number;
}> {
  const response = await requestJson<{ events: unknown[]; sequence: number }>(
    `/api/expeditions/${expeditionId}/events?after=${after}`,
  );
  if (!Number.isInteger(response.sequence) || !Array.isArray(response.events)) {
    throw new Error('The orchestrator returned an invalid event history envelope.');
  }
  return { events: response.events.map(parseWorldEvent), sequence: response.sequence };
}

export async function fetchReplayProjection(
  expeditionId: string,
  sequence?: number,
): Promise<ReplayProjectionResponse> {
  const query = sequence === undefined ? '' : `?sequence=${sequence}`;
  return requestJson<ReplayProjectionResponse>(`/api/expeditions/${expeditionId}/replay${query}`);
}

export async function resolveFixtureCase(expeditionId: string): Promise<FixtureResolutionResponse> {
  return requestJson<FixtureResolutionResponse>(
    `/api/expeditions/${expeditionId}/resolve-fixture`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function fetchCaseFile(expeditionId: string): Promise<SignalAtlasCaseFile> {
  return requestJson<SignalAtlasCaseFile>(`/api/expeditions/${expeditionId}/case-file`);
}

export async function fetchFixtureConfiguration(
  expeditionId: string,
): Promise<FixtureConfiguration> {
  return requestJson<FixtureConfiguration>(
    `/api/expeditions/${expeditionId}/fixture-configuration`,
  );
}

export async function updateFixtureMissionScenario(
  expeditionId: string,
  missionScenario: FixtureMissionScenario,
): Promise<FixtureConfiguration> {
  return requestJson<FixtureConfiguration>(
    `/api/expeditions/${expeditionId}/fixture-configuration`,
    {
      method: 'PUT',
      body: JSON.stringify({ missionScenario }),
    },
  );
}

export async function interpretMissionDraft(
  expeditionId: string,
  text: string,
  selectedAgentId: string,
): Promise<MissionDraft> {
  const response = await requestJson<{ draft: Omit<MissionDraft, 'submissionId'> }>(
    `/api/expeditions/${expeditionId}/mission-drafts/interpret`,
    {
      method: 'POST',
      body: JSON.stringify({ text, selectedAgentId }),
    },
  );
  return {
    ...response.draft,
    submissionId: createClientId('submission'),
    createdAt: new Date().toISOString(),
  };
}

export async function submitWorldCommand(command: WorldCommand): Promise<CommandResponse> {
  return requestJson<CommandResponse>(`/api/expeditions/${command.expeditionId}/commands`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}
