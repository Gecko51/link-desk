import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignalingClient } from "@/features/signaling/signaling-client";
import type { WebSocketLike } from "@/features/signaling/signaling-client";

// Minimal WebSocket stub implementing WebSocketLike.
// Lets tests drive open/message/close events without a real server.
// FakeWebSocket implements WebSocketLike structurally — no cast needed.
class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }
  // Test helpers — simulate server-driven events.
  simulateOpen(): void {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }
  simulateMessage(raw: unknown): void {
    this.onmessage?.({ data: JSON.stringify(raw) });
  }
}

describe("SignalingClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Factory: returns a client wired to inject FakeWebSocket instances.
  function build() {
    const sockets: FakeWebSocket[] = [];
    const client = new SignalingClient({
      url: "ws://test/signaling",
      // createSocket returns WebSocketLike — FakeWebSocket satisfies it directly.
      createSocket: (url: string): WebSocketLike => {
        const s = new FakeWebSocket(url);
        sockets.push(s);
        return s;
      },
    });
    return { client, sockets };
  }

  it("opens a socket on connect()", () => {
    const { client, sockets } = build();
    client.connect();
    expect(sockets).toHaveLength(1);
    expect(client.state).toBe("connecting");
  });

  it("transitions to open on socket open", () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0].simulateOpen();
    expect(client.state).toBe("open");
  });

  it("send() writes to the open socket", () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0].simulateOpen();
    client.send({ type: "ping" });
    expect(sockets[0].sent[0]).toBe(JSON.stringify({ type: "ping" }));
  });

  it("reconnects with exponential backoff on close", () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0].simulateOpen();
    sockets[0].close();
    expect(client.state).toBe("reconnecting");

    // Attempt 1 — 1s backoff.
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);

    sockets[1].close();
    // Attempt 2 — 2s backoff: not there yet at 1999ms.
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
  });

  it("notifies message listeners on parseable server messages", () => {
    const { client, sockets } = build();
    const received: unknown[] = [];
    client.onMessage((m) => received.push(m));
    client.connect();
    sockets[0].simulateOpen();

    sockets[0].simulateMessage({ type: "pong" });
    expect(received).toEqual([{ type: "pong" }]);
  });

  it("ignores unparseable server messages", () => {
    const { client, sockets } = build();
    const received: unknown[] = [];
    client.onMessage((m) => received.push(m));
    client.connect();
    sockets[0].simulateOpen();

    sockets[0].simulateMessage({ type: "nonsense" });
    expect(received).toEqual([]);
  });

  it("disconnect() closes the socket and stops reconnecting", () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0].simulateOpen();
    client.disconnect();
    expect(client.state).toBe("offline");

    // No new sockets after any amount of time — backoff timer was cleared.
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });
});
