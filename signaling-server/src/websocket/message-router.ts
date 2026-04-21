import type { WebSocket } from "ws";
import type { SessionManager } from "./session-manager";
import { parseClientMessage } from "./schemas";
import { handleRegister, handleUpdatePin } from "@/features/register/register-handler";

// Context passed to every handler: the session registry and the caller's socket.
// machineId is resolved after a successful register and passed for ping messages.
interface RouterContext {
  manager: SessionManager;
  socket: WebSocket;
  machineId?: string;
}

// Sends a structured error response back to the client.
function sendError(socket: WebSocket, code: string, message: string): void {
  socket.send(JSON.stringify({ type: "error", code, message }));
}

// Routes a raw (string) incoming message to the appropriate handler.
// Handles two failure modes before dispatching:
//   1. JSON.parse failure  → error ack with code "invalid_json"
//   2. Zod validation fail → error ack with code "invalid_message"
// Unknown or malformed messages are never silently dropped.
export function routeMessage(raw: string, ctx: RouterContext): void {
  // --- Parse JSON ---
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendError(ctx.socket, "invalid_json", "Failed to parse message as JSON");
    return;
  }

  // --- Validate against the discriminated union schema ---
  const result = parseClientMessage(parsed);
  if (!result.ok) {
    sendError(ctx.socket, "invalid_message", result.error);
    return;
  }

  // --- Dispatch to the correct domain handler ---
  const msg = result.value;
  switch (msg.type) {
    case "register":
      handleRegister(msg, ctx);
      return;
    case "update_pin":
      handleUpdatePin(msg, ctx);
      return;
    case "ping":
      // Touch keeps the heartbeat timestamp fresh for this client.
      if (ctx.machineId) ctx.manager.touch(ctx.machineId);
      ctx.socket.send(JSON.stringify({ type: "pong" }));
      return;
  }
}
