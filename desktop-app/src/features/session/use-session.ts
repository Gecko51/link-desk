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
  dataChannel: RTCDataChannel | null;
  remoteStream: MediaStream | null;
  requestConnect: (targetPin: string) => void;
  addVideoTrack: (stream: MediaStream) => void;
  endSession: () => void;
}

// ------------------------------------------------------------------
// Internal micro-reducers
// ------------------------------------------------------------------

const DATA_CHANNEL_LABEL = "linkdesk-control";
const CONSENT_TIMEOUT_SECS = 30;

type ChannelAction = { type: "set"; channel: RTCDataChannel | null };

function channelReducer(
  _prev: RTCDataChannel | null,
  action: ChannelAction,
): RTCDataChannel | null {
  return action.channel;
}

type StreamAction = { type: "set"; stream: MediaStream | null };

function streamReducer(
  _prev: MediaStream | null,
  action: StreamAction,
): MediaStream | null {
  return action.stream;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

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

export function useSession(opts: UseSessionOptions): UseSessionApi {
  const [status, dispatch] = useReducer(sessionReducer, initialSessionStatus);
  const [channel, setChannel] = useReducer(channelReducer, null);
  const [remoteStream, setRemoteStream] = useReducer(streamReducer, null);

  const navigate = useNavigate();

  const signalingRef = useRef(opts.signaling);
  useEffect(() => {
    signalingRef.current = opts.signaling;
  }, [opts.signaling]);

  const handleIncomingDataChannel = useCallback((dc: RTCDataChannel) => {
    setChannel({ type: "set", channel: dc });
  }, []);

  const { peer } = usePeerConnection({
    active: status.kind === "negotiating" || status.kind === "connected",
    onIncomingDataChannel: handleIncomingDataChannel,
  });

  useDataChannel({ channel });

  // Listen for incoming video tracks (controller receives host's screen).
  useEffect(() => {
    if (!peer) return;
    const handleTrack = (ev: RTCTrackEvent) => {
      if (ev.streams[0]) {
        setRemoteStream({ type: "set", stream: ev.streams[0] });
        dispatch({ type: "video_track_received" });
      }
    };
    peer.addEventListener("track", handleTrack);
    return () => peer.removeEventListener("track", handleTrack);
  }, [peer]);

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
    const dc = peer.createDataChannel(DATA_CHANNEL_LABEL, {
      ordered: true,
      maxRetransmits: 0,
    });
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

  // Cleanup remote stream on session end.
  useEffect(() => {
    if (status.kind === "ended" || status.kind === "idle") {
      setRemoteStream({ type: "set", stream: null });
    }
  }, [status.kind]);

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

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

  const addVideoTrack = useCallback(
    (stream: MediaStream) => {
      if (!peer) return;
      for (const track of stream.getVideoTracks()) {
        peer.addTrack(track, stream);
      }
    },
    [peer],
  );

  const endSession = useCallback(() => {
    dispatch({ type: "user_ended" });
  }, []);

  return { status, dataChannel: channel, remoteStream, requestConnect, addVideoTrack, endSession };
}
