export type SimulationErrorCode =
  | 'unsupported_event_version'
  | 'unsupported_event_type'
  | 'wrong_expedition'
  | 'non_contiguous_sequence'
  | 'illegal_transition'
  | 'non_serializable_projection';

export class SimulationError extends Error {
  readonly code: SimulationErrorCode;

  constructor(code: SimulationErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class UnsupportedEventVersionError extends SimulationError {
  readonly receivedVersion: number;

  constructor(receivedVersion: number) {
    super(
      'unsupported_event_version',
      `Unsupported world event schema version ${receivedVersion}; this reducer supports version 1.`,
    );
    this.receivedVersion = receivedVersion;
  }
}

export class UnsupportedEventTypeError extends SimulationError {
  readonly receivedType: string;

  constructor(receivedType: string) {
    super('unsupported_event_type', `Unsupported world event type: ${receivedType}.`);
    this.receivedType = receivedType;
  }
}

export class WrongExpeditionError extends SimulationError {
  constructor(expectedId: string, receivedId: string) {
    super(
      'wrong_expedition',
      `Event belongs to expedition ${receivedId}; projection expects ${expectedId}.`,
    );
  }
}

export class NonContiguousSequenceError extends SimulationError {
  constructor(expected: number, received: number) {
    super('non_contiguous_sequence', `Expected event sequence ${expected}; received ${received}.`);
  }
}

export class IllegalTransitionError extends SimulationError {
  constructor(message: string) {
    super('illegal_transition', message);
  }
}

export class NonSerializableProjectionError extends SimulationError {
  constructor(path: string, reason: string) {
    super(
      'non_serializable_projection',
      `Projection value at ${path || '<root>'} is not canonical JSON: ${reason}.`,
    );
  }
}
