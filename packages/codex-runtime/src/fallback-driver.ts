import type { AgentTurnInput } from '@signal-atlas/contracts';

import { publicCodexError } from './public-error.js';

import {
  CodexDriverError,
  type CodexDriver,
  type CodexDriverContext,
  type CodexDriverDiagnostics,
  type CodexTurnResult,
} from './types.js';

export interface CodexUnavailableFallbackDriverOptions<TArtifacts> {
  primary: CodexDriver<AgentTurnInput, TArtifacts>;
  fallback: CodexDriver<AgentTurnInput, TArtifacts>;
  id?: string;
}

/** Use scripted behavior only when the configured local executable is genuinely unavailable. */
export class CodexUnavailableFallbackDriver<TArtifacts> implements CodexDriver<
  AgentTurnInput,
  TArtifacts
> {
  readonly id: string;
  readonly kind = 'local_exec' as const;
  readonly #primary: CodexDriver<AgentTurnInput, TArtifacts>;
  readonly #fallback: CodexDriver<AgentTurnInput, TArtifacts>;
  #runs = 0;
  #usedFallback = false;
  #fallbackReason: string | undefined;
  #lastRunAt: string | undefined;
  #lastError: string | undefined;

  constructor(options: CodexUnavailableFallbackDriverOptions<TArtifacts>) {
    this.id = options.id ?? 'local-codex-with-scripted-fallback';
    this.#primary = options.primary;
    this.#fallback = options.fallback;
  }

  async runTurn(
    input: AgentTurnInput,
    context: CodexDriverContext,
  ): Promise<CodexTurnResult<TArtifacts>> {
    this.#runs += 1;
    this.#lastRunAt = new Date().toISOString();
    this.#lastError = undefined;
    const primaryAvailable = this.#primary.diagnostics().available;
    if (!primaryAvailable) {
      return this.#runFallback(input, context, 'Local Codex executable is unavailable.');
    }
    try {
      const result = await this.#primary.runTurn(input, context);
      this.#usedFallback = false;
      this.#fallbackReason = undefined;
      return result;
    } catch (error: unknown) {
      if (error instanceof CodexDriverError && error.code === 'codex_unavailable') {
        return this.#runFallback(input, context, error.message);
      }
      const publicError = publicCodexError(error);
      this.#lastError = publicError.message;
      throw publicError;
    }
  }

  diagnostics(): CodexDriverDiagnostics {
    const primary = this.#primary.diagnostics();
    const fallbackActive = this.#usedFallback || !primary.available;
    return {
      id: this.id,
      kind: this.kind,
      available: primary.available || this.#fallback.diagnostics().available,
      description: fallbackActive
        ? 'Local Codex is unavailable; deterministic scripted mission behavior is active.'
        : 'Local schema-constrained Codex with a deterministic unavailable-only fallback.',
      runs: this.#runs,
      activeMode: fallbackActive ? 'scripted_fallback' : 'local_exec',
      ...(this.#lastRunAt ? { lastRunAt: this.#lastRunAt } : {}),
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
      ...(primary.command ? { command: structuredClone(primary.command) } : {}),
      fallback: {
        driverId: this.#fallback.id,
        used: this.#usedFallback,
        ...(this.#fallbackReason ? { reason: this.#fallbackReason } : {}),
      },
    };
  }

  async #runFallback(
    input: AgentTurnInput,
    context: CodexDriverContext,
    reason: string,
  ): Promise<CodexTurnResult<TArtifacts>> {
    this.#usedFallback = true;
    this.#fallbackReason = publicCodexError(
      new CodexDriverError('codex_unavailable', reason, true),
    ).message;
    context.emit({ phase: 'scripted_fallback', reason: 'codex_unavailable' });
    return this.#fallback.runTurn(input, context);
  }
}
