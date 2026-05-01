import { useEffect, useState } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { HostSessionWidget } from "@/components/host-session-widget";

// Shape of the payload emitted by the Rust overlay command
// when the session status changes (peer label + start timestamp).
interface SessionStatusPayload {
  peerLabel: string;
  startedAt: number;
}

// Overlay route — rendered in the dedicated transparent overlay window
// created by the Rust backend via tauri-plugin-window-state.
// Communicates with the main window exclusively through Tauri events.
export function OverlayRoute() {
  const [peerLabel, setPeerLabel] = useState("...");
  const [duration, setDuration] = useState("00:00");
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // Listen for "session-status" events from Rust to populate the peer label
  // and the session start timestamp (Unix ms).
  useEffect(() => {
    const unlisten = listen<SessionStatusPayload>("session-status", (event) => {
      setPeerLabel(event.payload.peerLabel);
      setStartedAt(event.payload.startedAt);
    });
    return () => {
      // Cleanup: unsubscribe the Tauri event listener on unmount.
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Derive human-readable elapsed time (MM:SS) from the start timestamp.
  // Recalculates every second while the session is active.
  useEffect(() => {
    if (startedAt === null) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      setDuration(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Forward the keyboard shortcut event (fired by Rust) to the same
  // "overlay-disconnect-clicked" event so a single handler covers both paths.
  useEffect(() => {
    const unlisten = listen("session-disconnect-shortcut", () => {
      void emit("overlay-disconnect-clicked", {});
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Button click handler — emits the disconnect event for the main window to act on.
  const handleDisconnect = () => {
    void emit("overlay-disconnect-clicked", {});
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent p-0">
      <HostSessionWidget
        peerLabel={peerLabel}
        duration={duration}
        onDisconnect={handleDisconnect}
      />
    </div>
  );
}
