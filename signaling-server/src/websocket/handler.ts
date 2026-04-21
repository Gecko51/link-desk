import type { WebSocket } from "ws";
import type { Logger } from "pino";
import type { SessionManager } from "./session-manager";
import { routeMessage } from "./message-router";
import { maskPin } from "@/lib/logger";

// Max silence before forced disconnect (DEV-RULES §7 — 30 s ping + 10 s timeout + slack).
const HEARTBEAT_TIMEOUT_MS = 45_000;

// Interval between heartbeat checks. Short enough to enforce the 45 s grace window
// without being so frequent it wastes CPU.
const HEARTBEAT_CHECK_INTERVAL_MS = 15_000;

interface ConnectionOptions {
  manager: SessionManager;
  logger: Logger;
}

// Wires all lifecycle events (message / close / error) on a freshly accepted WebSocket.
// A closure tracks machineId so cleanup on disconnect requires no outbound message parsing.
// A periodic timer enforces the heartbeat contract: silent clients are force-closed.
export function handleConnection(socket: WebSocket, opts: ConnectionOptions): void {
  // Each connection gets its own child logger with a unique socket_id for tracing.
  let machineId: string | undefined;
  const log = opts.logger.child({ socket_id: crypto.randomUUID() });

  log.info("client connected");

  // --- Inbound message handler ---
  socket.on("message", (raw) => {
    // ws v8 delivers Buffer | string | ArrayBuffer; coerce to UTF-8 string.
    const text = Buffer.isBuffer(raw)
      ? raw.toString("utf-8")
      : typeof raw === "string"
        ? raw
        : Buffer.from(raw as ArrayBuffer).toString("utf-8");

    // Delegate routing and error acks to the pure routeMessage function.
    routeMessage(text, { manager: opts.manager, socket, machineId });

    // Inspect the inbound payload to resolve machineId for subsequent lifecycle events.
    // Errors are swallowed here because routeMessage already sent an error ack to the client.
    try {
      const scan = JSON.parse(text) as {
        type?: string;
        machine_id?: string;
        new_pin?: string;
      };

      if (
        scan.type === "register" &&
        typeof scan.machine_id === "string" &&
        opts.manager.findByMachineId(scan.machine_id)
      ) {
        // Resolve machineId so subsequent events (close, heartbeat) can look up the session.
        machineId = scan.machine_id;
        log.info({ machineId }, "client registered");
      }

      if (scan.type === "update_pin" && typeof scan.machine_id === "string") {
        // DEV-RULES §10: never log PINs in clear — pass through maskPin.
        log.debug(
          {
            machineId: scan.machine_id,
            pin: scan.new_pin ? maskPin(scan.new_pin) : undefined,
          },
          "pin updated",
        );
      }
    } catch {
      // Unparseable payload already handled by routeMessage — nothing to log here.
    }
  });

  // --- Heartbeat timer ---
  // Runs every HEARTBEAT_CHECK_INTERVAL_MS. If the client has been silent for more
  // than HEARTBEAT_TIMEOUT_MS since its last ping, the socket is force-closed.
  const heartbeatTimer = setInterval(() => {
    if (!machineId) return;
    const client = opts.manager.findByMachineId(machineId);
    if (!client) return;

    const elapsed = Date.now() - client.lastPingAt.getTime();
    if (elapsed > HEARTBEAT_TIMEOUT_MS) {
      log.warn({ machineId, elapsed }, "heartbeat timeout — closing socket");
      try {
        socket.close();
      } catch {
        // Ignore errors on half-closed sockets.
      }
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS);

  // --- Close handler ---
  socket.on("close", () => {
    clearInterval(heartbeatTimer);
    if (machineId) {
      opts.manager.remove(machineId);
      log.info({ machineId }, "client disconnected");
    }
  });

  // --- Error handler ---
  socket.on("error", (err: unknown) => {
    log.error({ err }, "socket error");
  });
}
