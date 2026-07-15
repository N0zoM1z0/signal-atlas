import { CodexDriverError, CodexTurnCanceledError, CodexTurnTimeoutError } from './types.js';

const publicCodes = new Set([
  'codex_invalid_event_stream',
  'codex_output_limit',
  'codex_process_failed',
  'codex_unavailable',
  'pref_auth_required',
  'pref_call_budget_exceeded',
  'pref_canceled',
  'pref_capability_denied',
  'pref_connection_failed',
  'pref_deadline_exceeded',
  'pref_disconnected',
  'pref_discovery_failed',
  'pref_fixture_miss',
  'pref_invalid_request',
  'pref_invalid_response',
  'pref_mapping_invalid',
  'pref_proxy_failed',
  'pref_response_too_large',
  'pref_server_denied',
  'pref_timeout',
  'pref_tool_denied',
  'pref_upstream_error',
  'runtime_canceled',
  'runtime_driver_failed',
  'runtime_identity_mismatch',
  'runtime_timeout',
]);

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
    const code = publicCodes.has(error.code) ? error.code : 'runtime_driver_failed';
    return new CodexDriverError(code, fixedMessage(code), error.recoverable);
  }
  return new CodexDriverError('runtime_driver_failed', fixedMessage('runtime_driver_failed'), true);
}
