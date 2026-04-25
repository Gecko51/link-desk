import { renderHook } from "@testing-library/react";
import { usePeerConnection } from "@/features/webrtc/use-peer-connection";

// Fake RTCPeerConnection that captures all event listeners and exposes helpers
// to trigger them manually in tests.
class FakePeerConnection {
  iceGatheringState: RTCIceGatheringState = "new";
  connectionState: RTCPeerConnectionState = "new";
  listeners = new Map<string, Array<(ev?: unknown) => void>>();
  close = vi.fn();
  createDataChannel = vi.fn(
    () =>
      ({ label: "hello", readyState: "connecting" }) as unknown as RTCDataChannel,
  );
  addEventListener = (evt: string, cb: (ev?: unknown) => void) => {
    const arr = this.listeners.get(evt) ?? [];
    arr.push(cb);
    this.listeners.set(evt, arr);
  };
  removeEventListener = (evt: string, cb: (ev?: unknown) => void) => {
    const arr = this.listeners.get(evt) ?? [];
    this.listeners.set(
      evt,
      arr.filter((l) => l !== cb),
    );
  };
  // Helper to manually fire an event in tests
  _fire(evt: string, ev?: unknown): void {
    this.listeners.get(evt)?.forEach((cb) => cb(ev));
  }
}

describe("usePeerConnection", () => {
  let fakes: FakePeerConnection[];
  let RealRTCPeerConnection: typeof RTCPeerConnection;

  beforeEach(() => {
    fakes = [];
    RealRTCPeerConnection = globalThis.RTCPeerConnection;
    // Replace the global with our fake factory so every `new RTCPeerConnection()`
    // returns a FakePeerConnection and pushes it into the `fakes` array.
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection =
      class {
        constructor() {
          const fake = new FakePeerConnection();
          fakes.push(fake);
          return fake as unknown as RTCPeerConnection;
        }
      };
  });

  afterEach(() => {
    // Restore the real global to avoid polluting other tests.
    (
      globalThis as unknown as { RTCPeerConnection: unknown }
    ).RTCPeerConnection = RealRTCPeerConnection;
  });

  it("creates a peer connection on mount when active=true", () => {
    renderHook(() =>
      usePeerConnection({ active: true, onIncomingDataChannel: () => undefined }),
    );
    expect(fakes).toHaveLength(1);
  });

  it("closes on unmount", () => {
    const { unmount } = renderHook(() =>
      usePeerConnection({ active: true, onIncomingDataChannel: () => undefined }),
    );
    unmount();
    expect(fakes[0].close).toHaveBeenCalled();
  });

  it("does not create a peer when active=false", () => {
    renderHook(() =>
      usePeerConnection({
        active: false,
        onIncomingDataChannel: () => undefined,
      }),
    );
    expect(fakes).toHaveLength(0);
  });

  it("exposes peer and current state", () => {
    const { result } = renderHook(() =>
      usePeerConnection({ active: true, onIncomingDataChannel: () => undefined }),
    );
    expect(result.current.peer).not.toBeNull();
    expect(result.current.state).toBe("new");
  });
});
