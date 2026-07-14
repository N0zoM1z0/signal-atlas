import type { z } from 'zod';

import { prefHash, prefResponseBytes } from './hash.js';
import { normalizePrefRawResult } from './normalize.js';
import {
  FixturePrefResponseSchema,
  PrefCallContextSchema,
  PrefCanonicalCapabilitySchema,
  PrefGatewayConfigSchema,
  PrefLocalConditionsRequestSchema,
  PrefReadRequestSchema,
  PrefSearchRequestSchema,
  PrefGatewayError,
  type FixturePrefResponse,
  type PrefAuditEvent,
  type PrefAuditSink,
  type PrefCallContext,
  type PrefCanonicalCapability,
  type PrefCapabilityDescriptor,
  type PrefCapabilityResult,
  type PrefGateway,
  type PrefGatewayConfig,
  type PrefGatewayDiagnostics,
  type PrefGatewayErrorCode,
  type PrefGatewayHealth,
  type PrefReadRequest,
  type PrefSearchRequest,
} from './types.js';

export interface FixturePrefGatewayOptions {
  config: PrefGatewayConfig;
  responses: readonly FixturePrefResponse[];
  audit?: PrefAuditSink;
  now?: () => Date;
}

const inputSchemas: Record<PrefCanonicalCapability, z.ZodType> = {
  search_sources: PrefSearchRequestSchema,
  read_source: PrefReadRequestSchema,
  local_conditions: PrefLocalConditionsRequestSchema,
};

function responseKey(capability: PrefCanonicalCapability, input: unknown): string {
  return prefHash({ capability, input });
}

function safeError(code: PrefGatewayErrorCode): PrefGatewayError {
  switch (code) {
    case 'pref_invalid_request':
      return new PrefGatewayError(code, 'The Pref request did not match its canonical contract.');
    case 'pref_disconnected':
      return new PrefGatewayError(code, 'The Pref Gateway is disconnected.', true);
    case 'pref_capability_denied':
      return new PrefGatewayError(code, 'The requested Pref capability is not allow-listed.');
    case 'pref_call_budget_exceeded':
      return new PrefGatewayError(code, 'The mission Pref call budget has been exhausted.');
    case 'pref_deadline_exceeded':
      return new PrefGatewayError(code, 'The Pref call deadline has already elapsed.', true);
    case 'pref_timeout':
      return new PrefGatewayError(code, 'The Pref call exceeded its time limit.', true);
    case 'pref_canceled':
      return new PrefGatewayError(code, 'The Pref call was canceled.', true);
    case 'pref_response_too_large':
      return new PrefGatewayError(code, 'The Pref response exceeded the configured byte limit.');
    case 'pref_upstream_error':
      return new PrefGatewayError(code, 'The Pref provider could not return a safe result.', true);
    case 'pref_fixture_miss':
      return new PrefGatewayError(code, 'No recorded fixture matches this canonical Pref request.');
    case 'pref_invalid_response':
      return new PrefGatewayError(code, 'The Pref response could not be safely normalized.');
  }
}

function contextWithoutSignal(context: PrefCallContext): unknown {
  return {
    expeditionId: context.expeditionId,
    correlationId: context.correlationId,
    deadlineAt: context.deadlineAt,
    ...(context.missionId ? { missionId: context.missionId } : {}),
    ...(context.agentId ? { agentId: context.agentId } : {}),
  };
}

/** Deterministic recorded-response implementation of the same boundary used by live adapters. */
export class FixturePrefGateway implements PrefGateway {
  readonly #config: PrefGatewayConfig;
  readonly #responses = new Map<string, FixturePrefResponse>();
  readonly #audit: PrefAuditSink | undefined;
  readonly #now: () => Date;
  readonly #callsByBudgetKey = new Map<string, number>();
  #connected = false;
  #calls = 0;
  #completed = 0;
  #failed = 0;
  #lastCallAt: string | undefined;
  #lastError: PrefGatewayDiagnostics['lastError'];

  constructor(options: FixturePrefGatewayOptions) {
    this.#config = PrefGatewayConfigSchema.parse(options.config);
    if (this.#config.transport !== 'fixture') {
      throw new Error('FixturePrefGateway requires the fixture transport.');
    }
    this.#audit = options.audit;
    this.#now = options.now ?? (() => new Date());
    for (const candidate of options.responses) {
      let response: FixturePrefResponse;
      try {
        response = FixturePrefResponseSchema.parse(candidate);
        response = {
          ...response,
          input: this.#parseInput(response.capability, response.input),
        };
      } catch {
        throw safeError('pref_invalid_response');
      }
      const key = responseKey(response.capability, response.input);
      if (this.#responses.has(key)) {
        throw new Error(`Duplicate recorded Pref response for ${response.capability}.`);
      }
      this.#responses.set(key, structuredClone(response));
    }
  }

  async connect(): Promise<void> {
    this.#connected = true;
    this.#lastError = undefined;
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
  }

  async health(): Promise<PrefGatewayHealth> {
    return {
      connected: this.#connected,
      checkedAt: this.#timestamp(),
      message: this.#connected
        ? 'Fixture Pref Gateway is connected.'
        : 'Fixture Pref Gateway is disconnected.',
    };
  }

  async discoverCapabilities(): Promise<PrefCapabilityDescriptor[]> {
    if (!this.#connected) throw safeError('pref_disconnected');
    const discovered = new Map<PrefCanonicalCapability, FixturePrefResponse>();
    for (const response of this.#responses.values()) {
      if (!discovered.has(response.capability)) discovered.set(response.capability, response);
    }
    return [...discovered.entries()]
      .filter(([capability]) => this.#config.allowCapabilities.includes(capability))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([capability, response]) => ({
        canonicalName: capability,
        primitive: 'fixture' as const,
        primitiveName: response.results[0]?.primitiveName ?? `fixture.${capability}`,
        readOnly: true as const,
        locationAware: capability === 'search_sources' || capability === 'local_conditions',
        temporal: capability === 'search_sources' || capability === 'local_conditions',
      }));
  }

  search(request: PrefSearchRequest, context: PrefCallContext): Promise<PrefCapabilityResult> {
    return this.invokeCanonicalCapability('search_sources', request, context);
  }

  read(request: PrefReadRequest, context: PrefCallContext): Promise<PrefCapabilityResult> {
    return this.invokeCanonicalCapability('read_source', request, context);
  }

  async invokeCanonicalCapability(
    capabilityValue: string,
    inputValue: unknown,
    contextValue: PrefCallContext,
  ): Promise<PrefCapabilityResult> {
    const parsedCapability = PrefCanonicalCapabilitySchema.safeParse(capabilityValue);
    if (!parsedCapability.success) throw safeError('pref_capability_denied');
    let capability: PrefCanonicalCapability;
    let context: ReturnType<typeof PrefCallContextSchema.parse>;
    let input: unknown;
    try {
      capability = parsedCapability.data;
      context = PrefCallContextSchema.parse(contextWithoutSignal(contextValue));
      input = this.#parseInput(capability, inputValue);
    } catch {
      throw safeError('pref_invalid_request');
    }

    const argumentsHash = prefHash({ capability, input });
    const budgetKey = `${context.expeditionId}:${context.missionId ?? context.correlationId}`;
    const callNumber = (this.#callsByBudgetKey.get(budgetKey) ?? 0) + 1;
    const attemptNumber = this.#calls + 1;
    const callId = `pref-${prefHash({
      serverName: this.#config.serverName,
      correlationId: context.correlationId,
      capability,
      argumentsHash,
      attemptNumber,
    }).slice(0, 24)}`;
    const startedAt = this.#now();
    const auditBase = {
      callId,
      occurredAt: startedAt.toISOString(),
      expeditionId: context.expeditionId,
      correlationId: context.correlationId,
      ...(context.missionId ? { missionId: context.missionId } : {}),
      ...(context.agentId ? { agentId: context.agentId } : {}),
    };
    this.#calls += 1;
    this.#lastCallAt = auditBase.occurredAt;
    this.#emit({
      ...auditBase,
      type: 'pref.call.started',
      capability,
      argumentsHash,
    });

    try {
      if (!this.#connected) throw safeError('pref_disconnected');
      if (!this.#config.allowCapabilities.includes(capability)) {
        throw safeError('pref_capability_denied');
      }
      this.#callsByBudgetKey.set(budgetKey, callNumber);
      if (callNumber > this.#config.maxCallsPerMission) {
        throw safeError('pref_call_budget_exceeded');
      }
      const remainingMs = new Date(context.deadlineAt).getTime() - startedAt.getTime();
      if (remainingMs <= 0) throw safeError('pref_deadline_exceeded');
      const response = this.#responses.get(responseKey(capability, input));
      if (!response) throw safeError('pref_fixture_miss');
      await this.#wait(
        response.latencyMs ?? 0,
        Math.min(remainingMs, this.#config.timeoutMs),
        contextValue.signal,
      );
      const responseBytes = prefResponseBytes(response.results);
      if (responseBytes > this.#config.maxResponseBytes) {
        throw safeError('pref_response_too_large');
      }
      const responseHash = prefHash(response.results);
      const retrievedAt = this.#timestamp();
      let sources;
      try {
        sources = response.results.map((result) =>
          normalizePrefRawResult(result, {
            config: this.#config,
            callId,
            argumentsHash,
            responseHash,
            retrievedAt,
          }),
        );
      } catch {
        throw safeError('pref_invalid_response');
      }
      const durationMs = Math.max(0, this.#now().getTime() - startedAt.getTime());
      this.#completed += 1;
      this.#lastError = undefined;
      this.#emit({
        ...auditBase,
        type: 'pref.call.completed',
        occurredAt: this.#timestamp(),
        sourceIds: sources.map((source) => source.id),
        responseHash,
        responseBytes,
        durationMs,
      });
      return {
        callId,
        capability,
        sources,
        evidence: [],
        argumentsHash,
        responseHash,
        retrievedAt,
        durationMs,
        responseBytes,
        fromCache: false,
        cache: { status: 'miss' },
      };
    } catch (error: unknown) {
      const normalized =
        error instanceof PrefGatewayError ? error : safeError('pref_invalid_response');
      const durationMs = Math.max(0, this.#now().getTime() - startedAt.getTime());
      this.#failed += 1;
      this.#lastError = { code: normalized.code, message: normalized.message };
      this.#emit({
        ...auditBase,
        type: 'pref.call.failed',
        occurredAt: this.#timestamp(),
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
        durationMs,
      });
      throw normalized;
    }
  }

  diagnostics(): PrefGatewayDiagnostics {
    return {
      serverName: this.#config.serverName,
      transport: this.#config.transport,
      connected: this.#connected,
      readOnly: true,
      allowCapabilities: [...this.#config.allowCapabilities].sort(),
      limits: {
        timeoutMs: this.#config.timeoutMs,
        maxResponseBytes: this.#config.maxResponseBytes,
        maxCallsPerMission: this.#config.maxCallsPerMission,
      },
      calls: this.#calls,
      completed: this.#completed,
      failed: this.#failed,
      ...(this.#lastCallAt ? { lastCallAt: this.#lastCallAt } : {}),
      ...(this.#lastError ? { lastError: structuredClone(this.#lastError) } : {}),
    };
  }

  #parseInput(capability: PrefCanonicalCapability, input: unknown): unknown {
    return inputSchemas[capability].parse(input);
  }

  #emit(event: PrefAuditEvent): void {
    this.#audit?.(structuredClone(event));
  }

  #timestamp(): string {
    return this.#now().toISOString();
  }

  async #wait(latencyMs: number, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw safeError('pref_canceled');
    if (latencyMs === 0) return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: PrefGatewayError) => {
        if (settled) return;
        settled = true;
        clearTimeout(latencyTimer);
        clearTimeout(timeoutTimer);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(safeError('pref_canceled'));
      const latencyTimer = setTimeout(() => finish(), latencyMs);
      const timeoutTimer = setTimeout(() => finish(safeError('pref_timeout')), timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
}
