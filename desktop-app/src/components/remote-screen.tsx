import { useEffect, type RefObject } from "react";

// Props for the RemoteScreen component
// stream: the MediaStream received from the WebRTC peer connection (null if not yet connected)
// videoRef: a ref forwarded from the parent to control the <video> element directly
export interface RemoteScreenProps {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

// Renders the remote peer's video stream into a full-screen <video> element.
// The useEffect keeps srcObject in sync whenever the stream changes.
export function RemoteScreen({ stream, videoRef }: RemoteScreenProps) {
  // Assign the MediaStream to the video element's srcObject each time it changes.
  // We cannot pass srcObject as a JSX prop, so we use a ref + effect instead.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      // Covers the entire parent container; black background while stream is absent
      className="absolute inset-0 h-full w-full bg-black object-contain"
      // Hide the system cursor over the video: the controller injects its own cursor
      style={{ cursor: stream ? "none" : "default" }}
      data-testid="remote-screen"
    />
  );
}
