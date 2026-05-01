// Vertical floating toolbar shown on the controller side during an active session.
// Positioned on the left edge of the screen to stay out of the way of the remote desktop.

export interface SessionToolbarProps {
  /** Display name or machine ID of the remote host */
  peerLabel: string;
  /** Human-readable elapsed time, e.g. "02:45" */
  duration: string;
  /** Visual indicator of the WebRTC connection quality */
  connectionQuality: "good" | "fair" | "poor";
  /** Called when the user clicks the disconnect button */
  onDisconnect: () => void;
}

// Maps quality levels to Tailwind color classes for the status dot
const QUALITY_COLORS = {
  good: "bg-emerald-500",
  fair: "bg-amber-500",
  poor: "bg-red-500",
} as const;

export function SessionToolbar({
  peerLabel,
  duration,
  connectionQuality,
  onDisconnect,
}: SessionToolbarProps) {
  return (
    // Fixed pill anchored to the vertical center of the left edge
    <div
      className="fixed left-2 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-2 rounded-lg border border-white/10 p-2"
      style={{
        width: 36,
        // Semi-transparent dark background with blur to keep content readable
        background: "rgba(15, 23, 42, 0.9)",
        backdropFilter: "blur(8px)",
      }}
      data-testid="session-toolbar"
    >
      {/* Connection quality dot — tooltip shows peer name and elapsed time */}
      <div
        className={`h-3 w-3 rounded-full ${QUALITY_COLORS[connectionQuality]}`}
        title={`${peerLabel} · ${duration}`}
      />

      {/* Elapsed session duration displayed vertically to save horizontal space */}
      <span
        className="text-[9px] text-slate-400"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        {duration}
      </span>

      {/* Spacer pushes the disconnect button to the bottom of the toolbar */}
      <div className="flex-1" />

      {/* Disconnect button — red to signal a destructive / session-ending action */}
      <button
        onClick={onDisconnect}
        className="flex h-6 w-6 items-center justify-center rounded bg-red-600 text-xs text-white hover:bg-red-700"
        title="Couper la session"
        data-testid="disconnect-button"
      >
        ✕
      </button>
    </div>
  );
}
