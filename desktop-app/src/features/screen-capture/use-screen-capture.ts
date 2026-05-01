import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenCaptureStatus } from "./capture.types";

// Return shape for the useScreenCapture hook.
// Exposes the live MediaStream, current lifecycle status, any error message,
// and the start/stop controls.
export interface UseScreenCaptureReturn {
  stream: MediaStream | null;
  status: ScreenCaptureStatus;
  error: string | null;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
}

/**
 * Manages the screen capture lifecycle via the browser's getDisplayMedia API.
 *
 * - startCapture: requests display media access from the OS picker, then
 *   stores the resulting MediaStream and marks status = "capturing".
 * - stopCapture: stops every track on the stream and marks status = "stopped".
 * - The onended callback of the video track handles cases where the user
 *   dismisses the browser's "stop sharing" button directly.
 * - The useEffect cleanup ensures tracks are always stopped on unmount,
 *   preventing ghost capture sessions.
 */
export function useScreenCapture(): UseScreenCaptureReturn {
  // React state drives re-renders when the stream or status changes.
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<ScreenCaptureStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Ref keeps a stable reference to the current stream so the cleanup
  // function inside useEffect can always access the latest value without
  // being listed as a dependency.
  const streamRef = useRef<MediaStream | null>(null);

  // Stop all active tracks, reset the ref and the React state.
  // Wrapped in useCallback so the reference is stable across renders
  // (useful if a parent component passes stopCapture as a prop or dep).
  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setStream(null);
    setStatus("stopped");
  }, []);

  // Request display media access, configure stream constraints and register
  // the onended handler for user-initiated sharing stops.
  const startCapture = useCallback(async () => {
    try {
      setError(null);
      // Ask the OS/browser for a screen/window capture stream.
      // Constraints cap resolution and frame-rate to avoid saturating the
      // WebRTC connection with unnecessarily large frames.
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: false, // audio capture is not part of the LinkDesk protocol
      });

      // Persist in both the ref (for cleanup) and state (for rendering).
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus("capturing");

      // Handle the user clicking "Stop sharing" in the browser's built-in UI.
      // This fires the track's onended event without going through stopCapture.
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          // Clear the ref first so the state setter below finds nothing to double-stop.
          streamRef.current = null;
          setStream(null);
          setStatus("stopped");
        };
      }
    } catch (err) {
      // getDisplayMedia rejects when the user cancels the picker or permissions
      // are denied. Surface the message for the UI to display.
      const message =
        err instanceof Error ? err.message : "unknown capture error";
      setError(message);
      setStatus("error");
    }
  }, []);

  // Safety net: stop any lingering tracks when the component using this hook
  // unmounts (e.g., navigating away from the host screen mid-session).
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  return { stream, status, error, startCapture, stopCapture };
}
