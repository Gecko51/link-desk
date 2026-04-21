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

export interface BuildServerResult {
  app: FastifyInstance;
  sessions: SessionManager;
}

// Builds (but does not start) a Fastify server wired with:
//  - /health            GET liveness
//  - /signaling         WebSocket upgrade
// Returns both the app and the session manager so tests can inspect server state.
export async function buildServer(opts: BuildServerOptions): Promise<BuildServerResult> {
  const logger = createLogger(opts.env);
  const sessions = new SessionManager();

  // Disable Fastify's built-in logger - we pass our own Pino instance (DEV-RULES §3).
  const app = Fastify({ logger: false });

  await app.register(websocket);
  await app.register(healthRoute);

  // @fastify/websocket v10 handler receives (socket, req) where `socket` is the raw ws.WebSocket.
  app.get("/signaling", { websocket: true }, (socket, _req) => {
    handleConnection(socket, { manager: sessions, logger });
  });

  return { app, sessions };
}
