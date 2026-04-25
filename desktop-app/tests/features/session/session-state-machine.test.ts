import { describe, it, expect } from "vitest";
import {
  sessionReducer,
  initialSessionStatus,
} from "@/features/session/session-state-machine";

describe("sessionReducer", () => {
  it("user_requested_connect from idle → requesting", () => {
    const next = sessionReducer(initialSessionStatus, {
      type: "user_requested_connect",
      targetPin: "123-456-789",
    });
    expect(next).toEqual({ kind: "requesting", targetPin: "123-456-789" });
  });

  it("server_pin_not_found from requesting → ended(pin_not_found)", () => {
    const next = sessionReducer(
      { kind: "requesting", targetPin: "123-456-789" },
      { type: "server_pin_not_found" },
    );
    expect(next).toEqual({ kind: "ended", reason: "pin_not_found" });
  });

  it("server_self_connect_forbidden from requesting → ended(self_connect_forbidden)", () => {
    const next = sessionReducer(
      { kind: "requesting", targetPin: "999-999-999" },
      { type: "server_self_connect_forbidden" },
    );
    expect(next).toEqual({ kind: "ended", reason: "self_connect_forbidden" });
  });

  it("server_connect_offer from idle → awaiting_consent(host)", () => {
    const next = sessionReducer(initialSessionStatus, {
      type: "server_connect_offer",
      sessionId: "s1",
      controllerId: "ctrl-1",
    });
    expect(next).toEqual({
      kind: "awaiting_consent",
      sessionId: "s1",
      role: "host",
      peerId: "ctrl-1",
    });
  });

  it("consent_accepted from awaiting_consent(host) → negotiating", () => {
    const next = sessionReducer(
      { kind: "awaiting_consent", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "consent_accepted", sessionId: "s1" },
    );
    expect(next.kind).toBe("negotiating");
    if (next.kind === "negotiating") expect(next.role).toBe("host");
  });

  it("consent_declined from awaiting_consent → ended(declined)", () => {
    const next = sessionReducer(
      { kind: "awaiting_consent", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "consent_declined" },
    );
    expect(next).toEqual({ kind: "ended", reason: "declined" });
  });

  it("server_session_ready from requesting → negotiating(controller)", () => {
    const next = sessionReducer(
      { kind: "requesting", targetPin: "123-456-789" },
      { type: "server_session_ready", sessionId: "s1", hostId: "host-1" },
    );
    expect(next).toEqual({
      kind: "negotiating",
      sessionId: "s1",
      role: "controller",
      peerId: "host-1",
    });
  });

  it("peer_connected from negotiating → connected", () => {
    const next = sessionReducer(
      { kind: "negotiating", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "peer_connected", sessionId: "s1" },
    );
    expect(next.kind).toBe("connected");
  });

  it("server_peer_disconnected (host_disconnected) from connected → ended(peer_disconnected)", () => {
    const next = sessionReducer(
      { kind: "connected", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "server_peer_disconnected", sessionId: "s1", reason: "host_disconnected" },
    );
    expect(next).toEqual({ kind: "ended", reason: "peer_disconnected" });
  });

  it("server_peer_disconnected (declined) → ended(declined)", () => {
    const next = sessionReducer(
      {
        kind: "awaiting_consent",
        sessionId: "s1",
        role: "controller",
        peerId: "host-1",
      },
      { type: "server_peer_disconnected", sessionId: "s1", reason: "declined" },
    );
    expect(next).toEqual({ kind: "ended", reason: "declined" });
  });

  it("server_peer_disconnected (timeout) → ended(timeout)", () => {
    const next = sessionReducer(
      { kind: "negotiating", sessionId: "s1", role: "controller", peerId: "host-1" },
      { type: "server_peer_disconnected", sessionId: "s1", reason: "timeout" },
    );
    expect(next).toEqual({ kind: "ended", reason: "timeout" });
  });

  it("user_ended from connected → ended(local_disconnect)", () => {
    const next = sessionReducer(
      { kind: "connected", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "user_ended" },
    );
    expect(next).toEqual({ kind: "ended", reason: "local_disconnect" });
  });

  it("invalid transitions are ignored", () => {
    const s = {
      kind: "connected" as const,
      sessionId: "s1",
      role: "host" as const,
      peerId: "ctrl-1",
    };
    // user_requested_connect on connected → no change
    const next = sessionReducer(s, {
      type: "user_requested_connect",
      targetPin: "123-456-789",
    });
    expect(next).toBe(s);
  });
});
