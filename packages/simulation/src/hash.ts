import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { NonSerializableProjectionError } from './errors.js';
import type { WorldProjection } from './state.js';

function canonicalize(value: unknown, path: string, ancestors: WeakSet<object>): string {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new NonSerializableProjectionError(path, 'numbers must be finite');
      }
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    case 'undefined':
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new NonSerializableProjectionError(path, `unsupported ${typeof value} value`);
    case 'object':
      break;
  }

  if (ancestors.has(value)) {
    throw new NonSerializableProjectionError(path, 'cyclic references are not supported');
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((item, index) => canonicalize(item, `${path}[${index}]`, ancestors))
        .join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new NonSerializableProjectionError(path, 'only plain objects are supported');
    }

    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalize(record[key], `${path}.${key}`, ancestors)}`,
      )
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value, '$', new WeakSet<object>());
}

export function canonicalHash(value: unknown): string {
  const encoded = new TextEncoder().encode(canonicalJson(value));
  return `sha256:${bytesToHex(sha256(encoded))}`;
}

export function projectionHash(projection: WorldProjection): string {
  return canonicalHash(projection);
}
