import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";

describe("ConnectionRequestTracker", () => {
  let tracker: ConnectionRequestTracker;
  const A = "550e8400-e29b-41d4-a716-446655440000";
  const B = "550e8400-e29b-41d4-a716-446655440001";

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new ConnectionRequestTracker({ ttlMs: 30_000 });
  });

  afterEach(() => vi.useRealTimers());

  it("creates a pending request with a fresh session_id", () => {
    const req = tracker.create({ controllerId: A, hostId: B });
    expect(req.sessionId).toMatch(/^[0-9a-f-]+$/);
    expect(req.status).toBe("pending");
    expect(req.controllerId).toBe(A);
    expect(req.hostId).toBe(B);
  });

  it("finds a request by sessionId", () => {
    const req = tracker.create({ controllerId: A, hostId: B });
    expect(tracker.find(req.sessionId)).toBe(req);
  });

  it("removes a request", () => {
    const req = tracker.create({ controllerId: A, hostId: B });
    tracker.remove(req.sessionId);
    expect(tracker.find(req.sessionId)).toBeUndefined();
  });

  it("markAccepted freezes expiry", () => {
    const req = tracker.create({ controllerId: A, hostId: B });
    tracker.markAccepted(req.sessionId);
    expect(tracker.find(req.sessionId)?.status).toBe("accepted");
    vi.advanceTimersByTime(60_000);
    expect(tracker.find(req.sessionId)?.status).toBe("accepted");
  });

  it("expires pending requests after ttlMs and fires onExpire", () => {
    const onExpire = vi.fn();
    tracker.onExpire(onExpire);
    const req = tracker.create({ controllerId: A, hostId: B });
    vi.advanceTimersByTime(29_999);
    expect(tracker.find(req.sessionId)).toBeDefined();
    vi.advanceTimersByTime(2);
    expect(tracker.find(req.sessionId)).toBeUndefined();
    expect(onExpire).toHaveBeenCalledWith(req.sessionId);
  });

  it("ignores remove / markAccepted on unknown sessionId", () => {
    expect(() => tracker.remove("nope")).not.toThrow();
    expect(() => tracker.markAccepted("nope")).not.toThrow();
  });
});
