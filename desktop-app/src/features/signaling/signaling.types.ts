// Connection states for the WebSocket signaling channel.
// - connecting: attempting to establish WS connection
// - open: WS connected and ready
// - reconnecting: lost connection, retrying
// - offline: connection permanently down (user offline)
// - disabled: VITE_SIGNALING_URL env var not set
export type ConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "offline"
  | "disabled";

// Aggregated WebSocket signaling state (consumed by SignalingClient + useSignaling hook).
export interface SignalingState {
  connection: ConnectionState;
  lastError: string | null;
  registered: boolean;
}
