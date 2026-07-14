import { CodexDriverError } from './types.js';

export interface ParsedCodexEventStream {
  sessionId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  diagnostics: Array<Record<string, unknown>>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Parse Codex JSONL while retaining only event metadata, never message/reasoning contents. */
export function parseCodexJsonl(value: string): ParsedCodexEventStream {
  let sessionId: string | undefined;
  let usage: ParsedCodexEventStream['usage'];
  const diagnostics: Array<Record<string, unknown>> = [];
  const lines = value.split(/\r?\n/u).filter((line) => line.trim().length > 0);

  for (const [index, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new CodexDriverError(
        'codex_invalid_event_stream',
        `Codex emitted invalid JSONL at event line ${index + 1}.`,
        true,
      );
    }
    const event = record(parsed);
    const type = event?.['type'];
    if (!event || typeof type !== 'string') {
      throw new CodexDriverError(
        'codex_invalid_event_stream',
        `Codex event line ${index + 1} has no event type.`,
        true,
      );
    }

    if (type === 'thread.started' && typeof event['thread_id'] === 'string') {
      sessionId = event['thread_id'];
    }
    if (type === 'turn.completed') {
      const rawUsage = record(event['usage']);
      const inputTokens = optionalNumber(rawUsage?.['input_tokens']);
      const outputTokens = optionalNumber(rawUsage?.['output_tokens']);
      usage = {
        ...(inputTokens === undefined ? {} : { inputTokens }),
        ...(outputTokens === undefined ? {} : { outputTokens }),
      };
    }

    const item = record(event['item']);
    diagnostics.push({
      cliEvent: type,
      ...(typeof item?.['type'] === 'string' ? { itemType: item['type'] } : {}),
      ...(typeof item?.['status'] === 'string' ? { itemStatus: item['status'] } : {}),
    });
  }

  return {
    ...(sessionId ? { sessionId } : {}),
    ...(usage ? { usage } : {}),
    diagnostics,
  };
}
