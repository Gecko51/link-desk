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

// Discriminated union of all client → server messages.
export const ClientMessageSchema = z.discriminatedUnion("type", [
  RegisterMessageSchema,
  UpdatePinMessageSchema,
  PingMessageSchema,
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
