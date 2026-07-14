import { z } from 'zod';

import { EntityIdSchema, MissionVerbSchema, UnknownRecordSchema } from './common.js';

export const PointSchema = z.strictObject({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
});

export const CapabilityBindingSchema = z.strictObject({
  canonicalCapability: z.string().min(1),
  configuration: UnknownRecordSchema.optional(),
});

export const PlaceSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  archetype: z.enum([
    'observatory',
    'newsroom',
    'weather_tower',
    'exchange',
    'archive',
    'professor',
    'town_square',
    'field_site',
  ]),
  position: PointSchema,
  entranceNodeId: EntityIdSchema,
  description: z.string().min(1),
  missionVerbs: z.array(MissionVerbSchema),
  capabilityBindings: z.array(CapabilityBindingSchema),
  tags: z.array(z.string().min(1)),
  visualState: UnknownRecordSchema.optional(),
});

export const RouteSchema = z.strictObject({
  id: EntityIdSchema,
  fromPlaceId: EntityIdSchema,
  toPlaceId: EntityIdSchema,
  waypoints: z.array(PointSchema).min(2),
  baseDurationMs: z.number().int().positive(),
  bidirectional: z.boolean(),
  transitType: z.enum(['walk', 'tram', 'boat', 'elevator']),
  cameraHint: z.enum(['follow', 'wide', 'none']).optional(),
});

export const AmbientLayerSchema = z.strictObject({
  id: EntityIdSchema,
  type: z.enum(['gradient', 'particles', 'landmark', 'weather', 'lighting']),
  state: z.string().min(1),
  configuration: UnknownRecordSchema.optional(),
});

export const CameraZoneSchema = z.strictObject({
  id: EntityIdSchema,
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  zoom: z.number().positive().optional(),
  label: z.string().min(1).optional(),
});

export const WorldManifestSchema = z
  .strictObject({
    id: EntityIdSchema,
    version: z.number().int().positive(),
    template: z.string().min(1),
    logicalWidth: z.number().int().positive(),
    logicalHeight: z.number().int().positive(),
    tileSize: z.number().int().positive(),
    places: z.array(PlaceSchema).min(1),
    routes: z.array(RouteSchema),
    ambientLayers: z.array(AmbientLayerSchema),
    cameraZones: z.array(CameraZoneSchema),
    defaultSpawnPlaceId: EntityIdSchema,
    assetPack: z.string().min(1),
  })
  .superRefine((manifest, context) => {
    const placeIds = manifest.places.map((place) => place.id);
    const routeIds = manifest.routes.map((route) => route.id);
    if (new Set(placeIds).size !== placeIds.length) {
      context.addIssue({ code: 'custom', path: ['places'], message: 'Place IDs must be unique.' });
    }
    if (new Set(routeIds).size !== routeIds.length) {
      context.addIssue({ code: 'custom', path: ['routes'], message: 'Route IDs must be unique.' });
    }
    if (!placeIds.includes(manifest.defaultSpawnPlaceId)) {
      context.addIssue({
        code: 'custom',
        path: ['defaultSpawnPlaceId'],
        message: 'Default spawn place must reference a place in the manifest.',
      });
    }

    manifest.routes.forEach((route, index) => {
      if (!placeIds.includes(route.fromPlaceId)) {
        context.addIssue({
          code: 'custom',
          path: ['routes', index, 'fromPlaceId'],
          message: 'Route origin must reference a place in the manifest.',
        });
      }
      if (!placeIds.includes(route.toPlaceId)) {
        context.addIssue({
          code: 'custom',
          path: ['routes', index, 'toPlaceId'],
          message: 'Route destination must reference a place in the manifest.',
        });
      }
      if (route.fromPlaceId === route.toPlaceId) {
        context.addIssue({
          code: 'custom',
          path: ['routes', index],
          message: 'A route must connect two different places.',
        });
      }
    });
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/world-manifest.schema.json',
    title: 'Signal Atlas World Manifest',
  });

export type Point = z.infer<typeof PointSchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type WorldManifest = z.infer<typeof WorldManifestSchema>;
