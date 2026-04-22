import type { SessionManager } from "@/websocket/session-manager";
import type { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import type {
  SdpOfferMessageSchema,
  SdpAnswerMessageSchema,
  IceCandidateMessageSchema,
} from "@/websocket/schemas";
import type { z } from "zod";

type RelayMessage =
  | z.infer<typeof SdpOfferMessageSchema>
  | z.infer<typeof SdpAnswerMessageSchema>
  | z.infer<typeof IceCandidateMessageSchema>;

interface RelayContext {
  sessions: SessionManager;
  tracker: ConnectionRequestTracker;
  fromMachineId: string;
}

// Forwards a session-scoped message to the opposite peer. Drops silently if the
// session or the target peer is unknown (do not leak state to the sender).
export function relayToPeer(msg: RelayMessage, ctx: RelayContext): void {
  const req = ctx.tracker.find(msg.session_id);
  if (!req) return;

  const targetMachineId =
    ctx.fromMachineId === req.controllerId ? req.hostId
    : ctx.fromMachineId === req.hostId ? req.controllerId
    : null;
  if (!targetMachineId) return;

  const target = ctx.sessions.findByMachineId(targetMachineId);
  if (!target) return;

  target.socket.send(JSON.stringify(msg));
}
