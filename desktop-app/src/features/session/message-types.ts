import { z } from "zod";

// ---------------------------------------------------------------------------
// Mouse Event Schema
// Represents a mouse action sent from controller to host over the data channel.
// x_ratio and y_ratio are normalized coordinates in [0, 1] so they are
// resolution-independent (host scales them to its actual screen dimensions).
// ---------------------------------------------------------------------------
export const mouseEventSchema = z.object({
  type: z.literal("mouse_event"),
  // Horizontal position as a fraction of screen width (0 = left, 1 = right)
  x_ratio: z.number().min(0).max(1),
  // Vertical position as a fraction of screen height (0 = top, 1 = bottom)
  y_ratio: z.number().min(0).max(1),
  // Which mouse button is involved in this event
  button: z.enum(["left", "right", "middle"]),
  // Type of mouse action
  action: z.enum(["move", "down", "up", "scroll"]),
  // Number of scroll ticks (positive = down, negative = up). Only relevant
  // when action === "scroll", but kept optional on all events for simplicity.
  scroll_delta: z.number().optional(),
});

export type MouseEvent = z.infer<typeof mouseEventSchema>;

// ---------------------------------------------------------------------------
// Keyboard Event Schema
// Represents a key press/release sent from controller to host.
// Uses the Web KeyboardEvent naming convention (key + code) so the Rust
// input-injection layer can map them to OS-level keycodes.
// ---------------------------------------------------------------------------
export const keyboardEventSchema = z.object({
  type: z.literal("keyboard_event"),
  // Printable character or key name (e.g., "a", "Enter", "ArrowLeft")
  key: z.string(),
  // Physical key identifier (e.g., "KeyA", "Enter", "ArrowLeft")
  code: z.string(),
  // Active modifier keys at the time of the event
  modifiers: z.object({
    ctrl: z.boolean(),
    alt: z.boolean(),
    shift: z.boolean(),
    meta: z.boolean(),
  }),
  // Whether the key is being pressed down or released
  action: z.enum(["down", "up"]),
});

export type KeyboardEvent = z.infer<typeof keyboardEventSchema>;

// ---------------------------------------------------------------------------
// Screen Metadata Schema
// Sent by the host immediately after the data channel opens so the controller
// knows the host screen dimensions and can compute correct x_ratio/y_ratio.
// ---------------------------------------------------------------------------
export const screenMetadataSchema = z.object({
  type: z.literal("screen_metadata"),
  // Screen width in physical pixels (positive integer)
  width: z.number().int().positive(),
  // Screen height in physical pixels (positive integer)
  height: z.number().int().positive(),
  // DPI scale factor (e.g., 1.0 for 96 dpi, 2.0 for HiDPI/Retina)
  scale_factor: z.number().positive(),
});

export type ScreenMetadata = z.infer<typeof screenMetadataSchema>;

// ---------------------------------------------------------------------------
// Disconnect Schema
// Sent by either peer to signal a clean session termination over the data
// channel before closing the RTCPeerConnection.
// ---------------------------------------------------------------------------
export const disconnectSchema = z.object({
  type: z.literal("disconnect"),
  // Why the session is ending — used for UI feedback on the remote side
  reason: z.enum(["user_request", "timeout", "error"]),
});

export type DisconnectMessage = z.infer<typeof disconnectSchema>;

// ---------------------------------------------------------------------------
// DataChannelMessage — discriminated union
// All messages exchanged over the WebRTC data channel must match one of these
// shapes. Validation happens at the boundary (onmessage handler) using
// dataChannelMessageSchema.safeParse(JSON.parse(event.data)).
// ---------------------------------------------------------------------------
export const dataChannelMessageSchema = z.discriminatedUnion("type", [
  mouseEventSchema,
  keyboardEventSchema,
  screenMetadataSchema,
  disconnectSchema,
]);

export type DataChannelMessage = z.infer<typeof dataChannelMessageSchema>;
