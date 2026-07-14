import type { AgentTurnInput, AgentTurnOutput } from '@signal-atlas/contracts';

export type MaybePromise<T> = T | Promise<T>;

export type CodexDriverKind = 'scripted' | 'local_exec';

export interface CodexRuntimeEvent {
  id: string;
  type:
    | 'turn.queued'
    | 'turn.started'
    | 'turn.completed'
    | 'turn.failed'
    | 'turn.canceled'
    | 'turn.timed_out'
    | 'driver.event';
  turnId: string;
  occurredAt: string;
  detail?: Record<string, unknown>;
}

export interface CodexDriverContext {
  signal: AbortSignal;
  deadlineAt: string;
  emit: (detail: Record<string, unknown>) => void;
}

export interface CodexTurnResult<TArtifacts = unknown> {
  output: AgentTurnOutput;
  artifacts?: TArtifacts;
  sessionId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface CodexDriverDiagnostics {
  id: string;
  kind: CodexDriverKind;
  available: boolean;
  description: string;
  runs: number;
  lastRunAt?: string;
  lastError?: string;
}

export interface CodexDriver<TInput extends AgentTurnInput = AgentTurnInput, TArtifacts = unknown> {
  readonly id: string;
  readonly kind: CodexDriverKind;
  runTurn(input: TInput, context: CodexDriverContext): MaybePromise<CodexTurnResult<TArtifacts>>;
  diagnostics(): CodexDriverDiagnostics;
}

export type RuntimeTurnStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'canceled' | 'timed_out';

export interface RuntimeTurnRecord {
  turnId: string;
  expeditionId: string;
  agentId: string;
  missionId: string;
  driverId: string;
  status: RuntimeTurnStatus;
  attempt: number;
  requestedAt: string;
  timeoutMs: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  sessionId?: string;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

export interface CodexRuntimeDiagnostics {
  driver: CodexDriverDiagnostics;
  scheduler: {
    maxConcurrency: number;
    defaultTimeoutMs: number;
    activeCount: number;
    queuedCount: number;
  };
  totals: Record<RuntimeTurnStatus, number>;
  turns: RuntimeTurnRecord[];
  recentEvents: CodexRuntimeEvent[];
}

export class CodexDriverError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(code: string, message: string, recoverable = true) {
    super(message);
    this.name = 'CodexDriverError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

export class CodexTurnCanceledError extends CodexDriverError {
  constructor(message = 'The Codex turn was canceled.') {
    super('runtime_canceled', message, true);
    this.name = 'CodexTurnCanceledError';
  }
}

export class CodexTurnTimeoutError extends CodexDriverError {
  constructor(timeoutMs: number) {
    super('runtime_timeout', `The Codex turn exceeded its ${timeoutMs} ms time limit.`, true);
    this.name = 'CodexTurnTimeoutError';
  }
}

export function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof (value as Partial<Promise<T>>)?.then === 'function';
}
