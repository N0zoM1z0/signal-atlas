import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { RuntimeTurnRecord, RuntimeTurnStatus } from './types.js';

const runtimeTurnStatuses = new Set<RuntimeTurnStatus>([
  'queued',
  'running',
  'completed',
  'failed',
  'canceled',
  'timed_out',
]);

export interface RuntimeTurnStore {
  list(): RuntimeTurnRecord[];
  write(record: RuntimeTurnRecord): void;
}

function ordered(records: Iterable<RuntimeTurnRecord>): RuntimeTurnRecord[] {
  return [...records]
    .map((record) => structuredClone(record))
    .sort(
      (left, right) =>
        left.requestedAt.localeCompare(right.requestedAt) ||
        left.turnId.localeCompare(right.turnId),
    );
}

export class InMemoryRuntimeTurnStore implements RuntimeTurnStore {
  readonly #records = new Map<string, RuntimeTurnRecord>();

  list(): RuntimeTurnRecord[] {
    return ordered(this.#records.values());
  }

  write(record: RuntimeTurnRecord): void {
    this.#records.set(record.turnId, structuredClone(record));
  }
}

/** Append-only JSONL persistence. The latest valid record for each turn wins on reload. */
export class JsonlRuntimeTurnStore implements RuntimeTurnStore {
  readonly #path: string;
  readonly #records = new Map<string, RuntimeTurnRecord>();

  constructor(path: string) {
    this.#path = path;
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) return;
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    for (const [index, line] of lines.entries()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error(`Invalid runtime turn JSONL at line ${index + 1}.`);
      }
      if (!isRuntimeTurnRecord(parsed)) {
        throw new Error(`Invalid runtime turn record at line ${index + 1}.`);
      }
      this.#records.set(parsed.turnId, structuredClone(parsed));
    }
  }

  list(): RuntimeTurnRecord[] {
    return ordered(this.#records.values());
  }

  write(record: RuntimeTurnRecord): void {
    this.#records.set(record.turnId, structuredClone(record));
    appendFileSync(this.#path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}

function isRuntimeTurnRecord(value: unknown): value is RuntimeTurnRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RuntimeTurnRecord>;
  return (
    typeof record.turnId === 'string' &&
    typeof record.expeditionId === 'string' &&
    typeof record.agentId === 'string' &&
    typeof record.missionId === 'string' &&
    typeof record.driverId === 'string' &&
    runtimeTurnStatuses.has(record.status as RuntimeTurnStatus) &&
    Number.isInteger(record.attempt) &&
    (record.attempt ?? 0) > 0 &&
    typeof record.requestedAt === 'string' &&
    Number.isInteger(record.timeoutMs) &&
    (record.timeoutMs ?? 0) > 0 &&
    typeof record.queuedAt === 'string'
  );
}
