export type SessionRole = "controller" | "host";

export type SessionStatus =
  | { kind: "idle" }
  | { kind: "requesting"; targetPin: string }
  | { kind: "awaiting_consent"; sessionId: string; role: SessionRole; peerId: string }
  | { kind: "negotiating"; sessionId: string; role: SessionRole; peerId: string }
  | { kind: "connected"; sessionId: string; role: SessionRole; peerId: string }
  | { kind: "ended"; reason: SessionEndReason };

export type SessionEndReason =
  | "local_disconnect"
  | "peer_disconnected"
  | "declined"
  | "timeout"
  | "pin_not_found"
  | "self_connect_forbidden"
  | "network_error";

export type SessionEvent =
  | { type: "user_requested_connect"; targetPin: string }
  | { type: "server_pin_not_found" }
  | { type: "server_self_connect_forbidden" }
  | { type: "server_connect_offer"; sessionId: string; controllerId: string }
  | { type: "server_session_ready"; sessionId: string; hostId: string }
  | {
      type: "server_peer_disconnected";
      sessionId: string;
      reason: "host_disconnected" | "controller_disconnected" | "timeout" | "declined";
    }
  | { type: "consent_accepted"; sessionId: string }
  | { type: "consent_declined" }
  | { type: "peer_connected"; sessionId: string }
  | { type: "user_ended" };
