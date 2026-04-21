import type { Pin } from "./pin.types";

const PIN_LENGTH = 9;
const PIN_PATTERN = /^\d{3}-\d{3}-\d{3}$/;

// Generates a 9-digit PIN using crypto.getRandomValues (CSPRNG).
// DEV-RULES §10: PINs must never come from Math.random.
export function generatePin(): Pin {
  const bytes = new Uint32Array(PIN_LENGTH);
  crypto.getRandomValues(bytes);
  // Map each 32-bit value to a single digit [0-9] via modulo.
  // Modulo bias is negligible here (2^32 mod 10 = 6, bias < 1.4e-9 per digit).
  const digits = Array.from(bytes, (n) => (n % 10).toString()).join("");
  return formatPin(digits);
}

// Formats a 9-digit string into "XXX-XXX-XXX". Throws on malformed input.
export function formatPin(raw: string): Pin {
  if (!/^\d{9}$/.test(raw)) {
    throw new Error(`Invalid PIN body: expected 9 digits, got "${raw}"`);
  }
  return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 9)}`;
}

// Parses "XXX-XXX-XXX" into "XXXXXXXXX". Returns null if the format is wrong.
// Accepts exactly the canonical format - callers should normalize first.
export function parsePin(formatted: string): string | null {
  if (!PIN_PATTERN.test(formatted)) return null;
  return formatted.replace(/-/g, "");
}
