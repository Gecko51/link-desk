import { buildServer } from "@/server";
import { loadEnv } from "@/lib/env";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import type { SessionManager } from "@/websocket/session-manager";
import type { ConnectionRequestTracker } from "@/features/connect/connection-requests";

// UUIDs stable used for the host and the controller throughout the tests.
const HOST = "550e8400-e29b-41d4-a716-446655440000";
const CTRL = "550e8400-e29b-41d4-a716-446655440001";
const PIN = "123-456-789";

// Typed structure for incoming WebSocket messages.
interface WsMessage {
  type: string;
  [key: string]: unknown;
}

// Resolves with the first message received on the socket, parsed as JSON.
// Rejects if the socket emits an error before a message arrives.
function nextMessage(ws: WebSocket): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    ws.once("message", (data) =>
      resolve(JSON.parse(data.toString("utf-8")) as WsMessage),
    );
    ws.once("error", reject);
  });
}

// Opens a WebSocket and resolves once the connection is fully established.
function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

// Closes a socket and waits 100 ms so the server's "close" handler can run.
async function closeAndFlush(ws: WebSocket): Promise<void> {
  ws.close();
  await new Promise((r) => setTimeout(r, 100));
}

describe("connect flow E2E", () => {
  let app: FastifyInstance;
  let sessions: SessionManager;
  let tracker: ConnectionRequestTracker;
  let url: string;

  // Spin up a real Fastify instance on an ephemeral OS-assigned port (port: 0).
  // PORT: "3001" satisfies Zod's .positive() validation; the actual binding port
  // comes from port: 0 passed to app.listen().
  beforeAll(async () => {
    const env = loadEnv({ PORT: "3001", NODE_ENV: "test", LOG_LEVEL: "error" });
    const built = await buildServer({ env });
    app = built.app;
    sessions = built.sessions;
    tracker = built.tracker;

    // app.listen returns "http://127.0.0.1:<port>" — swap scheme to get the WS URL.
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    url = address.replace("http", "ws") + "/signaling";
  });

  // Shut down the server cleanly after all tests to avoid open handles in Vitest.
  afterAll(async () => {
    await app.close();
  });

  it("completes connect → consent → SDP exchange → host disconnect", async () => {
    const hostWs = await open(url);
    const ctrlWs = await open(url);

    // --- Register host ---
    hostWs.send(
      JSON.stringify({
        type: "register",
        machine_id: HOST,
        pin: PIN,
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    await nextMessage(hostWs); // registered ack

    // --- Register controller ---
    ctrlWs.send(
      JSON.stringify({
        type: "register",
        machine_id: CTRL,
        pin: "999-999-999",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    await nextMessage(ctrlWs); // registered ack

    // --- Controller requests connection; host receives connect_offer ---
    ctrlWs.send(
      JSON.stringify({
        type: "connect_request",
        controller_id: CTRL,
        target_pin: PIN,
      }),
    );
    const offer = await nextMessage(hostWs);
    expect(offer.type).toBe("connect_offer");
    expect(offer.controller_id).toBe(CTRL);
    const sessionId = offer.session_id as string;

    // --- Host accepts; controller receives session_ready ---
    hostWs.send(
      JSON.stringify({
        type: "consent_response",
        session_id: sessionId,
        accepted: true,
      }),
    );
    const ready = await nextMessage(ctrlWs);
    expect(ready).toEqual({
      type: "session_ready",
      session_id: sessionId,
      host_id: HOST,
    });

    // --- Controller sends SDP offer → host receives it ---
    ctrlWs.send(
      JSON.stringify({
        type: "sdp_offer",
        session_id: sessionId,
        sdp: { type: "offer", sdp: "v=0\r\n" },
      }),
    );
    const relayedOffer = await nextMessage(hostWs);
    expect(relayedOffer.type).toBe("sdp_offer");
    expect(relayedOffer.session_id).toBe(sessionId);

    // --- Host sends SDP answer → controller receives it ---
    hostWs.send(
      JSON.stringify({
        type: "sdp_answer",
        session_id: sessionId,
        sdp: { type: "answer", sdp: "v=0\r\n" },
      }),
    );
    const relayedAnswer = await nextMessage(ctrlWs);
    expect(relayedAnswer.type).toBe("sdp_answer");

    // --- Host disconnects; controller receives peer_disconnected(host_disconnected) ---
    hostWs.close();
    const byeMsg = await nextMessage(ctrlWs);
    expect(byeMsg).toEqual({
      type: "peer_disconnected",
      session_id: sessionId,
      reason: "host_disconnected",
    });

    // Clean up controller and assert server-side state is fully cleared.
    await closeAndFlush(ctrlWs);
    expect(sessions.count()).toBe(0);
    expect(tracker.find(sessionId)).toBeUndefined();
  }, 15_000);

  it("refuses connect to unknown PIN", async () => {
    const ctrlWs = await open(url);

    ctrlWs.send(
      JSON.stringify({
        type: "register",
        machine_id: CTRL,
        pin: "999-999-999",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    await nextMessage(ctrlWs); // registered ack

    // Target PIN is not registered → server must reply with an error.
    ctrlWs.send(
      JSON.stringify({
        type: "connect_request",
        controller_id: CTRL,
        target_pin: "000-000-000",
      }),
    );
    const err = await nextMessage(ctrlWs);
    expect(err.type).toBe("error");
    expect(err.code).toBe("pin_not_found");

    await closeAndFlush(ctrlWs);
  });

  it("declined consent sends peer_disconnected(declined) to controller", async () => {
    const hostWs = await open(url);
    const ctrlWs = await open(url);

    // Register both clients.
    hostWs.send(
      JSON.stringify({
        type: "register",
        machine_id: HOST,
        pin: PIN,
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    await nextMessage(hostWs);

    ctrlWs.send(
      JSON.stringify({
        type: "register",
        machine_id: CTRL,
        pin: "999-999-999",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    await nextMessage(ctrlWs);

    // Controller requests; host receives connect_offer.
    ctrlWs.send(
      JSON.stringify({
        type: "connect_request",
        controller_id: CTRL,
        target_pin: PIN,
      }),
    );
    const offer = await nextMessage(hostWs);
    const sessionId = offer.session_id as string;

    // Host declines; controller must receive peer_disconnected(declined).
    hostWs.send(
      JSON.stringify({
        type: "consent_response",
        session_id: sessionId,
        accepted: false,
      }),
    );
    const declined = await nextMessage(ctrlWs);
    expect(declined).toEqual({
      type: "peer_disconnected",
      session_id: sessionId,
      reason: "declined",
    });

    await closeAndFlush(hostWs);
    await closeAndFlush(ctrlWs);
  });
});
