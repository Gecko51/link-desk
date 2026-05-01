// Types for mouse and keyboard input actions captured from DOM events.
// These map directly to what the controller sends over the WebRTC data channel.

/** Possible mouse interaction types. */
export type MouseAction = "move" | "down" | "up" | "scroll";

/** Mouse button identifiers (matches DOM button indices 0/1/2). */
export type MouseButton = "left" | "right" | "middle";

/** Keyboard key press direction. */
export type KeyAction = "down" | "up";

/**
 * Target capture frequency for mouse move events.
 * 16ms ≈ 60Hz — matches typical monitor refresh rate to avoid flooding the data channel.
 */
export const MOUSE_THROTTLE_MS = 16; // ~60Hz
