// Hook that subscribes to incoming data-channel messages on the host side
// and dispatches each one to the appropriate OS-level input injection command.
//
// Only active when `enabled` is true AND `screenMetadata` is available.
// This prevents injection before the session is fully established and before
// the host screen dimensions are known (which are needed for coordinate mapping).

import { useEffect } from "react";
import type { UseDataChannelMessagesReturn } from "@/features/session/use-data-channel-messages";
import type { ScreenMetadata } from "@/features/screen-capture/capture.types";
import type { DataChannelMessage } from "@/features/session/message-types";
import { ratioToPixel } from "./coord-mapper";
import { injectMouseEvent, injectKeyboardEvent } from "./inject-commands";

// Options accepted by the hook.
export interface UseInputInjectionOptions {
  // The typed message layer wrapping the RTCDataChannel.
  messages: UseDataChannelMessagesReturn;
  // Host screen info needed to convert ratio coordinates to physical pixels.
  // Null means the host hasn't received screen metadata yet — injection is
  // disabled until this is populated.
  screenMetadata: ScreenMetadata | null;
  // Master on/off switch. Set to false when the session is not in the
  // "connected" state to avoid injecting stale events.
  enabled: boolean;
  // Optional callback invoked when the controller sends a "disconnect" message,
  // allowing the host route to tear down the session gracefully.
  onDisconnectReceived?: () => void;
}

/**
 * Subscribes to the data channel and routes incoming messages to the correct
 * Tauri injection command.
 *
 * - "mouse_event"    → convert ratio coords to pixels, call injectMouseEvent
 * - "keyboard_event" → call injectKeyboardEvent directly
 * - "disconnect"     → call onDisconnectReceived callback if provided
 * - "screen_metadata" → ignored on the host side (host sends, doesn't consume)
 *
 * The subscription is cleaned up automatically when enabled/screenMetadata
 * change or when the component using this hook unmounts.
 */
export function useInputInjection(opts: UseInputInjectionOptions): void {
  const { enabled, screenMetadata, messages, onDisconnectReceived } = opts;

  useEffect(() => {
    if (!enabled || !screenMetadata) return;

    const screen = screenMetadata;

    const unsubscribe = messages.subscribe((msg: DataChannelMessage) => {
      switch (msg.type) {
        case "mouse_event": {
          // Convert normalised [0,1] ratios to physical pixel coordinates on
          // the host screen before forwarding to the OS injection layer.
          const coords = ratioToPixel(msg.x_ratio, msg.y_ratio, screen);
          // Fire-and-forget: inject errors are logged by the Rust layer; we
          // don't need to surface them individually in the UI here.
          void injectMouseEvent(coords, msg.button, msg.action, msg.scroll_delta);
          break;
        }
        case "keyboard_event": {
          void injectKeyboardEvent(msg.key, msg.code, msg.modifiers, msg.action);
          break;
        }
        case "disconnect": {
          onDisconnectReceived?.();
          break;
        }
        case "screen_metadata":
          // The host is the sender of screen_metadata, not the consumer.
          // Silently ignore if a malformed session somehow echoes it back.
          break;
      }
    });

    // Clean up the subscription when enabled/screenMetadata/messages change
    // or when the component unmounts.
    return unsubscribe;
  }, [enabled, screenMetadata, messages, onDisconnectReceived]);
}
