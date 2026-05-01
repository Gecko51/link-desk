// Pure functions that convert DOM events into typed data-channel messages.
// These are intentionally side-effect-free so they can be tested in isolation.
//
// Return types are derived from the Zod schemas in message-types.ts so that
// any schema change is automatically reflected here at compile time.

import type {
  MouseEvent as DCMouseEvent,
  KeyboardEvent as DCKeyboardEvent,
} from "@/features/session/message-types";
import type { MouseAction, MouseButton, KeyAction } from "./input.types";

// Re-export so callers can reference the return types without importing
// from two different places.
export type { DCMouseEvent, DCKeyboardEvent };

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Clamp a number between min and max (inclusive).
 * Used to guarantee ratios never escape the [0, 1] range even when the cursor
 * drifts slightly outside the video element boundaries.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Map DOM button index to a typed MouseButton string.
 * DOM spec: 0 = primary (left), 1 = auxiliary (middle), 2 = secondary (right).
 */
function mapButton(button: number): MouseButton {
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return "left"; // 0 and any unknown value default to left
}

/**
 * Compute normalised [0, 1] position ratios from pixel offsets relative to
 * the video element's rendered dimensions.
 */
function computeRatios(
  offsetX: number,
  offsetY: number,
  video: HTMLVideoElement,
): { x_ratio: number; y_ratio: number } {
  const x_ratio = clamp(offsetX / video.clientWidth, 0, 1);
  const y_ratio = clamp(offsetY / video.clientHeight, 0, 1);
  return { x_ratio, y_ratio };
}

// ─── Public mappers ───────────────────────────────────────────────────────────

/**
 * Convert a DOM MouseEvent into a data-channel mouse message.
 *
 * @param e      - The original DOM MouseEvent (from the <video> element listener).
 * @param video  - The <video> element used as coordinate reference.
 * @param action - Whether this is a move, down, or up event (caller decides).
 * @returns      A typed DCMouseEvent ready to be JSON-serialised and sent.
 */
export function mapMouseEvent(
  e: MouseEvent,
  video: HTMLVideoElement,
  action: Exclude<MouseAction, "scroll">,
): DCMouseEvent {
  const { x_ratio, y_ratio } = computeRatios(e.offsetX, e.offsetY, video);
  return {
    type: "mouse_event",
    x_ratio,
    y_ratio,
    button: mapButton(e.button),
    action,
  };
}

/**
 * Convert a DOM WheelEvent into a data-channel scroll message.
 * scroll_delta uses the raw deltaY value — positive = scroll down, negative = scroll up.
 * The host side applies its own speed/scaling when injecting the scroll.
 *
 * @param e     - The original DOM WheelEvent.
 * @param video - The <video> element used as coordinate reference.
 * @returns     A DCMouseEvent with action "scroll" and scroll_delta populated.
 */
export function mapWheelEvent(e: WheelEvent, video: HTMLVideoElement): DCMouseEvent {
  const { x_ratio, y_ratio } = computeRatios(e.offsetX, e.offsetY, video);
  return {
    type: "mouse_event",
    x_ratio,
    y_ratio,
    button: mapButton(e.button),
    action: "scroll",
    scroll_delta: e.deltaY,
  };
}

/**
 * Convert a DOM KeyboardEvent into a data-channel keyboard message.
 * All four common modifiers are captured; the host recreates the key combo exactly.
 *
 * @param e      - The original DOM KeyboardEvent.
 * @param action - Whether this is a key-down or key-up event.
 * @returns      A typed DCKeyboardEvent ready to be JSON-serialised and sent.
 */
export function mapKeyboardEvent(e: KeyboardEvent, action: KeyAction): DCKeyboardEvent {
  return {
    type: "keyboard_event",
    key: e.key,
    code: e.code,
    modifiers: {
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
    },
    action,
  };
}
