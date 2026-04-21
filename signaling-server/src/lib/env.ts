import { z } from "zod";

// Env schema. Numeric coercion on PORT via z.coerce.
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

// Parses env vars and throws with a helpful error on invalid input.
// Accepts a plain record so tests can inject arbitrary input without touching process.env.
export function loadEnv(input: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}
