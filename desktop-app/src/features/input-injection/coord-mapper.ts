// Converts normalised ratio coordinates (sent by the controller over the
// WebRTC data channel) into physical pixel coordinates on the host screen.
//
// The controller works in a "ratio space" where (0,0) = top-left and
// (1,1) = bottom-right, independent of actual screen resolution.
// The host applies its own width / height / scaleFactor to produce the
// exact OS-level pixel position to feed into the input injection API.

import type { ScreenMetadata } from "@/features/screen-capture/capture.types";

// Absolute pixel position on the host screen (physical pixels after DPI scaling).
export interface PixelCoords {
  x: number;
  y: number;
}

/**
 * Converts a normalised (ratio) mouse position to physical pixel coordinates.
 *
 * @param xRatio  - Horizontal ratio in [0, 1]. Values outside range are clamped.
 * @param yRatio  - Vertical   ratio in [0, 1]. Values outside range are clamped.
 * @param screen  - Host screen metadata (width, height, scaleFactor).
 * @returns       Physical pixel coordinates, rounded to the nearest integer.
 *
 * Formula:  pixel = round( clamp(ratio) * dimension * scaleFactor )
 */
export function ratioToPixel(
  xRatio: number,
  yRatio: number,
  screen: ScreenMetadata,
): PixelCoords {
  // Clamp both axes to [0, 1] to guard against out-of-range data channel values.
  const clampedX = Math.max(0, Math.min(1, xRatio));
  const clampedY = Math.max(0, Math.min(1, yRatio));

  return {
    // Multiply by scaleFactor to get physical (device) pixels.
    x: Math.round(clampedX * screen.width * screen.scaleFactor),
    y: Math.round(clampedY * screen.height * screen.scaleFactor),
  };
}
