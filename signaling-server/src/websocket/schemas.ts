import { z } from "zod";

// Canonical PIN format: "XXX-XXX-XXX" (9 digits, two dashes).
const PinSchema = z.string().regex(/^\d{3}-\d{3}-\d{3}$/);

// Timestamps are ISO-8601 strings transmitted over the wire.
const IsoTimestampSchema = z.string().datetime();

const MachineIdSchema = z.string().uuid();

// --- Client → Server messages ---

export const RegisterMessageSchema = z.object({
  type: z.literal("register"),
  machine_id: MachineIdSchema,
  pin: PinSchema,
  pin_expires_at: IsoTimestampSchema,
});

export const UpdatePinMessageSchema = z.object({
  type: z.literal("update_pin"),
  machine_id: MachineIdSchema,
  new_pin: PinSchema,
  new_expires_at: IsoTimestampSchema,
});

export const PingMessageSchema = z.object({
  type: z.literal("ping"),
});

// --- Phase 3: WebRTC handshake ---

const SessionIdSchema = z.string().uuid();

// RTCSessionDescriptionInit shape (browser native).
const SdpDescriptionSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().optional(),
});

// RTCIceCandidateInit — all fields optional per spec except `candidate`.
const IceCandidateInitSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

// Client → Server: open a session to the host behind target_pin.
export const ConnectRequestMessageSchema = z.object({
  type: z.literal("connect_request"),
  controller_id: MachineIdSchema,
  target_pin: z.string().regex(/^\d{3}-\d{3}-\d{3}$/),
});

// Server → Host: pending controller wants to connect.
export const ConnectOfferMessageSchema = z.object({
  type: z.literal("connect_offer"),
  session_id: SessionIdSchema,
  controller_id: MachineIdSchema,
});

// Host → Server: user accepted/refused the connect_offer.
export const ConsentResponseMessageSchema = z.object({
  type: z.literal("consent_response"),
  session_id: SessionIdSchema,
  accepted: z.boolean(),
});

// Server → Controller: host accepted, you can now create the SDP offer.
export const SessionReadyMessageSchema = z.object({
  type: z.literal("session_ready"),
  session_id: SessionIdSchema,
  host_id: MachineIdSchema,
});

// Controller → Server → Host: SDP offer (ICE candidates embedded, wait-for-complete).
export const SdpOfferMessageSchema = z.object({
  type: z.literal("sdp_offer"),
  session_id: SessionIdSchema,
  sdp: SdpDescriptionSchema,
});

// Host → Server → Controller: SDP answer.
export const SdpAnswerMessageSchema = z.object({
  type: z.literal("sdp_answer"),
  session_id: SessionIdSchema,
  sdp: SdpDescriptionSchema,
});

// Either peer → Server → other peer: trickle ICE (unused in Phase 3, Phase 5 opt-in).
export const IceCandidateMessageSchema = z.object({
  type: z.literal("ice_candidate"),
  session_id: SessionIdSchema,
  candidate: IceCandidateInitSchema,
});

// Server → Peer: the session was cut short.
export const PeerDisconnectedMessageSchema = z.object({
  type: z.literal("peer_disconnected"),
  session_id: SessionIdSchema,
  reason: z.enum(["host_disconnected", "controller_disconnected", "timeout", "declined"]),
});

// Discriminated union of all client → server messages.
export const ClientMessageSchema = z.discriminatedUnion("type", [
  RegisterMessageSchema,
  UpdatePinMessageSchema,
  PingMessageSchema,
  ConnectRequestMessageSchema,
  ConsentResponseMessageSchema,
  SdpOfferMessageSchema,
  SdpAnswerMessageSchema,
  IceCandidateMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// --- Server → Client messages ---

export const RegisteredAckSchema = z.object({
  type: z.literal("registered"),
  machine_id: MachineIdSchema,
});

export const PinUpdatedAckSchema = z.object({
  type: z.literal("pin_updated"),
});

export const PongMessageSchema = z.object({
  type: z.literal("pong"),
});

export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  RegisteredAckSchema,
  PinUpdatedAckSchema,
  PongMessageSchema,
  ErrorMessageSchema,
  ConnectOfferMessageSchema,
  SessionReadyMessageSchema,
  SdpOfferMessageSchema,
  SdpAnswerMessageSchema,
  IceCandidateMessageSchema,
  PeerDisconnectedMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// --- Parser helper ---

// Parses a raw client-sent value (already JSON.parse'd) into a typed ClientMessage.
// Returns a discriminated result so callers don't need try/catch around Zod.
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  const parsed = ClientMessageSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.message };
}
