import {
  RegisterMessageSchema,
  UpdatePinMessageSchema,
  PingMessageSchema,
  parseClientMessage,
  ConnectRequestMessageSchema,
  ConnectOfferMessageSchema,
  ConsentResponseMessageSchema,
  SessionReadyMessageSchema,
  SdpOfferMessageSchema,
  IceCandidateMessageSchema,
  PeerDisconnectedMessageSchema,
} from "@/websocket/schemas";
import { describe, expect, it } from "vitest";

describe("websocket schemas", () => {
  describe("RegisterMessageSchema", () => {
    it("accepts a valid register payload", () => {
      const result = RegisterMessageSchema.safeParse({
        type: "register",
        machine_id: "550e8400-e29b-41d4-a716-446655440000",
        pin: "123-456-789",
        pin_expires_at: "2026-04-21T10:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });

    it("rejects malformed machine_id", () => {
      const result = RegisterMessageSchema.safeParse({
        type: "register",
        machine_id: "not-a-uuid",
        pin: "123-456-789",
        pin_expires_at: "2026-04-21T10:00:00.000Z",
      });
      expect(result.success).toBe(false);
    });

    it("rejects malformed pin", () => {
      const result = RegisterMessageSchema.safeParse({
        type: "register",
        machine_id: "550e8400-e29b-41d4-a716-446655440000",
        pin: "12345", // too short
        pin_expires_at: "2026-04-21T10:00:00.000Z",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdatePinMessageSchema", () => {
    it("accepts a valid update_pin payload", () => {
      const result = UpdatePinMessageSchema.safeParse({
        type: "update_pin",
        machine_id: "550e8400-e29b-41d4-a716-446655440000",
        new_pin: "987-654-321",
        new_expires_at: "2026-04-21T10:30:00.000Z",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("PingMessageSchema", () => {
    it("accepts a bare ping", () => {
      expect(PingMessageSchema.safeParse({ type: "ping" }).success).toBe(true);
    });
  });

  describe("parseClientMessage", () => {
    it("routes by type to the correct schema", () => {
      const result = parseClientMessage({ type: "ping" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe("ping");
    });

    it("returns an error for unknown types", () => {
      const result = parseClientMessage({ type: "unknown" });
      expect(result.ok).toBe(false);
    });

    it("returns an error on non-object input", () => {
      const result = parseClientMessage("hello");
      expect(result.ok).toBe(false);
    });
  });

  describe("webrtc phase 3", () => {
    const SESSION = "550e8400-e29b-41d4-a716-446655440010";
    const CONTROLLER = "550e8400-e29b-41d4-a716-446655440000";
    const HOST = "550e8400-e29b-41d4-a716-446655440001";

    it("validates connect_request", () => {
      const r = ConnectRequestMessageSchema.safeParse({
        type: "connect_request",
        controller_id: CONTROLLER,
        target_pin: "123-456-789",
      });
      expect(r.success).toBe(true);
    });

    it("rejects connect_request with invalid pin", () => {
      const r = ConnectRequestMessageSchema.safeParse({
        type: "connect_request",
        controller_id: CONTROLLER,
        target_pin: "bad",
      });
      expect(r.success).toBe(false);
    });

    it("validates connect_offer", () => {
      const r = ConnectOfferMessageSchema.safeParse({
        type: "connect_offer",
        session_id: SESSION,
        controller_id: CONTROLLER,
      });
      expect(r.success).toBe(true);
    });

    it("validates consent_response (accepted)", () => {
      const r = ConsentResponseMessageSchema.safeParse({
        type: "consent_response",
        session_id: SESSION,
        accepted: true,
      });
      expect(r.success).toBe(true);
    });

    it("validates session_ready", () => {
      const r = SessionReadyMessageSchema.safeParse({
        type: "session_ready",
        session_id: SESSION,
        host_id: HOST,
      });
      expect(r.success).toBe(true);
    });

    it("validates sdp_offer", () => {
      const r = SdpOfferMessageSchema.safeParse({
        type: "sdp_offer",
        session_id: SESSION,
        sdp: { type: "offer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n" },
      });
      expect(r.success).toBe(true);
    });

    it("validates ice_candidate", () => {
      const r = IceCandidateMessageSchema.safeParse({
        type: "ice_candidate",
        session_id: SESSION,
        candidate: { candidate: "candidate:1 1 UDP 2130706431 1.2.3.4 54321 typ host" },
      });
      expect(r.success).toBe(true);
    });

    it("validates peer_disconnected with all reason codes", () => {
      const reasons = ["host_disconnected", "controller_disconnected", "timeout", "declined"] as const;
      for (const reason of reasons) {
        const r = PeerDisconnectedMessageSchema.safeParse({
          type: "peer_disconnected",
          session_id: SESSION,
          reason,
        });
        expect(r.success).toBe(true);
      }
    });
  });
});
