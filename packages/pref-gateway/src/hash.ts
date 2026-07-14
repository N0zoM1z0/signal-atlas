import { createHash } from 'node:crypto';

export class PrefSerializationError extends Error {
  constructor(path: string, reason: string) {
    super(`Pref value at ${path} is not canonically serializable: ${reason}.`);
    this.name = 'PrefSerializationError';
  }
}

function canonicalize(value: unknown, path: string, ancestors: WeakSet<object>): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new PrefSerializationError(path, 'number must be finite');
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    case 'undefined':
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new PrefSerializationError(path, `${typeof value} is unsupported`);
    case 'object':
      break;
  }

  if (ancestors.has(value)) throw new PrefSerializationError(path, 'cycles are unsupported');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((item, index) => canonicalize(item, `${path}[${index}]`, ancestors))
        .join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new PrefSerializationError(path, 'only plain objects are supported');
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

export function canonicalPrefJson(value: unknown): string {
  return canonicalize(value, '$', new WeakSet<object>());
}

/** SHA-256 as the 64-character hexadecimal representation required by SourceRecord. */
export function prefHash(value: unknown): string {
  return createHash('sha256').update(canonicalPrefJson(value), 'utf8').digest('hex');
}

export function prefResponseBytes(value: unknown): number {
  return Buffer.byteLength(canonicalPrefJson(value), 'utf8');
}
