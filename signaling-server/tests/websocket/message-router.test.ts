import { routeMessage } from "@/websocket/message-router";
import { SessionManager } from "@/websocket/session-manager";
import type { WebSocket } from "ws";

// Minimal WebSocket mock that captures sent messages.
function mockSocket() {
  const sent: string[] = [];
  return {
    sent,
    close: () => undefined,
    send: (data: string) => { sent.push(data); },
  } as unknown as WebSocket & { sent: string[] };
}

const machineA = "550e8400-e29b-41d4-a716-446655440000";

describe("routeMessage", () => {
  it("routes register to its handler", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    routeMessage(
      JSON.stringify({
        type: "register",
        machine_id: machineA,
        pin: "111-222-333",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
      { manager, socket },
    );
    expect(manager.count()).toBe(1);
    expect((socket as { sent: string[] }).sent[0]).toContain("registered");
  });

  it("replies pong to ping and touches the client", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    // Register first so ping has something to touch.
    routeMessage(
      JSON.stringify({
        type: "register",
        machine_id: machineA,
        pin: "111-222-333",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
      { manager, socket },
    );
    (socket as { sent: string[] }).sent.length = 0;

    routeMessage(JSON.stringify({ type: "ping" }), { manager, socket, machineId: machineA });

    const pong = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(pong).toEqual({ type: "pong" });
  });

  it("sends an error message on invalid JSON", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    routeMessage("not-json", { manager, socket });

    const err = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(err.type).toBe("error");
    expect(err.code).toBe("invalid_json");
  });

  it("sends an error message on unknown type", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    routeMessage(JSON.stringify({ type: "bogus" }), { manager, socket });

    const err = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(err.type).toBe("error");
    expect(err.code).toBe("invalid_message");
  });
});
