import { spawn } from 'node:child_process';

import { CodexDriverError } from './types.js';

export interface CodexProcessRequest {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin: string;
  signal: AbortSignal;
  killGraceMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}

export interface CodexProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  aborted: boolean;
}

export type CodexProcessRunner = (request: CodexProcessRequest) => Promise<CodexProcessResult>;

function appendBounded(current: string, chunk: Buffer, maximum: number, stream: string): string {
  if (Buffer.byteLength(current) + chunk.byteLength > maximum) {
    throw new CodexDriverError(
      'codex_output_limit',
      `The Codex ${stream} stream exceeded its ${maximum} byte limit.`,
      true,
    );
  }
  return current + chunk.toString('utf8');
}

function signalProcess(childPid: number | undefined, signal: NodeJS.Signals): void {
  if (!childPid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-childPid, signal);
      return;
    } catch {
      // The process may have exited between the abort and group signal.
    }
  }
  try {
    process.kill(childPid, signal);
  } catch {
    // A process that already exited is terminal enough.
  }
}

/** Spawn a bounded process directly. No command string or shell interpolation is used. */
export const runCodexProcess: CodexProcessRunner = async (request) =>
  new Promise<CodexProcessResult>((resolve, reject) => {
    const killGraceMs = request.killGraceMs ?? 250;
    const maxStdoutBytes = request.maxStdoutBytes ?? 1_048_576;
    const maxStderrBytes = request.maxStderrBytes ?? 65_536;
    const child = spawn(request.executable, request.args, {
      cwd: request.cwd,
      env: request.env,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let aborted = request.signal.aborted;
    let settled = false;
    let streamError: Error | undefined;
    let forceKill: ReturnType<typeof setTimeout> | undefined;

    const terminate = () => {
      if (!child.pid) return;
      signalProcess(child.pid, 'SIGTERM');
      forceKill = setTimeout(() => signalProcess(child.pid, 'SIGKILL'), killGraceMs);
      forceKill.unref();
    };
    const onAbort = () => {
      aborted = true;
      terminate();
    };
    const failStream = (error: unknown) => {
      if (streamError) return;
      streamError = error instanceof Error ? error : new Error(String(error));
      terminate();
    };

    request.signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      try {
        stdout = appendBounded(stdout, chunk, maxStdoutBytes, 'stdout');
      } catch (error: unknown) {
        failStream(error);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      try {
        stderr = appendBounded(stderr, chunk, maxStderrBytes, 'stderr');
      } catch (error: unknown) {
        failStream(error);
      }
    });
    child.stdin.on('error', () => undefined);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      request.signal.removeEventListener('abort', onAbort);
      if (forceKill) clearTimeout(forceKill);
      reject(error);
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      request.signal.removeEventListener('abort', onAbort);
      if (forceKill) clearTimeout(forceKill);
      if (streamError) {
        reject(streamError);
        return;
      }
      resolve({ exitCode, signal, stdout, stderr, aborted });
    });

    if (request.signal.aborted) terminate();
    child.stdin.end(request.stdin);
  });
