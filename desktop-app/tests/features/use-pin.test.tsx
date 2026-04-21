import { act, renderHook } from "@testing-library/react";
import { usePin } from "@/features/pin/use-pin";

describe("usePin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates a PIN on mount", () => {
    const { result } = renderHook(() => usePin({ rotationIntervalMs: 1000 }));
    expect(result.current.session.pin).toMatch(/^\d{3}-\d{3}-\d{3}$/);
  });

  it("exposes seconds-remaining countdown", () => {
    const { result } = renderHook(() => usePin({ rotationIntervalMs: 10_000 }));
    expect(result.current.secondsRemaining).toBeGreaterThan(0);
    expect(result.current.secondsRemaining).toBeLessThanOrEqual(10);
  });

  it("rotates PIN automatically when interval elapses", () => {
    const { result } = renderHook(() => usePin({ rotationIntervalMs: 1000 }));
    const firstPin = result.current.session.pin;

    act(() => {
      vi.advanceTimersByTime(1001);
    });

    expect(result.current.session.pin).not.toBe(firstPin);
  });

  it("regenerate() forces a new PIN immediately", () => {
    const { result } = renderHook(() => usePin({ rotationIntervalMs: 60_000 }));
    const firstPin = result.current.session.pin;

    act(() => {
      result.current.regenerate();
    });

    expect(result.current.session.pin).not.toBe(firstPin);
  });
});
