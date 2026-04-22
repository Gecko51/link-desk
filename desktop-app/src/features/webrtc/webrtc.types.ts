// PeerConnectionState represents the lifecycle state of an RTCPeerConnection.
export type PeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

// SessionDescriptor identifies a WebRTC session and its participants.
export interface SessionDescriptor {
  sessionId: string;
  role: "controller" | "host";
  peerMachineId: string;
}
