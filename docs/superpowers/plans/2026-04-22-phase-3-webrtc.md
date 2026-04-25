# LinkDesk — Phase 3 : Handshake WebRTC & consentement — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Établir un data channel WebRTC P2P entre un contrôleur et un hôte après consentement explicite de l'hôte via popup OS-level. Échange d'un "hello world" dans les 2 sens. Aucune vidéo, aucune injection d'inputs (Phase 4).

**Architecture :** Le signaling server route 8 nouveaux types de messages entre 2 clients identifiés par `session_id`. Côté client, un hook `useSession` orchestre une state machine (`idle → requesting → awaiting_consent → negotiating → connected → ended`) en consommant `useSignaling` + `usePeerConnection` + `useDataChannel`. Une commande Rust `show_consent_dialog` utilise `tauri-plugin-dialog` pour la popup OS-level avec timeout 30s.

**Tech Stack :** WebRTC (`RTCPeerConnection`, `RTCDataChannel`) · STUN Google · Fastify + ws · `tauri-plugin-dialog` 2.x · Zod · Vitest · TypeScript strict

**Livrable :** Tag Git `v0.3-webrtc`.

---

## Prérequis

- Phase 2 mergée sur master (tag `v0.2-signaling` présent).
- Branche `feat/phase-3-webrtc` créée depuis master (fait).
- Context7 MCP opérationnel.

**Règle transverse :** Context7 avant toute API de `tauri-plugin-dialog` et `@fastify/websocket`. Pour WebRTC, référence MDN prioritaire (stable, bien documentée).

---

## Décisions d'architecture (figées)

1. **ICE strategy = wait-for-complete** (DEV-RULES §7). `ice_candidate` relayé côté serveur pour future Phase 5 trickle, mais AUCUN émis en Phase 3 — les candidats sont dans le SDP final.
2. **Popup consentement = native OS dialog** via `tauri-plugin-dialog`. 30s timeout → refus par défaut.
3. **Session ID = UUID serveur** généré à `connect_request`. Clé de routage pour sdp/ice/consent/disconnect.
4. **Data channel Phase 3** = 1 canal `{ ordered: true }` (reliable). Phase 4 utilisera `{ ordered: true, maxRetransmits: 0 }` pour inputs low-latency.
5. **ConnectionRequests** = tracker in-memory séparé du SessionManager, TTL 30s sur `pending`, illimité sur `accepted`.
6. **`session_ready`** (server → controller) signale l'acceptation de l'hôte et déclenche la création de l'offer SDP côté contrôleur.
7. **Pas de TURN, pas de rate-limit, pas de trickle ICE** — Phase 5.

---

## Protocole de messages (Phase 3)

| Type | Sens | Quand |
|---|---|---|
| `connect_request` | Controller → Server | User clique "Se connecter" avec un PIN |
| `connect_offer` | Server → Host | Server a résolu PIN → host |
| `consent_response` | Host → Server | User a accepté / refusé dans la popup OS |
| `session_ready` | Server → Controller | Host a accepté — controller peut créer l'offer |
| `sdp_offer` | Controller → Server → Host | Offer WebRTC (ICE inclus, wait-for-complete) |
| `sdp_answer` | Host → Server → Controller | Answer WebRTC |
| `ice_candidate` | Either → Server → Peer | Phase 5 only — défini mais unused en Phase 3 |
| `peer_disconnected` | Server → Either | `declined` / `timeout` / `host_disconnected` / `controller_disconnected` |

---

## File Structure

### Server (`signaling-server/`)

Modifiés :
- `src/websocket/schemas.ts` (+ tests) — nouveaux schemas
- `src/websocket/message-router.ts` — dispatch étendu
- `src/websocket/handler.ts` — `peer_disconnected` au peer sur close

Ajoutés :
- `src/features/connect/connection-requests.ts` + test
- `src/features/connect/connect-handler.ts` + test
- `src/features/connect/consent-handler.ts` + test
- `src/features/relay/sdp-relay.ts` + test
- `tests/integration/connect-flow.test.ts`

### Client (`desktop-app/`)

**Rust :**
- `src-tauri/Cargo.toml` (+ `tauri-plugin-dialog = "2"`)
- `src-tauri/src/lib.rs` (register plugin + commande)
- `src-tauri/src/commands/consent.rs` (`show_consent_dialog`)
- `src-tauri/capabilities/default.json` (+ `dialog:default`)

**Frontend nouveaux :**
- `src/features/webrtc/{webrtc.types.ts, peer-config.ts, offer-answer.ts, use-peer-connection.ts, use-data-channel.ts}`
- `src/features/session/{session.types.ts, session-state-machine.ts, use-session.ts}`
- `src/routes/{controller-connecting.tsx, controller-session.tsx, host-session.tsx}`
- Tests miroirs

**Frontend modifiés :**
- `src/types/tauri-commands.ts` (+ `show_consent_dialog`)
- `src/features/signaling/message-schemas.ts` (mirror)
- `src/app-state.tsx` (+ session dans AppState)
- `src/App.tsx` (call `useSession` + nouvelles routes)
- `src/routes/controller.tsx` (wire connect flow)

---

## Task 1 : Server — schemas WebRTC (TDD)

**Files :** Modify `signaling-server/src/websocket/schemas.ts` + `tests/websocket/schemas.test.ts`.

- [ ] **Step 1 : Tests**

Ajouter à la fin de `tests/websocket/schemas.test.ts` (dans le `describe("websocket schemas", ...)` existant) :

```typescript
  describe("webrtc phase 3", () => {
    const SESSION = "550e8400-e29b-41d4-a716-446655440010";
    const CONTROLLER = "550e8400-e29b-41d4-a716-446655440000";
    const HOST = "550e8400-e29b-41d4-a716-446655440001";

    it("validates connect_request", () => {
      const r = ConnectRequestMessageSchema.safeParse({
        type: "connect_request",
        controller_id: CONTROLLER,
        target_pin: "123-456-789",
      });
      expect(r.success).toBe(true);
    });

    it("rejects connect_request with invalid pin", () => {
      const r = ConnectRequestMessageSchema.safeParse({
        type: "connect_request",
        controller_id: CONTROLLER,
        target_pin: "bad",
      });
      expect(r.success).toBe(false);
    });

    it("validates connect_offer", () => {
      const r = ConnectOfferMessageSchema.safeParse({
        type: "connect_offer",
        session_id: SESSION,
        controller_id: CONTROLLER,
      });
      expect(r.success).toBe(true);
    });

    it("validates consent_response (accepted)", () => {
      const r = ConsentResponseMessageSchema.safeParse({
        type: "consent_response",
        session_id: SESSION,
        accepted: true,
      });
      expect(r.success).toBe(true);
    });

    it("validates session_ready", () => {
      const r = SessionReadyMessageSchema.safeParse({
        type: "session_ready",
        session_id: SESSION,
        host_id: HOST,
      });
      expect(r.success).toBe(true);
    });

    it("validates sdp_offer", () => {
      const r = SdpOfferMessageSchema.safeParse({
        type: "sdp_offer",
        session_id: SESSION,
        sdp: { type: "offer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n" },
      });
      expect(r.success).toBe(true);
    });

    it("validates ice_candidate", () => {
      const r = IceCandidateMessageSchema.safeParse({
        type: "ice_candidate",
        session_id: SESSION,
        candidate: { candidate: "candidate:1 1 UDP 2130706431 1.2.3.4 54321 typ host" },
      });
      expect(r.success).toBe(true);
    });

    it("validates peer_disconnected with all reason codes", () => {
      const reasons = ["host_disconnected", "controller_disconnected", "timeout", "declined"] as const;
      for (const reason of reasons) {
        const r = PeerDisconnectedMessageSchema.safeParse({
          type: "peer_disconnected",
          session_id: SESSION,
          reason,
        });
        expect(r.success).toBe(true);
      }
    });
  });
```

Ajouter les imports au top : `ConnectRequestMessageSchema, ConnectOfferMessageSchema, ConsentResponseMessageSchema, SessionReadyMessageSchema, SdpOfferMessageSchema, SdpAnswerMessageSchema, IceCandidateMessageSchema, PeerDisconnectedMessageSchema` depuis `@/websocket/schemas`.

- [ ] **Step 2 : Lancer — fail** (`npm test -w @linkdesk/signaling-server -- schemas`)

- [ ] **Step 3 : Implémenter**

Dans `src/websocket/schemas.ts`, AVANT la déclaration de `ClientMessageSchema`, insérer :

```typescript
// --- Phase 3: WebRTC handshake ---

const SessionIdSchema = z.string().uuid();

// RTCSessionDescriptionInit shape (browser native).
const SdpDescriptionSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().optional(),
});

// RTCIceCandidateInit — all fields optional per spec except `candidate`.
const IceCandidateInitSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

// Client → Server: open a session to the host behind target_pin.
export const ConnectRequestMessageSchema = z.object({
  type: z.literal("connect_request"),
  controller_id: MachineIdSchema,
  target_pin: z.string().regex(/^\d{3}-\d{3}-\d{3}$/),
});

// Server → Host: pending controller wants to connect.
export const ConnectOfferMessageSchema = z.object({
  type: z.literal("connect_offer"),
  session_id: SessionIdSchema,
  controller_id: MachineIdSchema,
});

// Host → Server: user accepted/refused the connect_offer.
export const ConsentResponseMessageSchema = z.object({
  type: z.literal("consent_response"),
  session_id: SessionIdSchema,
  accepted: z.boolean(),
});

// Server → Controller: host accepted, you can now create the SDP offer.
export const SessionReadyMessageSchema = z.object({
  type: z.literal("session_ready"),
  session_id: SessionIdSchema,
  host_id: MachineIdSchema,
});

// Controller → Server → Host: SDP offer (ICE candidates embedded, wait-for-complete).
export const SdpOfferMessageSchema = z.object({
  type: z.literal("sdp_offer"),
  session_id: SessionIdSchema,
  sdp: SdpDescriptionSchema,
});

// Host → Server → Controller: SDP answer.
export const SdpAnswerMessageSchema = z.object({
  type: z.literal("sdp_answer"),
  session_id: SessionIdSchema,
  sdp: SdpDescriptionSchema,
});

// Either peer → Server → other peer: trickle ICE (unused in Phase 3, Phase 5 opt-in).
export const IceCandidateMessageSchema = z.object({
  type: z.literal("ice_candidate"),
  session_id: SessionIdSchema,
  candidate: IceCandidateInitSchema,
});

// Server → Peer: the session was cut short.
export const PeerDisconnectedMessageSchema = z.object({
  type: z.literal("peer_disconnected"),
  session_id: SessionIdSchema,
  reason: z.enum(["host_disconnected", "controller_disconnected", "timeout", "declined"]),
});
```

**Remplacer** `ClientMessageSchema` par :

```typescript
export const ClientMessageSchema = z.discriminatedUnion("type", [
  RegisterMessageSchema,
  UpdatePinMessageSchema,
  PingMessageSchema,
  ConnectRequestMessageSchema,
  ConsentResponseMessageSchema,
  SdpOfferMessageSchema,
  SdpAnswerMessageSchema,
  IceCandidateMessageSchema,
]);
```

**Remplacer** `ServerMessageSchema` par :

```typescript
export const ServerMessageSchema = z.discriminatedUnion("type", [
  RegisteredAckSchema,
  PinUpdatedAckSchema,
  PongMessageSchema,
  ErrorMessageSchema,
  ConnectOfferMessageSchema,
  SessionReadyMessageSchema,
  SdpOfferMessageSchema,
  SdpAnswerMessageSchema,
  IceCandidateMessageSchema,
  PeerDisconnectedMessageSchema,
]);
```

Note : `SdpOfferMessageSchema`, `SdpAnswerMessageSchema`, `IceCandidateMessageSchema` apparaissent dans les DEUX unions — intentionnel, le server relaie.

- [ ] **Step 4 : Pass + lint + typecheck**

- [ ] **Step 5 : Commit**

```bash
git add signaling-server/src/websocket/schemas.ts signaling-server/tests/websocket/schemas.test.ts
git commit -m "feat(signaling): add webrtc handshake message schemas"
```

---

## Task 2 : Server — `ConnectionRequestTracker` (TDD)

**Files :** Create `signaling-server/src/features/connect/connection-requests.ts` + test.

- [ ] **Step 1 : Test** (`tests/features/connect/connection-requests.test.ts`) :

```typescript
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";

describe("ConnectionRequestTracker", () => {
  let tracker: ConnectionRequestTracker;
  const A = "550e8400-e29b-41d4-a716-446655440000";
  const B = "550e8400-e29b-41d4-a716-446655440001";

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new ConnectionRequestTracker({ ttlMs: 30_000 });
  });
  afterEach(() => vi.useRealTimers());

  it("creates a pending request with a fresh session_id", () => {
    const req = tracker.create({ controllerId: A, hostId: B });
    expect(req.sessionId).toMatch(/^[0-9a-f-]+$/);
    expect(req.status).toBe("pending");
  });

  it("finds / removes a request", () => {
    const req = tracker.create({ controllerId: A, hostId: B });
    expect(tracker.find(req.sessionId)).toBe(req);
    tracker.remove(req.sessionId);
    expect(tracker.find(req.sessionId)).toBeUndefined();
  });

  it("markAccepted freezes expiry", () => {
    const req = tracker.create({ controllerId: A, hostId: B });
    tracker.markAccepted(req.sessionId);
    vi.advanceTimersByTime(60_000);
    expect(tracker.find(req.sessionId)?.status).toBe("accepted");
  });

  it("expires pending requests after ttlMs and fires onExpire", () => {
    const onExpire = vi.fn();
    tracker.onExpire(onExpire);
    const req = tracker.create({ controllerId: A, hostId: B });
    vi.advanceTimersByTime(29_999);
    expect(tracker.find(req.sessionId)).toBeDefined();
    vi.advanceTimersByTime(2);
    expect(tracker.find(req.sessionId)).toBeUndefined();
    expect(onExpire).toHaveBeenCalledWith(req.sessionId);
  });
});
```

- [ ] **Step 2 : Fail**

- [ ] **Step 3 : Implémenter** (`src/features/connect/connection-requests.ts`) :

```typescript
export type ConnectionRequestStatus = "pending" | "accepted" | "denied" | "expired";

export interface ConnectionRequest {
  sessionId: string;
  controllerId: string;
  hostId: string;
  status: ConnectionRequestStatus;
  createdAt: Date;
  pinUsed?: string;
}

interface CreateInput { controllerId: string; hostId: string; pinUsed?: string; }
interface TrackerOptions { ttlMs: number; }
type ExpireListener = (sessionId: string) => void;

// Tracks connection requests in memory. Pending requests auto-expire after ttlMs.
// Accepted requests stay until remove() - the P2P connection owns their lifetime.
export class ConnectionRequestTracker {
  private readonly ttlMs: number;
  private readonly requests = new Map<string, ConnectionRequest>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<ExpireListener>();

  constructor(opts: TrackerOptions) { this.ttlMs = opts.ttlMs; }

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

  find(sessionId: string): ConnectionRequest | undefined {
    return this.requests.get(sessionId);
  }

  markAccepted(sessionId: string): void {
    const req = this.requests.get(sessionId);
    if (!req) return;
    req.status = "accepted";
    this.clearTimer(sessionId);
  }

  markDenied(sessionId: string): void {
    const req = this.requests.get(sessionId);
    if (!req) return;
    req.status = "denied";
    this.clearTimer(sessionId);
  }

  remove(sessionId: string): void {
    this.clearTimer(sessionId);
    this.requests.delete(sessionId);
  }

  onExpire(listener: ExpireListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

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

  private clearTimer(sessionId: string): void {
    const id = this.timers.get(sessionId);
    if (id) clearTimeout(id);
    this.timers.delete(sessionId);
  }
}
```

- [ ] **Step 4 : Pass**

- [ ] **Step 5 : Commit** `feat(signaling): add connection request tracker with ttl`

---

## Task 3 : Server — `connect-handler` (TDD)

**Files :** Create `signaling-server/src/features/connect/connect-handler.ts` + test.

- [ ] **Step 1 : Test**

```typescript
import { handleConnectRequest } from "@/features/connect/connect-handler";
import { SessionManager } from "@/websocket/session-manager";
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import type { WebSocket } from "ws";

function mockSocket() {
  const sent: string[] = [];
  return { sent, close: () => undefined, send: (d: string) => { sent.push(d); } } as unknown as WebSocket & { sent: string[] };
}

const CTRL = "550e8400-e29b-41d4-a716-446655440000";
const HOST = "550e8400-e29b-41d4-a716-446655440001";
const PIN = "111-222-333";

describe("handleConnectRequest", () => {
  let sessions: SessionManager;
  let tracker: ConnectionRequestTracker;
  let hostSocket: ReturnType<typeof mockSocket>;
  let ctrlSocket: ReturnType<typeof mockSocket>;

  beforeEach(() => {
    sessions = new SessionManager();
    tracker = new ConnectionRequestTracker({ ttlMs: 30_000 });
    hostSocket = mockSocket();
    ctrlSocket = mockSocket();
    sessions.register({ machineId: HOST, socket: hostSocket, pin: PIN, pinExpiresAt: new Date(Date.now() + 60_000) });
    sessions.register({ machineId: CTRL, socket: ctrlSocket, pin: "999-999-999", pinExpiresAt: new Date(Date.now() + 60_000) });
    hostSocket.sent.length = 0;
    ctrlSocket.sent.length = 0;
  });

  it("creates a session and sends connect_offer to the host", () => {
    handleConnectRequest(
      { type: "connect_request", controller_id: CTRL, target_pin: PIN },
      { sessions, tracker, socket: ctrlSocket },
    );
    const offer = JSON.parse(hostSocket.sent[0]);
    expect(offer.type).toBe("connect_offer");
    expect(offer.controller_id).toBe(CTRL);
    expect(tracker.find(offer.session_id)).toBeDefined();
  });

  it("errors with pin_not_found when PIN has no match", () => {
    handleConnectRequest(
      { type: "connect_request", controller_id: CTRL, target_pin: "000-000-000" },
      { sessions, tracker, socket: ctrlSocket },
    );
    expect(hostSocket.sent).toHaveLength(0);
    const err = JSON.parse(ctrlSocket.sent[0]);
    expect(err.type).toBe("error");
    expect(err.code).toBe("pin_not_found");
  });

  it("errors with self_connect_forbidden on own PIN", () => {
    handleConnectRequest(
      { type: "connect_request", controller_id: CTRL, target_pin: "999-999-999" },
      { sessions, tracker, socket: ctrlSocket },
    );
    const err = JSON.parse(ctrlSocket.sent[0]);
    expect(err.code).toBe("self_connect_forbidden");
  });
});
```

- [ ] **Step 2 : Fail**

- [ ] **Step 3 : Implémenter**

```typescript
import type { WebSocket } from "ws";
import type { SessionManager } from "@/websocket/session-manager";
import type { ConnectionRequestTracker } from "./connection-requests";
import type { ConnectRequestMessageSchema } from "@/websocket/schemas";
import type { z } from "zod";

interface HandlerContext {
  sessions: SessionManager;
  tracker: ConnectionRequestTracker;
  socket: WebSocket;
}

type ConnectRequestMessage = z.infer<typeof ConnectRequestMessageSchema>;

function sendError(socket: WebSocket, code: string, message: string): void {
  socket.send(JSON.stringify({ type: "error", code, message }));
}

// Resolves target_pin to a host machine, tracks a pending session, and pushes
// connect_offer to the host. Errors back to the controller on pin miss or self-connect.
export function handleConnectRequest(
  msg: ConnectRequestMessage,
  ctx: HandlerContext,
): void {
  const host = ctx.sessions.findByPin(msg.target_pin);
  if (!host) {
    sendError(ctx.socket, "pin_not_found", "No active client matches the provided PIN.");
    return;
  }
  if (host.machineId === msg.controller_id) {
    sendError(ctx.socket, "self_connect_forbidden", "Cannot open a session to your own device.");
    return;
  }
  const req = ctx.tracker.create({
    controllerId: msg.controller_id,
    hostId: host.machineId,
    pinUsed: msg.target_pin,
  });
  host.socket.send(JSON.stringify({
    type: "connect_offer" as const,
    session_id: req.sessionId,
    controller_id: msg.controller_id,
  }));
}
```

- [ ] **Step 4 : Pass**

- [ ] **Step 5 : Commit** `feat(signaling): add connect_request handler`

---

## Task 4 : Server — `consent-handler` (TDD)

**Files :** Create `signaling-server/src/features/connect/consent-handler.ts` + test.

- [ ] **Step 1 : Test**

```typescript
import { handleConsentResponse } from "@/features/connect/consent-handler";
import { SessionManager } from "@/websocket/session-manager";
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import type { WebSocket } from "ws";

function mockSocket() {
  const sent: string[] = [];
  return { sent, close: () => undefined, send: (d: string) => { sent.push(d); } } as unknown as WebSocket & { sent: string[] };
}

const CTRL = "550e8400-e29b-41d4-a716-446655440000";
const HOST = "550e8400-e29b-41d4-a716-446655440001";

describe("handleConsentResponse", () => {
  let sessions: SessionManager;
  let tracker: ConnectionRequestTracker;
  let hostSocket: ReturnType<typeof mockSocket>;
  let ctrlSocket: ReturnType<typeof mockSocket>;

  beforeEach(() => {
    sessions = new SessionManager();
    tracker = new ConnectionRequestTracker({ ttlMs: 30_000 });
    hostSocket = mockSocket();
    ctrlSocket = mockSocket();
    sessions.register({ machineId: HOST, socket: hostSocket, pin: "111-222-333", pinExpiresAt: new Date(Date.now() + 60_000) });
    sessions.register({ machineId: CTRL, socket: ctrlSocket, pin: "999-999-999", pinExpiresAt: new Date(Date.now() + 60_000) });
    hostSocket.sent.length = 0;
    ctrlSocket.sent.length = 0;
  });

  it("on accepted=true: marks accepted and sends session_ready to controller", () => {
    const req = tracker.create({ controllerId: CTRL, hostId: HOST });
    handleConsentResponse(
      { type: "consent_response", session_id: req.sessionId, accepted: true },
      { sessions, tracker, socket: hostSocket },
    );
    expect(tracker.find(req.sessionId)?.status).toBe("accepted");
    const ready = JSON.parse(ctrlSocket.sent[0]);
    expect(ready).toEqual({
      type: "session_ready",
      session_id: req.sessionId,
      host_id: HOST,
    });
  });

  it("on accepted=false: sends peer_disconnected(declined) and removes", () => {
    const req = tracker.create({ controllerId: CTRL, hostId: HOST });
    handleConsentResponse(
      { type: "consent_response", session_id: req.sessionId, accepted: false },
      { sessions, tracker, socket: hostSocket },
    );
    const msg = JSON.parse(ctrlSocket.sent[0]);
    expect(msg).toEqual({ type: "peer_disconnected", session_id: req.sessionId, reason: "declined" });
    expect(tracker.find(req.sessionId)).toBeUndefined();
  });

  it("ignores unknown session_id", () => {
    handleConsentResponse(
      { type: "consent_response", session_id: "550e8400-e29b-41d4-a716-446655440099", accepted: true },
      { sessions, tracker, socket: hostSocket },
    );
    expect(ctrlSocket.sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : Fail**

- [ ] **Step 3 : Implémenter**

```typescript
import type { WebSocket } from "ws";
import type { SessionManager } from "@/websocket/session-manager";
import type { ConnectionRequestTracker } from "./connection-requests";
import type { ConsentResponseMessageSchema } from "@/websocket/schemas";
import type { z } from "zod";

interface HandlerContext {
  sessions: SessionManager;
  tracker: ConnectionRequestTracker;
  socket: WebSocket;
}

type ConsentResponseMessage = z.infer<typeof ConsentResponseMessageSchema>;

// Routes the host's consent decision. On accept: sends session_ready to the controller.
// On decline: sends peer_disconnected(declined) and clears the tracker.
export function handleConsentResponse(
  msg: ConsentResponseMessage,
  ctx: HandlerContext,
): void {
  const req = ctx.tracker.find(msg.session_id);
  if (!req) return;

  const controller = ctx.sessions.findByMachineId(req.controllerId);
  if (!controller) {
    ctx.tracker.remove(req.sessionId);
    return;
  }

  if (msg.accepted) {
    ctx.tracker.markAccepted(req.sessionId);
    controller.socket.send(JSON.stringify({
      type: "session_ready" as const,
      session_id: req.sessionId,
      host_id: req.hostId,
    }));
    return;
  }

  controller.socket.send(JSON.stringify({
    type: "peer_disconnected" as const,
    session_id: req.sessionId,
    reason: "declined" as const,
  }));
  ctx.tracker.remove(req.sessionId);
}
```

- [ ] **Step 4 : Pass**

- [ ] **Step 5 : Commit** `feat(signaling): add consent_response handler`

---

## Task 5 : Server — `sdp-relay` (TDD)

**Files :** Create `signaling-server/src/features/relay/sdp-relay.ts` + test.

Handler générique qui relaie `sdp_offer`, `sdp_answer`, `ice_candidate` vers le peer opposé (`controllerId` ↔ `hostId` selon qui envoie).

- [ ] **Step 1 : Test**

```typescript
import { relayToPeer } from "@/features/relay/sdp-relay";
import { SessionManager } from "@/websocket/session-manager";
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import type { WebSocket } from "ws";

function mockSocket() {
  const sent: string[] = [];
  return { sent, close: () => undefined, send: (d: string) => { sent.push(d); } } as unknown as WebSocket & { sent: string[] };
}

const CTRL = "550e8400-e29b-41d4-a716-446655440000";
const HOST = "550e8400-e29b-41d4-a716-446655440001";

describe("relayToPeer", () => {
  let sessions: SessionManager;
  let tracker: ConnectionRequestTracker;
  let hostSocket: ReturnType<typeof mockSocket>;
  let ctrlSocket: ReturnType<typeof mockSocket>;
  let sessionId: string;

  beforeEach(() => {
    sessions = new SessionManager();
    tracker = new ConnectionRequestTracker({ ttlMs: 60_000 });
    hostSocket = mockSocket();
    ctrlSocket = mockSocket();
    sessions.register({ machineId: HOST, socket: hostSocket, pin: "111-222-333", pinExpiresAt: new Date(Date.now() + 60_000) });
    sessions.register({ machineId: CTRL, socket: ctrlSocket, pin: "999-999-999", pinExpiresAt: new Date(Date.now() + 60_000) });
    const req = tracker.create({ controllerId: CTRL, hostId: HOST });
    tracker.markAccepted(req.sessionId);
    sessionId = req.sessionId;
    hostSocket.sent.length = 0;
    ctrlSocket.sent.length = 0;
  });

  it("relays sdp_offer from controller to host", () => {
    relayToPeer(
      { type: "sdp_offer", session_id: sessionId, sdp: { type: "offer", sdp: "v=0" } },
      { sessions, tracker, fromMachineId: CTRL },
    );
    const fwd = JSON.parse(hostSocket.sent[0]);
    expect(fwd).toEqual({ type: "sdp_offer", session_id: sessionId, sdp: { type: "offer", sdp: "v=0" } });
    expect(ctrlSocket.sent).toHaveLength(0);
  });

  it("relays sdp_answer from host to controller", () => {
    relayToPeer(
      { type: "sdp_answer", session_id: sessionId, sdp: { type: "answer", sdp: "v=0" } },
      { sessions, tracker, fromMachineId: HOST },
    );
    const fwd = JSON.parse(ctrlSocket.sent[0]);
    expect(fwd.type).toBe("sdp_answer");
    expect(hostSocket.sent).toHaveLength(0);
  });

  it("relays ice_candidate from either side", () => {
    relayToPeer(
      { type: "ice_candidate", session_id: sessionId, candidate: { candidate: "candidate:1" } },
      { sessions, tracker, fromMachineId: CTRL },
    );
    expect(JSON.parse(hostSocket.sent[0]).type).toBe("ice_candidate");
  });

  it("silently drops if session unknown", () => {
    relayToPeer(
      { type: "sdp_offer", session_id: "550e8400-e29b-41d4-a716-446655440099", sdp: { type: "offer", sdp: "v=0" } },
      { sessions, tracker, fromMachineId: CTRL },
    );
    expect(hostSocket.sent).toHaveLength(0);
    expect(ctrlSocket.sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : Fail**

- [ ] **Step 3 : Implémenter** (`src/features/relay/sdp-relay.ts`)

```typescript
import type { SessionManager } from "@/websocket/session-manager";
import type { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import type {
  SdpOfferMessageSchema,
  SdpAnswerMessageSchema,
  IceCandidateMessageSchema,
} from "@/websocket/schemas";
import type { z } from "zod";

type RelayMessage =
  | z.infer<typeof SdpOfferMessageSchema>
  | z.infer<typeof SdpAnswerMessageSchema>
  | z.infer<typeof IceCandidateMessageSchema>;

interface RelayContext {
  sessions: SessionManager;
  tracker: ConnectionRequestTracker;
  fromMachineId: string;
}

// Forwards a session-scoped message to the opposite peer. Drops silently if the
// session or the target peer is unknown (do not leak state to the sender).
export function relayToPeer(msg: RelayMessage, ctx: RelayContext): void {
  const req = ctx.tracker.find(msg.session_id);
  if (!req) return;

  const targetMachineId =
    ctx.fromMachineId === req.controllerId ? req.hostId
    : ctx.fromMachineId === req.hostId ? req.controllerId
    : null;
  if (!targetMachineId) return;

  const target = ctx.sessions.findByMachineId(targetMachineId);
  if (!target) return;

  target.socket.send(JSON.stringify(msg));
}
```

- [ ] **Step 4 : Pass**

- [ ] **Step 5 : Commit** `feat(signaling): add sdp/ice relay by session`

---

## Task 6 : Server — wire new handlers + `peer_disconnected` on close

**Files :** Modify `signaling-server/src/websocket/message-router.ts` + `handler.ts` + `server.ts`.

- [ ] **Step 1 : Étendre le router**

Dans `src/websocket/message-router.ts`, modifier la signature de `RouterContext` et les imports, puis ajouter les cas switch :

```typescript
import type { WebSocket } from "ws";
import type { SessionManager } from "./session-manager";
import type { ConnectionRequestTracker } from "@/features/connect/connection-requests";
import { parseClientMessage } from "./schemas";
import { handleRegister, handleUpdatePin } from "@/features/register/register-handler";
import { handleConnectRequest } from "@/features/connect/connect-handler";
import { handleConsentResponse } from "@/features/connect/consent-handler";
import { relayToPeer } from "@/features/relay/sdp-relay";

interface RouterContext {
  manager: SessionManager;
  tracker: ConnectionRequestTracker;
  socket: WebSocket;
  machineId?: string;
}

function sendError(socket: WebSocket, code: string, message: string): void {
  socket.send(JSON.stringify({ type: "error", code, message }));
}

export function routeMessage(raw: string, ctx: RouterContext): void {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch {
    sendError(ctx.socket, "invalid_json", "Failed to parse message as JSON");
    return;
  }

  const result = parseClientMessage(parsed);
  if (!result.ok) {
    sendError(ctx.socket, "invalid_message", result.error);
    return;
  }

  const msg = result.value;
  switch (msg.type) {
    case "register":
      handleRegister(msg, { manager: ctx.manager, socket: ctx.socket });
      return;
    case "update_pin":
      handleUpdatePin(msg, { manager: ctx.manager, socket: ctx.socket });
      return;
    case "ping":
      if (ctx.machineId) ctx.manager.touch(ctx.machineId);
      ctx.socket.send(JSON.stringify({ type: "pong" }));
      return;
    case "connect_request":
      handleConnectRequest(msg, { sessions: ctx.manager, tracker: ctx.tracker, socket: ctx.socket });
      return;
    case "consent_response":
      handleConsentResponse(msg, { sessions: ctx.manager, tracker: ctx.tracker, socket: ctx.socket });
      return;
    case "sdp_offer":
    case "sdp_answer":
    case "ice_candidate":
      if (!ctx.machineId) {
        sendError(ctx.socket, "not_registered", "Register before sending relay messages.");
        return;
      }
      relayToPeer(msg, { sessions: ctx.manager, tracker: ctx.tracker, fromMachineId: ctx.machineId });
      return;
  }
}
```

- [ ] **Step 2 : Ajouter `peer_disconnected` à l'event close dans `handler.ts`**

Le handler actuel appelle `opts.manager.remove(machineId)` sur close. On doit AUSSI notifier l'éventuel peer d'une session en cours.

Ajouter un paramètre `tracker` à `ConnectionOptions` et modifier le close handler :

```typescript
interface ConnectionOptions {
  manager: SessionManager;
  tracker: ConnectionRequestTracker;
  logger: Logger;
}
```

Dans le `handleConnection`, après `clearInterval(heartbeatTimer)` et avant `opts.manager.remove(state.machineId)`, ajouter :

```typescript
    // Notify any peer currently sharing a session with us.
    if (state.machineId) {
      for (const req of findSessionsForMachine(opts.tracker, state.machineId)) {
        const peerMachineId = req.controllerId === state.machineId ? req.hostId : req.controllerId;
        const peer = opts.manager.findByMachineId(peerMachineId);
        if (peer) {
          peer.socket.send(JSON.stringify({
            type: "peer_disconnected" as const,
            session_id: req.sessionId,
            reason: req.controllerId === state.machineId ? "controller_disconnected" : "host_disconnected",
          }));
        }
        opts.tracker.remove(req.sessionId);
      }
    }
```

Et créer le helper dans `connection-requests.ts` :

```typescript
// Returns all requests (pending or accepted) that involve the given machine.
export function findSessionsForMachine(
  tracker: ConnectionRequestTracker,
  machineId: string,
): ConnectionRequest[] {
  return tracker.list().filter(
    (r) => r.controllerId === machineId || r.hostId === machineId,
  );
}
```

Et ajouter `list()` dans la classe `ConnectionRequestTracker` :

```typescript
  list(): ConnectionRequest[] {
    return Array.from(this.requests.values());
  }
```

- [ ] **Step 3 : Wire `tracker` dans `server.ts`**

```typescript
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";

// In buildServer:
const tracker = new ConnectionRequestTracker({ ttlMs: 30_000 });
// ...
app.get("/signaling", { websocket: true }, (socket, _req) => {
  handleConnection(socket, { manager: sessions, tracker, logger });
});
// ...
return { app, sessions, tracker };
```

Et étendre `BuildServerResult` :
```typescript
export interface BuildServerResult {
  app: FastifyInstance;
  sessions: SessionManager;
  tracker: ConnectionRequestTracker;
}
```

Et propager dans `handleConnection` → pass `tracker` dans le routeMessage via ctx.

- [ ] **Step 4 : Adapter les tests router existants**

Le `routeMessage` prend maintenant un `tracker` dans son context. Mettre à jour `tests/websocket/message-router.test.ts` pour passer un tracker mock :

```typescript
import { ConnectionRequestTracker } from "@/features/connect/connection-requests";
// Dans chaque test, remplacer `{ manager, socket }` par `{ manager, tracker: new ConnectionRequestTracker({ttlMs: 30000}), socket }`
```

- [ ] **Step 5 : Lancer full suite + lint + typecheck**

```bash
npm test -w @linkdesk/signaling-server
npm run -w @linkdesk/signaling-server lint
npm run -w @linkdesk/signaling-server typecheck
```

Expected : tous les tests existants + nouveaux passent.

- [ ] **Step 6 : Commit**

```bash
git add signaling-server/src signaling-server/tests
git commit -m "feat(signaling): wire connect/consent/relay handlers and disconnect notifications"
```

---

## Task 7 : Server — integration test full connect flow

**Files :** Create `signaling-server/tests/integration/connect-flow.test.ts`.

Test E2E : 2 vrais WS clients, PIN lookup, consent, SDP échange, déconnexion propre.

- [ ] **Step 1 : Test**

```typescript
import { buildServer } from "@/server";
import { loadEnv } from "@/lib/env";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import type { SessionManager } from "@/websocket/session-manager";
import type { ConnectionRequestTracker } from "@/features/connect/connection-requests";

const HOST = "550e8400-e29b-41d4-a716-446655440000";
const CTRL = "550e8400-e29b-41d4-a716-446655440001";
const PIN = "123-456-789";

describe("connect flow E2E", () => {
  let app: FastifyInstance;
  let sessions: SessionManager;
  let tracker: ConnectionRequestTracker;
  let url: string;

  beforeAll(async () => {
    const env = loadEnv({ PORT: "3001", NODE_ENV: "test", LOG_LEVEL: "error" });
    const built = await buildServer({ env });
    app = built.app;
    sessions = built.sessions;
    tracker = built.tracker;
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    url = address.replace("http", "ws") + "/signaling";
  });
  afterAll(async () => { await app.close(); });

  function nextMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString("utf-8"))));
      ws.once("error", reject);
    });
  }

  function open(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
    });
  }

  it("completes connect → consent → SDP exchange", async () => {
    const hostWs = await open();
    const ctrlWs = await open();

    // Register both.
    hostWs.send(JSON.stringify({ type: "register", machine_id: HOST, pin: PIN, pin_expires_at: new Date(Date.now() + 60_000).toISOString() }));
    await nextMessage(hostWs);
    ctrlWs.send(JSON.stringify({ type: "register", machine_id: CTRL, pin: "999-999-999", pin_expires_at: new Date(Date.now() + 60_000).toISOString() }));
    await nextMessage(ctrlWs);

    // Controller requests. Host receives connect_offer.
    ctrlWs.send(JSON.stringify({ type: "connect_request", controller_id: CTRL, target_pin: PIN }));
    const offer = await nextMessage(hostWs);
    expect(offer.type).toBe("connect_offer");
    const sessionId = offer.session_id;

    // Host accepts. Controller receives session_ready.
    hostWs.send(JSON.stringify({ type: "consent_response", session_id: sessionId, accepted: true }));
    const ready = await nextMessage(ctrlWs);
    expect(ready).toEqual({ type: "session_ready", session_id: sessionId, host_id: HOST });

    // Controller sends sdp_offer → host receives it.
    const sdpOffer = { type: "offer" as const, sdp: "v=0\r\n" };
    ctrlWs.send(JSON.stringify({ type: "sdp_offer", session_id: sessionId, sdp: sdpOffer }));
    const relayedOffer = await nextMessage(hostWs);
    expect(relayedOffer.type).toBe("sdp_offer");
    expect(relayedOffer.session_id).toBe(sessionId);

    // Host sends sdp_answer → controller receives it.
    const sdpAnswer = { type: "answer" as const, sdp: "v=0\r\n" };
    hostWs.send(JSON.stringify({ type: "sdp_answer", session_id: sessionId, sdp: sdpAnswer }));
    const relayedAnswer = await nextMessage(ctrlWs);
    expect(relayedAnswer.type).toBe("sdp_answer");

    // Host disconnects. Controller receives peer_disconnected(host_disconnected).
    hostWs.close();
    const byeMsg = await nextMessage(ctrlWs);
    expect(byeMsg).toEqual({
      type: "peer_disconnected",
      session_id: sessionId,
      reason: "host_disconnected",
    });

    ctrlWs.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(sessions.count()).toBe(0);
    expect(tracker.find(sessionId)).toBeUndefined();
  }, 15_000);

  it("refuses connect to unknown PIN", async () => {
    const ctrlWs = await open();
    ctrlWs.send(JSON.stringify({ type: "register", machine_id: CTRL, pin: "999-999-999", pin_expires_at: new Date(Date.now() + 60_000).toISOString() }));
    await nextMessage(ctrlWs);

    ctrlWs.send(JSON.stringify({ type: "connect_request", controller_id: CTRL, target_pin: "000-000-000" }));
    const err = await nextMessage(ctrlWs);
    expect(err.type).toBe("error");
    expect(err.code).toBe("pin_not_found");
    ctrlWs.close();
    await new Promise((r) => setTimeout(r, 100));
  });
});
```

- [ ] **Step 2 : Run**

```bash
npm test -w @linkdesk/signaling-server -- connect-flow
```

- [ ] **Step 3 : Commit** `test(signaling): connect flow e2e integration`

---

## Task 8 : Client — schemas WebRTC mirror

**Files :** Modify `desktop-app/src/features/signaling/message-schemas.ts`.

Ajouter les mêmes schemas que Task 1 côté client. Structure identique, on mirror.

- [ ] **Step 1 : Ajouter les schemas**

Dans `desktop-app/src/features/signaling/message-schemas.ts`, ajouter après les schemas existants :

```typescript
// --- Phase 3 WebRTC ---
const SessionIdSchema = z.string().uuid();

const SdpDescriptionSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().optional(),
});

const IceCandidateInitSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

// Client → Server
export const ConnectRequestMessageSchema = z.object({
  type: z.literal("connect_request"),
  controller_id: MachineIdSchema,
  target_pin: z.string().regex(/^\d{3}-\d{3}-\d{3}$/),
});

export const ConsentResponseMessageSchema = z.object({
  type: z.literal("consent_response"),
  session_id: SessionIdSchema,
  accepted: z.boolean(),
});

export const SdpOfferMessageSchema = z.object({
  type: z.literal("sdp_offer"),
  session_id: SessionIdSchema,
  sdp: SdpDescriptionSchema,
});

export const SdpAnswerMessageSchema = z.object({
  type: z.literal("sdp_answer"),
  session_id: SessionIdSchema,
  sdp: SdpDescriptionSchema,
});

export const IceCandidateMessageSchema = z.object({
  type: z.literal("ice_candidate"),
  session_id: SessionIdSchema,
  candidate: IceCandidateInitSchema,
});

// Server → Client
export const ConnectOfferMessageSchema = z.object({
  type: z.literal("connect_offer"),
  session_id: SessionIdSchema,
  controller_id: MachineIdSchema,
});

export const SessionReadyMessageSchema = z.object({
  type: z.literal("session_ready"),
  session_id: SessionIdSchema,
  host_id: MachineIdSchema,
});

export const PeerDisconnectedMessageSchema = z.object({
  type: z.literal("peer_disconnected"),
  session_id: SessionIdSchema,
  reason: z.enum(["host_disconnected", "controller_disconnected", "timeout", "declined"]),
});
```

`MachineIdSchema` existe déjà en début de fichier.

Étendre les unions : `ClientMessageSchema` ajoute `ConnectRequestMessageSchema`, `ConsentResponseMessageSchema`, `SdpOfferMessageSchema`, `SdpAnswerMessageSchema`, `IceCandidateMessageSchema`. `ServerMessageSchema` ajoute `ConnectOfferMessageSchema`, `SessionReadyMessageSchema`, `SdpOfferMessageSchema`, `SdpAnswerMessageSchema`, `IceCandidateMessageSchema`, `PeerDisconnectedMessageSchema`.

- [ ] **Step 2 : typecheck + lint + vite build + tests**

```bash
cd desktop-app && npm run typecheck && npm run lint && npm test && npx vite build
```

- [ ] **Step 3 : Commit** `feat(signaling): mirror webrtc schemas on client`

---

## Task 9 : Rust — commande `show_consent_dialog`

**Files :**
- Modify `desktop-app/src-tauri/Cargo.toml` (+ `tauri-plugin-dialog = "2"`)
- Create `desktop-app/src-tauri/src/commands/consent.rs`
- Modify `desktop-app/src-tauri/src/commands/mod.rs`
- Modify `desktop-app/src-tauri/src/lib.rs` (register plugin + command)
- Modify `desktop-app/src-tauri/capabilities/default.json` (+ `dialog:default`)

**Context7 MANDATORY** : `tauri-plugin-dialog` v2 — API exacte pour `ask()` ou équivalent (signature asynchrone, type retour, support timeout).

- [ ] **Step 1 : Cargo.toml**

Ajouter dans `[dependencies]` :

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2 : `commands/consent.rs`**

```rust
use crate::errors::AppError;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

// Shows a native OS-level confirmation dialog. Blocks up to `timeout_secs` seconds;
// if the user hasn't answered by then, returns `Ok(false)` (default-refuse per PRD §3).
#[tauri::command]
pub async fn show_consent_dialog(
    app: AppHandle,
    peer_label: String,
    timeout_secs: u64,
) -> Result<bool, AppError> {
    let message = format!(
        "{peer_label} veut prendre le contrôle de votre ordinateur.\n\n\
         Accepter ?"
    );

    // Build the dialog future using tauri-plugin-dialog's builder.
    let dialog_future = async {
        let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
        app.dialog()
            .message(&message)
            .title("LinkDesk — demande de connexion")
            .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                "Accepter".into(),
                "Refuser".into(),
            ))
            .show(move |accepted| {
                let _ = tx.send(accepted);
            });
        rx.await.unwrap_or(false)
    };

    match tokio::time::timeout(Duration::from_secs(timeout_secs), dialog_future).await {
        Ok(accepted) => Ok(accepted),
        Err(_) => Ok(false), // Timed out: default refuse.
    }
}
```

**⚠️ API à vérifier via Context7** : `app.dialog().message(...)` peut être `app.dialog().message_dialog(...)` selon la version du plugin. Si l'API diffère, adapter en gardant la sémantique :
- construire un dialog modal avec 2 boutons (Accepter / Refuser)
- attendre la réponse (oneshot)
- racer contre timeout → retour `false` par défaut

Si le builder n'accepte pas de callback asynchrone, utiliser la version bloquante dans un `tokio::task::spawn_blocking`.

Ajouter en haut de `Cargo.toml` dep si manquante : `tokio = { version = "1", features = ["sync", "time", "macros"] }` (étendre les features existantes).

- [ ] **Step 3 : `commands/mod.rs`**

Ajouter :
```rust
pub mod consent;
```

- [ ] **Step 4 : `lib.rs`**

Ajouter le plugin et enregistrer la commande :

```rust
// ... imports ...
use commands::consent;

// In tauri::Builder:
.plugin(tauri_plugin_dialog::init())
// ... other plugins ...
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    commands::consent::show_consent_dialog,
])
```

- [ ] **Step 5 : `capabilities/default.json`**

Ajouter `"dialog:default"` au tableau `permissions`.

- [ ] **Step 6 : Vérifier**

```bash
cd desktop-app/src-tauri
cargo check
cargo clippy --all-targets -- -D warnings
```

- [ ] **Step 7 : Commit** `feat(rust): add show_consent_dialog via tauri-plugin-dialog`

---

## Task 10 : Client — TS wrapper pour `show_consent_dialog`

**Files :** Modify `desktop-app/src/types/tauri-commands.ts`.

Ajouter dans `TauriCommandMap` :

```typescript
  show_consent_dialog: {
    args: { peer_label: string; timeout_secs: number };
    result: boolean;
  };
```

`tauriInvoke("show_consent_dialog", { peer_label, timeout_secs })` est désormais typé.

- [ ] **Step 1 : Edit** le fichier `types/tauri-commands.ts`

- [ ] **Step 2 : Typecheck**

- [ ] **Step 3 : Commit** `feat(tauri): type show_consent_dialog invocation`

---

## Task 11 : Client — helpers WebRTC (peer-config + offer-answer + types)

**Files :**
- Create `desktop-app/src/features/webrtc/webrtc.types.ts`
- Create `desktop-app/src/features/webrtc/peer-config.ts`
- Create `desktop-app/src/features/webrtc/offer-answer.ts`
- Create `desktop-app/tests/features/webrtc/offer-answer.test.ts`

**Context7 check :** MDN `RTCPeerConnection.createOffer`, `setLocalDescription`, `iceGatheringState`, `icegatheringstatechange`.

- [ ] **Step 1 : `webrtc.types.ts`**

```typescript
export type PeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

export interface SessionDescriptor {
  sessionId: string;
  role: "controller" | "host";
  peerMachineId: string;
}
```

- [ ] **Step 2 : `peer-config.ts`**

```typescript
const DEFAULT_STUN = "stun:stun.l.google.com:19302";

// Reads configured STUN servers from env, falls back to Google's public server.
// Multiple servers can be configured comma-separated in VITE_STUN_SERVERS.
export function getIceServers(): RTCIceServer[] {
  const envValue = import.meta.env.VITE_STUN_SERVERS ?? DEFAULT_STUN;
  const urls = envValue
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return urls.length > 0 ? [{ urls }] : [{ urls: DEFAULT_STUN }];
}

export function createPeerConfiguration(): RTCConfiguration {
  return { iceServers: getIceServers() };
}
```

- [ ] **Step 3 : Test offer-answer** (`tests/features/webrtc/offer-answer.test.ts`)

```typescript
import { waitForIceGatheringComplete } from "@/features/webrtc/offer-answer";

describe("waitForIceGatheringComplete", () => {
  it("resolves immediately when state is already complete", async () => {
    const pc = {
      iceGatheringState: "complete" as RTCIceGatheringState,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as RTCPeerConnection;
    await expect(waitForIceGatheringComplete(pc)).resolves.toBeUndefined();
  });

  it("resolves after icegatheringstatechange fires with complete", async () => {
    let state: RTCIceGatheringState = "gathering";
    const listeners = new Map<string, (() => void)[]>();
    const pc = {
      get iceGatheringState() { return state; },
      addEventListener: (evt: string, cb: () => void) => {
        const arr = listeners.get(evt) ?? [];
        arr.push(cb);
        listeners.set(evt, arr);
      },
      removeEventListener: () => undefined,
    } as unknown as RTCPeerConnection;

    const promise = waitForIceGatheringComplete(pc);
    state = "complete";
    listeners.get("icegatheringstatechange")?.forEach((cb) => cb());
    await expect(promise).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4 : Implémenter `offer-answer.ts`**

```typescript
// Waits until RTCPeerConnection.iceGatheringState === "complete".
// Used to implement "wait-for-complete ICE" per DEV-RULES §7 - avoids trickle.
export function waitForIceGatheringComplete(
  pc: RTCPeerConnection,
): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    const handleChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", handleChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", handleChange);
  });
}

// Creates a full SDP offer with all ICE candidates embedded.
// DEV-RULES §7: always wait for iceGatheringState === "complete" before sending.
export async function createOfferWithCompleteIce(
  pc: RTCPeerConnection,
): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGatheringComplete(pc);
  const local = pc.localDescription;
  if (!local) throw new Error("localDescription missing after gathering complete");
  return { type: local.type, sdp: local.sdp };
}

export async function createAnswerWithCompleteIce(
  pc: RTCPeerConnection,
): Promise<RTCSessionDescriptionInit> {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGatheringComplete(pc);
  const local = pc.localDescription;
  if (!local) throw new Error("localDescription missing after gathering complete");
  return { type: local.type, sdp: local.sdp };
}
```

- [ ] **Step 5 : Tests + typecheck + lint**

```bash
cd desktop-app && npm test -- offer-answer && npm run lint && npm run typecheck
```

- [ ] **Step 6 : Commit** `feat(webrtc): add ice wait-for-complete helpers`

---

## Task 12 : Client — `usePeerConnection` hook (TDD)

**Files :**
- Create `desktop-app/src/features/webrtc/use-peer-connection.ts`
- Create `desktop-app/tests/features/webrtc/use-peer-connection.test.tsx`

Hook qui encapsule la lifecycle d'une `RTCPeerConnection` : création avec STUN config, listeners `onconnectionstatechange` + `onicecandidate` + `ondatachannel`, helpers `createOffer`/`setRemoteDescription`/`createAnswer`, cleanup sur unmount.

- [ ] **Step 1 : Test** (utilise un stub `RTCPeerConnection`)

```typescript
import { renderHook, act } from "@testing-library/react";
import { usePeerConnection } from "@/features/webrtc/use-peer-connection";

class FakePeerConnection implements Partial<RTCPeerConnection> {
  iceGatheringState: RTCIceGatheringState = "new";
  connectionState: RTCPeerConnectionState = "new";
  onconnectionstatechange: ((ev: Event) => void) | null = null;
  ondatachannel: ((ev: RTCDataChannelEvent) => void) | null = null;
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
  createDataChannel = vi.fn(() => ({ label: "hello", readyState: "connecting" }) as unknown as RTCDataChannel);
}

describe("usePeerConnection", () => {
  let fakes: FakePeerConnection[];

  beforeEach(() => {
    fakes = [];
    (globalThis as typeof globalThis & { RTCPeerConnection: typeof RTCPeerConnection })
      .RTCPeerConnection = class {
        constructor() {
          const fake = new FakePeerConnection();
          fakes.push(fake);
          return fake as unknown as RTCPeerConnection;
        }
      } as unknown as typeof RTCPeerConnection;
  });

  it("creates a peer connection on mount when active=true", () => {
    renderHook(() => usePeerConnection({ active: true, onIncomingDataChannel: () => undefined }));
    expect(fakes).toHaveLength(1);
  });

  it("closes on unmount", () => {
    const { unmount } = renderHook(() => usePeerConnection({ active: true, onIncomingDataChannel: () => undefined }));
    unmount();
    expect(fakes[0].close).toHaveBeenCalled();
  });

  it("does not create a peer when active=false", () => {
    renderHook(() => usePeerConnection({ active: false, onIncomingDataChannel: () => undefined }));
    expect(fakes).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : Fail**

- [ ] **Step 3 : Implémenter**

```typescript
import { useEffect, useRef, useState } from "react";
import { createPeerConfiguration } from "./peer-config";
import type { PeerConnectionState } from "./webrtc.types";

export interface UsePeerConnectionOptions {
  active: boolean;
  onIncomingDataChannel: (channel: RTCDataChannel) => void;
}

export interface UsePeerConnectionResult {
  peer: RTCPeerConnection | null;
  state: PeerConnectionState;
}

// Mounts a single RTCPeerConnection when `active` is true and tears it down on unmount
// or when `active` flips back to false. Exposes the current connectionState for UI.
// Incoming data channels (receiver side) are forwarded to `onIncomingDataChannel`.
export function usePeerConnection(opts: UsePeerConnectionOptions): UsePeerConnectionResult {
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null);
  const [state, setState] = useState<PeerConnectionState>("new");
  const onIncomingRef = useRef(opts.onIncomingDataChannel);
  onIncomingRef.current = opts.onIncomingDataChannel;

  useEffect(() => {
    if (!opts.active) {
      setPeer(null);
      setState("new");
      return;
    }

    const pc = new RTCPeerConnection(createPeerConfiguration());
    setPeer(pc);
    setState("new");

    const handleStateChange = () => {
      setState(pc.connectionState as PeerConnectionState);
    };
    pc.addEventListener("connectionstatechange", handleStateChange);

    const handleDataChannel = (ev: RTCDataChannelEvent) => {
      onIncomingRef.current(ev.channel);
    };
    pc.addEventListener("datachannel", handleDataChannel);

    return () => {
      pc.removeEventListener("connectionstatechange", handleStateChange);
      pc.removeEventListener("datachannel", handleDataChannel);
      pc.close();
    };
  }, [opts.active]);

  return { peer, state };
}
```

- [ ] **Step 4 : Pass**

- [ ] **Step 5 : Commit** `feat(webrtc): add usePeerConnection hook`

---

## Task 13 : Client — `useDataChannel` hook (TDD)

**Files :**
- Create `desktop-app/src/features/webrtc/use-data-channel.ts`
- Create `desktop-app/tests/features/webrtc/use-data-channel.test.tsx`

Hook qui encapsule un `RTCDataChannel` : track `readyState`, listeners `onopen`/`onmessage`/`onclose`, méthode `send`.

- [ ] **Step 1 : Test**

```typescript
import { renderHook, act } from "@testing-library/react";
import { useDataChannel } from "@/features/webrtc/use-data-channel";

function fakeChannel() {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    label: "test",
    readyState: "connecting" as RTCDataChannelState,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: (evt: string, cb: EventListener) => {
      const set = listeners.get(evt) ?? new Set();
      set.add(cb);
      listeners.set(evt, set);
    },
    removeEventListener: () => undefined,
    _fire: (evt: string, data?: unknown) => {
      listeners.get(evt)?.forEach((cb) => cb({ data } as unknown as Event));
    },
  };
}

describe("useDataChannel", () => {
  it("exposes readyState as connecting before open", () => {
    const channel = fakeChannel();
    const { result } = renderHook(() => useDataChannel({ channel: channel as unknown as RTCDataChannel }));
    expect(result.current.readyState).toBe("connecting");
  });

  it("switches to open after onopen event", () => {
    const channel = fakeChannel();
    const { result } = renderHook(() => useDataChannel({ channel: channel as unknown as RTCDataChannel }));
    act(() => {
      channel.readyState = "open";
      channel._fire("open");
    });
    expect(result.current.readyState).toBe("open");
  });

  it("pushes received messages via onMessage", () => {
    const channel = fakeChannel();
    const onMessage = vi.fn();
    renderHook(() => useDataChannel({ channel: channel as unknown as RTCDataChannel, onMessage }));
    act(() => {
      channel._fire("message", "hello");
    });
    expect(onMessage).toHaveBeenCalledWith("hello");
  });

  it("send() forwards to the channel", () => {
    const channel = fakeChannel();
    channel.readyState = "open";
    const { result } = renderHook(() => useDataChannel({ channel: channel as unknown as RTCDataChannel }));
    result.current.send("ping");
    expect(channel.send).toHaveBeenCalledWith("ping");
  });
});
```

- [ ] **Step 2 : Fail**

- [ ] **Step 3 : Implémenter**

```typescript
import { useEffect, useState, useRef } from "react";

export interface UseDataChannelOptions {
  channel: RTCDataChannel | null;
  onMessage?: (data: string) => void;
}

export interface UseDataChannelResult {
  readyState: RTCDataChannelState | "closed";
  send: (data: string) => boolean;
}

// Wraps a single RTCDataChannel. Tracks readyState for UI + exposes a typed send().
// `onMessage` is called with the string payload of each incoming message.
export function useDataChannel(opts: UseDataChannelOptions): UseDataChannelResult {
  const [readyState, setReadyState] = useState<RTCDataChannelState | "closed">(
    opts.channel?.readyState ?? "closed",
  );
  const onMessageRef = useRef(opts.onMessage);
  onMessageRef.current = opts.onMessage;

  useEffect(() => {
    const channel = opts.channel;
    if (!channel) {
      setReadyState("closed");
      return;
    }

    setReadyState(channel.readyState);

    const handleOpen = () => setReadyState("open");
    const handleClose = () => setReadyState("closed");
    const handleMessage = (ev: Event) => {
      const data = (ev as MessageEvent).data;
      if (typeof data === "string") onMessageRef.current?.(data);
    };

    channel.addEventListener("open", handleOpen);
    channel.addEventListener("close", handleClose);
    channel.addEventListener("message", handleMessage);

    return () => {
      channel.removeEventListener("open", handleOpen);
      channel.removeEventListener("close", handleClose);
      channel.removeEventListener("message", handleMessage);
    };
  }, [opts.channel]);

  const send = (data: string): boolean => {
    const channel = opts.channel;
    if (!channel || channel.readyState !== "open") return false;
    channel.send(data);
    return true;
  };

  return { readyState, send };
}
```

- [ ] **Step 4 : Pass**

- [ ] **Step 5 : Commit** `feat(webrtc): add useDataChannel hook`

---

## Task 14 : Client — state machine session (pure reducer, TDD)

**Files :**
- Create `desktop-app/src/features/session/session.types.ts`
- Create `desktop-app/src/features/session/session-state-machine.ts`
- Create `desktop-app/tests/features/session/session-state-machine.test.ts`

Reducer pur testable qui pilote la state machine session. Le hook `useSession` (Task 15) branchera les effets.

- [ ] **Step 1 : `session.types.ts`**

```typescript
export type SessionRole = "controller" | "host";

export type SessionStatus =
  | { kind: "idle" }
  | { kind: "requesting"; targetPin: string } // controller only, before server responds
  | { kind: "awaiting_consent"; sessionId: string; role: SessionRole; peerId: string }
  | { kind: "negotiating"; sessionId: string; role: SessionRole; peerId: string }
  | { kind: "connected"; sessionId: string; role: SessionRole; peerId: string }
  | { kind: "ended"; reason: SessionEndReason };

export type SessionEndReason =
  | "local_disconnect"
  | "peer_disconnected"
  | "declined"
  | "timeout"
  | "pin_not_found"
  | "self_connect_forbidden"
  | "network_error";

export type SessionEvent =
  // Controller-initiated
  | { type: "user_requested_connect"; targetPin: string }
  // Server messages
  | { type: "server_pin_not_found" }
  | { type: "server_self_connect_forbidden" }
  | { type: "server_connect_offer"; sessionId: string; controllerId: string } // host-side
  | { type: "server_session_ready"; sessionId: string; hostId: string } // controller-side
  | { type: "server_peer_disconnected"; sessionId: string; reason: "host_disconnected" | "controller_disconnected" | "timeout" | "declined" }
  // Local/WebRTC
  | { type: "consent_accepted"; sessionId: string }
  | { type: "consent_declined" }
  | { type: "peer_connected"; sessionId: string }
  | { type: "user_ended" };
```

- [ ] **Step 2 : Test** (`session-state-machine.test.ts`)

```typescript
import { sessionReducer, initialSessionStatus } from "@/features/session/session-state-machine";

describe("sessionReducer", () => {
  it("user_requested_connect from idle → requesting", () => {
    const next = sessionReducer(initialSessionStatus, {
      type: "user_requested_connect",
      targetPin: "123-456-789",
    });
    expect(next).toEqual({ kind: "requesting", targetPin: "123-456-789" });
  });

  it("server_pin_not_found from requesting → ended(pin_not_found)", () => {
    const next = sessionReducer(
      { kind: "requesting", targetPin: "123-456-789" },
      { type: "server_pin_not_found" },
    );
    expect(next).toEqual({ kind: "ended", reason: "pin_not_found" });
  });

  it("server_connect_offer from idle → awaiting_consent(host)", () => {
    const next = sessionReducer(initialSessionStatus, {
      type: "server_connect_offer",
      sessionId: "s1",
      controllerId: "ctrl-1",
    });
    expect(next).toEqual({ kind: "awaiting_consent", sessionId: "s1", role: "host", peerId: "ctrl-1" });
  });

  it("consent_accepted from awaiting_consent(host) → negotiating", () => {
    const next = sessionReducer(
      { kind: "awaiting_consent", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "consent_accepted", sessionId: "s1" },
    );
    expect(next.kind).toBe("negotiating");
  });

  it("consent_declined from awaiting_consent → ended(declined)", () => {
    const next = sessionReducer(
      { kind: "awaiting_consent", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "consent_declined" },
    );
    expect(next).toEqual({ kind: "ended", reason: "declined" });
  });

  it("server_session_ready from requesting → negotiating(controller)", () => {
    const next = sessionReducer(
      { kind: "requesting", targetPin: "123-456-789" },
      { type: "server_session_ready", sessionId: "s1", hostId: "host-1" },
    );
    expect(next).toEqual({ kind: "negotiating", sessionId: "s1", role: "controller", peerId: "host-1" });
  });

  it("peer_connected from negotiating → connected", () => {
    const next = sessionReducer(
      { kind: "negotiating", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "peer_connected", sessionId: "s1" },
    );
    expect(next.kind).toBe("connected");
  });

  it("server_peer_disconnected from connected → ended(peer_disconnected)", () => {
    const next = sessionReducer(
      { kind: "connected", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "server_peer_disconnected", sessionId: "s1", reason: "host_disconnected" },
    );
    expect(next).toEqual({ kind: "ended", reason: "peer_disconnected" });
  });

  it("user_ended from any non-idle → ended(local_disconnect)", () => {
    const next = sessionReducer(
      { kind: "connected", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "user_ended" },
    );
    expect(next).toEqual({ kind: "ended", reason: "local_disconnect" });
  });
});
```

- [ ] **Step 3 : Fail**

- [ ] **Step 4 : Implémenter** (`session-state-machine.ts`)

```typescript
import type { SessionStatus, SessionEvent } from "./session.types";

export const initialSessionStatus: SessionStatus = { kind: "idle" };

// Pure reducer that maps (status, event) to the next status. Side effects (sending
// WS messages, opening peer connections, showing dialogs) are driven by the
// orchestrator hook observing transitions.
export function sessionReducer(status: SessionStatus, event: SessionEvent): SessionStatus {
  switch (event.type) {
    case "user_requested_connect":
      if (status.kind !== "idle" && status.kind !== "ended") return status;
      return { kind: "requesting", targetPin: event.targetPin };

    case "server_pin_not_found":
      if (status.kind !== "requesting") return status;
      return { kind: "ended", reason: "pin_not_found" };

    case "server_self_connect_forbidden":
      if (status.kind !== "requesting") return status;
      return { kind: "ended", reason: "self_connect_forbidden" };

    case "server_connect_offer":
      if (status.kind !== "idle" && status.kind !== "ended") return status;
      return {
        kind: "awaiting_consent",
        sessionId: event.sessionId,
        role: "host",
        peerId: event.controllerId,
      };

    case "server_session_ready":
      if (status.kind !== "requesting") return status;
      return {
        kind: "negotiating",
        sessionId: event.sessionId,
        role: "controller",
        peerId: event.hostId,
      };

    case "consent_accepted":
      if (status.kind !== "awaiting_consent") return status;
      return {
        kind: "negotiating",
        sessionId: status.sessionId,
        role: status.role,
        peerId: status.peerId,
      };

    case "consent_declined":
      if (status.kind !== "awaiting_consent") return status;
      return { kind: "ended", reason: "declined" };

    case "peer_connected":
      if (status.kind !== "negotiating") return status;
      return {
        kind: "connected",
        sessionId: status.sessionId,
        role: status.role,
        peerId: status.peerId,
      };

    case "server_peer_disconnected":
      if (status.kind === "idle" || status.kind === "ended") return status;
      if (event.reason === "declined") return { kind: "ended", reason: "declined" };
      if (event.reason === "timeout") return { kind: "ended", reason: "timeout" };
      return { kind: "ended", reason: "peer_disconnected" };

    case "user_ended":
      if (status.kind === "idle" || status.kind === "ended") return status;
      return { kind: "ended", reason: "local_disconnect" };
  }
}
```

- [ ] **Step 5 : Pass**

- [ ] **Step 6 : Commit** `feat(session): add pure state machine reducer`

---

## Task 15 : Client — `useSession` orchestrator + routes wiring

**Files :**
- Create `desktop-app/src/features/session/use-session.ts`
- Create `desktop-app/src/routes/controller-connecting.tsx`
- Create `desktop-app/src/routes/controller-session.tsx`
- Create `desktop-app/src/routes/host-session.tsx`
- Modify `desktop-app/src/app-state.tsx` (ajouter `session` dans AppState)
- Modify `desktop-app/src/App.tsx` (call `useSession`, add routes)
- Modify `desktop-app/src/routes/controller.tsx` (wire "Se connecter")
- Modify `desktop-app/src/routes/host.tsx` (navigate to /host/session on connected)

C'est la tâche la plus intégrative. Pas de TDD strict — la logique est largement du plumbing entre hooks déjà testés individuellement.

- [ ] **Step 1 : `use-session.ts`**

```typescript
import { useEffect, useReducer, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { sessionReducer, initialSessionStatus } from "./session-state-machine";
import type { SessionStatus } from "./session.types";
import type { SignalingClient } from "@/features/signaling/signaling-client";
import { usePeerConnection } from "@/features/webrtc/use-peer-connection";
import { useDataChannel } from "@/features/webrtc/use-data-channel";
import { createOfferWithCompleteIce, createAnswerWithCompleteIce } from "@/features/webrtc/offer-answer";
import { tauriInvoke } from "@/lib/tauri";

interface UseSessionOptions {
  machineId: string | null;
  signalingClient: SignalingClient | null;
  signalingOpen: boolean; // state.connection === "open"
}

export interface UseSessionReturn {
  status: SessionStatus;
  lastMessage: string | null;
  requestConnect: (targetPin: string) => void;
  sendMessage: (data: string) => boolean;
  endSession: () => void;
}

const CONSENT_TIMEOUT_SECS = 30;
const DATA_CHANNEL_LABEL = "linkdesk-phase3";

// Orchestrates the session lifecycle. Subscribes to signaling server messages,
// drives the state machine, manages an RTCPeerConnection + data channel,
// invokes the native consent dialog on host-side.
export function useSession(opts: UseSessionOptions): UseSessionReturn {
  const [status, dispatch] = useReducer(sessionReducer, initialSessionStatus);
  const navigate = useNavigate();
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const { peer } = usePeerConnection({
    active: status.kind === "negotiating" || status.kind === "connected",
    onIncomingDataChannel: (channel) => {
      dataChannelRef.current = channel;
    },
  });

  useDataChannel({
    channel: dataChannelRef.current,
    onMessage: (data) => setLastMessage(data),
  });

  // Subscribe to signaling messages.
  useEffect(() => {
    if (!opts.signalingClient) return;
    return opts.signalingClient.onMessage((msg) => {
      switch (msg.type) {
        case "connect_offer":
          dispatch({ type: "server_connect_offer", sessionId: msg.session_id, controllerId: msg.controller_id });
          break;
        case "session_ready":
          dispatch({ type: "server_session_ready", sessionId: msg.session_id, hostId: msg.host_id });
          break;
        case "peer_disconnected":
          dispatch({ type: "server_peer_disconnected", sessionId: msg.session_id, reason: msg.reason });
          break;
        case "sdp_offer":
          void handleIncomingSdp(peer, msg.sdp, opts.signalingClient, msg.session_id, "answer");
          break;
        case "sdp_answer":
          void peer?.setRemoteDescription(msg.sdp);
          dispatch({ type: "peer_connected", sessionId: msg.session_id });
          break;
        case "error":
          if (msg.code === "pin_not_found") dispatch({ type: "server_pin_not_found" });
          if (msg.code === "self_connect_forbidden") dispatch({ type: "server_self_connect_forbidden" });
          break;
      }
    });
  }, [opts.signalingClient, peer]);

  // Host side: on awaiting_consent → show native dialog, dispatch accepted/declined.
  useEffect(() => {
    if (status.kind !== "awaiting_consent" || status.role !== "host") return;
    let cancelled = false;
    const peerLabel = status.peerId.slice(0, 8);
    tauriInvoke("show_consent_dialog", { peer_label: peerLabel, timeout_secs: CONSENT_TIMEOUT_SECS })
      .then((accepted) => {
        if (cancelled) return;
        opts.signalingClient?.send({
          type: "consent_response",
          session_id: status.sessionId,
          accepted,
        });
        if (accepted) dispatch({ type: "consent_accepted", sessionId: status.sessionId });
        else dispatch({ type: "consent_declined" });
      })
      .catch(() => { if (!cancelled) dispatch({ type: "consent_declined" }); });
    return () => { cancelled = true; };
  }, [status, opts.signalingClient]);

  // Controller side: on negotiating → create data channel, generate SDP offer, send.
  useEffect(() => {
    if (status.kind !== "negotiating" || status.role !== "controller" || !peer) return;
    const channel = peer.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
    dataChannelRef.current = channel;
    void (async () => {
      const offer = await createOfferWithCompleteIce(peer);
      opts.signalingClient?.send({
        type: "sdp_offer",
        session_id: status.sessionId,
        sdp: offer,
      });
    })();
  }, [status, peer, opts.signalingClient]);

  // Navigate on status transitions.
  useEffect(() => {
    if (status.kind === "requesting") navigate("/controller/connecting");
    if (status.kind === "negotiating" && status.role === "controller") navigate("/controller/connecting");
    if (status.kind === "connected" && status.role === "controller") navigate("/controller/session");
    if (status.kind === "connected" && status.role === "host") navigate("/host/session");
    if (status.kind === "ended") navigate("/");
  }, [status, navigate]);

  return {
    status,
    lastMessage,
    requestConnect: (targetPin) => {
      if (!opts.machineId || !opts.signalingClient) return;
      dispatch({ type: "user_requested_connect", targetPin });
      opts.signalingClient.send({ type: "connect_request", controller_id: opts.machineId, target_pin: targetPin });
    },
    sendMessage: (data) => {
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== "open") return false;
      channel.send(data);
      return true;
    },
    endSession: () => {
      dispatch({ type: "user_ended" });
    },
  };
}

// Host-side incoming SDP offer: set remote, generate answer, send back.
async function handleIncomingSdp(
  peer: RTCPeerConnection | null,
  sdp: RTCSessionDescriptionInit,
  client: SignalingClient | null,
  sessionId: string,
  _expected: "offer" | "answer",
): Promise<void> {
  if (!peer) return;
  await peer.setRemoteDescription(sdp);
  const answer = await createAnswerWithCompleteIce(peer);
  client?.send({ type: "sdp_answer", session_id: sessionId, sdp: answer });
}
```

**Note** : ce hook est ~130 lignes (au-dessus de DEV-RULES §1 max 40/fn, mais l'orchestrateur complet a besoin de plusieurs effects). Si ESLint râle sur la taille de `useSession`, extraire les effects en helpers (`useHostConsentEffect`, `useControllerOfferEffect`). Le plan initial garde tout dans `useSession` pour lisibilité du flow.

- [ ] **Step 2 : Extend `app-state.tsx`**

```typescript
import type { SessionStatus } from "@/features/session/session.types";

export interface AppState {
  // ... existing fields ...
  session: {
    status: SessionStatus;
    lastMessage: string | null;
    requestConnect: (pin: string) => void;
    sendMessage: (data: string) => boolean;
    endSession: () => void;
  };
}
```

Et dans `App.tsx`, ajouter l'appel à `useSession` et inclure dans `appState`.

- [ ] **Step 3 : Nouvelles routes**

`controller-connecting.tsx` :

```tsx
import { RotateCw } from "lucide-react";
import { useAppState } from "@/app-state";

export function ControllerConnectingRoute() {
  const { session } = useAppState();
  return (
    <main
      data-testid="controller-connecting-route"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8"
    >
      <RotateCw className="size-12 animate-spin text-primary" aria-hidden />
      <h1 className="text-2xl font-semibold">Connexion en cours…</h1>
      <p className="text-sm text-muted-foreground">
        En attente du consentement de l'hôte.
      </p>
      <p className="text-xs text-muted-foreground">État : {session.status.kind}</p>
    </main>
  );
}
```

`controller-session.tsx` :

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppState } from "@/app-state";

export function ControllerSessionRoute() {
  const { session } = useAppState();
  const [input, setInput] = useState("");
  return (
    <main
      data-testid="controller-session-route"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8"
    >
      <h1 className="text-2xl font-semibold">Session active</h1>
      <p className="text-sm text-muted-foreground">
        Canal P2P ouvert avec l'hôte. Phase 4 ajoutera la vidéo et le contrôle.
      </p>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <Button onClick={() => { session.sendMessage(input); setInput(""); }}>Envoyer</Button>
      </div>
      {session.lastMessage && <p>Reçu : {session.lastMessage}</p>}
      <Button variant="destructive" onClick={session.endSession}>Couper</Button>
    </main>
  );
}
```

`host-session.tsx` :

```tsx
import { Button } from "@/components/ui/button";
import { useAppState } from "@/app-state";

export function HostSessionRoute() {
  const { session } = useAppState();
  return (
    <main
      data-testid="host-session-route"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8"
    >
      <h1 className="text-2xl font-semibold">Votre écran est partagé</h1>
      <p className="text-sm text-muted-foreground">
        Canal P2P ouvert avec le contrôleur. Phase 4 ajoutera le stream vidéo.
      </p>
      <Button onClick={() => session.sendMessage("hello from host " + Date.now())}>
        Envoyer un hello
      </Button>
      {session.lastMessage && <p>Reçu : {session.lastMessage}</p>}
      <Button variant="destructive" onClick={session.endSession}>Terminer la session</Button>
    </main>
  );
}
```

- [ ] **Step 4 : Modifier `App.tsx`** — ajouter les 3 routes dans le router :

```tsx
const router = createMemoryRouter(
  [
    { path: "/", element: <HomeRoute /> },
    { path: "/host", element: <HostRoute /> },
    { path: "/host/session", element: <HostSessionRoute /> },
    { path: "/controller", element: <ControllerRoute /> },
    { path: "/controller/connecting", element: <ControllerConnectingRoute /> },
    { path: "/controller/session", element: <ControllerSessionRoute /> },
  ],
  { initialEntries: ["/"] },
);
```

- [ ] **Step 5 : Modifier `controller.tsx`** — remplacer le `handleConnect` placeholder par `session.requestConnect(pin)` :

```tsx
import { useAppState } from "@/app-state";
// ...
const { signaling, session } = useAppState();
// ...
function handleConnect() {
  if (!complete) return;
  session.requestConnect(pin);
}
```

- [ ] **Step 6 : Vérifier**

```bash
cd desktop-app && npm run typecheck && npm run lint && npm test && npx vite build
```

Expected : tests existants passent. Nouvelles routes montent (smoke test via `tests/app.test.tsx` toujours vert).

**Common issues :**
- `useState` non importé dans use-session → `import { useState, useReducer, useRef, useEffect }`
- Circular dep use-session ↔ signaling → s'assurer que use-session ne ré-importe pas useSignaling (il reçoit `signalingClient` via props)
- SignalingClient exposé : useSignaling doit exposer le client (refactor mineur). Ou bien useSession consomme directement le hook useSignaling state. Pour rester simple : ajouter `client` au retour de `useSignaling` et le propager via AppState.

- [ ] **Step 7 : Commit** `feat(session): orchestrator hook and phase 3 routes`

---

## Task 16 : Fin de phase 3

**Files :**
- Update `CLAUDE.md`, `CHANGELOG.md`
- Create `docs/superpowers/reports/2026-04-22-phase-3-report.md`
- Manual verification (Guillaume)
- Tag `v0.3-webrtc` (local, not pushed)

- [ ] **Step 1 : Full checklist DEV-RULES §11**

```bash
npm install
npm run -w @linkdesk/signaling-server lint
npm run -w @linkdesk/signaling-server typecheck
npm test -w @linkdesk/signaling-server
npm run -w @linkdesk/signaling-server build
npm run -w desktop-app lint
npm run -w desktop-app typecheck
npm test -w desktop-app
npx --workspace=desktop-app vite build
cd desktop-app/src-tauri && cargo clippy --all-targets -- -D warnings && cargo test && cd ../..
```

Tous doivent être verts.

- [ ] **Step 2 : Update `CHANGELOG.md`**

Ajouter section `[0.3.0]` en tête :

```markdown
## [0.3.0] — 2026-04-22 — Phase 3 : Handshake WebRTC & consentement

### Added
- Protocol signaling étendu : `connect_request`, `connect_offer`, `consent_response`, `session_ready`, `sdp_offer`, `sdp_answer`, `ice_candidate`, `peer_disconnected`
- Server : `ConnectionRequestTracker` (TTL 30s), `connect-handler`, `consent-handler`, `sdp-relay`
- Server : `peer_disconnected` automatique sur close d'un peer en session
- Rust : commande `show_consent_dialog` via `tauri-plugin-dialog` (popup OS-level, timeout 30s)
- Client : helpers WebRTC (`offer-answer.ts` wait-for-complete, `peer-config.ts` STUN)
- Client : hooks `usePeerConnection`, `useDataChannel`, `useSession` (state machine complète)
- Client : 3 nouvelles routes (`/controller/connecting`, `/controller/session`, `/host/session`)
- Tests : ~15 nouveaux tests unit + integration E2E complète du connect flow

### Changed
- `AppState` inclut désormais `session` (status + requestConnect + sendMessage + endSession)
- `ControllerRoute` : `handleConnect` appelle `session.requestConnect` au lieu d'afficher un toast

### Notes
- Wait-for-complete ICE (pas de trickle) — `ice_candidate` défini dans le protocole mais pas émis
- Data channel Phase 3 = `{ ordered: true }` reliable — Phase 4 switchera sur `maxRetransmits: 0` pour les inputs
```

- [ ] **Step 3 : Rapport de phase**

`docs/superpowers/reports/2026-04-22-phase-3-report.md` :

```markdown
## Rapport Phase 3 — Handshake WebRTC & consentement

### Implémenté
- Protocole WS complet pour négocier une session WebRTC (connect/consent/sdp/ice/disconnect)
- Popup consentement OS-level via tauri-plugin-dialog (timeout 30s)
- State machine session pure (reducer testable)
- Orchestrateur `useSession` qui pilote WebRTC + signaling + consentement
- Data channel ordered/reliable — "hello world" échangé dans les 2 sens
- Nouvelles routes controller-connecting, controller-session, host-session
- Integration test E2E : connect + consent + SDP exchange + disconnect cleanup

### Non implémenté (et pourquoi)
- Trickle ICE : Phase 5 (wait-for-complete en Phase 3, plus simple)
- Vidéo/input streaming : Phase 4
- Rate-limit : Phase 5
- TURN server : Phase 5

### Décisions d'architecture
- `session_ready` server → controller : débloque la création de SDP offer après accept hôte
- ConnectionRequestTracker séparé de SessionManager — lifecycles distincts (TTL vs illimité post-accept)
- State machine purement fonctionnelle (reducer), side effects dans hook orchestrateur — testabilité et lisibilité

### Métriques à mesurer (Guillaume)
- Temps handshake end-to-end : [stopwatch de "Se connecter" → "Session active"]
- Fiabilité connect (5 essais LAN) : [% réussite]
- Fiabilité consent (5 essais) : [% popup montrée + timeout 30s respecté]
```

- [ ] **Step 4 : Commit + tag**

```bash
git add CHANGELOG.md CLAUDE.md docs/superpowers/reports/2026-04-22-phase-3-report.md
git commit -m "chore: complete phase 3"
git tag v0.3-webrtc
```

**DO NOT push tag** — Guillaume push après vérif manuelle.

- [ ] **Step 5 : Vérif manuelle (Guillaume)**

1. Serveur : `cd signaling-server && PORT=3099 npm run dev`
2. Client 1 (hôte) : `cd desktop-app && npm run tauri dev`
3. Client 2 (contrôleur) : MSI installé Phase 1 OU seconde instance tauri dev

Checklist :
- [ ] Hôte affiche PIN, badge "Connecté"
- [ ] Contrôleur saisit le PIN → clique "Se connecter" → spinner apparaît
- [ ] Popup OS native chez l'hôte : "Untel veut prendre le contrôle" avec boutons Accepter/Refuser
- [ ] Accepter → les 2 clients passent sur leur écran session (/host/session, /controller/session)
- [ ] Message "hello from controller" envoyé → reçu côté hôte
- [ ] Message "hello from host" envoyé → reçu côté contrôleur
- [ ] "Couper" côté hôte → contrôleur revient à l'accueil
- [ ] Refuser la popup → contrôleur revient à l'accueil avec état "declined"
- [ ] Timeout 30s sans réponse → popup disparaît, contrôleur revient à l'accueil

Post-vérif OK :
```bash
git push origin feat/phase-3-webrtc
git push --tags
```

Puis PR sur GitHub.

---

## Self-review

### 1. Spec coverage (PRD §9 Phase 3)

| Item | Task |
|---|---|
| Messages `connect_request`, `connect_offer`, `sdp_*`, `ice_candidate` | Tasks 1, 8 |
| Popup consentement côté hôte (Tauri dialog natif) | Task 9 |
| Établissement RTCPeerConnection + data channel | Tasks 11, 12, 13, 15 |
| Data channel "hello world" échange | Task 15 |
| Gestion timeouts (refus auto après 30s) | Task 9 (Rust timeout) + Task 2 (tracker TTL) |
| Tag `v0.3-webrtc` | Task 16 |

### 2. Placeholder scan

Aucun "TBD" / "TODO" / "implement later" sans contenu. Le Rust snippet de Task 9 contient un `⚠️ API à vérifier via Context7` — c'est explicite et pas un placeholder vide.

### 3. Cohérence de typage

- `SessionStatus` (Task 14) utilisé par `useSession` (Task 15) et routes (Task 15) ✅
- Messages `ConnectRequest`, `SdpOffer`, etc. (Task 1) consommés par handlers (Tasks 3, 4, 5) et mirror client (Task 8) ✅
- `ConnectionRequestTracker.list()` ajouté en Task 6 pour alimenter `findSessionsForMachine` ✅
- `AppState.session` défini en Task 15, consommé par routes nouvelles (même Task) ✅
- `PeerConnectionState` (Task 11) — cohérent avec `RTCPeerConnectionState` natif ✅

### 4. Risques prioritaires

1. **Task 9 (tauri-plugin-dialog API)** : API susceptible de différer. Context7 obligatoire. Si blocant, fallback sur custom Tauri window.
2. **Task 15 (useSession complexité)** : hook orchestrateur de ~130 lignes avec plusieurs effects. Si le code reviewer râle sur la taille, extraire les 3 effects en sous-hooks (`useHostConsentSideEffect`, `useControllerOfferSideEffect`, `useNavigationSideEffect`).
3. **Task 12+13 (hooks WebRTC)** : les tests mockent `RTCPeerConnection` globalement — vérifier que `tests/setup.ts` ne casse pas les autres tests. Ajouter un stub spécifique dans chaque test file si besoin.
4. **Task 7 (E2E)** : potentiellement flaky à cause du timing WS close → `peer_disconnected` propagation. Sleep 100ms OK en local, tuner si CI flaky.

---

**Fin du plan Phase 3.**
