// Connection request tracker: manages in-memory store of pending/accepted connection handshakes.
// Pending requests auto-expire after ttlMs; accepted requests stay until remove() is called.
// The P2P connection owns the lifetime of accepted requests.

export type ConnectionRequestStatus = "pending" | "accepted" | "denied" | "expired";

export interface ConnectionRequest {
  sessionId: string;
  controllerId: string;
  hostId: string;
  status: ConnectionRequestStatus;
  createdAt: Date;
  pinUsed?: string;
}

interface CreateInput {
  controllerId: string;
  hostId: string;
  pinUsed?: string;
}

interface TrackerOptions {
  ttlMs: number;
}

type ExpireListener = (sessionId: string) => void;

// In-memory tracker for connection requests with automatic TTL expiry for pending requests.
export class ConnectionRequestTracker {
  private readonly ttlMs: number;
  private readonly requests = new Map<string, ConnectionRequest>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<ExpireListener>();

  constructor(opts: TrackerOptions) {
    this.ttlMs = opts.ttlMs;
  }

  // Creates a new pending request with a fresh UUID session_id.
  create(input: CreateInput): ConnectionRequest {
    const sessionId = crypto.randomUUID();
    const req: ConnectionRequest = {
      sessionId,
      controllerId: input.controllerId,
      hostId: input.hostId,
      status: "pending",
      createdAt: new Date(),
      pinUsed: input.pinUsed,
    };
    this.requests.set(sessionId, req);
    this.scheduleExpiry(sessionId);
    return req;
  }

  // Finds a request by sessionId or undefined.
  find(sessionId: string): ConnectionRequest | undefined {
    return this.requests.get(sessionId);
  }

  // Marks a request as accepted and cancels its expiry timer.
  // Accepted requests stay in the store until remove() is called.
  markAccepted(sessionId: string): void {
    const req = this.requests.get(sessionId);
    if (!req) return;
    req.status = "accepted";
    this.clearTimer(sessionId);
  }

  // Marks a request as denied and cancels its expiry timer.
  markDenied(sessionId: string): void {
    const req = this.requests.get(sessionId);
    if (!req) return;
    req.status = "denied";
    this.clearTimer(sessionId);
  }

  // Removes the request and clears its timer. No-op if unknown.
  remove(sessionId: string): void {
    this.clearTimer(sessionId);
    this.requests.delete(sessionId);
  }

  // Registers a callback for pending-to-expired transitions.
  // Returns an unsubscribe function.
  onExpire(listener: ExpireListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Schedules automatic expiry of a pending request after ttlMs.
  private scheduleExpiry(sessionId: string): void {
    const id = setTimeout(() => {
      const req = this.requests.get(sessionId);
      if (!req || req.status !== "pending") return;
      req.status = "expired";
      this.requests.delete(sessionId);
      this.timers.delete(sessionId);
      for (const l of this.listeners) l(sessionId);
    }, this.ttlMs);
    this.timers.set(sessionId, id);
  }

  // Returns a snapshot of all tracked requests. Used by the close handler to find
  // sessions involving a disconnecting peer.
  list(): ConnectionRequest[] {
    return Array.from(this.requests.values());
  }

  // Clears the expiry timer for a sessionId.
  private clearTimer(sessionId: string): void {
    const id = this.timers.get(sessionId);
    if (id) clearTimeout(id);
    this.timers.delete(sessionId);
  }
}

// Returns all requests (pending or accepted) that involve the given machine.
export function findSessionsForMachine(
  tracker: ConnectionRequestTracker,
  machineId: string,
): ConnectionRequest[] {
  return tracker.list().filter(
    (r) => r.controllerId === machineId || r.hostId === machineId,
  );
}
