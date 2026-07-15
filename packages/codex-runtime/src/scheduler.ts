import {
  AgentTurnInputSchema,
  AgentTurnOutputSchema,
  MAX_MISSION_TIMEOUT_MS,
  type AgentTurnInput,
} from '@signal-atlas/contracts';

import { InMemoryRuntimeTurnStore, type RuntimeTurnStore } from './store.js';
import { publicCodexError } from './public-error.js';
import {
  CodexDriverError,
  CodexTurnCanceledError,
  CodexTurnTimeoutError,
  type CodexDriver,
  type CodexRuntimeDiagnostics,
  type CodexRuntimeEvent,
  type CodexTurnResult,
  type RuntimeTurnRecord,
  type RuntimeTurnStatus,
} from './types.js';

export interface CodexTurnSchedulerOptions<TInput extends AgentTurnInput, TArtifacts> {
  driver: CodexDriver<TInput, TArtifacts>;
  maxConcurrency?: number;
  defaultTimeoutMs?: number;
  store?: RuntimeTurnStore;
  now?: () => Date;
}

export interface ScheduledCodexTurn<TArtifacts> {
  turnId: string;
  completion: Promise<CodexTurnResult<TArtifacts>>;
}

interface QueueItem<TInput extends AgentTurnInput, TArtifacts> {
  input: TInput;
  resolve: (result: CodexTurnResult<TArtifacts>) => void;
  reject: (error: Error) => void;
}

const statuses: RuntimeTurnStatus[] = [
  'queued',
  'running',
  'completed',
  'failed',
  'canceled',
  'timed_out',
];

function errorDetails(error: unknown): NonNullable<RuntimeTurnRecord['error']> {
  const normalized = publicCodexError(error);
  return {
    code: normalized.code,
    message: normalized.message,
    recoverable: normalized.recoverable,
  };
}

export class CodexTurnScheduler<
  TInput extends AgentTurnInput = AgentTurnInput,
  TArtifacts = unknown,
> {
  readonly #driver: CodexDriver<TInput, TArtifacts>;
  readonly #maxConcurrency: number;
  readonly #defaultTimeoutMs: number;
  readonly #store: RuntimeTurnStore;
  readonly #now: () => Date;
  readonly #queue: Array<QueueItem<TInput, TArtifacts>> = [];
  readonly #active = new Map<string, AbortController>();
  readonly #events: CodexRuntimeEvent[] = [];
  readonly #listeners = new Set<(event: CodexRuntimeEvent) => void>();
  readonly #idleWaiters = new Set<() => void>();

  constructor(options: CodexTurnSchedulerOptions<TInput, TArtifacts>) {
    this.#driver = options.driver;
    this.#maxConcurrency = options.maxConcurrency ?? 2;
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.#store = options.store ?? new InMemoryRuntimeTurnStore();
    this.#now = options.now ?? (() => new Date());
    if (!Number.isInteger(this.#maxConcurrency) || this.#maxConcurrency < 1) {
      throw new Error('Codex scheduler concurrency must be a positive integer.');
    }
    if (
      !Number.isInteger(this.#defaultTimeoutMs) ||
      this.#defaultTimeoutMs < 1 ||
      this.#defaultTimeoutMs > MAX_MISSION_TIMEOUT_MS
    ) {
      throw new Error(
        `Codex scheduler timeout must be an integer from 1 to ${MAX_MISSION_TIMEOUT_MS} ms.`,
      );
    }

    for (const record of this.#store.list()) {
      if (record.status !== 'queued' && record.status !== 'running') continue;
      const finishedAt = this.#timestamp();
      this.#store.write({
        ...record,
        status: 'failed',
        finishedAt,
        error: {
          code: 'runtime_restart',
          message: 'The process restarted before this turn reached a terminal state.',
          recoverable: true,
        },
      });
    }
  }

  submit(input: TInput): ScheduledCodexTurn<TArtifacts> {
    const parsed = AgentTurnInputSchema.parse(input) as TInput;
    if (this.#store.list().some((record) => record.turnId === parsed.turnId)) {
      throw new Error(`Codex turn ${parsed.turnId} already exists.`);
    }

    let resolve!: QueueItem<TInput, TArtifacts>['resolve'];
    let reject!: QueueItem<TInput, TArtifacts>['reject'];
    const completion = new Promise<CodexTurnResult<TArtifacts>>((resolveResult, rejectError) => {
      resolve = resolveResult;
      reject = rejectError;
    });
    const item: QueueItem<TInput, TArtifacts> = { input: parsed, resolve, reject };
    this.#queue.push(item);
    const queuedAt = this.#timestamp();
    this.#store.write({
      turnId: parsed.turnId,
      expeditionId: parsed.expeditionId,
      agentId: parsed.agentId,
      missionId: parsed.mission.id,
      driverId: this.#driver.id,
      status: 'queued',
      attempt: parsed.attempt,
      requestedAt: parsed.requestedAt,
      timeoutMs: parsed.timeoutMs || this.#defaultTimeoutMs,
      queuedAt,
    });
    this.#emit('turn.queued', parsed.turnId, queuedAt);
    this.#pump();
    return { turnId: parsed.turnId, completion };
  }

  cancel(turnId: string, reason = 'Canceled by the runtime operator.'): boolean {
    const queuedIndex = this.#queue.findIndex((item) => item.input.turnId === turnId);
    if (queuedIndex >= 0) {
      const [item] = this.#queue.splice(queuedIndex, 1);
      if (!item) return false;
      const error = new CodexTurnCanceledError(reason);
      this.#finish(item.input, 'canceled', error);
      item.reject(error);
      this.#pump();
      this.#notifyIdle();
      return true;
    }
    const controller = this.#active.get(turnId);
    if (!controller) return false;
    controller.abort(new CodexTurnCanceledError(reason));
    return true;
  }

  subscribe(listener: (event: CodexRuntimeEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  diagnostics(): CodexRuntimeDiagnostics {
    const turns = this.#store.list();
    const totals = Object.fromEntries(
      statuses.map((status) => [status, turns.filter((turn) => turn.status === status).length]),
    ) as Record<RuntimeTurnStatus, number>;
    return {
      driver: this.#driver.diagnostics(),
      scheduler: {
        maxConcurrency: this.#maxConcurrency,
        defaultTimeoutMs: this.#defaultTimeoutMs,
        activeCount: this.#active.size,
        queuedCount: this.#queue.length,
      },
      totals,
      turns,
      recentEvents: structuredClone(this.#events),
    };
  }

  async waitForIdle(): Promise<void> {
    if (this.#active.size === 0 && this.#queue.length === 0) return;
    await new Promise<void>((resolve) => this.#idleWaiters.add(resolve));
  }

  #pump(): void {
    while (this.#active.size < this.#maxConcurrency) {
      const item = this.#queue.shift();
      if (!item) return;
      void this.#run(item);
    }
  }

  async #run(item: QueueItem<TInput, TArtifacts>): Promise<void> {
    const { input } = item;
    const startedAt = this.#timestamp();
    const startedMs = this.#now().getTime();
    const controller = new AbortController();
    this.#active.set(input.turnId, controller);
    const previous = this.#record(input.turnId);
    this.#store.write({ ...previous, status: 'running', startedAt });
    this.#emit('turn.started', input.turnId, startedAt);

    const timeoutMs = input.timeoutMs || this.#defaultTimeoutMs;
    const timeout = setTimeout(() => {
      controller.abort(new CodexTurnTimeoutError(timeoutMs));
    }, timeoutMs);
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(controller.signal.reason ?? new CodexTurnCanceledError()),
        { once: true },
      );
    });

    try {
      const result = await Promise.race([
        Promise.resolve(
          this.#driver.runTurn(input, {
            signal: controller.signal,
            deadlineAt: new Date(startedMs + timeoutMs).toISOString(),
            emit: (detail) => this.#emit('driver.event', input.turnId, this.#timestamp(), detail),
          }),
        ),
        aborted,
      ]);
      const output = AgentTurnOutputSchema.parse(result.output);
      if (output.agentId !== input.agentId || output.missionId !== input.mission.id) {
        throw new CodexDriverError(
          'runtime_identity_mismatch',
          'Codex output agent and mission IDs must match the scheduled turn.',
          false,
        );
      }
      const finishedAt = this.#timestamp();
      this.#store.write({
        ...this.#record(input.turnId),
        status: 'completed',
        finishedAt,
        durationMs: Math.max(0, this.#now().getTime() - startedMs),
        ...(result.sessionId ? { sessionId: result.sessionId } : {}),
      });
      this.#emit('turn.completed', input.turnId, finishedAt);
      item.resolve({ ...result, output });
    } catch (error: unknown) {
      const status: RuntimeTurnStatus =
        error instanceof CodexTurnTimeoutError
          ? 'timed_out'
          : error instanceof CodexTurnCanceledError
            ? 'canceled'
            : 'failed';
      const publicError = publicCodexError(error);
      this.#finish(input, status, publicError, startedMs);
      item.reject(publicError);
    } finally {
      clearTimeout(timeout);
      this.#active.delete(input.turnId);
      this.#pump();
      this.#notifyIdle();
    }
  }

  #finish(
    input: TInput,
    status: Extract<RuntimeTurnStatus, 'failed' | 'canceled' | 'timed_out'>,
    error: unknown,
    startedMs?: number,
  ): void {
    const finishedAt = this.#timestamp();
    this.#store.write({
      ...this.#record(input.turnId),
      status,
      finishedAt,
      ...(startedMs === undefined
        ? {}
        : { durationMs: Math.max(0, this.#now().getTime() - startedMs) }),
      error: errorDetails(error),
    });
    this.#emit(
      status === 'timed_out'
        ? 'turn.timed_out'
        : status === 'canceled'
          ? 'turn.canceled'
          : 'turn.failed',
      input.turnId,
      finishedAt,
      { error: errorDetails(error) },
    );
  }

  #record(turnId: string): RuntimeTurnRecord {
    const record = this.#store.list().find((candidate) => candidate.turnId === turnId);
    if (!record) throw new Error(`Codex turn ${turnId} is absent from the runtime store.`);
    return record;
  }

  #timestamp(): string {
    return this.#now().toISOString();
  }

  #notifyIdle(): void {
    if (this.#active.size > 0 || this.#queue.length > 0) return;
    for (const resolve of this.#idleWaiters) resolve();
    this.#idleWaiters.clear();
  }

  #emit(
    type: CodexRuntimeEvent['type'],
    turnId: string,
    occurredAt: string,
    detail?: Record<string, unknown>,
  ): void {
    const event: CodexRuntimeEvent = {
      id: `runtime-${turnId}-${this.#events.length + 1}`,
      type,
      turnId,
      occurredAt,
      ...(detail ? { detail } : {}),
    };
    this.#events.push(event);
    if (this.#events.length > 200) this.#events.shift();
    for (const listener of this.#listeners) listener(structuredClone(event));
  }
}
