import type { WebSocket } from "ws";
import type { SessionManager } from "@/websocket/session-manager";
import type { ConnectionRequestTracker } from "./connection-requests";
import type { ConsentResponseMessageSchema } from "@/websocket/schemas";
import type { z } from "zod";

interface HandlerContext {
  sessions: SessionManager;
  tracker: ConnectionRequestTracker;
  socket: WebSocket;
}

type ConsentResponseMessage = z.infer<typeof ConsentResponseMessageSchema>;

// Routes the host's consent decision. On accept: sends session_ready to the controller.
// On decline: sends peer_disconnected(declined) and clears the tracker.
export function handleConsentResponse(
  msg: ConsentResponseMessage,
  ctx: HandlerContext,
): void {
  const req = ctx.tracker.find(msg.session_id);
  if (!req) return;

  const controller = ctx.sessions.findByMachineId(req.controllerId);
  if (!controller) {
    ctx.tracker.remove(req.sessionId);
    return;
  }

  if (msg.accepted) {
    ctx.tracker.markAccepted(req.sessionId);
    controller.socket.send(JSON.stringify({
      type: "session_ready" as const,
      session_id: req.sessionId,
      host_id: req.hostId,
    }));
    return;
  }

  controller.socket.send(JSON.stringify({
    type: "peer_disconnected" as const,
    session_id: req.sessionId,
    reason: "declined" as const,
  }));
  ctx.tracker.remove(req.sessionId);
}
