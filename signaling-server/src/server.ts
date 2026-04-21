import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { SessionManager } from "@/websocket/session-manager";
import { handleConnection } from "@/websocket/handler";
import { healthRoute } from "@/routes/health";
import { createLogger } from "@/lib/logger";
import type { Env } from "@/lib/env";

export interface BuildServerOptions {
  env: Env;
}

// Builds (but does not start) a Fastify server wired with:
//  - /health            GET liveness
//  - /signaling         WebSocket upgrade
// The returned instance also exposes `sessions` for tests.
export async function buildServer(
  opts: BuildServerOptions,
): Promise<FastifyInstance & { sessions: SessionManager }> {
  const logger = createLogger(opts.env);
  const sessions = new SessionManager();

  // Disable Fastify's built-in logger — we pass our own Pino instance (DEV-RULES §3).
  const app = Fastify({ logger: false });

  await app.register(websocket);
  await app.register(healthRoute);

  // Context7 confirmed: @fastify/websocket v10 handler receives (socket, req)
  // where `socket` is the raw ws.WebSocket — no `.socket` indirection needed.
  app.get("/signaling", { websocket: true }, (socket, _req) => {
    handleConnection(socket, { manager: sessions, logger });
  });

  // Expose sessions for integration tests (Task 9).
  // Double-cast via `unknown` is required here: TypeScript cannot widen `app`
  // directly to the intersection because `sessions` is not part of FastifyInstance.
  // This pattern is explicitly allowed by DEV-RULES for augmented return types.
  (app as unknown as { sessions: SessionManager }).sessions = sessions;
  return app as unknown as FastifyInstance & { sessions: SessionManager };
}
