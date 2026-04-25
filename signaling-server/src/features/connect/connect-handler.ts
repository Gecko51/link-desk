import type { WebSocket } from "ws";
import type { SessionManager } from "@/websocket/session-manager";
import type { ConnectionRequestTracker } from "./connection-requests";
import type { ConnectRequestMessageSchema } from "@/websocket/schemas";
import type { z } from "zod";

interface HandlerContext {
  sessions: SessionManager;
  tracker: ConnectionRequestTracker;
  socket: WebSocket;
}

type ConnectRequestMessage = z.infer<typeof ConnectRequestMessageSchema>;

function sendError(socket: WebSocket, code: string, message: string): void {
  socket.send(JSON.stringify({ type: "error", code, message }));
}

// Resolves target_pin to a host machine, tracks a pending session, and pushes
// connect_offer to the host. Errors back to the controller on pin miss or self-connect.
export function handleConnectRequest(
  msg: ConnectRequestMessage,
  ctx: HandlerContext,
): void {
  const host = ctx.sessions.findByPin(msg.target_pin);
  if (!host) {
    sendError(ctx.socket, "pin_not_found", "No active client matches the provided PIN.");
    return;
  }
  if (host.machineId === msg.controller_id) {
    sendError(ctx.socket, "self_connect_forbidden", "Cannot open a session to your own device.");
    return;
  }
  const req = ctx.tracker.create({
    controllerId: msg.controller_id,
    hostId: host.machineId,
    pinUsed: msg.target_pin,
  });
  host.socket.send(JSON.stringify({
    type: "connect_offer" as const,
    session_id: req.sessionId,
    controller_id: msg.controller_id,
  }));
}
