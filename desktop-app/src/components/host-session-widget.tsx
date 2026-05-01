// Small overlay widget rendered on the host side while a remote session is active.
// Displayed as a floating card (typically via a Tauri overlay window) so the host
// always knows who is connected and can terminate the session at any time.

export interface HostSessionWidgetProps {
  /** Display name or machine ID of the remote controller */
  peerLabel: string;
  /** Human-readable elapsed time, e.g. "02:45" */
  duration: string;
  /** Called when the host clicks the "Couper" button to end the session */
  onDisconnect: () => void;
}

export function HostSessionWidget({
  peerLabel,
  duration,
  onDisconnect,
}: HostSessionWidgetProps) {
  return (
    // Compact horizontal card: fixed dimensions so the Tauri overlay window can be
    // sized exactly to match (280 × 60 px).
    <div
      className="flex h-[60px] w-[280px] items-center gap-3 rounded-lg border-2 border-red-600 bg-white px-3"
      // Prominent shadow so the widget stays visible on any background
      style={{ boxShadow: "0 8px 20px rgba(0,0,0,0.3)" }}
      data-testid="host-session-widget"
    >
      {/* Left section: peer info stacked vertically */}
      <div className="flex flex-1 flex-col gap-0.5">
        {/* Remote controller's identifier */}
        <span className="text-[11px] font-semibold text-slate-900">
          {peerLabel}
        </span>
        {/* Elapsed session duration */}
        <span className="text-[9px] text-slate-500">{duration}</span>
      </div>

      {/* Disconnect button — always visible so the host can regain control instantly */}
      <button
        onClick={onDisconnect}
        className="rounded bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-700"
        data-testid="overlay-disconnect-button"
      >
        Couper
      </button>
    </div>
  );
}
