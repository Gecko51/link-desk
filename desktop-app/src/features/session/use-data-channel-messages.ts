import { useCallback, useEffect, useRef } from "react";
import { dataChannelMessageSchema } from "./message-types";
import type { DataChannelMessage } from "./message-types";

// ---------------------------------------------------------------------------
// Return type for the useDataChannelMessages hook.
// send   — serialize and send a typed message; returns false if channel not open.
// subscribe — register a handler for incoming validated messages; returns
//             an unsubscribe function the caller must invoke on cleanup.
// ---------------------------------------------------------------------------
export interface UseDataChannelMessagesReturn {
  send: (msg: DataChannelMessage) => boolean;
  subscribe: (handler: (msg: DataChannelMessage) => void) => () => void;
}

// ---------------------------------------------------------------------------
// useDataChannelMessages
//
// Wraps a raw RTCDataChannel with a typed, Zod-validated message layer.
// - Incoming raw strings are JSON-parsed then validated against the
//   dataChannelMessageSchema discriminated union. Invalid frames are
//   discarded with a console.warn (never thrown to callers).
// - Handlers are stored in a ref (Set) so adding/removing subscribers never
//   triggers React re-renders.
// - `send` and `subscribe` are memoised with useCallback to keep referential
//   stability across renders.
// ---------------------------------------------------------------------------
export function useDataChannelMessages(
  channel: RTCDataChannel | null,
): UseDataChannelMessagesReturn {
  // Persistent set of active subscriber callbacks — lives outside React state
  // so mutations don't cause re-renders.
  const handlersRef = useRef<Set<(msg: DataChannelMessage) => void>>(
    new Set(),
  );

  // Attach a single "message" listener to the channel.
  // Re-runs only when the channel reference changes (open / close / swap).
  useEffect(() => {
    if (!channel) return;

    const onMessage = (ev: Event) => {
      // Cast to MessageEvent to access `.data`; keep `unknown` for safety.
      const raw = (ev as MessageEvent<unknown>).data;

      // Binary frames (ArrayBuffer / Blob) are not part of our protocol — skip.
      if (typeof raw !== "string") return;

      try {
        const parsed = JSON.parse(raw) as unknown;
        // Zod validates the discriminated union — throws ZodError on mismatch.
        const msg = dataChannelMessageSchema.parse(parsed);

        // Dispatch the validated message to every active subscriber.
        for (const handler of handlersRef.current) {
          handler(msg);
        }
      } catch {
        // Log and discard; never propagate parse failures to callers.
        console.warn(
          "[linkdesk] invalid data channel message, ignoring",
          raw,
        );
      }
    };

    channel.addEventListener("message", onMessage);

    // Cleanup: remove the listener when the channel changes or component unmounts.
    return () => channel.removeEventListener("message", onMessage);
  }, [channel]);

  // Serialise a typed message to JSON and push it through the data channel.
  // Returns false (instead of throwing) when the channel is absent or not open,
  // so callers can handle the failure gracefully without try/catch.
  const send = useCallback(
    (msg: DataChannelMessage): boolean => {
      if (!channel || channel.readyState !== "open") return false;
      channel.send(JSON.stringify(msg));
      return true;
    },
    [channel],
  );

  // Register a handler that will receive every Zod-validated incoming message.
  // Returns a stable unsubscribe function — callers should invoke it in their
  // own useEffect cleanup to avoid stale-handler memory leaks.
  const subscribe = useCallback(
    (handler: (msg: DataChannelMessage) => void): (() => void) => {
      handlersRef.current.add(handler);
      return () => {
        handlersRef.current.delete(handler);
      };
    },
    // Empty dep array: the Set lives in a ref, so this function never needs
    // to be recreated.
    [],
  );

  return { send, subscribe };
}
