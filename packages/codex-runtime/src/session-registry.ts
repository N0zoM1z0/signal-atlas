import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AgentSessionRecord {
  schemaVersion: 1;
  expeditionId: string;
  agentId: string;
  sessionId: string;
  profileId: string;
  profileVersion: number;
  updatedAt: string;
}

export interface AgentSessionRegistry {
  get(expeditionId: string, agentId: string): AgentSessionRecord | undefined;
  write(record: AgentSessionRecord): void;
}

function sessionKey(expeditionId: string, agentId: string): string {
  return `${expeditionId}:${agentId}`;
}

function clone(record: AgentSessionRecord): AgentSessionRecord {
  return structuredClone(record);
}

export class InMemoryAgentSessionRegistry implements AgentSessionRegistry {
  readonly #records = new Map<string, AgentSessionRecord>();

  get(expeditionId: string, agentId: string): AgentSessionRecord | undefined {
    const record = this.#records.get(sessionKey(expeditionId, agentId));
    return record ? clone(record) : undefined;
  }

  write(record: AgentSessionRecord): void {
    this.#records.set(sessionKey(record.expeditionId, record.agentId), clone(record));
  }
}

function isAgentSessionRecord(value: unknown): value is AgentSessionRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<AgentSessionRecord>;
  return (
    record.schemaVersion === 1 &&
    typeof record.expeditionId === 'string' &&
    record.expeditionId.length > 0 &&
    typeof record.agentId === 'string' &&
    record.agentId.length > 0 &&
    typeof record.sessionId === 'string' &&
    record.sessionId.length > 0 &&
    typeof record.profileId === 'string' &&
    record.profileId.length > 0 &&
    Number.isInteger(record.profileVersion) &&
    (record.profileVersion ?? 0) > 0 &&
    typeof record.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(record.updatedAt))
  );
}

/** Append-only registry; the latest valid record for each expedition/agent pair wins. */
export class JsonlAgentSessionRegistry implements AgentSessionRegistry {
  readonly #path: string;
  readonly #records = new Map<string, AgentSessionRecord>();

  constructor(path: string) {
    this.#path = path;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (!existsSync(path)) return;
    chmodSync(path, 0o600);
    for (const [index, line] of readFileSync(path, 'utf8').split('\n').entries()) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error(`Invalid agent session JSONL at line ${index + 1}.`);
      }
      if (!isAgentSessionRecord(parsed)) {
        throw new Error(`Invalid agent session record at line ${index + 1}.`);
      }
      this.#records.set(sessionKey(parsed.expeditionId, parsed.agentId), clone(parsed));
    }
  }

  get(expeditionId: string, agentId: string): AgentSessionRecord | undefined {
    const record = this.#records.get(sessionKey(expeditionId, agentId));
    return record ? clone(record) : undefined;
  }

  write(record: AgentSessionRecord): void {
    if (!isAgentSessionRecord(record))
      throw new Error('Refused to write an invalid agent session.');
    this.#records.set(sessionKey(record.expeditionId, record.agentId), clone(record));
    appendFileSync(this.#path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
    chmodSync(this.#path, 0o600);
  }
}
