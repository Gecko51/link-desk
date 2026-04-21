import {
  RegisterMessageSchema,
  UpdatePinMessageSchema,
  PingMessageSchema,
  parseClientMessage,
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
});
