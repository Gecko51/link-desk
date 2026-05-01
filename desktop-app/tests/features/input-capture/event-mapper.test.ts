import { describe, it, expect } from "vitest";
import { mapMouseEvent, mapWheelEvent, mapKeyboardEvent } from "@/features/input-capture/event-mapper";

// Helper: create a minimal mock for HTMLVideoElement (only the fields we need).
// TypeScript cast avoids constructing a real HTMLVideoElement in jsdom.
function makeVideo(clientWidth: number, clientHeight: number): HTMLVideoElement {
  return { clientWidth, clientHeight } as HTMLVideoElement;
}

// Helper: create a minimal MouseEvent mock.
// The real MouseEvent constructor doesn't set offsetX/offsetY from init options,
// so we build a plain object cast to MouseEvent.
function makeMouseEvent(offsetX: number, offsetY: number, button = 0): MouseEvent {
  return { offsetX, offsetY, button } as unknown as MouseEvent;
}

// Helper: create a minimal WheelEvent mock.
function makeWheelEvent(offsetX: number, offsetY: number, deltaY: number): WheelEvent {
  return { offsetX, offsetY, button: 0, deltaY } as unknown as WheelEvent;
}

// Helper: create a minimal KeyboardEvent mock.
function makeKeyboardEvent(
  key: string,
  code: string,
  opts: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    code,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
    metaKey: opts.metaKey ?? false,
  } as unknown as KeyboardEvent;
}

// ─── Mouse Events ─────────────────────────────────────────────────────────────

describe("mapMouseEvent", () => {
  it("center click → ratio 0.5 / 0.5", () => {
    const video = makeVideo(200, 100);
    const event = makeMouseEvent(100, 50, 0);
    const result = mapMouseEvent(event, video, "down");
    expect(result.type).toBe("mouse_event");
    expect(result.x_ratio).toBe(0.5);
    expect(result.y_ratio).toBe(0.5);
    expect(result.action).toBe("down");
    expect(result.button).toBe("left");
  });

  it("top-left click → ratio 0 / 0", () => {
    const video = makeVideo(200, 100);
    const event = makeMouseEvent(0, 0, 0);
    const result = mapMouseEvent(event, video, "down");
    expect(result.x_ratio).toBe(0);
    expect(result.y_ratio).toBe(0);
  });

  it("right click → button 'right'", () => {
    const video = makeVideo(200, 100);
    const event = makeMouseEvent(100, 50, 2);
    const result = mapMouseEvent(event, video, "down");
    expect(result.button).toBe("right");
  });

  it("middle click → button 'middle'", () => {
    const video = makeVideo(200, 100);
    const event = makeMouseEvent(100, 50, 1);
    const result = mapMouseEvent(event, video, "down");
    expect(result.button).toBe("middle");
  });

  it("negative offsetX is clamped to 0", () => {
    const video = makeVideo(200, 100);
    const event = makeMouseEvent(-10, 50, 0);
    const result = mapMouseEvent(event, video, "move");
    expect(result.x_ratio).toBe(0);
  });

  it("negative offsetY is clamped to 0", () => {
    const video = makeVideo(200, 100);
    const event = makeMouseEvent(100, -5, 0);
    const result = mapMouseEvent(event, video, "move");
    expect(result.y_ratio).toBe(0);
  });

  it("offsetX beyond clientWidth is clamped to 1", () => {
    const video = makeVideo(200, 100);
    const event = makeMouseEvent(250, 50, 0);
    const result = mapMouseEvent(event, video, "move");
    expect(result.x_ratio).toBe(1);
  });

  it("offsetY beyond clientHeight is clamped to 1", () => {
    const video = makeVideo(200, 100);
    const event = makeMouseEvent(100, 150, 0);
    const result = mapMouseEvent(event, video, "move");
    expect(result.y_ratio).toBe(1);
  });

  it("mouse up action is preserved", () => {
    const video = makeVideo(200, 100);
    const event = makeMouseEvent(100, 50, 0);
    const result = mapMouseEvent(event, video, "up");
    expect(result.action).toBe("up");
  });
});

// ─── Wheel Events ─────────────────────────────────────────────────────────────

describe("mapWheelEvent", () => {
  it("returns type mouse_event with action scroll and scroll_delta", () => {
    const video = makeVideo(200, 100);
    const event = makeWheelEvent(100, 50, 120);
    const result = mapWheelEvent(event, video);
    expect(result.type).toBe("mouse_event");
    expect(result.action).toBe("scroll");
    expect(result.scroll_delta).toBe(120);
  });

  it("negative deltaY is preserved as-is", () => {
    const video = makeVideo(200, 100);
    const event = makeWheelEvent(100, 50, -240);
    const result = mapWheelEvent(event, video);
    expect(result.scroll_delta).toBe(-240);
  });

  it("position ratios are still computed for wheel events", () => {
    const video = makeVideo(400, 200);
    const event = makeWheelEvent(200, 100, 60);
    const result = mapWheelEvent(event, video);
    expect(result.x_ratio).toBe(0.5);
    expect(result.y_ratio).toBe(0.5);
  });
});

// ─── Keyboard Events ──────────────────────────────────────────────────────────

describe("mapKeyboardEvent", () => {
  it("simple key down — letter a", () => {
    const event = makeKeyboardEvent("a", "KeyA");
    const result = mapKeyboardEvent(event, "down");
    expect(result.type).toBe("keyboard_event");
    expect(result.key).toBe("a");
    expect(result.code).toBe("KeyA");
    expect(result.action).toBe("down");
    expect(result.modifiers.ctrl).toBe(false);
    expect(result.modifiers.shift).toBe(false);
    expect(result.modifiers.alt).toBe(false);
    expect(result.modifiers.meta).toBe(false);
  });

  it("Ctrl+C — ctrl modifier is true", () => {
    const event = makeKeyboardEvent("c", "KeyC", { ctrlKey: true });
    const result = mapKeyboardEvent(event, "down");
    expect(result.modifiers.ctrl).toBe(true);
    expect(result.modifiers.shift).toBe(false);
  });

  it("special key Enter", () => {
    const event = makeKeyboardEvent("Enter", "Enter");
    const result = mapKeyboardEvent(event, "down");
    expect(result.key).toBe("Enter");
    expect(result.code).toBe("Enter");
  });

  it("key up action is preserved", () => {
    const event = makeKeyboardEvent("a", "KeyA");
    const result = mapKeyboardEvent(event, "up");
    expect(result.action).toBe("up");
  });

  it("Shift+A — shift modifier is true", () => {
    const event = makeKeyboardEvent("A", "KeyA", { shiftKey: true });
    const result = mapKeyboardEvent(event, "down");
    expect(result.modifiers.shift).toBe(true);
    expect(result.modifiers.ctrl).toBe(false);
  });

  it("Alt+F4 — alt modifier is true", () => {
    const event = makeKeyboardEvent("F4", "F4", { altKey: true });
    const result = mapKeyboardEvent(event, "down");
    expect(result.modifiers.alt).toBe(true);
  });

  it("Meta key — meta modifier is true", () => {
    const event = makeKeyboardEvent("Meta", "MetaLeft", { metaKey: true });
    const result = mapKeyboardEvent(event, "down");
    expect(result.modifiers.meta).toBe(true);
  });
});
