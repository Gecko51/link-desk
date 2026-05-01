import type { SessionStatus, SessionEvent } from "./session.types";

// Initial state: idle, waiting for user input or incoming connection offer
export const initialSessionStatus: SessionStatus = { kind: "idle" };

// Pure reducer: maps (current status, event) -> next status.
// No side effects: all orchestration (WS messages, dialogs, peer connections)
// happens in the useSession hook observing state transitions.
export function sessionReducer(status: SessionStatus, event: SessionEvent): SessionStatus {
  switch (event.type) {
    // User initiates connection with a PIN
    case "user_requested_connect":
      if (status.kind !== "idle" && status.kind !== "ended") return status;
      return { kind: "requesting", targetPin: event.targetPin };

    // Server rejects: PIN not found
    case "server_pin_not_found":
      if (status.kind !== "requesting") return status;
      return { kind: "ended", reason: "pin_not_found" };

    // Server rejects: same machine tried to connect to itself
    case "server_self_connect_forbidden":
      if (status.kind !== "requesting") return status;
      return { kind: "ended", reason: "self_connect_forbidden" };

    // Server offers connection: this machine becomes host, awaiting user consent
    case "server_connect_offer":
      if (status.kind !== "idle" && status.kind !== "ended") return status;
      return {
        kind: "awaiting_consent",
        sessionId: event.sessionId,
        role: "host",
        peerId: event.controllerId,
      };

    // Server confirms: controller's request was accepted, start negotiation
    case "server_session_ready":
      if (status.kind !== "requesting") return status;
      return {
        kind: "negotiating",
        sessionId: event.sessionId,
        role: "controller",
        peerId: event.hostId,
      };

    // User accepts incoming connection request
    case "consent_accepted":
      if (status.kind !== "awaiting_consent") return status;
      return {
        kind: "negotiating",
        sessionId: status.sessionId,
        role: status.role,
        peerId: status.peerId,
      };

    // User declines incoming connection request
    case "consent_declined":
      if (status.kind !== "awaiting_consent") return status;
      return { kind: "ended", reason: "declined" };

    // ICE/SDP negotiation complete, data channel established — video not yet streaming
    case "peer_connected":
      if (status.kind !== "negotiating") return status;
      return {
        kind: "connected",
        sessionId: status.sessionId,
        role: status.role,
        peerId: status.peerId,
        hasVideo: false,
      };

    // Remote video track received — controller can now start input capture
    case "video_track_received":
      if (status.kind !== "connected") return status;
      return { ...status, hasVideo: true };

    // Server reports peer disconnection with reason
    case "server_peer_disconnected":
      if (status.kind === "idle" || status.kind === "ended") return status;
      // Map server reason to local reason
      if (event.reason === "declined") return { kind: "ended", reason: "declined" };
      if (event.reason === "timeout") return { kind: "ended", reason: "timeout" };
      // host_disconnected or controller_disconnected -> unified to peer_disconnected
      return { kind: "ended", reason: "peer_disconnected" };

    // User manually ends the session
    case "user_ended":
      if (status.kind === "idle" || status.kind === "ended") return status;
      return { kind: "ended", reason: "local_disconnect" };
  }
}
