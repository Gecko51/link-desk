// Hook that captures mouse and keyboard events on the controller side and
// forwards them as typed data-channel messages to the host.
//
// Events are attached to the <video> element that displays the host screen.
// Keyboard events are attached to the window because the video element does
// not receive focus-based keyboard events in all browsers.

import { useEffect, useRef, type RefObject } from "react";
import type { UseDataChannelMessagesReturn } from "@/features/session/use-data-channel-messages";
import { mapMouseEvent, mapWheelEvent, mapKeyboardEvent } from "./event-mapper";
import { MOUSE_THROTTLE_MS } from "./input.types";

// Options accepted by the hook.
export interface UseInputCaptureOptions {
  // Ref to the <video> element rendering the host's screen.
  // Used both as the event target and as the coordinate reference for
  // computing normalised x_ratio / y_ratio values.
  videoRef: RefObject<HTMLVideoElement | null>;
  // Typed message layer over the RTCDataChannel — provides the `send` method.
  messages: UseDataChannelMessagesReturn;
  // Master switch: attach/detach listeners based on session state.
  // False = no listeners registered (avoids sending events when not connected).
  enabled: boolean;
}

/**
 * Attaches input listeners to the video element and the window, then sends
 * each captured event to the host via the data channel.
 *
 * Mouse throttling:
 *   Only "move" events are throttled to MOUSE_THROTTLE_MS (≈ 60 Hz).
 *   "down" and "up" events are always sent immediately for responsiveness.
 *
 * Keyboard handling:
 *   Listeners are on `window` to capture keys regardless of focus.
 *   `e.preventDefault()` suppresses default browser shortcuts (Ctrl+W, etc.)
 *   while the controller is active.
 *
 * Context menu + wheel:
 *   Right-click context menu is suppressed (we want the right-click event,
 *   not the browser menu). Wheel events use `passive: false` so we can call
 *   `preventDefault()` and prevent page scrolling in the webview.
 *
 * All listeners are removed in the effect cleanup when `enabled` becomes false
 * or when the component unmounts.
 */
export function useInputCapture(opts: UseInputCaptureOptions): void {
  const { videoRef, messages, enabled } = opts;
  // Tracks the timestamp of the last sent mouse-move event for throttling.
  // Stored in a ref (not state) so updates don't trigger re-renders.
  const lastMouseTimeRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    // Guard: do nothing if disabled or if the video element isn't mounted yet.
    if (!enabled || !video) return;

    // Helper: send a mouse event while respecting the 60Hz throttle for moves.
    const sendMouseThrottled = (
      e: MouseEvent,
      action: "move" | "down" | "up",
    ) => {
      const now = performance.now();
      // Skip move events that arrive faster than the throttle window.
      // down / up events bypass the throttle for accurate click timing.
      if (action === "move" && now - lastMouseTimeRef.current < MOUSE_THROTTLE_MS)
        return;
      lastMouseTimeRef.current = now;
      messages.send(mapMouseEvent(e, video, action));
    };

    // Individual listener functions are defined as named consts so they can be
    // passed to both addEventListener and removeEventListener as the same reference.
    const onMouseMove = (e: MouseEvent) => sendMouseThrottled(e, "move");
    const onMouseDown = (e: MouseEvent) => sendMouseThrottled(e, "down");
    const onMouseUp = (e: MouseEvent) => sendMouseThrottled(e, "up");

    const onWheel = (e: WheelEvent) => {
      // Prevent the webview from scrolling while the controller is active.
      e.preventDefault();
      messages.send(mapWheelEvent(e, video));
    };

    // Suppress the right-click context menu so it doesn't interfere with
    // right-click actions being forwarded to the host.
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      // Block default browser shortcuts (e.g., Ctrl+W closing the tab) while
      // keyboard events are being forwarded to the remote host.
      e.preventDefault();
      messages.send(mapKeyboardEvent(e, "down"));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      messages.send(mapKeyboardEvent(e, "up"));
    };

    // Attach mouse/wheel/context-menu listeners to the video element.
    // { passive: false } on the wheel listener allows e.preventDefault().
    video.addEventListener("mousemove", onMouseMove);
    video.addEventListener("mousedown", onMouseDown);
    video.addEventListener("mouseup", onMouseUp);
    video.addEventListener("wheel", onWheel, { passive: false });
    video.addEventListener("contextmenu", onContextMenu);

    // Keyboard listeners go on the window so key events are captured even when
    // the video element itself is not the focused element.
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Cleanup: remove every listener when enabled toggles off, the video ref
    // changes, or the component using this hook unmounts.
    return () => {
      video.removeEventListener("mousemove", onMouseMove);
      video.removeEventListener("mousedown", onMouseDown);
      video.removeEventListener("mouseup", onMouseUp);
      video.removeEventListener("wheel", onWheel);
      video.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [enabled, videoRef, messages]);
}
