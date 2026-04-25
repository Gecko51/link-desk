import { describe, it, expect, vi } from "vitest";
import { waitForIceGatheringComplete } from "@/features/webrtc/offer-answer";

describe("waitForIceGatheringComplete", () => {
  it("resolves immediately when state is already complete", async () => {
    const pc = {
      iceGatheringState: "complete" as RTCIceGatheringState,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as RTCPeerConnection;
    await expect(waitForIceGatheringComplete(pc)).resolves.toBeUndefined();
  });

  it("resolves after icegatheringstatechange fires with complete", async () => {
    let state: RTCIceGatheringState = "gathering";
    const listeners = new Map<string, (() => void)[]>();
    const pc = {
      get iceGatheringState() {
        return state;
      },
      addEventListener: (evt: string, cb: () => void) => {
        const arr = listeners.get(evt) ?? [];
        arr.push(cb);
        listeners.set(evt, arr);
      },
      removeEventListener: () => undefined,
    } as unknown as RTCPeerConnection;

    const promise = waitForIceGatheringComplete(pc);
    state = "complete";
    listeners.get("icegatheringstatechange")?.forEach((cb) => cb());
    await expect(promise).resolves.toBeUndefined();
  });
});
