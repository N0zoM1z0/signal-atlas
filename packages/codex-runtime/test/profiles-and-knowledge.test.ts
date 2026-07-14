import type { AgentTurnOutput, Signal, SourceRecord } from '@signal-atlas/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildKnowledgePacket,
  getAgentRoleProfile,
  validateAgentProfileOutput,
} from '../src/index.js';

const hash = 'a'.repeat(64);

function source(id: string, sourceClass: SourceRecord['sourceClass']): SourceRecord {
  return {
    id,
    version: 1,
    title: `${id} title`,
    sourceClass,
    retrievedAt: '2027-09-26T18:30:00Z',
    excerpt: `${id} evidence text`,
    contentHash: hash,
    provenance: {
      serverName: 'test-fixture',
      transport: 'fixture',
      primitive: 'fixture',
      primitiveName: 'fixture.lookup',
      responseHash: hash,
    },
    tags: sourceClass === 'archive' ? ['history'] : ['current'],
  };
}

function signal(id: string, sourceId: string): Signal {
  return {
    id,
    marketId: 'market-test',
    claimIds: [`claim-${id}`],
    sourceIds: [sourceId],
    headline: `${id} headline`,
    summary: `${id} summary`,
    direction: 'context',
    impact: { label: 'small' },
    reliability: {
      label: 'derived',
      reasons: ['Fixture test evidence.'],
      assessedBy: { kind: 'system' },
    },
    freshness: { referenceTime: '2027-09-26T18:30:00Z', label: 'fresh' },
    correlationGroupIds: [],
    createdAt: '2027-09-26T18:30:00Z',
    status: 'active',
  };
}

function output(action: AgentTurnOutput['action']): AgentTurnOutput {
  return {
    schemaVersion: 1,
    agentId: 'mira',
    missionId: 'mission-test',
    action,
    publicDialogue: 'I found one bounded observation, but an important uncertainty remains.',
    sourceIdsUsed: [],
    proposedClaims: [],
    proposedSignals: [],
    rationale: 'The public rationale is limited to the supplied evidence.',
    assumptions: [],
    unknowns: ['The outcome remains unknown.'],
  };
}

describe('agent role profiles', () => {
  it('fails closed for unknown profile versions and rejects unsupported actions', () => {
    expect(() => getAgentRoleProfile('scout', 99)).toThrow(
      'Unsupported agent role profile scout version 99',
    );
    const scout = getAgentRoleProfile('scout', 1);
    const analystOnly = output({
      type: 'update_belief',
      probabilities: { yes: 0.5, no: 0.5 },
    });

    expect(validateAgentProfileOutput(scout, analystOnly)).toContainEqual(
      expect.stringContaining('does not permit update_belief'),
    );
  });

  it('enforces concise one-paragraph dialogue and explicit unknowns', () => {
    const profile = getAgentRoleProfile('skeptic', 1);
    const invalid = {
      ...output({ type: 'wait', reason: 'No safe action.' }),
      publicDialogue: `${'x'.repeat(241)}\nsecond paragraph`,
      unknowns: [],
    };

    expect(validateAgentProfileOutput(profile, invalid)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('at most 240 characters'),
        expect.stringContaining('one compact paragraph'),
        expect.stringContaining('at least one material unknown'),
      ]),
    );
  });
});

describe('bounded knowledge packets', () => {
  const currentSource = source('src-current', 'official_primary');
  const archiveSource = source('src-archive', 'archive');
  const currentSignal = signal('sig-current', currentSource.id);
  const archiveSignal = signal('sig-archive', archiveSource.id);

  it('filters all ungranted sources and signals even when the builder receives the full corpus', () => {
    const packet = buildKnowledgePacket({
      sources: [currentSource, archiveSource],
      signals: [currentSignal, archiveSignal],
      knownSourceIds: [],
      knownSignalIds: [],
      currentTurnSourceIds: [currentSource.id],
    });

    expect(packet.sources.map(({ id }) => id)).toEqual(['src-current']);
    expect(packet.signals).toEqual([]);
    expect(JSON.stringify(packet)).not.toContain('src-archive');
    expect(JSON.stringify(packet)).not.toContain('sig-archive');
  });

  it('reveals archive evidence only through an explicit, inspectable grant', () => {
    const packet = buildKnowledgePacket({
      sources: [currentSource, archiveSource],
      signals: [currentSignal, archiveSignal],
      knownSourceIds: [],
      knownSignalIds: [],
      archiveGrant: {
        placeId: 'archive',
        missionVerb: 'search_history',
        sourceIds: [archiveSource.id],
        signalIds: [archiveSignal.id],
      },
    });

    expect(packet.access.archiveGrant).toMatchObject({ placeId: 'archive' });
    expect(packet.sources.map(({ id }) => id)).toEqual(['src-archive']);
    expect(packet.signals.map(({ id }) => id)).toEqual(['sig-archive']);
  });

  it('changes role style without mutating or reinterpreting source truth', () => {
    const packet = buildKnowledgePacket({
      sources: [currentSource],
      signals: [currentSignal],
      knownSourceIds: [currentSource.id],
      knownSignalIds: [currentSignal.id],
    });
    const scout = getAgentRoleProfile('scout', 1);
    const skeptic = getAgentRoleProfile('skeptic', 1);

    expect(scout.publicBehavior).not.toBe(skeptic.publicBehavior);
    expect(packet.sources[0]).toMatchObject({
      id: currentSource.id,
      title: currentSource.title,
      excerpt: currentSource.excerpt,
    });
  });
});
