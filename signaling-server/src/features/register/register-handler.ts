import type { WebSocket } from "ws";
import type { SessionManager } from "@/websocket/session-manager";
import type { RegisterMessageSchema, UpdatePinMessageSchema } from "@/websocket/schemas";
import type { z } from "zod";

interface HandlerContext {
  manager: SessionManager;
  socket: WebSocket;
}

type RegisterMessage = z.infer<typeof RegisterMessageSchema>;
type UpdatePinMessage = z.infer<typeof UpdatePinMessageSchema>;

// Handles a validated "register" message: records the client and acks.
export function handleRegister(
  msg: RegisterMessage,
  ctx: HandlerContext,
): void {
  ctx.manager.register({
    machineId: msg.machine_id,
    socket: ctx.socket,
    pin: msg.pin,
    pinExpiresAt: new Date(msg.pin_expires_at),
  });
  const ack = { type: "registered" as const, machine_id: msg.machine_id };
  ctx.socket.send(JSON.stringify(ack));
}

// Handles a validated "update_pin" message. Silently drops if the machine is unknown
// (this should not happen in a well-behaved client - but we don't surface an error
// to avoid leaking server state).
export function handleUpdatePin(
  msg: UpdatePinMessage,
  ctx: HandlerContext,
): void {
  if (!ctx.manager.findByMachineId(msg.machine_id)) return;
  ctx.manager.updatePin(
    msg.machine_id,
    msg.new_pin,
    new Date(msg.new_expires_at),
  );
  const ack = { type: "pin_updated" as const };
  ctx.socket.send(JSON.stringify(ack));
}
