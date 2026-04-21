import { buildServer } from "@/server";
import { loadEnv } from "@/lib/env";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import type { SessionManager } from "@/websocket/session-manager";

// Two distinct machine UUIDs used throughout this integration test.
const MACHINE_A = "550e8400-e29b-41d4-a716-446655440000";
const MACHINE_B = "550e8400-e29b-41d4-a716-446655440001";

describe("register flow — 2 simultaneous clients", () => {
  let app: FastifyInstance;
  let sessions: SessionManager;
  let url: string;

  // Start a real Fastify instance on an OS-assigned ephemeral port (port: 0).
  // This guarantees no port conflicts with any other running service.
  beforeAll(async () => {
    // PORT "3001" satisfies the Zod .positive() constraint; the actual binding port
    // is overridden below with port: 0 so the OS picks a free ephemeral port.
    const env = loadEnv({ PORT: "3001", NODE_ENV: "test", LOG_LEVEL: "error" });
    const built = await buildServer({ env });
    app = built.app;
    sessions = built.sessions;

    // app.listen returns "http://127.0.0.1:<port>" — swap scheme to get the WS URL.
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    url = address.replace("http", "ws") + "/signaling";
  });

  // Shut the server down after all tests; ensures no open handles in Vitest.
  afterAll(async () => {
    await app.close();
  });

  // Resolves with the first parsed message received on the given WebSocket.
  function awaitMessage(ws: WebSocket): Promise<unknown> {
    return new Promise((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString("utf-8"))));
      ws.once("error", reject);
    });
  }

  // Opens a WebSocket and resolves once the connection is established.
  function connectedSocket(wsUrl: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
    });
  }

  it("registers two clients and tracks them independently", async () => {
    // Connect both clients concurrently.
    const wsA = await connectedSocket(url);
    const wsB = await connectedSocket(url);

    // --- Client A sends register ---
    wsA.send(
      JSON.stringify({
        type: "register",
        machine_id: MACHINE_A,
        pin: "111-222-333",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    const ackA = await awaitMessage(wsA);
    expect(ackA).toEqual({ type: "registered", machine_id: MACHINE_A });

    // --- Client B sends register ---
    wsB.send(
      JSON.stringify({
        type: "register",
        machine_id: MACHINE_B,
        pin: "444-555-666",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    const ackB = await awaitMessage(wsB);
    expect(ackB).toEqual({ type: "registered", machine_id: MACHINE_B });

    // --- Server-side state assertions ---
    expect(sessions.count()).toBe(2);
    expect(sessions.findByMachineId(MACHINE_A)).toBeDefined();
    expect(sessions.findByMachineId(MACHINE_B)).toBeDefined();
    // PIN-to-machine lookup must resolve correctly.
    expect(sessions.findByPin("111-222-333")?.machineId).toBe(MACHINE_A);

    // Close both clients and wait briefly so the server's "close" handler can run
    // synchronously and deregister both sessions before we assert count === 0.
    wsA.close();
    wsB.close();

    await new Promise((r) => setTimeout(r, 100));

    // Both clients removed from the session registry after disconnect.
    expect(sessions.count()).toBe(0);
  });
});
