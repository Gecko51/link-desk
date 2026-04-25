import type { WebSocket } from "ws";
import type { Logger } from "pino";
import type { SessionManager } from "./session-manager";
import type { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import { findSessionsForMachine } from "@/features/connect/connection-requests";
import { routeMessage } from "./message-router";

// Max silence before forced disconnect (DEV-RULES §7 — 30 s ping + 10 s timeout + slack).
const HEARTBEAT_TIMEOUT_MS = 45_000;

// Interval between heartbeat checks. Short enough to enforce the 45 s grace window
// without being so frequent it wastes CPU.
const HEARTBEAT_CHECK_INTERVAL_MS = 15_000;

interface ConnectionOptions {
  manager: SessionManager;
  tracker: ConnectionRequestTracker;
  logger: Logger;
}

// Shared mutable state between the orchestrator and its helpers.
// Replaces the closure variable so each helper can observe machineId updates.
interface ConnectionState {
  machineId?: string;
}

// Coerces any inbound ws v8 payload (Buffer / string / ArrayBuffer) to a UTF-8 string.
function toText(raw: unknown): string {
  if (Buffer.isBuffer(raw)) return raw.toString("utf-8");
  if (typeof raw === "string") return raw;
  return Buffer.from(raw as ArrayBuffer).toString("utf-8");
}

// Attaches the message listener: routes the message, then scans the payload
// to resolve machineId (on register) and emit a pin-update log.
function attachMessageListener(
  socket: WebSocket,
  state: ConnectionState,
  opts: ConnectionOptions,
  log: Logger,
): void {
  socket.on("message", (raw) => {
    const text = toText(raw);

    // Delegate routing + error acks to the pure routeMessage function.
    routeMessage(text, { manager: opts.manager, tracker: opts.tracker, socket, machineId: state.machineId });

    // Inspect the payload to resolve machineId for subsequent lifecycle events.
    // Parse errors are defensive only — routeMessage already error-acked invalid JSON.
    try {
      const scan = JSON.parse(text) as { type?: string; machine_id?: string };

      if (
        scan.type === "register" &&
        typeof scan.machine_id === "string" &&
        opts.manager.findByMachineId(scan.machine_id)
      ) {
        state.machineId = scan.machine_id;
        log.info({ machineId: state.machineId }, "client registered");
      }

      if (scan.type === "update_pin" && typeof scan.machine_id === "string") {
        // DEV-RULES §10: never log PINs — log only the fact that it changed.
        log.debug({ machineId: scan.machine_id, pinUpdated: true }, "pin updated");
      }
    } catch {
      // Defensive — routeMessage already error-acked invalid JSON.
    }
  });
}

// Starts a periodic heartbeat check. Silent clients (> HEARTBEAT_TIMEOUT_MS)
// get their socket force-closed. Returns the timer id for cleanup on close.
function startHeartbeatTimer(
  socket: WebSocket,
  state: ConnectionState,
  opts: ConnectionOptions,
  log: Logger,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    if (!state.machineId) return;
    const client = opts.manager.findByMachineId(state.machineId);
    if (!client) return;

    const elapsed = Date.now() - client.lastPingAt.getTime();
    if (elapsed > HEARTBEAT_TIMEOUT_MS) {
      log.warn({ machineId: state.machineId, elapsed }, "heartbeat timeout — closing socket");
      try {
        socket.close();
      } catch {
        // Ignore errors on half-closed sockets.
      }
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS);
}

// Wires all lifecycle events (message / close / error) on a freshly accepted WebSocket.
// Orchestrates the two helpers above and owns the close/error listeners directly.
export function handleConnection(socket: WebSocket, opts: ConnectionOptions): void {
  const state: ConnectionState = {};
  const log = opts.logger.child({ socket_id: crypto.randomUUID() });
  log.info("client connected");

  attachMessageListener(socket, state, opts, log);
  const heartbeatTimer = startHeartbeatTimer(socket, state, opts, log);

  socket.on("close", () => {
    clearInterval(heartbeatTimer);
    if (state.machineId) {
      // Notify any peer currently sharing a session with us.
      for (const req of findSessionsForMachine(opts.tracker, state.machineId)) {
        const peerMachineId = req.controllerId === state.machineId ? req.hostId : req.controllerId;
        const peer = opts.manager.findByMachineId(peerMachineId);
        if (peer) {
          const reason = req.controllerId === state.machineId
            ? "controller_disconnected" as const
            : "host_disconnected" as const;
          peer.socket.send(JSON.stringify({
            type: "peer_disconnected" as const,
            session_id: req.sessionId,
            reason,
          }));
        }
        opts.tracker.remove(req.sessionId);
      }
      opts.manager.remove(state.machineId);
      log.info({ machineId: state.machineId }, "client disconnected");
    }
  });

  socket.on("error", (err: unknown) => {
    log.error({ err }, "socket error");
  });
}
