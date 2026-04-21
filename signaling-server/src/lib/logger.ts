import pino from "pino";
import type { Env } from "./env";

// Creates a Pino logger. In development, routes through pino-pretty for readable output.
// In production, emits JSON to stdout.
//
// Redaction: never log PINs in clear (DEV-RULES §10). Callers pass maskPin() for PIN fields.
export function createLogger(env: Env): pino.Logger {
  if (env.NODE_ENV === "development") {
    return pino({
      level: env.LOG_LEVEL,
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
  }
  return pino({ level: env.LOG_LEVEL });
}

// Returns a redacted representation of a PIN suitable for logging.
// "123-456-789" -> "***-***-***"
export function maskPin(pin: string): string {
  return pin.replace(/\d/g, "*");
}
