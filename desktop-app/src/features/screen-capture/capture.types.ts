// Lifecycle status of the screen capture pipeline on the host side.
// "idle"      → not started yet
// "capturing" → actively streaming frames
// "stopped"   → cleanly stopped by the user or session end
// "error"     → unexpected failure (see accompanying error payload)
export type ScreenCaptureStatus = "idle" | "capturing" | "stopped" | "error";

// Physical properties of the host screen used for coordinate mapping.
// scaleFactor accounts for HiDPI / Retina displays (e.g. 2 on a Retina Mac).
export interface ScreenMetadata {
  width: number;       // logical pixels (CSS pixels, before DPI scaling)
  height: number;      // logical pixels
  scaleFactor: number; // DPI multiplier — multiply logical → physical pixels
}
