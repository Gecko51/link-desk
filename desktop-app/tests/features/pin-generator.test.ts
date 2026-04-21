import { generatePin, formatPin, parsePin } from "@/features/pin/pin-generator";

describe("pin-generator", () => {
  describe("generatePin", () => {
    it("returns a string in XXX-XXX-XXX format", () => {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{3}-\d{3}-\d{3}$/);
    });

    it("uses crypto-secure randomness (distinct calls differ)", () => {
      const pins = new Set(Array.from({ length: 100 }, () => generatePin()));
      // With CSPRNG the collision probability across 100 calls is negligible.
      expect(pins.size).toBeGreaterThan(95);
    });
  });

  describe("formatPin", () => {
    it("inserts dashes every 3 chars", () => {
      expect(formatPin("123456789")).toBe("123-456-789");
    });

    it("throws if input is not 9 digits", () => {
      expect(() => formatPin("12345678")).toThrow();
      expect(() => formatPin("abcdefghi")).toThrow();
    });
  });

  describe("parsePin", () => {
    it("strips dashes and returns 9 digits", () => {
      expect(parsePin("123-456-789")).toBe("123456789");
    });

    it("returns null on invalid format", () => {
      expect(parsePin("12-345-678")).toBeNull();
      expect(parsePin("abc-def-ghi")).toBeNull();
    });
  });
});
