import { act, renderHook } from "@testing-library/react";
import { useDataChannel } from "@/features/webrtc/use-data-channel";

// Factory that mimics an RTCDataChannel with a simple event emitter.
// `_fire` lets tests dispatch synthetic events without a real browser context.
function fakeChannel() {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    label: "test",
    readyState: "connecting" as RTCDataChannelState,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: (evt: string, cb: EventListener) => {
      const set = listeners.get(evt) ?? new Set<EventListener>();
      set.add(cb);
      listeners.set(evt, set);
    },
    removeEventListener: () => undefined,
    _fire: (evt: string, data?: unknown) => {
      listeners.get(evt)?.forEach((cb) => cb({ data } as unknown as Event));
    },
  };
}

describe("useDataChannel", () => {
  it("exposes readyState as connecting before open", () => {
    const channel = fakeChannel();
    const { result } = renderHook(() =>
      useDataChannel({ channel: channel as unknown as RTCDataChannel }),
    );
    expect(result.current.readyState).toBe("connecting");
  });

  it("switches to open after onopen event", () => {
    const channel = fakeChannel();
    const { result } = renderHook(() =>
      useDataChannel({ channel: channel as unknown as RTCDataChannel }),
    );
    act(() => {
      channel.readyState = "open";
      channel._fire("open");
    });
    expect(result.current.readyState).toBe("open");
  });

  it("pushes received messages via onMessage", () => {
    const channel = fakeChannel();
    const onMessage = vi.fn();
    renderHook(() =>
      useDataChannel({
        channel: channel as unknown as RTCDataChannel,
        onMessage,
      }),
    );
    act(() => {
      channel._fire("message", "hello");
    });
    expect(onMessage).toHaveBeenCalledWith("hello");
  });

  it("send() forwards to the channel when open", () => {
    const channel = fakeChannel();
    channel.readyState = "open";
    const { result } = renderHook(() =>
      useDataChannel({ channel: channel as unknown as RTCDataChannel }),
    );
    const ok = result.current.send("ping");
    expect(ok).toBe(true);
    expect(channel.send).toHaveBeenCalledWith("ping");
  });

  it("send() returns false when channel is not open", () => {
    const channel = fakeChannel();
    const { result } = renderHook(() =>
      useDataChannel({ channel: channel as unknown as RTCDataChannel }),
    );
    const ok = result.current.send("ping");
    expect(ok).toBe(false);
    expect(channel.send).not.toHaveBeenCalled();
  });

  it("handles null channel", () => {
    const { result } = renderHook(() => useDataChannel({ channel: null }));
    expect(result.current.readyState).toBe("closed");
    expect(result.current.send("x")).toBe(false);
  });
});
