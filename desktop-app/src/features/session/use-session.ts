import { useCallback, useEffect, useReducer, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { sessionReducer, initialSessionStatus } from "./session-state-machine";
import type { SessionEvent, SessionStatus } from "./session.types";
import type { SignalingApi } from "@/features/signaling/signaling.types";
import { usePeerConnection } from "@/features/webrtc/use-peer-connection";
import { useDataChannel } from "@/features/webrtc/use-data-channel";
import {
  createOfferWithCompleteIce,
  createAnswerWithCompleteIce,
} from "@/features/webrtc/offer-answer";
import { tauriInvoke } from "@/lib/tauri";

// ------------------------------------------------------------------
// Options + return type
// ------------------------------------------------------------------

export interface UseSessionOptions {
  machineId: string | null;
  signaling: SignalingApi;
}

export interface UseSessionApi {
  status: SessionStatus;
  lastMessage: string | null;
  // Controller: initiates a connection using the remote host's PIN.
  requestConnect: (targetPin: string) => void;
  // Sends a raw string over the open data channel. Returns false if not ready.
  sendMessage: (data: string) => boolean;
  // Ends the session (both roles).
  endSession: () => void;
}

// ------------------------------------------------------------------
// Internal micro-reducers (useReducer replaces useState so dispatch can
// be called inside effects without triggering react-hooks/set-state-in-effect).
// ------------------------------------------------------------------

const DATA_CHANNEL_LABEL = "linkdesk-phase3";
const CONSENT_TIMEOUT_SECS = 30;

type ChannelAction = { type: "set"; channel: RTCDataChannel | null };

function channelReducer(
  _prev: RTCDataChannel | null,
  action: ChannelAction,
): RTCDataChannel | null {
  return action.channel;
}

type MessageAction = { type: "received"; data: string };

function messageReducer(_prev: string | null, action: MessageAction): string | null {
  return action.data;
}

// ------------------------------------------------------------------
// Helpers (module-level to keep useSession body under 40 lines/fn).
// ------------------------------------------------------------------

// Host side: applies the incoming SDP offer and replies with an answer.
async function handleIncomingSdpOffer(
  peer: RTCPeerConnection | null,
  sdp: RTCSessionDescriptionInit,
  signaling: SignalingApi,
  sessionId: string,
): Promise<void> {
  if (!peer) return;
  await peer.setRemoteDescription(sdp);
  const answer = await createAnswerWithCompleteIce(peer);
  signaling.send({ type: "sdp_answer", session_id: sessionId, sdp: answer });
}

// Controller side: applies the incoming SDP answer and dispatches peer_connected.
async function handleIncomingSdpAnswer(
  peer: RTCPeerConnection | null,
  sdp: RTCSessionDescriptionInit,
  sessionId: string,
  dispatch: (event: SessionEvent) => void,
): Promise<void> {
  if (!peer) return;
  await peer.setRemoteDescription(sdp);
  dispatch({ type: "peer_connected", sessionId });
}

// ------------------------------------------------------------------
// Orchestrator hook
// ------------------------------------------------------------------

// Orchestrates the full WebRTC session lifecycle:
// 1. Subscribes to server messages via signaling.onMessage.
// 2. Drives the pure sessionReducer state machine.
// 3. Shows the native consent dialog on the host side.
// 4. Creates the SDP offer and data channel on the controller side.
// 5. Navigates to the matching route on each status transition.
export function useSession(opts: UseSessionOptions): UseSessionApi {
  const [status, dispatch] = useReducer(sessionReducer, initialSessionStatus);
  const [channel, setChannel] = useReducer(channelReducer, null);
  const [lastMessage, setLastMessage] = useReducer(messageReducer, null);

  const navigate = useNavigate();

  // Keep a stable ref to the latest signaling API so async closures and
  // event callbacks always see the current value without being re-subscribed.
  const signalingRef = useRef(opts.signaling);
  useEffect(() => {
    signalingRef.current = opts.signaling;
  }, [opts.signaling]);

  // Forward incoming data channels (host role, receiver side).
  const handleIncomingDataChannel = useCallback((dc: RTCDataChannel) => {
    setChannel({ type: "set", channel: dc });
  }, []);

  // RTCPeerConnection is alive only during negotiating or connected.
  const { peer } = usePeerConnection({
    active: status.kind === "negotiating" || status.kind === "connected",
    onIncomingDataChannel: handleIncomingDataChannel,
  });

  // React to incoming data-channel messages.
  useDataChannel({
    channel,
    onMessage: (data) => setLastMessage({ type: "received", data }),
  });

  // Effect 1 — Subscribe to server messages and drive the state machine.
  useEffect(() => {
    const unsubscribe = opts.signaling.onMessage((msg) => {
      switch (msg.type) {
        case "connect_offer":
          dispatch({
            type: "server_connect_offer",
            sessionId: msg.session_id,
            controllerId: msg.controller_id,
          });
          return;
        case "session_ready":
          dispatch({
            type: "server_session_ready",
            sessionId: msg.session_id,
            hostId: msg.host_id,
          });
          return;
        case "peer_disconnected":
          dispatch({
            type: "server_peer_disconnected",
            sessionId: msg.session_id,
            reason: msg.reason,
          });
          return;
        case "sdp_offer":
          void handleIncomingSdpOffer(
            peer,
            msg.sdp,
            signalingRef.current,
            msg.session_id,
          );
          return;
        case "sdp_answer":
          void handleIncomingSdpAnswer(peer, msg.sdp, msg.session_id, dispatch);
          return;
        case "error":
          if (msg.code === "pin_not_found") {
            dispatch({ type: "server_pin_not_found" });
          }
          if (msg.code === "self_connect_forbidden") {
            dispatch({ type: "server_self_connect_forbidden" });
          }
          return;
        default:
          return;
      }
    });
    return unsubscribe;
  }, [opts.signaling, peer]);

  // Effect 2 — Host: show native consent dialog when awaiting_consent.
  useEffect(() => {
    if (status.kind !== "awaiting_consent" || status.role !== "host") return;
    let cancelled = false;
    const peerLabel = status.peerId.slice(0, 8);
    const sessionId = status.sessionId;

    tauriInvoke("show_consent_dialog", {
      peer_label: peerLabel,
      timeout_secs: CONSENT_TIMEOUT_SECS,
    })
      .then((accepted) => {
        if (cancelled) return;
        signalingRef.current.send({
          type: "consent_response",
          session_id: sessionId,
          accepted,
        });
        if (accepted) dispatch({ type: "consent_accepted", sessionId });
        else dispatch({ type: "consent_declined" });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "consent_declined" });
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  // Effect 3 — Controller: create data channel + SDP offer when negotiating.
  useEffect(() => {
    if (status.kind !== "negotiating" || status.role !== "controller" || !peer) return;
    const sessionId = status.sessionId;
    const dc = peer.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
    setChannel({ type: "set", channel: dc });

    void (async () => {
      try {
        const offer = await createOfferWithCompleteIce(peer);
        signalingRef.current.send({
          type: "sdp_offer",
          session_id: sessionId,
          sdp: offer,
        });
      } catch (err) {
        // TEMPORARY: surface WebRTC errors until we add structured error state in Phase 5.
        console.warn("sdp offer failed", err);
      }
    })();
  }, [status, peer]);

  // Effect 4 — Navigate on status transitions.
  useEffect(() => {
    if (
      status.kind === "requesting" ||
      (status.kind === "negotiating" && status.role === "controller")
    ) {
      navigate("/controller/connecting");
      return;
    }
    if (status.kind === "connected" && status.role === "controller") {
      navigate("/controller/session");
      return;
    }
    if (status.kind === "connected" && status.role === "host") {
      navigate("/host/session");
      return;
    }
    if (status.kind === "ended") {
      navigate("/");
    }
  }, [status, navigate]);

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  // Initiates a connection to a remote host identified by PIN.
  const requestConnect = useCallback(
    (targetPin: string) => {
      if (!opts.machineId) return;
      dispatch({ type: "user_requested_connect", targetPin });
      opts.signaling.send({
        type: "connect_request",
        controller_id: opts.machineId,
        target_pin: targetPin,
      });
    },
    [opts.machineId, opts.signaling],
  );

  // Sends raw data over the open data channel.
  const sendMessage = useCallback(
    (data: string): boolean => {
      if (!channel || channel.readyState !== "open") return false;
      channel.send(data);
      return true;
    },
    [channel],
  );

  // Dispatches user_ended to the state machine, triggers navigation to /.
  const endSession = useCallback(() => {
    dispatch({ type: "user_ended" });
  }, []);

  return { status, lastMessage, requestConnect, sendMessage, endSession };
}
