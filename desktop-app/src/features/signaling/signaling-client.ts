import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "./message-schemas";
import type { ConnectionState } from "./signaling.types";

// Backoff schedule (ms): 1s → 2s → 4s → 8s → 16s → 30s (capped).
const BACKOFF_SCHEDULE = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

// Minimal WebSocket surface used by SignalingClient.
// Tests inject a FakeWebSocket that satisfies this structurally (no cast needed).
// Handlers are write-only: we assign them but never read back, so native adapter getters return null.
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

// Adapts native WebSocket to WebSocketLike. Setters bridge Event-bearing native handlers
// to our zero-arg interface; getters return null (write-only pattern).
function wrapNativeSocket(ws: WebSocket): WebSocketLike {
  return {
    send: (d) => ws.send(d),
    close: () => ws.close(),
    set onopen(fn: (() => void) | null) { ws.onopen = fn; },
    get onopen() { return null; },
    set onmessage(fn: ((ev: { data: string }) => void) | null) {
      ws.onmessage = fn ? (ev: MessageEvent) => fn({ data: String(ev.data) }) : null;
    },
    get onmessage() { return null; },
    set onclose(fn: (() => void) | null) { ws.onclose = fn; },
    get onclose() { return null; },
    set onerror(fn: (() => void) | null) { ws.onerror = fn; },
    get onerror() { return null; },
  };
}

export interface SignalingClientOptions {
  url: string;
  // Optional factory so tests can inject a fake socket implementation.
  createSocket?: (url: string) => WebSocketLike;
}

type MessageListener = (msg: ServerMessage) => void;

// Transport-level WebSocket wrapper: state machine + exponential-backoff reconnect
// + JSON (de)serialisation with Zod validation. Pure TS, no React.
export class SignalingClient {
  readonly url: string;
  // Public so tests and hooks can read it without a getter overhead.
  state: ConnectionState = "offline";

  private socket: WebSocketLike | null = null;
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly listeners = new Set<MessageListener>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Prevents reconnection after an explicit disconnect() call.
  private stopped = false;

  constructor(opts: SignalingClientOptions) {
    this.url = opts.url;
    // Use the typed adapter by default; tests override with their own factory.
    this.createSocket = opts.createSocket ?? ((url) => wrapNativeSocket(new WebSocket(url)));
  }

  // Starts the connection.
  connect(): void {
    this.stopped = false;
    this.openSocket();
  }

  // Permanently stops the client: cancels any pending reconnect, closes the socket.
  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket !== null) {
      try { this.socket.close(); } catch { /* half-closed — ignore */ }
      this.socket = null;
    }
    this.state = "offline";
  }

  // Serialises msg and writes it to the open socket.
  // Returns false if socket is not open (no-op).
  send(msg: ClientMessage): boolean {
    if (this.socket === null || this.state !== "open") return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  // Registers a listener for validated server messages.
  // Returns an unsubscribe function.
  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // Creates and wires a new socket, transitions state to "connecting".
  private openSocket(): void {
    this.state = "connecting";
    const socket = this.createSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.state = "open";
      this.reconnectAttempt = 0; // reset backoff on successful connect
    };

    socket.onmessage = (ev) => {
      let raw: unknown;
      try { raw = JSON.parse(ev.data); }
      catch { return; } // malformed JSON — discard silently (fail-closed)
      const msg = parseServerMessage(raw);
      if (msg === null) return; // Zod validation failed — unknown message type
      for (const l of this.listeners) l(msg);
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.stopped) return; // disconnect() was called — do not reconnect
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // Errors are always followed by a close event — reconnect handled there.
    };
  }

  // Schedules the next reconnect attempt using exponential backoff.
  private scheduleReconnect(): void {
    this.state = "reconnecting";
    const idx = Math.min(this.reconnectAttempt, BACKOFF_SCHEDULE.length - 1);
    const delay = BACKOFF_SCHEDULE[idx];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.openSocket();
    }, delay);
  }
}
