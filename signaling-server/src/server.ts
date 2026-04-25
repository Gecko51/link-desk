import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { SessionManager } from "@/websocket/session-manager";
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";
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
  tracker: ConnectionRequestTracker;
}

// Builds (but does not start) the Fastify server wired with /health + /signaling.
// Returns sessions + tracker so tests can inspect server state.
export async function buildServer(opts: BuildServerOptions): Promise<BuildServerResult> {
  const logger = createLogger(opts.env);
  const sessions = new SessionManager();
  const tracker = new ConnectionRequestTracker({ ttlMs: 30_000 });

  // Disable Fastify's built-in logger - we use our own Pino.
  const app = Fastify({ logger: false });
  await app.register(websocket);
  await app.register(healthRoute);

  // @fastify/websocket v10: handler receives (socket, req) where socket is raw ws.WebSocket.
  app.get("/signaling", { websocket: true }, (socket, _req) => {
    handleConnection(socket, { manager: sessions, tracker, logger });
  });

  return { app, sessions, tracker };
}
