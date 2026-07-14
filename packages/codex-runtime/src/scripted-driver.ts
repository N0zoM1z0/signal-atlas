import type { AgentTurnInput } from '@signal-atlas/contracts';

import type {
  CodexDriver,
  CodexDriverContext,
  CodexDriverDiagnostics,
  CodexTurnResult,
  MaybePromise,
} from './types.js';
import { isPromiseLike } from './types.js';

export interface ScriptedCodexDriverOptions<TInput extends AgentTurnInput, TArtifacts = unknown> {
  id?: string;
  description?: string;
  run: (input: TInput, context: CodexDriverContext) => MaybePromise<CodexTurnResult<TArtifacts>>;
}

/** A deterministic driver with the same runtime boundary used by local Codex execution. */
export class ScriptedCodexDriver<
  TInput extends AgentTurnInput = AgentTurnInput,
  TArtifacts = unknown,
> implements CodexDriver<TInput, TArtifacts> {
  readonly id: string;
  readonly kind = 'scripted' as const;
  readonly #description: string;
  readonly #run: ScriptedCodexDriverOptions<TInput, TArtifacts>['run'];
  #runs = 0;
  #lastRunAt: string | undefined;
  #lastError: string | undefined;

  constructor(options: ScriptedCodexDriverOptions<TInput, TArtifacts>) {
    this.id = options.id ?? 'scripted';
    this.#description = options.description ?? 'Deterministic scripted Codex driver.';
    this.#run = options.run;
  }

  runTurn(input: TInput, context: CodexDriverContext): MaybePromise<CodexTurnResult<TArtifacts>> {
    this.#runs += 1;
    this.#lastRunAt = new Date().toISOString();
    this.#lastError = undefined;
    try {
      const result = this.#run(input, context);
      if (isPromiseLike(result)) {
        return result.catch((error: unknown) => {
          this.#lastError = error instanceof Error ? error.message : String(error);
          throw error;
        });
      }
      return result;
    } catch (error: unknown) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  diagnostics(): CodexDriverDiagnostics {
    return {
      id: this.id,
      kind: this.kind,
      available: true,
      description: this.#description,
      runs: this.#runs,
      ...(this.#lastRunAt ? { lastRunAt: this.#lastRunAt } : {}),
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
    };
  }
}
