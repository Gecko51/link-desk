import { handleConnectRequest } from "@/features/connect/connect-handler";
import { SessionManager } from "@/websocket/session-manager";
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import type { WebSocket } from "ws";

function mockSocket() {
  const sent: string[] = [];
  return { sent, close: () => undefined, send: (d: string) => { sent.push(d); } } as unknown as WebSocket & { sent: string[] };
}

const CTRL = "550e8400-e29b-41d4-a716-446655440000";
const HOST = "550e8400-e29b-41d4-a716-446655440001";
const PIN = "111-222-333";

describe("handleConnectRequest", () => {
  let sessions: SessionManager;
  let tracker: ConnectionRequestTracker;
  let hostSocket: ReturnType<typeof mockSocket>;
  let ctrlSocket: ReturnType<typeof mockSocket>;

  beforeEach(() => {
    sessions = new SessionManager();
    tracker = new ConnectionRequestTracker({ ttlMs: 30_000 });
    hostSocket = mockSocket();
    ctrlSocket = mockSocket();
    sessions.register({ machineId: HOST, socket: hostSocket, pin: PIN, pinExpiresAt: new Date(Date.now() + 60_000) });
    sessions.register({ machineId: CTRL, socket: ctrlSocket, pin: "999-999-999", pinExpiresAt: new Date(Date.now() + 60_000) });
    hostSocket.sent.length = 0;
    ctrlSocket.sent.length = 0;
  });

  it("creates a session and sends connect_offer to the host", () => {
    handleConnectRequest(
      { type: "connect_request", controller_id: CTRL, target_pin: PIN },
      { sessions, tracker, socket: ctrlSocket },
    );
    const offer = JSON.parse(hostSocket.sent[0]);
    expect(offer.type).toBe("connect_offer");
    expect(offer.controller_id).toBe(CTRL);
    expect(offer.session_id).toMatch(/^[0-9a-f-]+$/);
    expect(tracker.find(offer.session_id)).toBeDefined();
    expect(ctrlSocket.sent).toHaveLength(0);
  });

  it("errors with pin_not_found when PIN has no match", () => {
    handleConnectRequest(
      { type: "connect_request", controller_id: CTRL, target_pin: "000-000-000" },
      { sessions, tracker, socket: ctrlSocket },
    );
    expect(hostSocket.sent).toHaveLength(0);
    const err = JSON.parse(ctrlSocket.sent[0]);
    expect(err.type).toBe("error");
    expect(err.code).toBe("pin_not_found");
  });

  it("errors with self_connect_forbidden on own PIN", () => {
    handleConnectRequest(
      { type: "connect_request", controller_id: CTRL, target_pin: "999-999-999" },
      { sessions, tracker, socket: ctrlSocket },
    );
    const err = JSON.parse(ctrlSocket.sent[0]);
    expect(err.type).toBe("error");
    expect(err.code).toBe("self_connect_forbidden");
    expect(hostSocket.sent).toHaveLength(0);
  });
});
