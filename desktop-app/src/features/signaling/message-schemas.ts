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

export const ClientMessageSchema = z.discriminatedUnion("type", [
  RegisterMessageSchema,
  UpdatePinMessageSchema,
  PingMessageSchema,
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
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// Safely parses a raw (JSON.parsed) server message payload.
// Returns the parsed message on success, null if validation fails.
// Callers never see malformed data (DEV-RULES §6 — fail-closed pattern).
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const parsed = ServerMessageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
