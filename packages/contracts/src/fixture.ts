import { z } from 'zod';

import { DateTimeSchema, EntityIdSchema, hasExactlyKeys, MissionVerbSchema } from './common.js';
import { AgentSchema, ExpeditionSchema } from './agents.js';
import { ClaimSchema, SignalSchema, SourceRecordSchema } from './information.js';
import { MarketSchema } from './market.js';
import { WorldManifestSchema } from './world.js';
import { WorldEventSchema } from './events.js';
import { ProfessorResponseSchema } from './social.js';

export const ScriptedMissionResultSchema = z.strictObject({
  latencyMs: z.number().int().nonnegative(),
  sourceIds: z.array(EntityIdSchema),
  claimIds: z.array(EntityIdSchema),
  signalIds: z.array(EntityIdSchema),
  dialogue: z.string().min(1).max(400),
  suggestedFollowUp: z
    .strictObject({
      verb: MissionVerbSchema,
      objective: z.string().min(1),
      destinationPlaceId: EntityIdSchema.optional(),
    })
    .optional(),
});

export const ResolutionFixtureSchema = z.strictObject({
  resolvedOutcomeId: EntityIdSchema,
  resolvedAt: DateTimeSchema,
  resolutionNote: z.string().min(1),
});

function uniqueEntityIds<T extends { id: string }>(
  values: readonly T[],
  path: Array<string | number>,
  label: string,
  context: z.RefinementCtx,
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      context.addIssue({
        code: 'custom',
        path: [...path, index, 'id'],
        message: `Duplicate ${label} ID: ${value.id}.`,
      });
    }
    seen.add(value.id);
  });
}

export const ExpeditionFixtureSchema = z
  .strictObject({
    fixtureVersion: z.literal(1),
    seed: z.string().min(1),
    market: MarketSchema,
    expedition: ExpeditionSchema,
    worldManifest: WorldManifestSchema,
    agents: z.array(AgentSchema).min(1),
    sources: z.array(SourceRecordSchema),
    claims: z.array(ClaimSchema),
    signals: z.array(SignalSchema),
    initialEvents: z.array(WorldEventSchema).min(1),
    scriptedMissionResults: z.record(z.string().min(1), ScriptedMissionResultSchema),
    professorFixture: ProfessorResponseSchema,
    resolutionFixture: ResolutionFixtureSchema,
  })
  .superRefine((fixture, context) => {
    uniqueEntityIds(fixture.agents, ['agents'], 'agent', context);
    uniqueEntityIds(fixture.sources, ['sources'], 'source', context);
    uniqueEntityIds(fixture.claims, ['claims'], 'claim', context);
    uniqueEntityIds(fixture.signals, ['signals'], 'signal', context);
    uniqueEntityIds(fixture.initialEvents, ['initialEvents'], 'event', context);

    const outcomeIds = fixture.market.outcomes.map((outcome) => outcome.id);
    const placeIds = new Set(fixture.worldManifest.places.map((place) => place.id));
    const routeIds = new Set(fixture.worldManifest.routes.map((route) => route.id));
    const agentIds = new Set(fixture.agents.map((agent) => agent.id));
    const sourceIds = new Set(fixture.sources.map((source) => source.id));
    const claimIds = new Set(fixture.claims.map((claim) => claim.id));
    const signalIds = new Set(fixture.signals.map((signal) => signal.id));

    const addMissingReference = (path: Array<string | number>, label: string, id: string) => {
      context.addIssue({
        code: 'custom',
        path,
        message: `${label} references unknown ID: ${id}.`,
      });
    };

    if (fixture.expedition.marketId !== fixture.market.id) {
      addMissingReference(
        ['expedition', 'marketId'],
        'Expedition market',
        fixture.expedition.marketId,
      );
    }
    if (fixture.expedition.worldManifestId !== fixture.worldManifest.id) {
      addMissingReference(
        ['expedition', 'worldManifestId'],
        'Expedition world manifest',
        fixture.expedition.worldManifestId,
      );
    }

    fixture.agents.forEach((agent, agentIndex) => {
      if (!placeIds.has(agent.placeId)) {
        addMissingReference(['agents', agentIndex, 'placeId'], 'Agent place', agent.placeId);
      }
      agent.knownSourceIds.forEach((id, index) => {
        if (!sourceIds.has(id)) {
          addMissingReference(['agents', agentIndex, 'knownSourceIds', index], 'Agent source', id);
        }
      });
      agent.knownSignalIds.forEach((id, index) => {
        if (!signalIds.has(id)) {
          addMissingReference(['agents', agentIndex, 'knownSignalIds', index], 'Agent signal', id);
        }
      });
      agent.belief.evidenceSignalIds.forEach((id, index) => {
        if (!signalIds.has(id)) {
          addMissingReference(
            ['agents', agentIndex, 'belief', 'evidenceSignalIds', index],
            'Belief evidence',
            id,
          );
        }
      });
      if (!hasExactlyKeys(agent.belief.probabilities, outcomeIds)) {
        context.addIssue({
          code: 'custom',
          path: ['agents', agentIndex, 'belief', 'probabilities'],
          message: 'Agent belief probability keys must exactly match market outcome IDs.',
        });
      }
      if (agent.belief.uncertainty && !hasExactlyKeys(agent.belief.uncertainty, outcomeIds)) {
        context.addIssue({
          code: 'custom',
          path: ['agents', agentIndex, 'belief', 'uncertainty'],
          message: 'Agent uncertainty keys must exactly match market outcome IDs.',
        });
      }
      if (agent.movement) {
        if (!routeIds.has(agent.movement.routeId)) {
          addMissingReference(
            ['agents', agentIndex, 'movement', 'routeId'],
            'Agent movement route',
            agent.movement.routeId,
          );
        }
        for (const [field, id] of [
          ['fromPlaceId', agent.movement.fromPlaceId],
          ['toPlaceId', agent.movement.toPlaceId],
        ] as const) {
          if (!placeIds.has(id)) {
            addMissingReference(['agents', agentIndex, 'movement', field], 'Movement place', id);
          }
        }
      }
    });

    fixture.sources.forEach((source, sourceIndex) => {
      if (source.location?.placeId && !placeIds.has(source.location.placeId)) {
        addMissingReference(
          ['sources', sourceIndex, 'location', 'placeId'],
          'Source location',
          source.location.placeId,
        );
      }
      if (source.supersedesSourceId && !sourceIds.has(source.supersedesSourceId)) {
        addMissingReference(
          ['sources', sourceIndex, 'supersedesSourceId'],
          'Superseded source',
          source.supersedesSourceId,
        );
      }
    });

    fixture.claims.forEach((claim, claimIndex) => {
      claim.sourceIds.forEach((id, index) => {
        if (!sourceIds.has(id)) {
          addMissingReference(['claims', claimIndex, 'sourceIds', index], 'Claim source', id);
        }
      });
      if (
        claim.extractor.kind === 'agent' &&
        claim.extractor.id &&
        !agentIds.has(claim.extractor.id)
      ) {
        addMissingReference(
          ['claims', claimIndex, 'extractor', 'id'],
          'Claim extractor',
          claim.extractor.id,
        );
      }
    });

    fixture.signals.forEach((signal, signalIndex) => {
      if (signal.marketId !== fixture.market.id) {
        addMissingReference(['signals', signalIndex, 'marketId'], 'Signal market', signal.marketId);
      }
      signal.claimIds.forEach((id, index) => {
        if (!claimIds.has(id)) {
          addMissingReference(['signals', signalIndex, 'claimIds', index], 'Signal claim', id);
        }
      });
      signal.sourceIds.forEach((id, index) => {
        if (!sourceIds.has(id)) {
          addMissingReference(['signals', signalIndex, 'sourceIds', index], 'Signal source', id);
        }
      });
      if (signal.targetOutcomeId && !outcomeIds.includes(signal.targetOutcomeId)) {
        addMissingReference(
          ['signals', signalIndex, 'targetOutcomeId'],
          'Signal target outcome',
          signal.targetOutcomeId,
        );
      }
      if (signal.discoveredByAgentId && !agentIds.has(signal.discoveredByAgentId)) {
        addMissingReference(
          ['signals', signalIndex, 'discoveredByAgentId'],
          'Signal discoverer',
          signal.discoveredByAgentId,
        );
      }

      const claimSourceIds = new Set(
        signal.claimIds.flatMap(
          (claimId) => fixture.claims.find((claim) => claim.id === claimId)?.sourceIds ?? [],
        ),
      );
      claimSourceIds.forEach((id) => {
        if (!signal.sourceIds.includes(id)) {
          context.addIssue({
            code: 'custom',
            path: ['signals', signalIndex, 'sourceIds'],
            message: `Signal must include source ${id} used by its claims.`,
          });
        }
      });
    });

    const eventSequences = fixture.initialEvents.map((event) => event.sequence);
    fixture.initialEvents.forEach((event, eventIndex) => {
      if (event.expeditionId !== fixture.expedition.id) {
        addMissingReference(
          ['initialEvents', eventIndex, 'expeditionId'],
          'Event expedition',
          event.expeditionId,
        );
      }
      if (event.sequence !== eventIndex + 1) {
        context.addIssue({
          code: 'custom',
          path: ['initialEvents', eventIndex, 'sequence'],
          message: `Initial event sequence must be contiguous from 1; expected ${eventIndex + 1}.`,
        });
      }
      if (event.type === 'forecast.committed') {
        if (!hasExactlyKeys(event.payload.previousProbabilities, outcomeIds)) {
          context.addIssue({
            code: 'custom',
            path: ['initialEvents', eventIndex, 'payload', 'previousProbabilities'],
            message: 'Previous forecast keys must exactly match market outcome IDs.',
          });
        }
        if (!hasExactlyKeys(event.payload.newProbabilities, outcomeIds)) {
          context.addIssue({
            code: 'custom',
            path: ['initialEvents', eventIndex, 'payload', 'newProbabilities'],
            message: 'New forecast keys must exactly match market outcome IDs.',
          });
        }
        if (event.payload.uncertainty && !hasExactlyKeys(event.payload.uncertainty, outcomeIds)) {
          context.addIssue({
            code: 'custom',
            path: ['initialEvents', eventIndex, 'payload', 'uncertainty'],
            message: 'Forecast uncertainty keys must exactly match market outcome IDs.',
          });
        }
        event.payload.evidenceSignalIds.forEach((id, index) => {
          if (!signalIds.has(id)) {
            addMissingReference(
              ['initialEvents', eventIndex, 'payload', 'evidenceSignalIds', index],
              'Forecast evidence signal',
              id,
            );
          }
        });
      }
    });
    const lastSequence = eventSequences.at(-1) ?? 0;
    if (fixture.expedition.currentSequence !== lastSequence) {
      context.addIssue({
        code: 'custom',
        path: ['expedition', 'currentSequence'],
        message: `Expedition sequence ${fixture.expedition.currentSequence} does not match last initial event sequence ${lastSequence}.`,
      });
    }

    Object.entries(fixture.scriptedMissionResults).forEach(([key, result]) => {
      const parts = key.split(':');
      if (parts.length !== 3) {
        context.addIssue({
          code: 'custom',
          path: ['scriptedMissionResults', key],
          message: 'Scripted mission key must use agentId:missionVerb:placeId.',
        });
        return;
      }
      const [agentId, verb, placeId] = parts as [string, string, string];
      if (!agentIds.has(agentId)) {
        addMissingReference(['scriptedMissionResults', key], 'Scripted mission agent', agentId);
      }
      if (!MissionVerbSchema.safeParse(verb).success) {
        context.addIssue({
          code: 'custom',
          path: ['scriptedMissionResults', key],
          message: `Scripted mission uses unknown verb: ${verb}.`,
        });
      }
      if (!placeIds.has(placeId)) {
        addMissingReference(['scriptedMissionResults', key], 'Scripted mission place', placeId);
      }
      result.sourceIds.forEach((id, index) => {
        if (!sourceIds.has(id)) {
          addMissingReference(
            ['scriptedMissionResults', key, 'sourceIds', index],
            'Scripted result source',
            id,
          );
        }
      });
      result.claimIds.forEach((id, index) => {
        if (!claimIds.has(id)) {
          addMissingReference(
            ['scriptedMissionResults', key, 'claimIds', index],
            'Scripted result claim',
            id,
          );
        }
      });
      result.signalIds.forEach((id, index) => {
        if (!signalIds.has(id)) {
          addMissingReference(
            ['scriptedMissionResults', key, 'signalIds', index],
            'Scripted result signal',
            id,
          );
        }
      });
      const followUpPlaceId = result.suggestedFollowUp?.destinationPlaceId;
      if (followUpPlaceId && !placeIds.has(followUpPlaceId)) {
        addMissingReference(
          ['scriptedMissionResults', key, 'suggestedFollowUp', 'destinationPlaceId'],
          'Suggested follow-up place',
          followUpPlaceId,
        );
      }
    });

    fixture.professorFixture.selectedSignalIds?.forEach((id, index) => {
      if (!signalIds.has(id)) {
        addMissingReference(
          ['professorFixture', 'selectedSignalIds', index],
          'Professor selected signal',
          id,
        );
      }
    });
    fixture.professorFixture.evidenceUsed.forEach((evidence, index) => {
      const exists =
        evidence.type === 'source' ? sourceIds.has(evidence.id) : signalIds.has(evidence.id);
      if (!exists) {
        addMissingReference(
          ['professorFixture', 'evidenceUsed', index, 'id'],
          `Professor ${evidence.type}`,
          evidence.id,
        );
      }
    });

    if (!outcomeIds.includes(fixture.resolutionFixture.resolvedOutcomeId)) {
      addMissingReference(
        ['resolutionFixture', 'resolvedOutcomeId'],
        'Resolution outcome',
        fixture.resolutionFixture.resolvedOutcomeId,
      );
    }
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/expedition-fixture.schema.json',
    title: 'Signal Atlas Expedition Fixture',
  });

export function parseExpeditionFixture(input: unknown): ExpeditionFixture {
  return ExpeditionFixtureSchema.parse(input);
}

export type ScriptedMissionResult = z.infer<typeof ScriptedMissionResultSchema>;
export type ResolutionFixture = z.infer<typeof ResolutionFixtureSchema>;
export type ExpeditionFixture = z.infer<typeof ExpeditionFixtureSchema>;
