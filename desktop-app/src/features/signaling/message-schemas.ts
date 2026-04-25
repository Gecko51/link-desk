import { z } from "zod";

// Primitive schemas shared across client and server messages.
const PinSchema = z.string().regex(/^\d{3}-\d{3}-\d{3}$/);
const IsoTimestampSchema = z.string().datetime();
const MachineIdSchema = z.string().uuid();

// --- Client → Server Messages ---

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

export const PingMessageSchema = z.object({ type: z.literal("ping") });

// --- Phase 3: WebRTC handshake ---

const SessionIdSchema = z.string().uuid();

const SdpDescriptionSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().optional(),
});

const IceCandidateInitSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

// Client → Server
export const ConnectRequestMessageSchema = z.object({
  type: z.literal("connect_request"),
  controller_id: MachineIdSchema,
  target_pin: z.string().regex(/^\d{3}-\d{3}-\d{3}$/),
});

export const ConsentResponseMessageSchema = z.object({
  type: z.literal("consent_response"),
  session_id: SessionIdSchema,
  accepted: z.boolean(),
});

export const SdpOfferMessageSchema = z.object({
  type: z.literal("sdp_offer"),
  session_id: SessionIdSchema,
  sdp: SdpDescriptionSchema,
});

export const SdpAnswerMessageSchema = z.object({
  type: z.literal("sdp_answer"),
  session_id: SessionIdSchema,
  sdp: SdpDescriptionSchema,
});

export const IceCandidateMessageSchema = z.object({
  type: z.literal("ice_candidate"),
  session_id: SessionIdSchema,
  candidate: IceCandidateInitSchema,
});

// Server → Client
export const ConnectOfferMessageSchema = z.object({
  type: z.literal("connect_offer"),
  session_id: SessionIdSchema,
  controller_id: MachineIdSchema,
});

export const SessionReadyMessageSchema = z.object({
  type: z.literal("session_ready"),
  session_id: SessionIdSchema,
  host_id: MachineIdSchema,
});

export const PeerDisconnectedMessageSchema = z.object({
  type: z.literal("peer_disconnected"),
  session_id: SessionIdSchema,
  reason: z.enum(["host_disconnected", "controller_disconnected", "timeout", "declined"]),
});

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

// --- Server → Client Messages ---

export const RegisteredAckSchema = z.object({
  type: z.literal("registered"),
  machine_id: MachineIdSchema,
});

export const PinUpdatedAckSchema = z.object({ type: z.literal("pin_updated") });

export const PongMessageSchema = z.object({ type: z.literal("pong") });

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

// Safely parses a raw (JSON.parsed) server message payload.
// Returns the parsed message on success, null if validation fails.
// Callers never see malformed data (DEV-RULES §6 — fail-closed pattern).
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const parsed = ServerMessageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
