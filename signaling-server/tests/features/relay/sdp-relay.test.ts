import { relayToPeer } from "@/features/relay/sdp-relay";
import { SessionManager } from "@/websocket/session-manager";
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import type { WebSocket } from "ws";

function mockSocket() {
  const sent: string[] = [];
  return { sent, close: () => undefined, send: (d: string) => { sent.push(d); } } as unknown as WebSocket & { sent: string[] };
}

const CTRL = "550e8400-e29b-41d4-a716-446655440000";
const HOST = "550e8400-e29b-41d4-a716-446655440001";

describe("relayToPeer", () => {
  let sessions: SessionManager;
  let tracker: ConnectionRequestTracker;
  let hostSocket: ReturnType<typeof mockSocket>;
  let ctrlSocket: ReturnType<typeof mockSocket>;
  let sessionId: string;

  beforeEach(() => {
    sessions = new SessionManager();
    tracker = new ConnectionRequestTracker({ ttlMs: 60_000 });
    hostSocket = mockSocket();
    ctrlSocket = mockSocket();
    sessions.register({ machineId: HOST, socket: hostSocket, pin: "111-222-333", pinExpiresAt: new Date(Date.now() + 60_000) });
    sessions.register({ machineId: CTRL, socket: ctrlSocket, pin: "999-999-999", pinExpiresAt: new Date(Date.now() + 60_000) });
    const req = tracker.create({ controllerId: CTRL, hostId: HOST });
    tracker.markAccepted(req.sessionId);
    sessionId = req.sessionId;
    hostSocket.sent.length = 0;
    ctrlSocket.sent.length = 0;
  });

  it("relays sdp_offer from controller to host", () => {
    relayToPeer(
      { type: "sdp_offer", session_id: sessionId, sdp: { type: "offer", sdp: "v=0" } },
      { sessions, tracker, fromMachineId: CTRL },
    );
    const fwd = JSON.parse(hostSocket.sent[0]);
    expect(fwd).toEqual({ type: "sdp_offer", session_id: sessionId, sdp: { type: "offer", sdp: "v=0" } });
    expect(ctrlSocket.sent).toHaveLength(0);
  });

  it("relays sdp_answer from host to controller", () => {
    relayToPeer(
      { type: "sdp_answer", session_id: sessionId, sdp: { type: "answer", sdp: "v=0" } },
      { sessions, tracker, fromMachineId: HOST },
    );
    const fwd = JSON.parse(ctrlSocket.sent[0]);
    expect(fwd.type).toBe("sdp_answer");
    expect(hostSocket.sent).toHaveLength(0);
  });

  it("relays ice_candidate from either side", () => {
    relayToPeer(
      { type: "ice_candidate", session_id: sessionId, candidate: { candidate: "candidate:1" } },
      { sessions, tracker, fromMachineId: CTRL },
    );
    expect(JSON.parse(hostSocket.sent[0]).type).toBe("ice_candidate");
  });

  it("silently drops if session unknown", () => {
    relayToPeer(
      { type: "sdp_offer", session_id: "550e8400-e29b-41d4-a716-446655440099", sdp: { type: "offer", sdp: "v=0" } },
      { sessions, tracker, fromMachineId: CTRL },
    );
    expect(hostSocket.sent).toHaveLength(0);
    expect(ctrlSocket.sent).toHaveLength(0);
  });

  it("silently drops if sender is neither controller nor host of the session", () => {
    relayToPeer(
      { type: "sdp_offer", session_id: sessionId, sdp: { type: "offer", sdp: "v=0" } },
      { sessions, tracker, fromMachineId: "550e8400-e29b-41d4-a716-446655440088" },
    );
    expect(hostSocket.sent).toHaveLength(0);
    expect(ctrlSocket.sent).toHaveLength(0);
  });
});
