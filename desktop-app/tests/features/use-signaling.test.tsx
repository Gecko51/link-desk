import { act, renderHook } from "@testing-library/react";
import { useSignaling } from "@/features/signaling/use-signaling";
import type { SignalingClientLike } from "@/features/signaling/use-signaling";
import type { ServerMessage } from "@/features/signaling/message-schemas";

// Mock client factory. Returns an object satisfying SignalingClientLike
// (structural typing — no cast needed in production code).
function createMockClient(): SignalingClientLike & {
  _emit: (m: ServerMessage) => void;
  _setState: (s: "connecting" | "open" | "reconnecting" | "offline") => void;
  _sent: unknown[];
} {
  const listeners: Array<(m: ServerMessage) => void> = [];
  let state: "connecting" | "open" | "reconnecting" | "offline" = "offline";
  const sent: unknown[] = [];

  return {
    get state() { return state; },
    connect: vi.fn(() => { state = "connecting"; }),
    disconnect: vi.fn(() => { state = "offline"; }),
    send: vi.fn((m: unknown) => { sent.push(m); return true; }),
    onMessage: (cb: (m: ServerMessage) => void) => {
      listeners.push(cb);
      return () => { listeners.splice(listeners.indexOf(cb), 1); };
    },
    // Test helpers — drive state and fire listeners.
    _emit: (m: ServerMessage) => listeners.forEach((l) => l(m)),
    _setState: (s: "connecting" | "open" | "reconnecting" | "offline") => { state = s; },
    _sent: sent,
  };
}

describe("useSignaling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects on mount when machineId is present", () => {
    const client = createMockClient();
    renderHook(() =>
      useSignaling({
        client,
        machineId: "550e8400-e29b-41d4-a716-446655440000",
        pin: "111-222-333",
        pinExpiresAt: new Date(Date.now() + 60_000),
      }),
    );
    expect(client.connect).toHaveBeenCalled();
  });

  it("does not connect when machineId is null", () => {
    const client = createMockClient();
    renderHook(() =>
      useSignaling({
        client,
        machineId: null,
        pin: null,
        pinExpiresAt: null,
      }),
    );
    expect(client.connect).not.toHaveBeenCalled();
  });

  it("sends register when the socket opens and inputs are present", async () => {
    const client = createMockClient();
    const machineId = "550e8400-e29b-41d4-a716-446655440000";
    const pin = "111-222-333";
    const pinExpiresAt = new Date(Date.now() + 60_000);

    const { rerender } = renderHook(
      (props: { state: "connecting" | "open" }) => {
        client._setState(props.state);
        return useSignaling({ client, machineId, pin, pinExpiresAt });
      },
      { initialProps: { state: "connecting" } },
    );

    // No register before socket is open.
    expect(client.send).not.toHaveBeenCalled();

    // Transition to open: rerender so the mock state is "open", then advance fake
    // timers async so the 250ms polling interval fires and React flushes the
    // resulting setSigState before Effect 3 runs (sends "register").
    rerender({ state: "open" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "register",
        machine_id: machineId,
        pin,
      }),
    );
  });
});
