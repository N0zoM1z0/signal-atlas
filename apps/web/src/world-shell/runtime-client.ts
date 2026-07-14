import type { MissionVerb, WorldCommand, WorldEvent } from '@signal-atlas/contracts';
import type { WorldProjection } from '@signal-atlas/simulation';

import { shellModel } from './model.js';

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

const expeditionId = shellModel.projection.expedition.id;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const rejected = payload as Partial<RejectedCommandResponse> & { error?: string };
    const detail = rejected.issues?.map((issue) => issue.message).join(' ') ?? rejected.error;
    throw new Error(detail ?? `Orchestrator request failed with status ${response.status}.`);
  }
  return payload as T;
}

export function createClientId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${random}`;
}

export async function fetchExpeditionSnapshot(): Promise<WorldProjection> {
  const response = await requestJson<{ projection: WorldProjection }>(
    `/api/expeditions/${expeditionId}/snapshot`,
  );
  return response.projection;
}

export async function fetchExpeditionEvents(after = 0): Promise<{
  events: WorldEvent[];
  sequence: number;
}> {
  return requestJson<{ events: WorldEvent[]; sequence: number }>(
    `/api/expeditions/${expeditionId}/events?after=${after}`,
  );
}

export async function fetchFixtureConfiguration(): Promise<FixtureConfiguration> {
  return requestJson<FixtureConfiguration>(
    `/api/expeditions/${expeditionId}/fixture-configuration`,
  );
}

export async function updateFixtureMissionScenario(
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
  return requestJson<CommandResponse>(`/api/expeditions/${expeditionId}/commands`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}
