import { handleConsentResponse } from "@/features/connect/consent-handler";
import { SessionManager } from "@/websocket/session-manager";
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import type { WebSocket } from "ws";

function mockSocket() {
  const sent: string[] = [];
  return { sent, close: () => undefined, send: (d: string) => { sent.push(d); } } as unknown as WebSocket & { sent: string[] };
}

const CTRL = "550e8400-e29b-41d4-a716-446655440000";
const HOST = "550e8400-e29b-41d4-a716-446655440001";

describe("handleConsentResponse", () => {
  let sessions: SessionManager;
  let tracker: ConnectionRequestTracker;
  let hostSocket: ReturnType<typeof mockSocket>;
  let ctrlSocket: ReturnType<typeof mockSocket>;

  beforeEach(() => {
    sessions = new SessionManager();
    tracker = new ConnectionRequestTracker({ ttlMs: 30_000 });
    hostSocket = mockSocket();
    ctrlSocket = mockSocket();
    sessions.register({ machineId: HOST, socket: hostSocket, pin: "111-222-333", pinExpiresAt: new Date(Date.now() + 60_000) });
    sessions.register({ machineId: CTRL, socket: ctrlSocket, pin: "999-999-999", pinExpiresAt: new Date(Date.now() + 60_000) });
    hostSocket.sent.length = 0;
    ctrlSocket.sent.length = 0;
  });

  it("on accepted=true: marks accepted and sends session_ready to controller", () => {
    const req = tracker.create({ controllerId: CTRL, hostId: HOST });
    handleConsentResponse(
      { type: "consent_response", session_id: req.sessionId, accepted: true },
      { sessions, tracker, socket: hostSocket },
    );
    expect(tracker.find(req.sessionId)?.status).toBe("accepted");
    const ready = JSON.parse(ctrlSocket.sent[0]);
    expect(ready).toEqual({
      type: "session_ready",
      session_id: req.sessionId,
      host_id: HOST,
    });
  });

  it("on accepted=false: sends peer_disconnected(declined) and removes", () => {
    const req = tracker.create({ controllerId: CTRL, hostId: HOST });
    handleConsentResponse(
      { type: "consent_response", session_id: req.sessionId, accepted: false },
      { sessions, tracker, socket: hostSocket },
    );
    const msg = JSON.parse(ctrlSocket.sent[0]);
    expect(msg).toEqual({ type: "peer_disconnected", session_id: req.sessionId, reason: "declined" });
    expect(tracker.find(req.sessionId)).toBeUndefined();
  });

  it("ignores unknown session_id", () => {
    handleConsentResponse(
      { type: "consent_response", session_id: "550e8400-e29b-41d4-a716-446655440099", accepted: true },
      { sessions, tracker, socket: hostSocket },
    );
    expect(ctrlSocket.sent).toHaveLength(0);
  });

  it("if controller is disconnected, drops silently and removes", () => {
    const req = tracker.create({ controllerId: "550e8400-e29b-41d4-a716-446655440077", hostId: HOST });
    handleConsentResponse(
      { type: "consent_response", session_id: req.sessionId, accepted: true },
      { sessions, tracker, socket: hostSocket },
    );
    expect(tracker.find(req.sessionId)).toBeUndefined();
  });
});
