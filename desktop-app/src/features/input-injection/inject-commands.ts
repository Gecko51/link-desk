// Typed wrappers around Tauri commands for OS-level input injection.
// All calls go through tauriInvoke (DEV-RULES §5: no raw invoke() allowed).
// The Rust side validates the values and translates them to OS-level events
// via the platform input-injection APIs (enigo or similar).

import { tauriInvoke } from "@/lib/tauri";
import type { PixelCoords } from "./coord-mapper";
import type {
  MouseAction,
  MouseButton,
  KeyAction,
} from "@/features/input-capture/input.types";

/**
 * Ask the Rust backend to synthesize a mouse event at the given screen position.
 *
 * @param coords      - Physical pixel coordinates on the host screen (after DPI scaling).
 * @param button      - Which mouse button is involved ("left" | "right" | "middle").
 * @param action      - The kind of event to inject ("move" | "down" | "up" | "scroll").
 * @param scrollDelta - Scroll distance in pixels (positive = down). Only relevant
 *                      when action === "scroll"; omit or pass undefined otherwise.
 */
export async function injectMouseEvent(
  coords: PixelCoords,
  button: MouseButton,
  action: MouseAction,
  scrollDelta?: number,
): Promise<void> {
  // snake_case keys match the Rust command parameter names (serde rename default).
  await tauriInvoke("inject_mouse_event", {
    x: coords.x,
    y: coords.y,
    button,
    action,
    scroll_delta: scrollDelta,
  });
}

/**
 * Ask the Rust backend to synthesize a keyboard event.
 *
 * @param key       - Logical key value (e.g. "a", "Enter", "ArrowLeft").
 * @param code      - Physical key code (e.g. "KeyA", "Enter").
 * @param modifiers - State of the four common modifier keys at event time.
 * @param action    - "down" (key press) or "up" (key release).
 */
export async function injectKeyboardEvent(
  key: string,
  code: string,
  modifiers: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean },
  action: KeyAction,
): Promise<void> {
  await tauriInvoke("inject_keyboard_event", { key, code, modifiers, action });
}
