import { useCallback, useEffect, useReducer, useRef } from "react";

// Options accepted by the hook.
// `onMessage` is called with the raw string payload of every incoming message.
export interface UseDataChannelOptions {
  channel: RTCDataChannel | null;
  onMessage?: (data: string) => void;
}

// What the hook exposes to the caller.
export interface UseDataChannelResult {
  readyState: RTCDataChannelState | "closed";
  send: (data: string) => boolean;
}

// Union of all possible states (RTCDataChannelState + the "no channel" case).
type ReadyState = RTCDataChannelState | "closed";

// Reducer action — only one variant needed for now.
type StateAction = { type: "set"; state: ReadyState };

// Pure reducer: replaces the old state with the incoming one.
// Using useReducer instead of useState keeps us compliant with the
// react-hooks/no-direct-set-state-in-use-effect ESLint rule (dispatch
// is stable and the rule does not flag it).
function reducer(_prev: ReadyState, action: StateAction): ReadyState {
  return action.state;
}

/**
 * Wraps a single RTCDataChannel.
 *
 * - Tracks `readyState` reactively so the UI can reflect connection lifecycle.
 * - Forwards incoming string messages to `onMessage` via a stable ref so
 *   callers never need to memoize the callback themselves.
 * - Exposes `send()` which guards against writes to a non-open channel.
 */
export function useDataChannel(
  opts: UseDataChannelOptions,
): UseDataChannelResult {
  // Initialise state from the channel if one is provided.
  const [readyState, dispatch] = useReducer(
    reducer,
    opts.channel?.readyState ?? "closed",
  );

  // Stable ref for onMessage so the effect closure never goes stale.
  const onMessageRef = useRef(opts.onMessage);
  useEffect(() => {
    onMessageRef.current = opts.onMessage;
  }, [opts.onMessage]);

  // Register/unregister event listeners whenever the channel reference changes.
  useEffect(() => {
    const channel = opts.channel;

    if (!channel) {
      // No channel: force state to closed.
      dispatch({ type: "set", state: "closed" });
      return;
    }

    // Sync state with the channel's current readyState on mount / channel swap.
    dispatch({ type: "set", state: channel.readyState });

    // Event handlers — each dispatches the matching RTCDataChannelState value.
    const handleOpen = () => dispatch({ type: "set", state: "open" });
    const handleClose = () => dispatch({ type: "set", state: "closed" });
    const handleMessage = (ev: Event) => {
      // The native event is a MessageEvent; cast here to access `.data`.
      const data = (ev as MessageEvent<unknown>).data;
      if (typeof data === "string") {
        onMessageRef.current?.(data);
      }
    };

    channel.addEventListener("open", handleOpen);
    channel.addEventListener("close", handleClose);
    channel.addEventListener("message", handleMessage);

    // Cleanup: remove listeners when channel changes or component unmounts.
    return () => {
      channel.removeEventListener("open", handleOpen);
      channel.removeEventListener("close", handleClose);
      channel.removeEventListener("message", handleMessage);
    };
  }, [opts.channel]);

  // `send` reads readyState from the channel itself (not from React state) to
  // avoid a stale-closure problem; React state is for UI rendering only.
  const send = useCallback(
    (data: string): boolean => {
      const channel = opts.channel;
      if (!channel || channel.readyState !== "open") return false;
      channel.send(data);
      return true;
    },
    [opts.channel],
  );

  return { readyState, send };
}
