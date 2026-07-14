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
]);

export const PrefCapabilityMappingSchema = z.strictObject({
  canonicalName: PrefCanonicalCapabilitySchema,
  enabled: z.boolean(),
  toolRef: ToolRefSchema,
  providerServer: SafeNameSchema,
  inputProjection: z.record(SafeNameSchema, PrefInputProjectionSelectorSchema),
  expectedInput: z.record(SafeNameSchema, z.enum(['string', 'number', 'boolean'])),
  requiredAnnotations: z.strictObject({
    readOnlyHint: z.literal(true),
    destructiveHint: z.literal(false),
    idempotentHint: z.boolean().optional(),
  }),
});

export const PrefCapabilityMapSchema = z
  .strictObject({
    version: z.literal(1),
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
        values: map.mappings.map((mapping) => mapping.canonicalName),
        path: ['mappings'],
        message: 'Canonical Pref mappings must be unique.',
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
    }
  });

export type PrefCapabilityMapping = z.infer<typeof PrefCapabilityMappingSchema>;
export type PrefCapabilityMap = z.infer<typeof PrefCapabilityMapSchema>;
export type PrefInputProjectionSelector = z.infer<typeof PrefInputProjectionSelectorSchema>;

export function parsePrefCapabilityMap(value: unknown): PrefCapabilityMap {
  return PrefCapabilityMapSchema.parse(value);
}

export async function loadPrefCapabilityMap(
  fileUrl: URL = new URL('../config/pref-capabilities.json', import.meta.url),
): Promise<PrefCapabilityMap> {
  const contents = await readFile(fileUrl, 'utf8');
  return parsePrefCapabilityMap(JSON.parse(contents) as unknown);
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
    Object.entries(mapping.inputProjection).map(([argumentName, selector]) => [
      argumentName,
      projectedValue(selector, input),
    ]),
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
    case 'at': {
      const value = input[selector];
      if (value === undefined) throw new Error(`Missing canonical Pref field ${selector}.`);
      return value;
    }
    case 'location.query': {
      const location = input['location'];
      if (!location || typeof location !== 'object') {
        throw new Error('Missing canonical Pref location.');
      }
      const record = location as Record<string, unknown>;
      if (typeof record['label'] === 'string' && record['label'].trim().length > 0) {
        return record['label'].trim();
      }
      if (typeof record['latitude'] === 'number' && typeof record['longitude'] === 'number') {
        return `${record['latitude']},${record['longitude']}`;
      }
      throw new Error('The canonical Pref location needs a label or coordinates.');
    }
  }
}
