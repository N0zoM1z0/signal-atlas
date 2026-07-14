import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentTurnInput, AgentTurnOutput } from '@signal-atlas/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildCodexExecArguments,
  CodexUnavailableFallbackDriver,
  getAgentRoleProfile,
  JsonlAgentSessionRegistry,
  LocalCodexExecDriver,
  redactSensitiveText,
  ScriptedCodexDriver,
  type CodexProcessRequest,
  type CodexProcessResult,
  type CodexTurnPromptContext,
  type AgentSessionRegistry,
} from '../src/index.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function input(turnId = 'turn-local-1'): AgentTurnInput {
  return {
    schemaVersion: 1,
    turnId,
    expeditionId: 'exp-helios3-demo',
    agentId: 'mira',
    mission: {
      id: `mission-${turnId}`,
      expeditionId: 'exp-helios3-demo',
      assignedAgentId: 'mira',
      verb: 'observe_conditions',
      objective: 'Check the bounded weather evidence.',
      destinationPlaceId: 'weather-tower',
      budget: { maxToolCalls: 1, timeoutMs: 5_000 },
      status: 'running',
      createdBy: { kind: 'player', id: 'player-local' },
      createdAt: '2027-09-26T18:00:00Z',
      startedAt: '2027-09-26T18:01:00Z',
    },
    effectivePlaceId: 'weather-tower',
    attempt: 1,
    knownSourceIds: [],
    knownSignalIds: [],
    allowedCapabilities: ['fixture.weather.advisory'],
    requestedAt: '2027-09-26T18:01:00Z',
    timeoutMs: 5_000,
  };
}

function context(): CodexTurnPromptContext {
  return {
    role: { name: 'Mira' },
    profile: getAgentRoleProfile('scout', 1),
    market: {
      question: 'Will Helios-3 launch in the fictional window?',
      outcomeIds: ['yes', 'no'],
      resolutionRules: 'Resolve from the authored fixture outcome.',
    },
    place: {
      id: 'weather-tower',
      name: 'Galehaven Weather Tower',
      description: 'A fictional source observation point.',
    },
    knowledge: {
      access: {
        knownSourceIds: [],
        knownSignalIds: [],
        currentTurnSourceIds: ['src-current'],
      },
      sources: [
        {
          id: 'src-current',
          title: 'Fixture crosswind advisory',
          sourceClass: 'official_primary',
          retrievedAt: '2027-09-26T18:01:00Z',
          excerpt: 'Crosswinds overlap part of the launch window.',
        },
      ],
      signals: [],
      omitted: { sources: 0, signals: 0 },
    },
  };
}

function output(sourceId = 'src-current'): AgentTurnOutput {
  return {
    schemaVersion: 1,
    agentId: 'mira',
    missionId: 'mission-turn-local-1',
    action: {
      type: 'investigate',
      capability: 'fixture.weather.advisory',
      query: 'Check the bounded weather evidence.',
    },
    publicDialogue: 'The fixture advisory overlaps part of the window, with uncertainty remaining.',
    sourceIdsUsed: [sourceId],
    proposedClaims: [
      {
        text: 'Crosswinds overlap part of the fictional launch window.',
        sourceIds: [sourceId],
        qualifiers: ['fixture', 'partial-window'],
      },
    ],
    proposedSignals: [
      {
        headline: 'Crosswind advisory overlaps launch window',
        summary: 'The bounded advisory is negative but does not cover the full window.',
        claimIndexes: [0],
        sourceIds: [sourceId],
        direction: 'opposes_outcome',
        targetOutcomeId: 'yes',
        impactLabel: 'small',
      },
    ],
    rationale: 'The only supplied source supports a limited negative update.',
    assumptions: ['The authored advisory remains current for this fixture turn.'],
    unknowns: ['Conditions after the advisory interval remain unknown.'],
  };
}

function successfulProcess(
  outputs: readonly string[],
  requests: CodexProcessRequest[],
): (request: CodexProcessRequest) => Promise<CodexProcessResult> {
  let call = 0;
  return async (request) => {
    requests.push(request);
    const outputPath = request.args[request.args.indexOf('-o') + 1];
    if (!outputPath) throw new Error('Test command omitted the output file.');
    writeFileSync(outputPath, outputs[Math.min(call, outputs.length - 1)] ?? '');
    call += 1;
    return {
      exitCode: 0,
      signal: null,
      stdout: [
        JSON.stringify({ type: 'thread.started', thread_id: 'session-mira-fixture' }),
        JSON.stringify({
          type: 'item.completed',
          item: {
            type: 'agent_message',
            status: 'completed',
            text: 'private message content must not enter diagnostics',
          },
        }),
        JSON.stringify({
          type: 'turn.completed',
          usage: { input_tokens: 123, output_tokens: 45 },
        }),
      ].join('\n'),
      stderr: '',
      aborted: false,
    };
  };
}

function driver(
  outputs: readonly string[],
  requests: CodexProcessRequest[],
  runtimeRoot: string,
  sessionRegistry?: AgentSessionRegistry,
) {
  return new LocalCodexExecDriver({
    executable: '/test/bin/codex',
    runtimeRoot,
    outputSchema: { type: 'object' },
    promptContext: async () => context(),
    processRunner: successfulProcess(outputs, requests),
    isAvailable: () => true,
    ...(sessionRegistry ? { sessionRegistry } : {}),
  });
}

function runtimeRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'signal-atlas-local-driver-'));
  temporaryDirectories.push(directory);
  return directory;
}

function driverContext() {
  const details: Array<Record<string, unknown>> = [];
  return {
    details,
    context: {
      signal: new AbortController().signal,
      deadlineAt: '2027-09-26T18:01:05Z',
      emit: (detail: Record<string, unknown>) => details.push(detail),
    },
  };
}

describe('LocalCodexExecDriver', () => {
  it('runs a valid schema-constrained turn with a safe direct command', async () => {
    const requests: CodexProcessRequest[] = [];
    const local = driver([JSON.stringify(output())], requests, runtimeRoot());
    const emitted = driverContext();

    const result = await local.runTurn(input(), emitted.context);

    expect(result.output.sourceIdsUsed).toEqual(['src-current']);
    expect(result.sessionId).toBe('session-mira-fixture');
    expect(result.usage).toEqual({ inputTokens: 123, outputTokens: 45 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      executable: '/test/bin/codex',
      cwd: expect.stringContaining('agent-mira'),
    });
    expect(requests[0]?.args).toEqual(
      expect.arrayContaining(['exec', '--sandbox', 'read-only', '--json', '--output-schema', '-o']),
    );
    expect(requests[0]?.args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(requests[0]?.stdin).toContain('<UNTRUSTED_EVIDENCE_PACKET>');
    expect(requests[0]?.stdin).toContain('never reveal private reasoning');
    expect(requests[0]?.env['OPENAI_API_KEY']).toBeUndefined();
    expect(JSON.stringify(emitted.details)).not.toContain('private message content');
    expect(local.diagnostics().command?.display).toContain('codex exec');
  });

  it('captures a session and resumes it for the next agent turn', async () => {
    const requests: CodexProcessRequest[] = [];
    const secondOutput = {
      ...output(),
      missionId: 'mission-turn-local-2',
    };
    const local = driver(
      [JSON.stringify(output()), JSON.stringify(secondOutput)],
      requests,
      runtimeRoot(),
    );
    const emitted = driverContext();

    await local.runTurn(input(), emitted.context);
    await local.runTurn(input('turn-local-2'), emitted.context);

    expect(requests[1]?.args.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(requests[1]?.args).toContain('session-mira-fixture');
    expect(requests[1]?.args).not.toContain('-C');
  });

  it('resumes an agent session after the driver and registry are reconstructed', async () => {
    const requests: CodexProcessRequest[] = [];
    const root = runtimeRoot();
    const registryPath = join(root, 'agent-sessions.jsonl');
    const first = driver(
      [JSON.stringify(output())],
      requests,
      root,
      new JsonlAgentSessionRegistry(registryPath),
    );
    await first.runTurn(input(), driverContext().context);

    const secondOutput = { ...output(), missionId: 'mission-turn-local-2' };
    const restarted = driver(
      [JSON.stringify(secondOutput)],
      requests,
      root,
      new JsonlAgentSessionRegistry(registryPath),
    );
    await restarted.runTurn(input('turn-local-2'), driverContext().context);

    expect(requests[1]?.args.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(requests[1]?.args).toContain('session-mira-fixture');
    expect(statSync(registryPath).mode & 0o777).toBe(0o600);
  });

  it('does not persist a session that received a transient archive grant', async () => {
    const requests: CodexProcessRequest[] = [];
    const root = runtimeRoot();
    const registry = new JsonlAgentSessionRegistry(join(root, 'agent-sessions.jsonl'));
    const archiveContext = context();
    archiveContext.knowledge.access.archiveGrant = {
      placeId: 'archive',
      missionVerb: 'search_history',
      sourceIds: [],
      signalIds: [],
    };
    const local = new LocalCodexExecDriver({
      executable: '/test/bin/codex',
      runtimeRoot: root,
      outputSchema: { type: 'object' },
      promptContext: () => archiveContext,
      processRunner: successfulProcess([JSON.stringify(output())], requests),
      isAvailable: () => true,
      sessionRegistry: registry,
    });

    await local.runTurn(input(), driverContext().context);

    expect(registry.get(input().expeditionId, input().agentId)).toBeUndefined();
  });

  it('repairs one invalid JSON response in the captured session', async () => {
    const requests: CodexProcessRequest[] = [];
    const local = driver(['not-json', JSON.stringify(output())], requests, runtimeRoot());
    const emitted = driverContext();

    const result = await local.runTurn(input(), emitted.context);

    expect(requests).toHaveLength(2);
    expect(requests[1]?.args.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(requests[1]?.stdin).toContain('SIGNAL ATLAS OUTPUT REPAIR');
    expect(requests[1]?.stdin).toContain('final output is not valid JSON');
    expect(result.output.action.type).toBe('investigate');
    expect(result.artifacts).toMatchObject({ repairAttempts: 1, safeFallback: false });
  });

  it('turns two unknown-source outputs into a safe wait with no accepted evidence', async () => {
    const requests: CodexProcessRequest[] = [];
    const invalid = JSON.stringify(output('src-unknown'));
    const local = driver([invalid, invalid], requests, runtimeRoot());
    const emitted = driverContext();

    const result = await local.runTurn(input(), emitted.context);

    expect(requests).toHaveLength(2);
    expect(result.output).toMatchObject({
      action: { type: 'wait' },
      sourceIdsUsed: [],
      proposedClaims: [],
      proposedSignals: [],
    });
    expect(result.artifacts).toMatchObject({
      repairAttempts: 1,
      safeFallback: true,
      validationErrors: [expect.stringContaining('src-unknown')],
    });
    expect(emitted.details).toContainEqual(
      expect.objectContaining({ phase: 'safe_wait', evidenceAccepted: false }),
    );
  });

  it('turns an action unsupported by the active profile into a safe wait', async () => {
    const requests: CodexProcessRequest[] = [];
    const unsupported = JSON.stringify({
      ...output(),
      action: { type: 'update_belief', probabilities: { yes: 0.45, no: 0.55 } },
    });
    const local = driver([unsupported, unsupported], requests, runtimeRoot());

    const result = await local.runTurn(input(), driverContext().context);

    expect(result.output.action.type).toBe('wait');
    expect(result.artifacts).toMatchObject({
      safeFallback: true,
      validationErrors: [expect.stringContaining('scout.v1 does not permit update_belief')],
    });
  });

  it('redacts process failure details before exposing them', async () => {
    const local = new LocalCodexExecDriver({
      executable: '/test/bin/codex',
      runtimeRoot: runtimeRoot(),
      outputSchema: { type: 'object' },
      promptContext: () => context(),
      processRunner: async () => ({
        exitCode: 1,
        signal: null,
        stdout: '',
        stderr: 'Authorization: Bearer sk-test-secret-value-123456789',
        aborted: false,
      }),
      isAvailable: () => true,
    });
    const emitted = driverContext();

    await expect(local.runTurn(input(), emitted.context)).rejects.toThrow('[REDACTED]');
    expect(local.diagnostics().lastError).not.toContain('test-secret');
  });

  it('extracts a redacted actionable error from failed JSONL stdout', async () => {
    const local = new LocalCodexExecDriver({
      executable: '/test/bin/codex',
      runtimeRoot: runtimeRoot(),
      outputSchema: { type: 'object' },
      promptContext: () => context(),
      processRunner: async () => ({
        exitCode: 1,
        signal: null,
        stdout: `${JSON.stringify({
          type: 'error',
          message: 'Schema rejected with OPENAI_API_KEY=sk-private-value-123456789',
        })}\n`,
        stderr: '',
        aborted: false,
      }),
      isAvailable: () => true,
    });
    const emitted = driverContext();

    await expect(local.runTurn(input(), emitted.context)).rejects.toThrow(
      'Schema rejected with OPENAI_API_KEY=[REDACTED]',
    );
  });

  it('uses the scripted driver only when the local executable is absent', async () => {
    const primary = new LocalCodexExecDriver<{ scripted: true }>({
      executable: '/missing/codex',
      runtimeRoot: runtimeRoot(),
      outputSchema: { type: 'object' },
      promptContext: () => context(),
      isAvailable: () => false,
    });
    const fallback = new ScriptedCodexDriver<AgentTurnInput, { scripted: true }>({
      id: 'fixture-fallback',
      run: (_turnInput) => ({ output: output(), artifacts: { scripted: true } }),
    });
    const combined = new CodexUnavailableFallbackDriver({ primary, fallback });
    const emitted = driverContext();

    const result = await combined.runTurn(input(), emitted.context);

    expect(result.artifacts).toEqual({ scripted: true });
    expect(combined.diagnostics()).toMatchObject({
      activeMode: 'scripted_fallback',
      fallback: { driverId: 'fixture-fallback', used: true },
    });
  });
});

describe('local Codex command and redaction helpers', () => {
  it('keeps resume sandbox policy explicit without unsupported resume flags', () => {
    const args = buildCodexExecArguments({
      schemaPath: '/runtime/schema.json',
      outputPath: '/runtime/output.json',
      workspacePath: '/runtime/mira',
      sessionId: 'session-mira-fixture',
    });
    expect(args.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(args).toContain('sandbox_mode="read-only"');
    expect(args).not.toContain('--sandbox');
    expect(args).not.toContain('-C');
  });

  it('redacts tokens, secret assignments, and Codex auth paths', () => {
    const redacted = redactSensitiveText(
      'OPENAI_API_KEY=sk-example-secret-123456 Bearer abc.def /home/test/.codex/auth.json',
    );
    expect(redacted).toBe('OPENAI_API_KEY=[REDACTED] Bearer [REDACTED] $CODEX_HOME/auth.json');
  });
});
