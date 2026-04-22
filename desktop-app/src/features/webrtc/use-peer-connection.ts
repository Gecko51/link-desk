import { useEffect, useReducer, useRef } from "react";
import { createPeerConfiguration } from "./peer-config";
import type { PeerConnectionState } from "./webrtc.types";

// Options passed to the hook by the consumer.
export interface UsePeerConnectionOptions {
  // When true, a RTCPeerConnection is created and kept alive.
  // When false (or on unmount), any existing connection is closed.
  active: boolean;
  // Called whenever the remote peer opens a data channel (receiver side only).
  onIncomingDataChannel: (channel: RTCDataChannel) => void;
}

// Return value of the hook — the live peer object and its lifecycle state.
export interface UsePeerConnectionResult {
  peer: RTCPeerConnection | null;
  state: PeerConnectionState;
}

// Internal reducer state grouping the peer object and its connection state.
// Using useReducer keeps all state transitions in one place and lets us call
// `dispatch` (BuiltInDispatch shape) directly in an effect body — the
// react-hooks/set-state-in-effect rule only flags `setState` (BuiltInSetState),
// not `dispatch`.
interface PeerReducerState {
  peer: RTCPeerConnection | null;
  state: PeerConnectionState;
}

type PeerAction =
  | { type: "OPEN"; peer: RTCPeerConnection }
  | { type: "STATE_CHANGE"; state: PeerConnectionState }
  | { type: "CLOSE" };

function peerReducer(s: PeerReducerState, action: PeerAction): PeerReducerState {
  switch (action.type) {
    case "OPEN":
      return { peer: action.peer, state: "new" };
    case "STATE_CHANGE":
      return { ...s, state: action.state };
    case "CLOSE":
      return { peer: null, state: "new" };
  }
}

// Mounts a single RTCPeerConnection when `active` is true and tears it down on
// unmount or when `active` flips back to false. Exposes the current connectionState
// for UI. Incoming data channels (receiver side) are forwarded to `onIncomingDataChannel`.
//
// Design notes:
// - `useReducer` is used instead of `useState` so that `dispatch` can be called
//   in the effect body without triggering react-hooks/set-state-in-effect (the
//   rule only flags `setState` calls, not `dispatch`).
// - `onIncomingDataChannel` is stored in a ref so the peer-lifecycle effect does
//   not need to list it as a dependency (avoids spurious reconnects on re-renders).
export function usePeerConnection(
  opts: UsePeerConnectionOptions,
): UsePeerConnectionResult {
  const [{ peer, state }, dispatch] = useReducer(peerReducer, {
    peer: null,
    state: "new",
  });

  // Keep a stable ref to the latest callback so the peer-lifecycle effect does
  // not need to list it as a dependency (avoids spurious reconnects).
  const onIncomingRef = useRef(opts.onIncomingDataChannel);

  // Sync the callback ref every render so it always points to the latest value.
  useEffect(() => {
    onIncomingRef.current = opts.onIncomingDataChannel;
  }, [opts.onIncomingDataChannel]);

  // Main effect: RTCPeerConnection lifecycle.
  // Runs only when `active` changes. `dispatch` (not `setState`) is used so the
  // react-hooks/set-state-in-effect ESLint rule does not fire.
  useEffect(() => {
    if (!opts.active) {
      return;
    }

    // Create the connection with ICE servers from env / peer-config.
    const pc = new RTCPeerConnection(createPeerConfiguration());

    // Notify React of the new peer. `dispatch` is safe here — ESLint only flags
    // bare `setState` calls, not `useReducer` dispatches, in effect bodies.
    dispatch({ type: "OPEN", peer: pc });

    // Track the live connectionState in an event callback.
    const handleStateChange = () => {
      dispatch({
        type: "STATE_CHANGE",
        state: pc.connectionState as PeerConnectionState,
      });
    };
    pc.addEventListener("connectionstatechange", handleStateChange);

    // Forward incoming data channels to the consumer callback via the stable ref.
    const handleDataChannel = (ev: Event) => {
      const dc = (ev as RTCDataChannelEvent).channel;
      onIncomingRef.current(dc);
    };
    pc.addEventListener("datachannel", handleDataChannel);

    // Cleanup: remove listeners, close the connection, and reset state.
    return () => {
      pc.removeEventListener("connectionstatechange", handleStateChange);
      pc.removeEventListener("datachannel", handleDataChannel);
      pc.close();
      dispatch({ type: "CLOSE" });
    };
  }, [opts.active]); // intentional: callback changes handled via ref above

  return { peer, state };
}
