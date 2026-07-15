import {
  CodexDriverError,
  type CodexDriver,
  type CodexTurnResult,
} from '@signal-atlas/codex-runtime';
import type { AgentTurnInput } from '@signal-atlas/contracts';

import type { ProfessorDriver } from './professor-driver.js';

interface QueuedAdmission {
  signal: AbortSignal;
  resolve: () => void;
  reject: (error: unknown) => void;
  onAbort: () => void;
}

export interface ExternalCallGateDiagnostics {
  maxConcurrency: number;
  maxQueued: number;
  activeCount: number;
  queuedCount: number;
  admittedCount: number;
  rejectedCount: number;
}

export interface ExternalCallGateOptions {
  maxConcurrency: number;
  maxQueued?: number;
}

function canceledReason(signal: AbortSignal): unknown {
  return signal.reason ?? new CodexDriverError('runtime_canceled', 'External call was canceled.');
}

/** A process-local admission boundary shared by every expedition's external drivers. */
export class ExternalCallGate {
  readonly #maxConcurrency: number;
  readonly #maxQueued: number;
  readonly #queue: QueuedAdmission[] = [];
  #activeCount = 0;
  #admittedCount = 0;
  #rejectedCount = 0;

  constructor(options: ExternalCallGateOptions) {
    this.#maxConcurrency = options.maxConcurrency;
    this.#maxQueued = options.maxQueued ?? 32;
    if (!Number.isInteger(this.#maxConcurrency) || this.#maxConcurrency < 1) {
      throw new Error('External call concurrency must be a positive integer.');
    }
    if (!Number.isInteger(this.#maxQueued) || this.#maxQueued < 0) {
      throw new Error('External call queue limit must be a non-negative integer.');
    }
  }

  async run<T>(signal: AbortSignal, operation: () => T | Promise<T>): Promise<T> {
    await this.#acquire(signal);
    try {
      if (signal.aborted) throw canceledReason(signal);
      return await operation();
    } finally {
      this.#release();
    }
  }

  diagnostics(): ExternalCallGateDiagnostics {
    return {
      maxConcurrency: this.#maxConcurrency,
      maxQueued: this.#maxQueued,
      activeCount: this.#activeCount,
      queuedCount: this.#queue.length,
      admittedCount: this.#admittedCount,
      rejectedCount: this.#rejectedCount,
    };
  }

  #acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(canceledReason(signal));
    if (this.#activeCount < this.#maxConcurrency) {
      this.#activeCount += 1;
      this.#admittedCount += 1;
      return Promise.resolve();
    }
    if (this.#queue.length >= this.#maxQueued) {
      this.#rejectedCount += 1;
      return Promise.reject(
        new CodexDriverError(
          'runtime_overloaded',
          `The global external-call queue is full at ${this.#maxQueued} waiting turns.`,
          true,
        ),
      );
    }

    return new Promise<void>((resolve, reject) => {
      const admission: QueuedAdmission = {
        signal,
        resolve,
        reject,
        onAbort: () => {
          const index = this.#queue.indexOf(admission);
          if (index >= 0) this.#queue.splice(index, 1);
          reject(canceledReason(signal));
        },
      };
      signal.addEventListener('abort', admission.onAbort, { once: true });
      this.#queue.push(admission);
    });
  }

  #release(): void {
    this.#activeCount -= 1;
    while (this.#queue.length > 0) {
      const admission = this.#queue.shift();
      if (!admission) break;
      admission.signal.removeEventListener('abort', admission.onAbort);
      if (admission.signal.aborted) {
        admission.reject(canceledReason(admission.signal));
        continue;
      }
      this.#activeCount += 1;
      this.#admittedCount += 1;
      admission.resolve();
      break;
    }
  }
}

export function gateCodexDriver<TInput extends AgentTurnInput, TArtifacts>(
  driver: CodexDriver<TInput, TArtifacts>,
  gate: ExternalCallGate,
): CodexDriver<TInput, TArtifacts> {
  if (driver.kind === 'scripted') return driver;
  return {
    id: driver.id,
    kind: driver.kind,
    diagnostics: () => driver.diagnostics(),
    runTurn: (input, context): Promise<CodexTurnResult<TArtifacts>> =>
      gate.run(context.signal, () => driver.runTurn(input, context)),
  };
}

export function gateProfessorDriver(
  driver: ProfessorDriver,
  gate: ExternalCallGate,
): ProfessorDriver {
  if (driver.kind === 'scripted') return driver;
  return {
    id: driver.id,
    kind: driver.kind,
    diagnostics: () => driver.diagnostics(),
    runTurn: (input, context) => gate.run(context.signal, () => driver.runTurn(input, context)),
  };
}
