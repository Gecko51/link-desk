import type { ClientMessage, ServerMessage } from "./message-schemas";

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

// Extended public API returned by useSignaling.
// Exposes send + onMessage without leaking the SignalingClient class itself.
// This lets useSession and any other consumer send/receive messages
// while the client instance remains encapsulated in the hook.
export interface SignalingApi extends SignalingState {
  // Sends a message to the server. Returns false if the socket is not open.
  send: (msg: ClientMessage) => boolean;
  // Registers a listener for incoming server messages. Returns an unsubscribe fn.
  onMessage: (listener: (msg: ServerMessage) => void) => () => void;
}
