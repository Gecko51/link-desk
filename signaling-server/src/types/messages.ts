// Re-export the inferred types for convenience. Callers import from here for types
// and from `@/websocket/schemas` for runtime parsing.
export type { ClientMessage, ServerMessage } from "@/websocket/schemas";
