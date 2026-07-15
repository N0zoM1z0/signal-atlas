import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import {
  PrefCanonicalCapabilitySchema,
  PrefGatewayError,
  PrefLocalConditionsRequestSchema,
  PrefReadRequestSchema,
  PrefSearchRequestSchema,
  type PrefCanonicalCapability,
} from './types.js';

const SafeNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u);
const ToolRefSchema = z
  .string()
  .trim()
  .min(3)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9][A-Za-z0-9_-]*)+$/u);
const HostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/u,
  );

export const PrefInputProjectionSelectorSchema = z.enum([
  'location.query',
  'query',
  'externalId',
  'uri',
  'at',
  'since',
  'until',
  'limit',
]);

export const PrefInputTransformSchema = z.enum(['identity', 'iso_to_gdelt_datetime']);

export const PrefInputProjectionSchema = z.strictObject({
  selector: PrefInputProjectionSelectorSchema,
  requiredFromCanonical: z.boolean(),
  transform: PrefInputTransformSchema.default('identity'),
});

export const PrefCapabilityMappingSchema = z.strictObject({
  mappingId: SafeNameSchema,
  canonicalName: PrefCanonicalCapabilitySchema,
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(1_000),
  toolRef: ToolRefSchema,
  providerServer: SafeNameSchema,
  executionMode: z.literal('synchronous'),
  inputProjection: z.record(SafeNameSchema, PrefInputProjectionSchema),
  expectedInput: z.record(SafeNameSchema, z.enum(['string', 'number', 'boolean'])),
  responseAdapter: z.enum(['local_conditions_v1', 'article_search_v1']),
  requiredAnnotations: z.strictObject({
    readOnlyHint: z.literal(true),
    destructiveHint: z.literal(false),
    idempotentHint: z.boolean().optional(),
  }),
  requiredSecurityHints: z.strictObject({
    sideEffect: z.literal('read_only'),
  }),
});

export const PrefCapabilityMapSchema = z
  .strictObject({
    version: z.literal(3),
    server: z.strictObject({
      name: SafeNameSchema,
      transport: z.literal('streamable_http'),
      endpoint: z.url(),
      allowedHosts: z.array(HostSchema).min(1).max(16),
      credentialEnvKey: z.literal('SIGNAL_ATLAS_PREF_BEARER_TOKEN'),
    }),
    discovery: z.strictObject({
      catalogTool: SafeNameSchema,
      executionTool: SafeNameSchema,
      resourceListTool: SafeNameSchema.optional(),
      promptListTool: SafeNameSchema.optional(),
      allowedDirectTools: z.array(SafeNameSchema).min(2).max(32),
    }),
    allowedProviderTools: z.array(ToolRefSchema).min(1).max(64),
    mappings: z.array(PrefCapabilityMappingSchema).min(1).max(16),
  })
  .superRefine((map, context) => {
    const uniqueFields: ReadonlyArray<{
      values: readonly string[];
      path: readonly (string | number)[];
      message: string;
    }> = [
      {
        values: map.server.allowedHosts,
        path: ['server', 'allowedHosts'],
        message: 'Allowed Pref hosts must be unique.',
      },
      {
        values: map.discovery.allowedDirectTools,
        path: ['discovery', 'allowedDirectTools'],
        message: 'Allowed direct Pref tools must be unique.',
      },
      {
        values: map.allowedProviderTools,
        path: ['allowedProviderTools'],
        message: 'Allowed Pref provider tools must be unique.',
      },
      {
        values: map.mappings.map((mapping) => mapping.mappingId),
        path: ['mappings'],
        message: 'Pref mapping IDs must be unique.',
      },
      {
        values: map.mappings.map((mapping) => mapping.toolRef),
        path: ['mappings'],
        message: 'Mapped Pref provider tools must be unique.',
      },
    ];
    for (const field of uniqueFields) {
      if (new Set(field.values).size !== field.values.length) {
        context.addIssue({ code: 'custom', path: [...field.path], message: field.message });
      }
    }

    const endpoint = safeUrl(map.server.endpoint);
    if (!endpoint || !isAllowedPrefEndpoint(endpoint, map.server.allowedHosts)) {
      context.addIssue({
        code: 'custom',
        path: ['server', 'endpoint'],
        message: 'The Pref endpoint must be an allow-listed HTTPS /mcp URL without credentials.',
      });
    }

    const referencedDirectTools = [
      map.discovery.catalogTool,
      map.discovery.executionTool,
      ...(map.discovery.resourceListTool ? [map.discovery.resourceListTool] : []),
      ...(map.discovery.promptListTool ? [map.discovery.promptListTool] : []),
    ];
    for (const tool of referencedDirectTools) {
      if (!map.discovery.allowedDirectTools.includes(tool)) {
        context.addIssue({
          code: 'custom',
          path: ['discovery', 'allowedDirectTools'],
          message: `Referenced direct Pref tool ${tool} is not allow-listed.`,
        });
      }
    }

    for (const [index, mapping] of map.mappings.entries()) {
      if (!map.allowedProviderTools.includes(mapping.toolRef)) {
        context.addIssue({
          code: 'custom',
          path: ['mappings', index, 'toolRef'],
          message: 'Mapped Pref provider tool is not allow-listed.',
        });
      }
      if (Object.keys(mapping.inputProjection).length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['mappings', index, 'inputProjection'],
          message: 'A Pref mapping needs at least one projected argument.',
        });
      }
      for (const argumentName of Object.keys(mapping.inputProjection)) {
        if (!(argumentName in mapping.expectedInput)) {
          context.addIssue({
            code: 'custom',
            path: ['mappings', index, 'expectedInput'],
            message: `Projected argument ${argumentName} has no expected input type.`,
          });
        }
      }
      for (const argumentName of Object.keys(mapping.expectedInput)) {
        if (!(argumentName in mapping.inputProjection)) {
          context.addIssue({
            code: 'custom',
            path: ['mappings', index, 'inputProjection'],
            message: `Expected argument ${argumentName} has no canonical input projection.`,
          });
        }
      }
      if (
        (mapping.canonicalName === 'local_conditions') !==
        (mapping.responseAdapter === 'local_conditions_v1')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['mappings', index, 'responseAdapter'],
          message: 'The response adapter does not match the canonical Pref capability.',
        });
      }
      if (
        mapping.responseAdapter === 'article_search_v1' &&
        mapping.canonicalName !== 'search_sources'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['mappings', index, 'responseAdapter'],
          message: 'The article search adapter is only valid for search_sources.',
        });
      }
    }
  });

export type PrefCapabilityMapping = z.infer<typeof PrefCapabilityMappingSchema>;
export type PrefCapabilityMap = z.infer<typeof PrefCapabilityMapSchema>;
export type PrefInputProjectionSelector = z.infer<typeof PrefInputProjectionSelectorSchema>;
export type PrefInputTransform = z.infer<typeof PrefInputTransformSchema>;

export function parsePrefCapabilityMap(value: unknown): PrefCapabilityMap {
  return PrefCapabilityMapSchema.parse(value);
}

export async function loadPrefCapabilityMap(
  fileUrl: URL = new URL('../config/pref-capabilities.json', import.meta.url),
): Promise<PrefCapabilityMap> {
  const contents = await readFile(fileUrl, 'utf8');
  return parsePrefCapabilityMap(JSON.parse(contents) as unknown);
}

export function loadPrefCapabilityMapSync(
  fileUrl: URL = new URL('../config/pref-capabilities.json', import.meta.url),
): PrefCapabilityMap {
  return parsePrefCapabilityMap(JSON.parse(readFileSync(fileUrl, 'utf8')) as unknown);
}

export function assertAllowedPrefEndpoint(value: string, allowedHosts: readonly string[]): URL {
  const endpoint = safeUrl(value);
  if (!endpoint || !isAllowedPrefEndpoint(endpoint, allowedHosts)) {
    throw new PrefGatewayError(
      'pref_capability_denied',
      'The configured Pref server endpoint is not allow-listed.',
    );
  }
  return endpoint;
}

export function projectPrefCapabilityInput(
  mapping: PrefCapabilityMapping,
  inputValue: unknown,
): Record<string, unknown> {
  const input = parseCanonicalInput(mapping.canonicalName, inputValue);
  return Object.fromEntries(
    Object.entries(mapping.inputProjection).flatMap(([argumentName, projection]) => {
      const selected = projectedValue(projection.selector, input);
      if (selected === undefined) {
        if (projection.requiredFromCanonical) {
          throw new Error(`Missing required canonical Pref field ${projection.selector}.`);
        }
        return [];
      }
      return [[argumentName, transformedValue(projection.transform, selected)]];
    }),
  );
}

function safeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isAllowedPrefEndpoint(endpoint: URL, allowedHosts: readonly string[]): boolean {
  return (
    endpoint.protocol === 'https:' &&
    (endpoint.port === '' || endpoint.port === '443') &&
    endpoint.username === '' &&
    endpoint.password === '' &&
    endpoint.search === '' &&
    endpoint.hash === '' &&
    endpoint.pathname === '/mcp' &&
    allowedHosts.includes(endpoint.hostname.toLowerCase())
  );
}

function parseCanonicalInput(
  capability: PrefCanonicalCapability,
  input: unknown,
): Record<string, unknown> {
  switch (capability) {
    case 'search_sources':
      return PrefSearchRequestSchema.parse(input);
    case 'read_source':
      return PrefReadRequestSchema.parse(input);
    case 'local_conditions':
      return PrefLocalConditionsRequestSchema.parse(input);
  }
}

function projectedValue(
  selector: PrefInputProjectionSelector,
  input: Record<string, unknown>,
): unknown {
  switch (selector) {
    case 'query':
    case 'externalId':
    case 'uri':
    case 'at':
    case 'since':
    case 'until':
    case 'limit':
      return input[selector];
    case 'location.query': {
      const location = input['location'];
      if (!location || typeof location !== 'object') return undefined;
      const record = location as Record<string, unknown>;
      if (typeof record['label'] === 'string' && record['label'].trim().length > 0) {
        return record['label'].trim();
      }
      if (typeof record['latitude'] === 'number' && typeof record['longitude'] === 'number') {
        return `${record['latitude']},${record['longitude']}`;
      }
      return undefined;
    }
  }
}

function transformedValue(transform: PrefInputTransform, value: unknown): unknown {
  switch (transform) {
    case 'identity':
      return value;
    case 'iso_to_gdelt_datetime': {
      if (typeof value !== 'string') throw new Error('A GDELT datetime transform requires text.');
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new Error('The canonical Pref datetime is invalid.');
      return date
        .toISOString()
        .replace(/\.\d{3}Z$/u, '')
        .replace(/[-:T]/gu, '');
    }
  }
}
