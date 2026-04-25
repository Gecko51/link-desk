import type { WebSocket } from "ws";
import type { SessionManager } from "./session-manager";
import type { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import { parseClientMessage } from "./schemas";
import { handleRegister, handleUpdatePin } from "@/features/register/register-handler";
import { handleConnectRequest } from "@/features/connect/connect-handler";
import { handleConsentResponse } from "@/features/connect/consent-handler";
import { relayToPeer } from "@/features/relay/sdp-relay";

interface RouterContext {
  manager: SessionManager;
  tracker: ConnectionRequestTracker;
  socket: WebSocket;
  machineId?: string;
}

function sendError(socket: WebSocket, code: string, message: string): void {
  socket.send(JSON.stringify({ type: "error", code, message }));
}

// Routes a raw (string) incoming message to the appropriate handler.
// Unknown or malformed messages yield a structured error response.
export function routeMessage(raw: string, ctx: RouterContext): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendError(ctx.socket, "invalid_json", "Failed to parse message as JSON");
    return;
  }

  const result = parseClientMessage(parsed);
  if (!result.ok) {
    sendError(ctx.socket, "invalid_message", result.error);
    return;
  }

  const msg = result.value;
  switch (msg.type) {
    case "register":
      handleRegister(msg, { manager: ctx.manager, socket: ctx.socket });
      return;
    case "update_pin":
      handleUpdatePin(msg, { manager: ctx.manager, socket: ctx.socket });
      return;
    case "ping":
      if (ctx.machineId) ctx.manager.touch(ctx.machineId);
      ctx.socket.send(JSON.stringify({ type: "pong" }));
      return;
    case "connect_request":
      handleConnectRequest(msg, { sessions: ctx.manager, tracker: ctx.tracker, socket: ctx.socket });
      return;
    case "consent_response":
      handleConsentResponse(msg, { sessions: ctx.manager, tracker: ctx.tracker, socket: ctx.socket });
      return;
    case "sdp_offer":
    case "sdp_answer":
    case "ice_candidate":
      if (!ctx.machineId) {
        sendError(ctx.socket, "not_registered", "Register before sending relay messages.");
        return;
      }
      relayToPeer(msg, { sessions: ctx.manager, tracker: ctx.tracker, fromMachineId: ctx.machineId });
      return;
  }
}
