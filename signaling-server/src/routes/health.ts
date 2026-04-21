import type { FastifyInstance } from "fastify";

// Minimal liveness endpoint. Phase 5 may expand with readiness checks.
export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));
}
