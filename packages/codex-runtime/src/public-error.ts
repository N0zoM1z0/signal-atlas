import { CodexDriverError, CodexTurnCanceledError, CodexTurnTimeoutError } from './types.js';

function fixedMessage(code: string): string {
  switch (code) {
    case 'codex_unavailable':
      return 'The local Codex executable is unavailable.';
    case 'codex_process_failed':
      return 'The local Codex process failed before producing a validated result.';
    case 'runtime_identity_mismatch':
      return 'The Codex output identity did not match the scheduled turn.';
    case 'pref_proxy_failed':
      return 'The Pref agent proxy failed before accepting evidence.';
    default:
      return code.startsWith('pref_')
        ? 'The Pref-backed turn failed before a validated result was accepted.'
        : 'The Codex runtime failed before a validated result was accepted.';
  }
}

/** Convert any driver/process exception into a fixed, world-safe public error. */
export function publicCodexError(error: unknown): CodexDriverError {
  if (error instanceof CodexTurnTimeoutError) return error;
  if (error instanceof CodexTurnCanceledError) return new CodexTurnCanceledError();
  if (error instanceof CodexDriverError) {
    return new CodexDriverError(error.code, fixedMessage(error.code), error.recoverable);
  }
  return new CodexDriverError('runtime_driver_failed', fixedMessage('runtime_driver_failed'), true);
}
