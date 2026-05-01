import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/app-state";
import { RemoteScreen } from "@/components/remote-screen";
import { SessionToolbar } from "@/components/session-toolbar";
import { useDataChannelMessages } from "@/features/session/use-data-channel-messages";
import { useInputCapture } from "@/features/input-capture/use-input-capture";
import type { ScreenMetadata } from "@/features/screen-capture/capture.types";

export function ControllerSessionRoute() {
  const { session } = useAppState();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const messages = useDataChannelMessages(session.dataChannel);
  // screenMeta is received from the host for future cursor scaling (Phase 5)
  const [_screenMeta, setScreenMeta] = useState<ScreenMetadata | null>(null);
  const [duration, setDuration] = useState("00:00");
  const sessionStartRef = useRef(Date.now());

  // Listen for screen_metadata from the host.
  useEffect(() => {
    const unsubscribe = messages.subscribe((msg) => {
      if (msg.type === "screen_metadata") {
        setScreenMeta({
          width: msg.width,
          height: msg.height,
          scaleFactor: msg.scale_factor,
        });
      }
      if (msg.type === "disconnect") {
        session.endSession();
      }
    });
    return unsubscribe;
  }, [messages, session]);

  // Capture mouse/keyboard when video is available.
  const hasVideo = session.status.kind === "connected" && session.status.hasVideo;
  useInputCapture({ videoRef, messages, enabled: hasVideo });

  // Update duration timer.
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      setDuration(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDisconnect = () => {
    messages.send({ type: "disconnect", reason: "user_request" });
    setTimeout(() => {
      session.endSession();
    }, 500);
  };

  const peerLabel =
    session.status.kind === "connected" ? session.status.peerId.slice(0, 8) : "...";

  const connectionQuality = "good" as const;

  return (
    <main
      data-testid="controller-session-route"
      className="relative h-screen w-screen overflow-hidden bg-black"
    >
      <RemoteScreen stream={session.remoteStream} videoRef={videoRef} />
      <SessionToolbar
        peerLabel={peerLabel}
        duration={duration}
        connectionQuality={connectionQuality}
        onDisconnect={handleDisconnect}
      />
    </main>
  );
}
