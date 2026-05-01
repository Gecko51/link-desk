import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { useAppState } from "@/app-state";
import { useScreenCapture } from "@/features/screen-capture/use-screen-capture";
import { useDataChannelMessages } from "@/features/session/use-data-channel-messages";
import { useInputInjection } from "@/features/input-injection/use-input-injection";
import { tauriInvoke } from "@/lib/tauri";
import type { ScreenMetadata } from "@/features/screen-capture/capture.types";

export function HostSessionRoute() {
  const { session } = useAppState();
  const { stream, status: captureStatus, startCapture, stopCapture } = useScreenCapture();
  const messages = useDataChannelMessages(session.dataChannel);
  const [screenMeta, setScreenMeta] = useState<ScreenMetadata | null>(null);
  const [sessionStart] = useState(() => Date.now());

  // Start screen capture when the route mounts.
  useEffect(() => {
    void startCapture();
  }, [startCapture]);

  // Fetch screen info and send to controller once capture is active.
  useEffect(() => {
    if (captureStatus !== "capturing") return;
    void (async () => {
      try {
        const info = await tauriInvoke("get_screen_info");
        const meta: ScreenMetadata = {
          width: info.width,
          height: info.height,
          scaleFactor: info.scale_factor,
        };
        setScreenMeta(meta);
        messages.send({
          type: "screen_metadata",
          width: info.width,
          height: info.height,
          scale_factor: info.scale_factor,
        });
      } catch (err) {
        console.warn("failed to get screen info", err);
      }
    })();
  }, [captureStatus, messages]);

  // Add the video track to the peer connection so the controller receives it.
  useEffect(() => {
    if (!stream || session.status.kind !== "connected") return;
    session.addVideoTrack(stream);
  }, [stream, session]);

  // Create overlay window on mount, close on unmount.
  useEffect(() => {
    void tauriInvoke("create_overlay_window");
    return () => {
      void tauriInvoke("close_overlay_window");
    };
  }, []);

  // Send session status to overlay window periodically.
  useEffect(() => {
    if (session.status.kind !== "connected") return;
    const peerId = session.status.peerId;
    const peerLabel = peerId.slice(0, 8);

    void emit("session-status", {
      peerLabel,
      startedAt: sessionStart,
    });

    const interval = setInterval(() => {
      void emit("session-status", {
        peerLabel,
        startedAt: sessionStart,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [session.status, sessionStart]);

  const handleDisconnect = useCallback(() => {
    messages.send({ type: "disconnect", reason: "user_request" });
    setTimeout(() => {
      stopCapture();
      session.endSession();
    }, 500);
  }, [messages, stopCapture, session]);

  // Listen for disconnect click from overlay window.
  useEffect(() => {
    const unlisten = listen("overlay-disconnect-clicked", () => {
      handleDisconnect();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [handleDisconnect]);

  // Inject incoming input events from the controller.
  useInputInjection({
    messages,
    screenMetadata: screenMeta,
    enabled: captureStatus === "capturing",
    onDisconnectReceived: handleDisconnect,
  });

  return (
    <main
      data-testid="host-session-route"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8"
    >
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-emerald-500" />
        <h1 className="text-lg font-semibold">Session active</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Votre écran est partagé. Le widget overlay est affiché.
      </p>
      <p className="text-xs text-muted-foreground">
        {captureStatus === "capturing" ? "Capture en cours" : `Statut : ${captureStatus}`}
      </p>
    </main>
  );
}
