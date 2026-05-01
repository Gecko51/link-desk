import { describe, it, expect } from "vitest";
import { ratioToPixel } from "@/features/input-injection/coord-mapper";
import type { ScreenMetadata } from "@/features/screen-capture/capture.types";

// Standard 1080p screen, no HiDPI scaling.
const screen1080p: ScreenMetadata = {
  width: 1920,
  height: 1080,
  scaleFactor: 1,
};

// 4K screen with HiDPI 2x scale factor (e.g. Retina display).
const screenHiDPI: ScreenMetadata = {
  width: 2560,
  height: 1440,
  scaleFactor: 2,
};

describe("ratioToPixel", () => {
  // --- Center mapping ---
  it("maps the center (0.5, 0.5) correctly on a 1080p screen", () => {
    const result = ratioToPixel(0.5, 0.5, screen1080p);
    // 0.5 * 1920 * 1 = 960, 0.5 * 1080 * 1 = 540
    expect(result).toEqual({ x: 960, y: 540 });
  });

  // --- Corner: top-left (0, 0) ---
  it("maps the top-left corner (0, 0) to pixel (0, 0)", () => {
    const result = ratioToPixel(0, 0, screen1080p);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  // --- Corner: bottom-right (1, 1) ---
  it("maps the bottom-right corner (1, 1) to the full screen resolution", () => {
    const result = ratioToPixel(1, 1, screen1080p);
    // 1 * 1920 * 1 = 1920, 1 * 1080 * 1 = 1080
    expect(result).toEqual({ x: 1920, y: 1080 });
  });

  // --- Rounding: fractional pixel result must be rounded ---
  it("rounds fractional pixel values to the nearest integer", () => {
    // 0.3 * 1920 * 1 = 576.0 (exact), 0.7 * 1080 * 1 = 756.0 (exact)
    // Use a value that produces a true fraction: 1/3
    const result = ratioToPixel(1 / 3, 1 / 3, screen1080p);
    // 1/3 * 1920 = 640.000… → 640
    // 1/3 * 1080 = 360.000… → 360
    expect(result.x).toBe(Math.round((1 / 3) * 1920));
    expect(result.y).toBe(Math.round((1 / 3) * 1080));
  });

  it("rounds 0.1 on a 1000x1000 screen to nearest integer", () => {
    // 0.1 * 1000 * 1 = 100 — exact, but tests Math.round path
    const screen: ScreenMetadata = { width: 1000, height: 1000, scaleFactor: 1 };
    const result = ratioToPixel(0.1, 0.9, screen);
    expect(result).toEqual({ x: 100, y: 900 });
  });

  // --- HiDPI scale factor 2x ---
  it("applies the 2x scale factor on a HiDPI screen", () => {
    const result = ratioToPixel(0.5, 0.5, screenHiDPI);
    // 0.5 * 2560 * 2 = 2560, 0.5 * 1440 * 2 = 1440
    expect(result).toEqual({ x: 2560, y: 1440 });
  });

  it("maps (1, 1) correctly on a HiDPI 2x screen", () => {
    const result = ratioToPixel(1, 1, screenHiDPI);
    // 1 * 2560 * 2 = 5120, 1 * 1440 * 2 = 2880
    expect(result).toEqual({ x: 5120, y: 2880 });
  });

  // --- Clamping: negative values must be clamped to 0 ---
  it("clamps negative xRatio to 0", () => {
    const result = ratioToPixel(-0.5, 0.5, screen1080p);
    expect(result.x).toBe(0);
    expect(result.y).toBe(540);
  });

  it("clamps negative yRatio to 0", () => {
    const result = ratioToPixel(0.5, -1, screen1080p);
    expect(result.x).toBe(960);
    expect(result.y).toBe(0);
  });

  // --- Clamping: values > 1 must be clamped to 1 ---
  it("clamps xRatio > 1 to screen width", () => {
    const result = ratioToPixel(1.5, 0.5, screen1080p);
    // clamped to 1 → 1 * 1920 * 1 = 1920
    expect(result.x).toBe(1920);
    expect(result.y).toBe(540);
  });

  it("clamps yRatio > 1 to screen height", () => {
    const result = ratioToPixel(0.5, 2, screen1080p);
    // clamped to 1 → 1 * 1080 * 1 = 1080
    expect(result.x).toBe(960);
    expect(result.y).toBe(1080);
  });

  it("clamps both axes independently when both are out of range", () => {
    const result = ratioToPixel(-99, 99, screen1080p);
    expect(result).toEqual({ x: 0, y: 1080 });
  });
});
