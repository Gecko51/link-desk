import { buildServer } from "./server";
import { loadEnv } from "./lib/env";
import { createLogger } from "./lib/logger";

// Starts the server. Any bootstrap failure exits the process with non-zero code
// so supervisors (systemd, PM2, Docker) can restart.
async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const logger = createLogger(env);
  const app = await buildServer({ env });

  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    logger.info({ port: env.PORT }, "signaling server listening");
  } catch (err) {
    logger.error({ err }, "failed to start");
    process.exit(1);
  }
}

main();
