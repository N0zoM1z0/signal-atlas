import { parseEventStreamEnvelope, type EventStreamEnvelope } from '@signal-atlas/contracts';

export type EventStreamPhase =
  'connecting' | 'live' | 'reconnecting' | 'schema_error' | 'boundary_error' | 'stopped';

export interface EventStreamStatus {
  phase: EventStreamPhase;
  cursor: number;
  attempt: number;
  message: string;
}

export type WorldEventsEnvelope = Extract<EventStreamEnvelope, { type: 'world.events' }>;

interface EventStreamSocketEventMap {
  close: CloseEvent;
  error: Event;
  message: MessageEvent<unknown>;
  open: Event;
}

export interface EventStreamSocket {
  addEventListener<K extends keyof EventStreamSocketEventMap>(
    type: K,
    listener: (event: EventStreamSocketEventMap[K]) => void,
  ): void;
  close(code?: number, reason?: string): void;
}

export interface ExpeditionEventStreamOptions {
  expeditionId: string;
  initialSequence: number;
  onEvents: (envelope: WorldEventsEnvelope) => Promise<void> | void;
  onStatus: (status: EventStreamStatus) => void;
  onBoundaryError?: (message: string) => void;
  retryDelaysMs?: readonly number[];
  socketFactory?: (url: string) => EventStreamSocket;
  urlFactory?: (expeditionId: string, afterSequence: number) => string;
}

const defaultRetryDelaysMs = [250, 500, 1_000, 2_000, 5_000] as const;

export function browserEventStreamUrl(expeditionId: string, afterSequence: number): string {
  const url = new URL(window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/api/expeditions/${encodeURIComponent(expeditionId)}/stream`;
  url.search = new URLSearchParams({ after: String(afterSequence) }).toString();
  url.hash = '';
  return url.toString();
}

export class ExpeditionEventStream {
  readonly #expeditionId: string;
  readonly #onEvents: ExpeditionEventStreamOptions['onEvents'];
  readonly #onStatus: ExpeditionEventStreamOptions['onStatus'];
  readonly #onBoundaryError: ExpeditionEventStreamOptions['onBoundaryError'];
  readonly #retryDelaysMs: readonly number[];
  readonly #socketFactory: (url: string) => EventStreamSocket;
  readonly #urlFactory: (expeditionId: string, afterSequence: number) => string;
  #attempt = 0;
  #cursor: number;
  #messageQueue = Promise.resolve();
  #phase: EventStreamPhase = 'stopped';
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #socket: EventStreamSocket | undefined;
  #stopped = true;
  #terminalBoundary = false;

  constructor(options: ExpeditionEventStreamOptions) {
    if (!Number.isInteger(options.initialSequence) || options.initialSequence < 0) {
      throw new Error('Event stream initial sequence must be a non-negative integer.');
    }
    this.#expeditionId = options.expeditionId;
    this.#cursor = options.initialSequence;
    this.#onEvents = options.onEvents;
    this.#onStatus = options.onStatus;
    this.#onBoundaryError = options.onBoundaryError;
    this.#retryDelaysMs =
      options.retryDelaysMs && options.retryDelaysMs.length > 0
        ? options.retryDelaysMs
        : defaultRetryDelaysMs;
    this.#socketFactory =
      options.socketFactory ?? ((url) => new WebSocket(url) as EventStreamSocket);
    this.#urlFactory = options.urlFactory ?? browserEventStreamUrl;
  }

  get cursor(): number {
    return this.#cursor;
  }

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#terminalBoundary = false;
    this.#connect(false);
  }

  stop(): void {
    this.#stopped = true;
    this.#terminalBoundary = false;
    if (this.#retryTimer !== undefined) clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close(1000, 'client_stopped');
    this.#emit('stopped', 'Event stream stopped.');
  }

  #connect(reconnecting: boolean): void {
    if (this.#stopped || this.#terminalBoundary) return;
    this.#retryTimer = undefined;
    this.#emit(
      reconnecting ? 'reconnecting' : 'connecting',
      reconnecting
        ? `Reconnecting from sequence ${this.#cursor}.`
        : `Connecting from sequence ${this.#cursor}.`,
    );

    let socket: EventStreamSocket;
    try {
      socket = this.#socketFactory(this.#urlFactory(this.#expeditionId, this.#cursor));
    } catch {
      this.#scheduleReconnect('The event stream transport is unavailable.');
      return;
    }
    this.#socket = socket;

    socket.addEventListener('message', (event) => {
      if (this.#socket !== socket || this.#stopped) return;
      this.#messageQueue = this.#messageQueue
        .then(async () => this.#handleMessage(event.data, socket))
        .catch(() => {
          this.#recoverFromProjectionFailure(socket);
        });
    });
    socket.addEventListener('close', () => {
      if (this.#socket === socket) this.#socket = undefined;
      if (this.#stopped || this.#terminalBoundary || this.#retryTimer !== undefined) return;
      this.#scheduleReconnect('Connection lost; the last valid projection remains visible.');
    });
    socket.addEventListener('error', () => {
      if (this.#socket !== socket || this.#stopped) return;
      socket.close(1011, 'transport_error');
    });
  }

  async #handleMessage(data: unknown, socket: EventStreamSocket): Promise<void> {
    if (this.#socket !== socket || this.#stopped) return;
    if (typeof data !== 'string') {
      this.#failSchema(socket);
      return;
    }

    let envelope: EventStreamEnvelope;
    try {
      envelope = parseEventStreamEnvelope(JSON.parse(data));
    } catch {
      this.#failSchema(socket);
      return;
    }
    if (envelope.expeditionId !== this.#expeditionId) {
      this.#failSchema(socket);
      return;
    }

    if (envelope.type === 'world.error') {
      const message = `${envelope.message} Last valid sequence ${this.#cursor} remains authoritative.`;
      this.#terminalBoundary = true;
      this.#onBoundaryError?.(message);
      this.#emit('boundary_error', message);
      if (this.#socket === socket) this.#socket = undefined;
      socket.close(1008, envelope.code);
      return;
    }

    if (envelope.type === 'world.ready') {
      if (envelope.sequence !== this.#cursor) {
        this.#failSchema(socket);
        return;
      }
      this.#attempt = 0;
      this.#emit('live', `Fixture live at sequence ${this.#cursor}.`);
      return;
    }

    if (envelope.afterSequence !== this.#cursor) {
      this.#failSchema(socket);
      return;
    }
    await this.#onEvents(envelope);
    if (this.#socket !== socket || this.#stopped) return;
    this.#cursor = envelope.sequence;
    this.#emit(
      this.#phase,
      this.#phase === 'live'
        ? `Fixture live at sequence ${this.#cursor}.`
        : `Validated through sequence ${this.#cursor}.`,
    );
  }

  #failSchema(socket: EventStreamSocket): void {
    const message = `Event stream schema validation failed. Last valid sequence ${this.#cursor} remains authoritative.`;
    this.#onBoundaryError?.(message);
    this.#emit('schema_error', message);
    this.#scheduleReconnect(message, false);
    if (this.#socket === socket) this.#socket = undefined;
    socket.close(1008, 'invalid_schema');
  }

  #recoverFromProjectionFailure(socket: EventStreamSocket): void {
    if (this.#socket !== socket || this.#stopped) return;
    const message = `Projection refresh failed. Reconnecting from sequence ${this.#cursor}.`;
    this.#scheduleReconnect(message);
    if (this.#socket === socket) this.#socket = undefined;
    socket.close(1011, 'projection_refresh_failed');
  }

  #scheduleReconnect(message: string, emitStatus = true): void {
    if (this.#stopped || this.#terminalBoundary || this.#retryTimer !== undefined) return;
    const delay =
      this.#retryDelaysMs[Math.min(this.#attempt, this.#retryDelaysMs.length - 1)] ?? 5_000;
    this.#attempt += 1;
    if (emitStatus) this.#emit('reconnecting', message);
    this.#retryTimer = setTimeout(() => this.#connect(true), delay);
  }

  #emit(phase: EventStreamPhase, message: string): void {
    this.#phase = phase;
    this.#onStatus({ attempt: this.#attempt, cursor: this.#cursor, message, phase });
  }
}
