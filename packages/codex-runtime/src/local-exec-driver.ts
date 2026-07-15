import { constants, accessSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';

import {
  AgentTurnOutputSchema,
  type AgentTurnInput,
  type AgentTurnOutput,
} from '@signal-atlas/contracts';

import { parseCodexJsonl } from './jsonl.js';
import { validateAgentProfileOutput } from './profiles.js';
import {
  buildCodexRepairPrompt,
  buildCodexTurnPrompt,
  type CodexTurnPromptContext,
} from './prompt.js';
import { runCodexProcess, type CodexProcessRequest, type CodexProcessRunner } from './process.js';
import { publicCodexError } from './public-error.js';
import { redactSensitiveText } from './redaction.js';
import { InMemoryAgentSessionRegistry, type AgentSessionRegistry } from './session-registry.js';
import {
  CodexDriverError,
  CodexTurnCanceledError,
  type CodexDriver,
  type CodexDriverContext,
  type CodexDriverDiagnostics,
  type CodexTurnResult,
} from './types.js';

export interface LocalCodexTurnMetadata {
  command: CodexDriverDiagnostics['command'];
  durationMs: number;
  repairAttempts: number;
  safeFallback: boolean;
  validationErrors: string[];
}

export interface LocalCodexExecDriverOptions<TArtifacts = LocalCodexTurnMetadata> {
  id?: string;
  executable?: string;
  model?: string;
  runtimeRoot?: string;
  outputSchema: Record<string, unknown>;
  promptContext: (
    input: AgentTurnInput,
  ) => CodexTurnPromptContext | Promise<CodexTurnPromptContext>;
  materializeArtifacts?: (
    input: AgentTurnInput,
    output: AgentTurnOutput,
    metadata: LocalCodexTurnMetadata,
  ) => TArtifacts | Promise<TArtifacts>;
  validateOutput?: (
    input: AgentTurnInput,
    output: AgentTurnOutput,
    context: CodexTurnPromptContext,
  ) => string[];
  processRunner?: CodexProcessRunner;
  environment?: NodeJS.ProcessEnv;
  isAvailable?: (executable: string, environment: NodeJS.ProcessEnv) => boolean;
  now?: () => Date;
  killGraceMs?: number;
  sessionRegistry?: AgentSessionRegistry;
}

interface AttemptResult {
  output?: AgentTurnOutput;
  rawOutput: string;
  errors: string[];
  sessionId?: string;
  usage?: CodexTurnResult['usage'];
  durationMs: number;
  command: NonNullable<CodexDriverDiagnostics['command']>;
}

const forwardedEnvironmentKeys = [
  'HOME',
  'USER',
  'LOGNAME',
  'PATH',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TMPDIR',
  'CODEX_HOME',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
] as const;

export function codexProcessEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { NO_COLOR: '1' };
  for (const key of forwardedEnvironmentKeys) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

export function isExecutableAvailable(
  executable: string,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const candidates = isAbsolute(executable)
    ? [executable]
    : (environment['PATH'] ?? '')
        .split(delimiter)
        .filter(Boolean)
        .map((directory) => join(directory, executable));
  return candidates.some((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, '_').slice(0, 120);
}

function quoteForDisplay(value: string): string {
  return /^[a-zA-Z0-9_./:=<>-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function commandDiagnostics(
  executable: string,
  args: readonly string[],
): NonNullable<CodexDriverDiagnostics['command']> {
  const safeExecutable = redactSensitiveText(executable);
  const safeArgs = args.map((argument) => redactSensitiveText(argument));
  return {
    executable: safeExecutable,
    args: safeArgs,
    display: [safeExecutable, ...safeArgs].map(quoteForDisplay).join(' '),
  };
}

function commonArguments(schemaPath: string, outputPath: string, model?: string): string[] {
  return [
    '--ignore-user-config',
    '--ignore-rules',
    '--strict-config',
    '--skip-git-repo-check',
    '--json',
    '--disable',
    'shell_tool',
    '--disable',
    'multi_agent',
    '--disable',
    'apps',
    '--disable',
    'remote_plugin',
    '-c',
    'approval_policy="never"',
    '-c',
    'sandbox_mode="read-only"',
    '-c',
    'web_search="disabled"',
    '-c',
    'shell_environment_policy.inherit="none"',
    '--output-schema',
    schemaPath,
    '-o',
    outputPath,
    ...(model ? ['--model', model] : []),
  ];
}

export function buildCodexExecArguments(options: {
  schemaPath: string;
  outputPath: string;
  workspacePath: string;
  sessionId?: string;
  model?: string;
}): string[] {
  const common = commonArguments(options.schemaPath, options.outputPath, options.model);
  if (options.sessionId) {
    return ['exec', 'resume', ...common, options.sessionId, '-'];
  }
  return ['exec', '--sandbox', 'read-only', '-C', options.workspacePath, ...common, '-'];
}

function validationErrors(
  input: AgentTurnInput,
  output: AgentTurnOutput,
  context: CodexTurnPromptContext,
): string[] {
  const errors: string[] = [];
  const allowedSourceIds = new Set(context.knowledge.sources.map((source) => source.id));
  const allowedSignalIds = new Set(context.knowledge.signals.map((signal) => signal.id));
  const allowedOutcomes = new Set(context.market.outcomeIds);

  if (output.agentId !== input.agentId) {
    errors.push(`agentId: expected ${input.agentId}, received ${output.agentId}.`);
  }
  if (output.missionId !== input.mission.id) {
    errors.push(`missionId: expected ${input.mission.id}, received ${output.missionId}.`);
  }

  for (const sourceId of output.sourceIdsUsed) {
    if (!allowedSourceIds.has(sourceId)) {
      errors.push(`sourceIdsUsed: source ${sourceId} was not available to this turn.`);
    }
  }
  if (new Set(output.sourceIdsUsed).size !== output.sourceIdsUsed.length) {
    errors.push('sourceIdsUsed: source IDs must be unique.');
  }
  if (
    output.action.type === 'investigate' &&
    !input.allowedCapabilities.includes(output.action.capability)
  ) {
    errors.push(`action.capability: capability ${output.action.capability} is not allowed.`);
  }
  if (output.action.type === 'share_signal') {
    for (const signalId of output.action.signalIds) {
      if (!allowedSignalIds.has(signalId)) {
        errors.push(`action.signalIds: signal ${signalId} was not known to this agent.`);
      }
    }
  }
  if (output.action.type === 'update_belief') {
    for (const outcomeId of Object.keys(output.action.probabilities)) {
      if (!allowedOutcomes.has(outcomeId)) {
        errors.push(`action.probabilities: outcome ${outcomeId} is not part of this market.`);
      }
    }
  }
  output.proposedSignals.forEach((signal, index) => {
    if (signal.targetOutcomeId && !allowedOutcomes.has(signal.targetOutcomeId)) {
      errors.push(
        `proposedSignals.${index}.targetOutcomeId: outcome ${signal.targetOutcomeId} is unknown.`,
      );
    }
  });
  errors.push(...validateAgentProfileOutput(context.profile, output));
  return errors;
}

function zodErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'output';
    return `${path}: ${issue.message}`;
  });
}

/** Convert strict Structured Outputs null sentinels back to domain-level omitted optionals. */
export function normalizeCodexTransportOutput(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const output = structuredClone(value) as Record<string, unknown>;
  if (output['suggestedFollowUp'] === null) {
    delete output['suggestedFollowUp'];
  } else if (output['suggestedFollowUp'] && typeof output['suggestedFollowUp'] === 'object') {
    const followUp = output['suggestedFollowUp'] as Record<string, unknown>;
    if (followUp['destinationPlaceId'] === null) delete followUp['destinationPlaceId'];
  }
  if (output['action'] && typeof output['action'] === 'object') {
    const action = output['action'] as Record<string, unknown>;
    if (action['destinationPlaceId'] === null) delete action['destinationPlaceId'];
    if (action['uncertainty'] === null) delete action['uncertainty'];
  }
  if (Array.isArray(output['proposedSignals'])) {
    for (const signal of output['proposedSignals']) {
      if (signal && typeof signal === 'object') {
        const record = signal as Record<string, unknown>;
        if (record['targetOutcomeId'] === null) delete record['targetOutcomeId'];
      }
    }
  }
  return output;
}

function safeWait(input: AgentTurnInput): AgentTurnOutput {
  return AgentTurnOutputSchema.parse({
    schemaVersion: 1,
    agentId: input.agentId,
    missionId: input.mission.id,
    action: {
      type: 'wait',
      reason: 'The local Codex result could not be validated after one repair attempt.',
    },
    publicDialogue:
      'I could not validate this turn safely, so I recorded no evidence and will wait for direction.',
    sourceIdsUsed: [],
    proposedClaims: [],
    proposedSignals: [],
    rationale: 'The bounded runtime rejected both the original and repaired output.',
    assumptions: [],
    unknowns: ['No source, claim, signal, or belief change was accepted from this turn.'],
  });
}

export class LocalCodexExecDriver<TArtifacts = LocalCodexTurnMetadata> implements CodexDriver<
  AgentTurnInput,
  TArtifacts
> {
  readonly id: string;
  readonly kind = 'local_exec' as const;
  readonly #executable: string;
  readonly #model: string | undefined;
  readonly #runtimeRoot: string;
  readonly #outputSchema: Record<string, unknown>;
  readonly #promptContext: LocalCodexExecDriverOptions<TArtifacts>['promptContext'];
  readonly #materialize: LocalCodexExecDriverOptions<TArtifacts>['materializeArtifacts'];
  readonly #validate: LocalCodexExecDriverOptions<TArtifacts>['validateOutput'];
  readonly #processRunner: CodexProcessRunner;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #now: () => Date;
  readonly #killGraceMs: number;
  readonly #sessionRegistry: AgentSessionRegistry;
  #available: boolean;
  #runs = 0;
  #lastRunAt: string | undefined;
  #lastError: string | undefined;
  #lastCommand: CodexDriverDiagnostics['command'];

  constructor(options: LocalCodexExecDriverOptions<TArtifacts>) {
    this.id = options.id ?? 'local-codex-exec';
    this.#executable = options.executable ?? 'codex';
    this.#model = options.model;
    this.#runtimeRoot = options.runtimeRoot ?? join(tmpdir(), 'signal-atlas-codex-runtime');
    this.#outputSchema = structuredClone(options.outputSchema);
    this.#promptContext = options.promptContext;
    this.#materialize = options.materializeArtifacts;
    this.#validate = options.validateOutput;
    this.#processRunner = options.processRunner ?? runCodexProcess;
    this.#environment = codexProcessEnvironment(options.environment ?? process.env);
    this.#now = options.now ?? (() => new Date());
    this.#killGraceMs = options.killGraceMs ?? 250;
    this.#sessionRegistry = options.sessionRegistry ?? new InMemoryAgentSessionRegistry();
    this.#available = (options.isAvailable ?? isExecutableAvailable)(
      this.#executable,
      this.#environment,
    );
  }

  async runTurn(
    input: AgentTurnInput,
    driverContext: CodexDriverContext,
  ): Promise<CodexTurnResult<TArtifacts>> {
    this.#runs += 1;
    this.#lastRunAt = this.#now().toISOString();
    this.#lastError = undefined;
    if (!this.#available) {
      const error = new CodexDriverError(
        'codex_unavailable',
        `Local Codex executable ${this.#executable} is unavailable.`,
        true,
      );
      this.#lastError = error.message;
      throw error;
    }

    try {
      const promptContext = await this.#promptContext(input);
      const transientArchiveAccess = Boolean(promptContext.knowledge.access.archiveGrant);
      const storedSession = transientArchiveAccess
        ? undefined
        : this.#sessionRegistry.get(input.expeditionId, input.agentId);
      const compatibleSession =
        storedSession?.profileId === promptContext.profile.profileId &&
        storedSession.profileVersion === promptContext.profile.version
          ? storedSession.sessionId
          : undefined;
      const original = await this.#attempt(
        input,
        promptContext,
        buildCodexTurnPrompt(input, promptContext),
        compatibleSession,
        0,
        driverContext,
      );
      let selected = original;
      let repairAttempts = 0;
      if (!selected.output) {
        repairAttempts = 1;
        driverContext.emit({
          phase: 'validation_failed',
          repairPending: true,
          issueCount: selected.errors.length,
        });
        selected = await this.#attempt(
          input,
          promptContext,
          buildCodexRepairPrompt(selected.errors, selected.rawOutput),
          selected.sessionId ?? compatibleSession,
          1,
          driverContext,
        );
      }

      if (selected.sessionId && !transientArchiveAccess) {
        this.#sessionRegistry.write({
          schemaVersion: 1,
          expeditionId: input.expeditionId,
          agentId: input.agentId,
          sessionId: selected.sessionId,
          profileId: promptContext.profile.profileId,
          profileVersion: promptContext.profile.version,
          updatedAt: this.#now().toISOString(),
        });
      }

      const safeFallback = !selected.output;
      const output = selected.output ?? safeWait(input);
      if (safeFallback) {
        driverContext.emit({
          phase: 'safe_wait',
          issueCount: selected.errors.length,
          evidenceAccepted: false,
        });
      }
      const metadata: LocalCodexTurnMetadata = {
        command: selected.command,
        durationMs: original.durationMs + (repairAttempts > 0 ? selected.durationMs : 0),
        repairAttempts,
        safeFallback,
        validationErrors: safeFallback ? [...selected.errors] : [],
      };
      const artifacts = this.#materialize
        ? await this.#materialize(input, output, metadata)
        : (metadata as TArtifacts);
      return {
        output,
        artifacts,
        ...(selected.sessionId ? { sessionId: selected.sessionId } : {}),
        ...(selected.usage ? { usage: selected.usage } : {}),
      };
    } catch (error: unknown) {
      const unavailable =
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT';
      const normalized = unavailable
        ? new CodexDriverError(
            'codex_unavailable',
            `Local Codex executable ${this.#executable} is unavailable.`,
            true,
          )
        : error;
      if (unavailable) this.#available = false;
      const publicError = publicCodexError(normalized);
      this.#lastError = publicError.message;
      throw publicError;
    }
  }

  diagnostics(): CodexDriverDiagnostics {
    return {
      id: this.id,
      kind: this.kind,
      available: this.#available,
      description:
        'Schema-constrained local Codex CLI driver in a read-only, tool-disabled workspace.',
      runs: this.#runs,
      activeMode: 'local_exec',
      ...(this.#lastRunAt ? { lastRunAt: this.#lastRunAt } : {}),
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
      ...(this.#lastCommand ? { command: structuredClone(this.#lastCommand) } : {}),
    };
  }

  #runtimePaths(input: AgentTurnInput, attempt: number) {
    mkdirSync(this.#runtimeRoot, { recursive: true, mode: 0o700 });
    const workspacePath = join(this.#runtimeRoot, `agent-${safeSegment(input.agentId)}`);
    mkdirSync(workspacePath, { recursive: true, mode: 0o700 });
    const schemaPath = join(this.#runtimeRoot, 'agent-turn-output.codex.schema.json');
    writeFileSync(schemaPath, `${JSON.stringify(this.#outputSchema, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    const outputPath = join(
      this.#runtimeRoot,
      `${safeSegment(input.turnId)}-attempt-${attempt + 1}.json`,
    );
    rmSync(outputPath, { force: true });
    return { workspacePath, schemaPath, outputPath };
  }

  async #attempt(
    input: AgentTurnInput,
    promptContext: CodexTurnPromptContext,
    prompt: string,
    sessionId: string | undefined,
    attempt: number,
    driverContext: CodexDriverContext,
  ): Promise<AttemptResult> {
    const paths = this.#runtimePaths(input, attempt);
    const args = buildCodexExecArguments({
      ...paths,
      ...(sessionId ? { sessionId } : {}),
      ...(this.#model ? { model: this.#model } : {}),
    });
    const command = commandDiagnostics(this.#executable, args);
    this.#lastCommand = command;
    driverContext.emit({
      phase: 'codex_attempt_started',
      attempt: attempt + 1,
      resumed: Boolean(sessionId),
    });
    const startedAt = this.#now().getTime();
    const request: CodexProcessRequest = {
      executable: this.#executable,
      args,
      cwd: paths.workspacePath,
      env: this.#environment,
      stdin: prompt,
      signal: driverContext.signal,
      killGraceMs: this.#killGraceMs,
    };
    let processResult;
    try {
      processResult = await this.#processRunner(request);
    } catch (error: unknown) {
      rmSync(paths.outputPath, { force: true });
      throw error;
    }
    const durationMs = Math.max(0, this.#now().getTime() - startedAt);
    if (processResult.aborted || driverContext.signal.aborted) {
      rmSync(paths.outputPath, { force: true });
      const reason = driverContext.signal.reason;
      throw reason instanceof Error ? reason : new CodexTurnCanceledError();
    }
    if (processResult.exitCode !== 0) {
      rmSync(paths.outputPath, { force: true });
      throw new CodexDriverError(
        'codex_process_failed',
        'The local Codex process failed before producing a validated result.',
        true,
      );
    }

    let stream: ReturnType<typeof parseCodexJsonl>;
    try {
      stream = parseCodexJsonl(processResult.stdout);
    } catch (error: unknown) {
      return {
        rawOutput: this.#consumeRawOutput(paths.outputPath),
        errors: [error instanceof Error ? error.message : String(error)],
        durationMs,
        command,
      };
    }
    for (const detail of stream.diagnostics) driverContext.emit(detail);
    const rawOutput = this.#consumeRawOutput(paths.outputPath);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawOutput);
    } catch {
      return {
        rawOutput,
        errors: ['output: final output is not valid JSON.'],
        ...(stream.sessionId ? { sessionId: stream.sessionId } : {}),
        ...(stream.usage ? { usage: stream.usage } : {}),
        durationMs,
        command,
      };
    }
    const parsed = AgentTurnOutputSchema.safeParse(normalizeCodexTransportOutput(parsedJson));
    if (!parsed.success) {
      return {
        rawOutput,
        errors: zodErrors(parsed.error),
        ...(stream.sessionId ? { sessionId: stream.sessionId } : {}),
        ...(stream.usage ? { usage: stream.usage } : {}),
        durationMs,
        command,
      };
    }
    const errors = [
      ...validationErrors(input, parsed.data, promptContext),
      ...(this.#validate?.(input, parsed.data, promptContext) ?? []),
    ];
    return {
      ...(errors.length === 0 ? { output: parsed.data } : {}),
      rawOutput,
      errors,
      ...(stream.sessionId ? { sessionId: stream.sessionId } : {}),
      ...(stream.usage ? { usage: stream.usage } : {}),
      durationMs,
      command,
    };
  }

  #consumeRawOutput(path: string): string {
    try {
      const output = readFileSync(path, 'utf8');
      if (Buffer.byteLength(output) > 262_144) {
        return '{"error":"final output exceeded the runtime size limit"}';
      }
      return output;
    } catch {
      return '';
    } finally {
      rmSync(path, { force: true });
    }
  }
}
