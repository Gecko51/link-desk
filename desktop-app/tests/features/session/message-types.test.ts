import { describe, it, expect } from "vitest";
import {
  mouseEventSchema,
  keyboardEventSchema,
  screenMetadataSchema,
  disconnectSchema,
  dataChannelMessageSchema,
} from "@/features/session/message-types";

// ---------------------------------------------------------------------------
// MouseEvent
// ---------------------------------------------------------------------------
describe("mouseEventSchema", () => {
  it("accepts a valid move event", () => {
    const result = mouseEventSchema.safeParse({
      type: "mouse_event",
      x_ratio: 0.5,
      y_ratio: 0.25,
      button: "left",
      action: "move",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a scroll event with scroll_delta", () => {
    const result = mouseEventSchema.safeParse({
      type: "mouse_event",
      x_ratio: 0.0,
      y_ratio: 1.0,
      button: "middle",
      action: "scroll",
      scroll_delta: -3,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.scroll_delta).toBe(-3);
  });

  it("scroll_delta is optional (defaults to undefined)", () => {
    const result = mouseEventSchema.safeParse({
      type: "mouse_event",
      x_ratio: 0.5,
      y_ratio: 0.5,
      button: "right",
      action: "down",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.scroll_delta).toBeUndefined();
  });

  it("rejects x_ratio below 0", () => {
    const result = mouseEventSchema.safeParse({
      type: "mouse_event",
      x_ratio: -0.1,
      y_ratio: 0.5,
      button: "left",
      action: "move",
    });
    expect(result.success).toBe(false);
  });

  it("rejects x_ratio above 1", () => {
    const result = mouseEventSchema.safeParse({
      type: "mouse_event",
      x_ratio: 1.001,
      y_ratio: 0.5,
      button: "left",
      action: "move",
    });
    expect(result.success).toBe(false);
  });

  it("rejects y_ratio below 0", () => {
    const result = mouseEventSchema.safeParse({
      type: "mouse_event",
      x_ratio: 0.5,
      y_ratio: -0.001,
      button: "left",
      action: "move",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown button value", () => {
    const result = mouseEventSchema.safeParse({
      type: "mouse_event",
      x_ratio: 0.5,
      y_ratio: 0.5,
      button: "extra",
      action: "move",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown action value", () => {
    const result = mouseEventSchema.safeParse({
      type: "mouse_event",
      x_ratio: 0.5,
      y_ratio: 0.5,
      button: "left",
      action: "click",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required field (action)", () => {
    const result = mouseEventSchema.safeParse({
      type: "mouse_event",
      x_ratio: 0.5,
      y_ratio: 0.5,
      button: "left",
    });
    expect(result.success).toBe(false);
  });

  it("rejects wrong type discriminant", () => {
    const result = mouseEventSchema.safeParse({
      type: "keyboard_event",
      x_ratio: 0.5,
      y_ratio: 0.5,
      button: "left",
      action: "move",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// KeyboardEvent
// ---------------------------------------------------------------------------
describe("keyboardEventSchema", () => {
  it("accepts a valid key down event", () => {
    const result = keyboardEventSchema.safeParse({
      type: "keyboard_event",
      key: "a",
      code: "KeyA",
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      action: "down",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a key up event with modifiers", () => {
    const result = keyboardEventSchema.safeParse({
      type: "keyboard_event",
      key: "A",
      code: "KeyA",
      modifiers: { ctrl: false, alt: false, shift: true, meta: false },
      action: "up",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.modifiers.shift).toBe(true);
  });

  it("rejects missing key field", () => {
    const result = keyboardEventSchema.safeParse({
      type: "keyboard_event",
      code: "KeyA",
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      action: "down",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean modifier", () => {
    const result = keyboardEventSchema.safeParse({
      type: "keyboard_event",
      key: "a",
      code: "KeyA",
      modifiers: { ctrl: "yes", alt: false, shift: false, meta: false },
      action: "down",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown action (press)", () => {
    const result = keyboardEventSchema.safeParse({
      type: "keyboard_event",
      key: "a",
      code: "KeyA",
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      action: "press",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing modifiers object", () => {
    const result = keyboardEventSchema.safeParse({
      type: "keyboard_event",
      key: "a",
      code: "KeyA",
      action: "down",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScreenMetadata
// ---------------------------------------------------------------------------
describe("screenMetadataSchema", () => {
  it("accepts valid screen metadata", () => {
    const result = screenMetadataSchema.safeParse({
      type: "screen_metadata",
      width: 1920,
      height: 1080,
      scale_factor: 1.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(1920);
      expect(result.data.scale_factor).toBe(1.5);
    }
  });

  it("rejects width = 0 (must be positive)", () => {
    const result = screenMetadataSchema.safeParse({
      type: "screen_metadata",
      width: 0,
      height: 1080,
      scale_factor: 1.0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative height", () => {
    const result = screenMetadataSchema.safeParse({
      type: "screen_metadata",
      width: 1920,
      height: -100,
      scale_factor: 1.0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects float width (must be integer)", () => {
    const result = screenMetadataSchema.safeParse({
      type: "screen_metadata",
      width: 1920.5,
      height: 1080,
      scale_factor: 1.0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects scale_factor = 0 (must be positive)", () => {
    const result = screenMetadataSchema.safeParse({
      type: "screen_metadata",
      width: 1920,
      height: 1080,
      scale_factor: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative scale_factor", () => {
    const result = screenMetadataSchema.safeParse({
      type: "screen_metadata",
      width: 1920,
      height: 1080,
      scale_factor: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing scale_factor", () => {
    const result = screenMetadataSchema.safeParse({
      type: "screen_metadata",
      width: 1920,
      height: 1080,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DisconnectMessage
// ---------------------------------------------------------------------------
describe("disconnectSchema", () => {
  it("accepts user_request reason", () => {
    const result = disconnectSchema.safeParse({
      type: "disconnect",
      reason: "user_request",
    });
    expect(result.success).toBe(true);
  });

  it("accepts timeout reason", () => {
    const result = disconnectSchema.safeParse({
      type: "disconnect",
      reason: "timeout",
    });
    expect(result.success).toBe(true);
  });

  it("accepts error reason", () => {
    const result = disconnectSchema.safeParse({
      type: "disconnect",
      reason: "error",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown reason", () => {
    const result = disconnectSchema.safeParse({
      type: "disconnect",
      reason: "kicked",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing reason", () => {
    const result = disconnectSchema.safeParse({
      type: "disconnect",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DataChannelMessage — discriminated union routing
// ---------------------------------------------------------------------------
describe("dataChannelMessageSchema (discriminated union)", () => {
  it("routes mouse_event to mouseEventSchema", () => {
    const result = dataChannelMessageSchema.safeParse({
      type: "mouse_event",
      x_ratio: 0.5,
      y_ratio: 0.5,
      button: "left",
      action: "move",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("mouse_event");
  });

  it("routes keyboard_event to keyboardEventSchema", () => {
    const result = dataChannelMessageSchema.safeParse({
      type: "keyboard_event",
      key: "Enter",
      code: "Enter",
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      action: "up",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("keyboard_event");
  });

  it("routes screen_metadata to screenMetadataSchema", () => {
    const result = dataChannelMessageSchema.safeParse({
      type: "screen_metadata",
      width: 2560,
      height: 1440,
      scale_factor: 2.0,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("screen_metadata");
  });

  it("routes disconnect to disconnectSchema", () => {
    const result = dataChannelMessageSchema.safeParse({
      type: "disconnect",
      reason: "error",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe("disconnect");
  });

  it("rejects unknown type discriminant", () => {
    const result = dataChannelMessageSchema.safeParse({
      type: "video_frame",
      data: "base64...",
    });
    expect(result.success).toBe(false);
  });

  it("rejects entirely invalid payload (null)", () => {
    const result = dataChannelMessageSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("rejects payload with valid type but invalid fields", () => {
    // x_ratio out of range → should fail even though type is recognized
    const result = dataChannelMessageSchema.safeParse({
      type: "mouse_event",
      x_ratio: 2.0,
      y_ratio: 0.5,
      button: "left",
      action: "move",
    });
    expect(result.success).toBe(false);
  });
});
