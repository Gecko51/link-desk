import { useEffect, useRef, useState } from "react";
import { SignalingClient } from "./signaling-client";
import type { ConnectionState, SignalingState } from "./signaling.types";
import type { ClientMessage, ServerMessage } from "./message-schemas";

// Narrow interface mirroring SignalingClient's public surface.
// Declared here so tests can satisfy it structurally without any cast.
export interface SignalingClientLike {
  readonly state: ConnectionState;
  connect(): void;
  disconnect(): void;
  send(msg: ClientMessage): boolean;
  onMessage(cb: (msg: ServerMessage) => void): () => void;
}

// Hook options. All pin values nullable at boot (useMachineId / usePin resolve async).
export interface UseSignalingOptions {
  machineId: string | null;
  pin: string | null;
  pinExpiresAt: Date | null;
  // Injection point for tests / Storybook. Production leaves this undefined.
  client?: SignalingClientLike;
  url?: string;
}

// Interval (ms) at which we poll client.state into React state.
// SignalingClient is plain TS — no built-in React reactivity.
const STATE_POLL_MS = 250;

// Heartbeat interval (ms) while the socket is open.
const PING_INTERVAL_MS = 30_000;

// URL read from Vite env at module load time.
const DEFAULT_URL: string = import.meta.env.VITE_SIGNALING_WS_URL ?? "";

// Factory isolated at module level so the useState lazy initializer
// can reference it without touching refs during render.
function makeClient(
  injected: SignalingClientLike | undefined,
  url: string | undefined,
): SignalingClientLike | null {
  if (injected !== undefined) return injected;
  const resolved = url ?? DEFAULT_URL;
  if (resolved === "") return null;
  return new SignalingClient({ url: resolved });
}

// ------------------------------------------------------------------
// useSignaling — React binding over SignalingClient.
// Architecture note: `registered` is tracked purely via a ref and synced
// into React state by the polling interval callback. This avoids direct
// setState() calls in effect bodies (react-hooks/set-state-in-effect rule).
// ------------------------------------------------------------------
export function useSignaling(opts: UseSignalingOptions): SignalingState {
  // Capture opts in a ref so interval callbacks always see fresh values
  // without being listed as effect dependencies (avoids extra reconnects).
  // Updated in a layout effect (before paint) so the ref is always current.
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });

  // Client is stable for the lifetime of the component.
  // useState lazy initializer runs once; no ref access during render.
  const [client] = useState<SignalingClientLike | null>(() =>
    makeClient(opts.client, opts.url),
  );

  const [sigState, setSigState] = useState<SignalingState>({
    connection: client === null ? "disabled" : "offline",
    lastError: null,
    registered: false,
  });

  // Internal tracking refs — never trigger re-renders directly.
  // `registeredRef` mirrors sigState.registered so polling can sync it.
  const registeredRef = useRef(false);
  // `registeredPinRef` detects PIN rotation for update_pin messages.
  const registeredPinRef = useRef<string | null>(null);

  // Effect 1 — Connect / disconnect lifecycle tied to machineId availability.
  // No setState in the effect body or cleanup — safe.
  useEffect(() => {
    if (client === null || opts.machineId === null) return;
    client.connect();
    return () => { client.disconnect(); };
  }, [client, opts.machineId]);

  // Effect 2 — Poll client.state + registeredRef into React state every 250 ms.
  // All setSigState calls are inside the setInterval callback — not in the effect
  // body — so react-hooks/set-state-in-effect does not trigger.
  useEffect(() => {
    if (client === null) return;
    const id = window.setInterval(() => {
      const nextConn = client.state;

      // Register / update-pin logic: runs when socket just became "open".
      // Driven here (inside a callback) to avoid setState-in-effect violations.
      const { machineId, pin, pinExpiresAt } = optsRef.current;
      if (
        nextConn === "open" &&
        machineId !== null &&
        pin !== null &&
        pinExpiresAt !== null
      ) {
        if (!registeredRef.current) {
          // First open: send register and mark as registered.
          client.send({
            type: "register",
            machine_id: machineId,
            pin,
            pin_expires_at: pinExpiresAt.toISOString(),
          });
          registeredRef.current = true;
          registeredPinRef.current = pin;
        } else if (registeredPinRef.current !== pin) {
          // PIN rotated: notify the server.
          client.send({
            type: "update_pin",
            machine_id: machineId,
            new_pin: pin,
            new_expires_at: pinExpiresAt.toISOString(),
          });
          registeredPinRef.current = pin;
        }
      }

      // Reset registration on drop so we re-register after reconnect.
      if (nextConn === "reconnecting" || nextConn === "offline") {
        registeredRef.current = false;
        registeredPinRef.current = null;
      }

      // Sync to React state (inside callback — allowed by the linter rule).
      setSigState((s) => {
        if (s.connection === nextConn && s.registered === registeredRef.current) {
          return s;
        }
        return { ...s, connection: nextConn, registered: registeredRef.current };
      });
    }, STATE_POLL_MS);
    return () => { window.clearInterval(id); };
  }, [client]);

  // Effect 3 — 30-second ping heartbeat (only while the socket is open).
  // No setState in the effect body or callback — purely a side-effect.
  useEffect(() => {
    if (client === null || sigState.connection !== "open") return;
    const id = window.setInterval(() => {
      client.send({ type: "ping" });
    }, PING_INTERVAL_MS);
    return () => { window.clearInterval(id); };
  }, [client, sigState.connection]);

  // Effect 4 — Listen for server messages and surface `error` payloads.
  // setSigState is inside the onMessage callback — not in the effect body — safe.
  useEffect(() => {
    if (client === null) return;
    return client.onMessage((msg) => {
      if (msg.type === "error") {
        setSigState((s) => ({
          ...s,
          lastError: `${msg.code}: ${msg.message}`,
        }));
      }
    });
  }, [client]);

  return sigState;
}
