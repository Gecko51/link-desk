import type { WebSocket } from "ws";

// An active client tracked by the session manager (in-memory, Phase 2).
export interface ActiveClient {
  machineId: string;
  socketId: string; // Generated server-side (crypto.randomUUID())
  socket: WebSocket; // Live WS reference
  connectedAt: Date;
  currentPin: string | null; // null until registered
  pinExpiresAt: Date | null;
  lastPingAt: Date; // For heartbeat liveness check
}
