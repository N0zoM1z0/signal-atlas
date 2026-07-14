const assignmentPattern =
  /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*([^\s,;]+)/gi;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const openAiKeyPattern = /\b(?:sk|sess)-[A-Za-z0-9_-]{12,}\b/g;
const authPathPattern = /(?:\/[^\s"']+)*\/\.codex\/auth\.json/gi;

/** Redact common credential forms before process output reaches diagnostics or errors. */
export function redactSensitiveText(value: string, maxLength = 2_000): string {
  const redacted = value
    .replace(assignmentPattern, '$1=[REDACTED]')
    .replace(bearerPattern, 'Bearer [REDACTED]')
    .replace(openAiKeyPattern, '[REDACTED]')
    .replace(authPathPattern, '$CODEX_HOME/auth.json');
  if (redacted.length <= maxLength) return redacted;
  return `${redacted.slice(0, maxLength)}…[truncated]`;
}
