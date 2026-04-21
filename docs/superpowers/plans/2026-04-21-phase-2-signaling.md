# LinkDesk — Phase 2 : Signaling server + enregistrement — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Livrer un serveur WebSocket Node.js/Fastify qui gère l'enregistrement (`register`), la mise à jour du PIN (`update_pin`) et le heartbeat (`ping`/`pong`), et câbler côté `desktop-app` un hook `useSignaling` qui maintient une connexion WS avec reconnect auto + heartbeat. Fin de phase : 2 clients desktop s'enregistrent simultanément et apparaissent dans l'état in-memory du serveur.

**Architecture :** Le serveur Fastify expose `/signaling` (WS upgrade) + `/health` (GET). Un `session-manager` in-memory indexe les clients actifs par `machine_id` et par `current_pin`. Chaque message entrant est validé par Zod avant dispatch via un `message-router`. Côté client, un `signaling-client.ts` encapsule le `WebSocket` natif avec un event-emitter léger + backoff exponentiel, un hook `useSignaling` l'expose à React, et App.tsx hoisté `usePin`/`useMachineId` pour que l'enregistrement + les rotations de PIN soient poussés automatiquement.

**Tech Stack :** Node.js 20 LTS · Fastify 4.x · `@fastify/websocket` · `ws` · Pino · Zod · Vitest · TypeScript strict · (côté client) WebSocket natif + React 18

**Livrable :** Tag Git `v0.2-signaling` à la fin de la phase.

---

## Prérequis

- Node 20 LTS (vérifier `node --version`).
- Phase 1 mergée sur master (commits jusqu'à `555321a` + tag `v0.1-setup` présents).
- Branche `feat/phase-2-signaling` créée depuis master (déjà fait).
- Context7 MCP opérationnel.

**Règle transverse :** avant d'appeler une API de librairie (`fastify`, `@fastify/websocket`, `ws`, `pino`, `zod`), l'exécuteur **doit** faire un `mcp__claude_ai_Context7__query-docs`. Les snippets du plan sont un best-guess à date ; valider avant de coder.

---

## Décisions d'architecture (figées avant le plan)

1. **Zod côté client ET serveur — duplication contrôlée.** Phase 2 duplique les schémas dans `signaling-server/src/websocket/schemas.ts` et `desktop-app/src/features/signaling/message-schemas.ts`. Un package partagé est prévu pour Phase 5 (mention dans `CLAUDE.md` à la fin de Phase 2).

2. **Rôle-agnostique au boot.** Le client (que l'utilisateur finisse en hôte ou contrôleur) appelle toujours `register` avec son `machine_id` + PIN courant. C'est le comportement PRD §3 Module 2 ("Au lancement, l'app ouvre une WebSocket"). → **Hoisting de `usePin` et `useSignaling` au niveau `App.tsx`** (Task 14).

3. **Heartbeat application-level (pas protocole).** Le browser WebSocket API ne permet pas d'envoyer des ping frames natifs depuis JS. On utilise des messages JSON `{"type":"ping"}` / `{"type":"pong"}` toutes les 30s.

4. **Detection de mort de lien :** les deux bords tracent le dernier ping/pong vu. Si > 40s sans activité, close + reconnect (DEV-RULES §7 : "timeout 10s" sur pong, "30s" sur fréquence → grace ~5s).

5. **Reconnexion avec backoff exponentiel** (DEV-RULES §7) : 1s, 2s, 4s, 8s, 16s, 30s (cap 30s). Réinitialisé sur connexion réussie.

6. **Pas de rate-limit en Phase 2** (reporté Phase 5 par le PRD).

7. **Pas d'origin check strict** en Phase 2 (dev local uniquement). Phase 5 ajoutera une whitelist `TRUSTED_ORIGINS`.

8. **Pas de Docker/CI en Phase 2** — strict PRD §9 scope.

9. **Cleanup in-memory :** un client est retiré de `active_clients` sur `close` de sa socket. Pas de TTL purger périodique (YAGNI — les disconnects sont fiables en local).

---

## File Structure

### `signaling-server/` (nouveau package)

```
signaling-server/
├── src/
│   ├── index.ts                       # Entrypoint: load env, build server, listen
│   ├── server.ts                      # buildServer() factory (Fastify + WS plugin + routes)
│   ├── lib/
│   │   ├── env.ts                     # loadEnv() avec validation Zod
│   │   └── logger.ts                  # Pino instance (pino-pretty en dev)
│   ├── types/
│   │   ├── messages.ts                # Types miroir Zod (ClientMessage, ServerMessage)
│   │   └── client.ts                  # ActiveClient
│   ├── websocket/
│   │   ├── schemas.ts                 # Zod schemas de tous les messages
│   │   ├── session-manager.ts         # Map<machineId, ActiveClient> + index par PIN
│   │   ├── handler.ts                 # onConnect / onMessage / onClose lifecycle
│   │   └── message-router.ts          # Dispatch par type
│   ├── features/
│   │   └── register/
│   │       └── register-handler.ts    # Traite register + update_pin
│   └── routes/
│       └── health.ts                  # GET /health
├── tests/
│   ├── setup.ts                       # Config Vitest commune
│   ├── websocket/
│   │   └── session-manager.test.ts
│   ├── features/
│   │   └── register/
│   │       └── register-handler.test.ts
│   └── integration/
│       └── register-flow.test.ts      # Spin up server + 2 WS clients
├── .env.example
├── eslint.config.js                   # Flat config (ESLint v10)
├── tsconfig.json
├── vitest.config.ts
├── package.json
└── README.md
```

### `desktop-app/` (fichiers ajoutés / modifiés)

Ajoutés :
- `src/features/signaling/signaling.types.ts`
- `src/features/signaling/message-schemas.ts`       # Mirror côté client
- `src/features/signaling/signaling-client.ts`     # Classe WS + events + backoff
- `src/features/signaling/use-signaling.ts`        # Hook React
- `src/components/status-badge.tsx`                # Indicator "Connecté / Reconnexion / Hors ligne"
- `tests/features/signaling-client.test.ts`
- `tests/features/use-signaling.test.tsx`

Modifiés :
- `src/App.tsx`                                     # Hoist usePin + useSignaling; pass via context
- `src/routes/home.tsx`                             # StatusBadge dans le header
- `src/routes/host.tsx`                             # Consomme usePin depuis context
- `src/routes/controller.tsx`                       # StatusBadge visible
- `src/.env.example`                                # `VITE_SIGNALING_WS_URL` déjà présent depuis Phase 1

### Racine monorepo

- `package.json` racine : ajouter scripts workspaces pour `signaling-server`.
- `CHANGELOG.md` : section `[0.2.0]`.
- `docs/superpowers/reports/2026-04-21-phase-2-report.md` : rapport fin de phase.

---

## Task 1 : Init workspace `signaling-server/`

**Files :**
- Create : `signaling-server/package.json`, `tsconfig.json`, `.gitignore`, `vitest.config.ts`, `README.md`
- Create : `signaling-server/src/index.ts` (placeholder `console.log("bootstrapping")`)

**Context7 check :** `fastify`, `@fastify/websocket`, `pino`, `pino-pretty`, `tsx` (dev runner) versions actuelles.

- [ ] **Step 1 : Créer `signaling-server/package.json`**

```json
{
  "name": "@linkdesk/signaling-server",
  "version": "0.2.0",
  "private": true,
  "description": "LinkDesk signaling server (Fastify + WebSocket)",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^4",
    "@fastify/websocket": "^10",
    "pino": "^9",
    "pino-pretty": "^11",
    "ws": "^8",
    "zod": "^3"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/ws": "^8",
    "@typescript-eslint/eslint-plugin": "^8",
    "@typescript-eslint/parser": "^8",
    "eslint": "^9",
    "tsx": "^4",
    "typescript": "^5",
    "vitest": "^2"
  },
  "engines": {
    "node": ">=20"
  }
}
```

Les versions majeures peuvent différer au moment de l'install — laisser `npm install` résoudre. Le plan n'impose pas de version patch exacte.

- [ ] **Step 2 : Créer `signaling-server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3 : Créer `signaling-server/.gitignore`**

```gitignore
node_modules/
dist/
.env
*.log
```

- [ ] **Step 4 : Créer `signaling-server/src/index.ts` placeholder**

```typescript
// Entrypoint - real implementation lands in Task 8.
console.log("signaling-server bootstrap placeholder");
```

- [ ] **Step 5 : Installer les dépendances**

Depuis la racine du monorepo :
```bash
npm install
```

Le `workspaces: ["signaling-server"]` du root `package.json` (ajouté en Phase 1) résout tout. Expected : `node_modules/` populé à la racine, lockfile mis à jour.

- [ ] **Step 6 : Créer `signaling-server/README.md` (court)**

```markdown
# LinkDesk — signaling-server

Serveur WebSocket de signaling (Fastify + `ws`).

## Dev

```bash
npm install        # depuis la racine
npm run -w @linkdesk/signaling-server dev
```

## Variables d'env

Voir `.env.example`. Minimum requis :
- `PORT` (défaut 3001)
- `LOG_LEVEL` (défaut `info`)

## Tests

```bash
npm run -w @linkdesk/signaling-server test
npm run -w @linkdesk/signaling-server typecheck
npm run -w @linkdesk/signaling-server lint
```

## Phase 2 — périmètre

Enregistrement client (`register`, `update_pin`) + heartbeat (`ping`/`pong`). Pas de handshake WebRTC (Phase 3+).
```

- [ ] **Step 7 : Vérifier**

```bash
npm run -w @linkdesk/signaling-server typecheck
# Expected: 0 error

npx -w @linkdesk/signaling-server tsx src/index.ts
# Expected: prints "signaling-server bootstrap placeholder"
```

- [ ] **Step 8 : Commit**

```bash
git add signaling-server/ package-lock.json
git commit -m "chore(signaling): scaffold fastify workspace"
```

---

## Task 2 : ESLint flat config + `.env.example` + scripts monorepo

**Files :**
- Create : `signaling-server/eslint.config.js`
- Create : `signaling-server/.env.example`
- Modify : `signaling-server/tests/setup.ts` (vide pour l'instant, configuré en Task 3)
- Modify : racine `package.json` (si besoin — ajouter un script `dev:server` pour faciliter les tests manuels fin de phase)

- [ ] **Step 1 : Créer `signaling-server/eslint.config.js`**

```javascript
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      globals: {
        process: "readonly",
        console: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
```

Installer la dep manquante :
```bash
npm install -D -w @linkdesk/signaling-server @eslint/js
```

- [ ] **Step 2 : Créer `signaling-server/.env.example`**

```env
# Signaling server environment (Node.js).

# HTTP/WebSocket listen port.
PORT=3001

# Pino log level: trace | debug | info | warn | error | fatal
LOG_LEVEL=info

# NODE_ENV is read by Pino to enable pino-pretty in dev.
NODE_ENV=development
```

- [ ] **Step 3 : Créer `signaling-server/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4 : Créer `signaling-server/tests/setup.ts`**

```typescript
// Vitest global setup - currently a no-op; reserved for future mocks.
export {};
```

- [ ] **Step 5 : Vérifier lint + typecheck**

```bash
npm run -w @linkdesk/signaling-server lint
npm run -w @linkdesk/signaling-server typecheck
# Expected: both exit 0
```

- [ ] **Step 6 : Commit**

```bash
git add signaling-server/ package-lock.json
git commit -m "chore(signaling): add eslint flat config, env example, vitest"
```

---

## Task 3 : `env.ts` + `logger.ts`

**Files :**
- Create : `signaling-server/src/lib/env.ts`
- Create : `signaling-server/src/lib/logger.ts`
- Create : `signaling-server/tests/lib/env.test.ts`

- [ ] **Step 1 : Écrire le test (TDD)**

`signaling-server/tests/lib/env.test.ts` :

```typescript
import { loadEnv } from "@/lib/env";

describe("loadEnv", () => {
  it("parses valid env with defaults", () => {
    const env = loadEnv({ PORT: "3001", LOG_LEVEL: "info", NODE_ENV: "development" });
    expect(env.PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("development");
  });

  it("applies defaults when vars are missing", () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(3001);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("development");
  });

  it("throws on invalid PORT", () => {
    expect(() => loadEnv({ PORT: "not-a-number" })).toThrow();
  });

  it("throws on invalid LOG_LEVEL", () => {
    expect(() => loadEnv({ LOG_LEVEL: "shouty" })).toThrow();
  });
});
```

- [ ] **Step 2 : Lancer le test — doit fail**

```bash
npm test -w @linkdesk/signaling-server -- env
```

Expected : FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `src/lib/env.ts`**

```typescript
import { z } from "zod";

// Env schema. Numeric coercion on PORT via z.coerce.
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

// Parses env vars and throws with a helpful error on invalid input.
// Accepts a plain record so tests can inject arbitrary input without touching process.env.
export function loadEnv(input: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}
```

- [ ] **Step 4 : Lancer le test — doit pass**

```bash
npm test -w @linkdesk/signaling-server -- env
# Expected: 4 passing
```

- [ ] **Step 5 : Implémenter `src/lib/logger.ts`** (pas de test — fin trop mince)

```typescript
import pino from "pino";
import type { Env } from "./env";

// Creates a Pino logger. In development, routes through pino-pretty for readable output.
// In production, emits JSON to stdout.
//
// Redaction: never log PINs in clear (DEV-RULES §10). Callers pass maskPin() for PIN fields.
export function createLogger(env: Env): pino.Logger {
  if (env.NODE_ENV === "development") {
    return pino({
      level: env.LOG_LEVEL,
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
  }
  return pino({ level: env.LOG_LEVEL });
}

// Returns a redacted representation of a PIN suitable for logging.
// "123-456-789" -> "***-***-***"
export function maskPin(pin: string): string {
  return pin.replace(/\d/g, "*");
}
```

- [ ] **Step 6 : Commit**

```bash
git add signaling-server/src/lib signaling-server/tests/lib
git commit -m "feat(signaling): add env loader and pino logger with pin masking"
```

---

## Task 4 : Zod schemas + type miroirs

**Files :**
- Create : `signaling-server/src/websocket/schemas.ts`
- Create : `signaling-server/src/types/messages.ts`
- Create : `signaling-server/src/types/client.ts`
- Create : `signaling-server/tests/websocket/schemas.test.ts`

- [ ] **Step 1 : Tests (TDD) — `tests/websocket/schemas.test.ts`**

```typescript
import {
  RegisterMessageSchema,
  UpdatePinMessageSchema,
  PingMessageSchema,
  parseClientMessage,
} from "@/websocket/schemas";

describe("websocket schemas", () => {
  describe("RegisterMessageSchema", () => {
    it("accepts a valid register payload", () => {
      const result = RegisterMessageSchema.safeParse({
        type: "register",
        machine_id: "550e8400-e29b-41d4-a716-446655440000",
        pin: "123-456-789",
        pin_expires_at: "2026-04-21T10:00:00.000Z",
      });
      expect(result.success).toBe(true);
    });

    it("rejects malformed machine_id", () => {
      const result = RegisterMessageSchema.safeParse({
        type: "register",
        machine_id: "not-a-uuid",
        pin: "123-456-789",
        pin_expires_at: "2026-04-21T10:00:00.000Z",
      });
      expect(result.success).toBe(false);
    });

    it("rejects malformed pin", () => {
      const result = RegisterMessageSchema.safeParse({
        type: "register",
        machine_id: "550e8400-e29b-41d4-a716-446655440000",
        pin: "12345", // too short
        pin_expires_at: "2026-04-21T10:00:00.000Z",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdatePinMessageSchema", () => {
    it("accepts a valid update_pin payload", () => {
      const result = UpdatePinMessageSchema.safeParse({
        type: "update_pin",
        machine_id: "550e8400-e29b-41d4-a716-446655440000",
        new_pin: "987-654-321",
        new_expires_at: "2026-04-21T10:30:00.000Z",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("PingMessageSchema", () => {
    it("accepts a bare ping", () => {
      expect(PingMessageSchema.safeParse({ type: "ping" }).success).toBe(true);
    });
  });

  describe("parseClientMessage", () => {
    it("routes by type to the correct schema", () => {
      const result = parseClientMessage({ type: "ping" });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.type).toBe("ping");
    });

    it("returns an error for unknown types", () => {
      const result = parseClientMessage({ type: "unknown" });
      expect(result.ok).toBe(false);
    });

    it("returns an error on non-object input", () => {
      const result = parseClientMessage("hello");
      expect(result.ok).toBe(false);
    });
  });
});
```

- [ ] **Step 2 : Lancer — doit fail**

```bash
npm test -w @linkdesk/signaling-server -- schemas
# Expected: FAIL (module introuvable)
```

- [ ] **Step 3 : Implémenter `src/websocket/schemas.ts`**

```typescript
import { z } from "zod";

// Canonical PIN format: "XXX-XXX-XXX" (9 digits, two dashes).
const PinSchema = z.string().regex(/^\d{3}-\d{3}-\d{3}$/);

// Timestamps are ISO-8601 strings transmitted over the wire.
const IsoTimestampSchema = z.string().datetime();

const MachineIdSchema = z.string().uuid();

// --- Client → Server messages ---

export const RegisterMessageSchema = z.object({
  type: z.literal("register"),
  machine_id: MachineIdSchema,
  pin: PinSchema,
  pin_expires_at: IsoTimestampSchema,
});

export const UpdatePinMessageSchema = z.object({
  type: z.literal("update_pin"),
  machine_id: MachineIdSchema,
  new_pin: PinSchema,
  new_expires_at: IsoTimestampSchema,
});

export const PingMessageSchema = z.object({
  type: z.literal("ping"),
});

// Discriminated union of all client → server messages.
export const ClientMessageSchema = z.discriminatedUnion("type", [
  RegisterMessageSchema,
  UpdatePinMessageSchema,
  PingMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// --- Server → Client messages ---

export const RegisteredAckSchema = z.object({
  type: z.literal("registered"),
  machine_id: MachineIdSchema,
});

export const PinUpdatedAckSchema = z.object({
  type: z.literal("pin_updated"),
});

export const PongMessageSchema = z.object({
  type: z.literal("pong"),
});

export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  RegisteredAckSchema,
  PinUpdatedAckSchema,
  PongMessageSchema,
  ErrorMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// --- Parser helper ---

// Parses a raw client-sent value (already JSON.parse'd) into a typed ClientMessage.
// Returns a discriminated result so callers don't need try/catch around Zod.
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  const parsed = ClientMessageSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.message };
}
```

- [ ] **Step 4 : Implémenter `src/types/messages.ts`**

```typescript
// Re-export the inferred types for convenience. Callers import from here for types
// and from `@/websocket/schemas` for runtime parsing.
export type { ClientMessage, ServerMessage } from "@/websocket/schemas";
```

- [ ] **Step 5 : Implémenter `src/types/client.ts`**

```typescript
import type { WebSocket } from "ws";

// An active client tracked by the session manager (in-memory, Phase 2).
export interface ActiveClient {
  machineId: string;
  socketId: string;              // Generated server-side (crypto.randomUUID())
  socket: WebSocket;             // Live WS reference
  connectedAt: Date;
  currentPin: string | null;     // null until registered
  pinExpiresAt: Date | null;
  lastPingAt: Date;              // For heartbeat liveness check
}
```

- [ ] **Step 6 : Lancer tests — doit pass**

```bash
npm test -w @linkdesk/signaling-server -- schemas
# Expected: all passing (8+ assertions across 3 describe blocks)
```

- [ ] **Step 7 : Commit**

```bash
git add signaling-server/src/websocket/schemas.ts signaling-server/src/types signaling-server/tests/websocket
git commit -m "feat(signaling): add zod schemas and client types"
```

---

## Task 5 : `session-manager` (TDD)

**Files :**
- Create : `signaling-server/src/websocket/session-manager.ts`
- Create : `signaling-server/tests/websocket/session-manager.test.ts`

- [ ] **Step 1 : Test (TDD)**

`tests/websocket/session-manager.test.ts` :

```typescript
import { SessionManager } from "@/websocket/session-manager";
import type { WebSocket } from "ws";

// Minimal WebSocket stub - only `close()` is called by the manager.
function mockSocket(): WebSocket {
  return { close: () => undefined } as unknown as WebSocket;
}

describe("SessionManager", () => {
  let manager: SessionManager;
  const machineA = "550e8400-e29b-41d4-a716-446655440000";
  const machineB = "550e8400-e29b-41d4-a716-446655440001";
  const pinA = "111-222-333";
  const pinB = "444-555-666";

  beforeEach(() => {
    manager = new SessionManager();
  });

  it("registers a new client", () => {
    const socket = mockSocket();
    const client = manager.register({
      machineId: machineA,
      socket,
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    expect(client.machineId).toBe(machineA);
    expect(client.currentPin).toBe(pinA);
    expect(manager.findByMachineId(machineA)).toBe(client);
    expect(manager.findByPin(pinA)).toBe(client);
  });

  it("closes and replaces the previous socket when the same machine_id re-registers", () => {
    let closed = false;
    const socketOld = { close: () => { closed = true; } } as unknown as WebSocket;
    manager.register({
      machineId: machineA,
      socket: socketOld,
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });

    const socketNew = mockSocket();
    manager.register({
      machineId: machineA,
      socket: socketNew,
      pin: "999-888-777",
      pinExpiresAt: new Date(Date.now() + 60_000),
    });

    expect(closed).toBe(true);
    expect(manager.findByMachineId(machineA)?.socket).toBe(socketNew);
    // Old PIN is no longer indexed.
    expect(manager.findByPin(pinA)).toBeUndefined();
  });

  it("updates a PIN and keeps the PIN index consistent", () => {
    manager.register({
      machineId: machineA,
      socket: mockSocket(),
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });

    manager.updatePin(machineA, "new-pin-bad"); // Invalid-format PINs are caller's concern;
                                                // manager just stores the string.
    manager.updatePin(machineA, pinB, new Date(Date.now() + 60_000));

    expect(manager.findByPin(pinA)).toBeUndefined();
    expect(manager.findByPin("new-pin-bad")).toBeUndefined(); // Overwritten by pinB
    expect(manager.findByPin(pinB)?.machineId).toBe(machineA);
  });

  it("removes a client and cleans indexes", () => {
    manager.register({
      machineId: machineA,
      socket: mockSocket(),
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    manager.remove(machineA);
    expect(manager.findByMachineId(machineA)).toBeUndefined();
    expect(manager.findByPin(pinA)).toBeUndefined();
  });

  it("counts active clients", () => {
    expect(manager.count()).toBe(0);
    manager.register({
      machineId: machineA,
      socket: mockSocket(),
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    manager.register({
      machineId: machineB,
      socket: mockSocket(),
      pin: pinB,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    expect(manager.count()).toBe(2);
  });

  it("touch() updates lastPingAt", () => {
    manager.register({
      machineId: machineA,
      socket: mockSocket(),
      pin: pinA,
      pinExpiresAt: new Date(Date.now() + 60_000),
    });
    const before = manager.findByMachineId(machineA)!.lastPingAt;
    // Advance real time by a small amount
    const later = new Date(before.getTime() + 1000);
    manager.touch(machineA, later);
    expect(manager.findByMachineId(machineA)?.lastPingAt).toEqual(later);
  });
});
```

- [ ] **Step 2 : Lancer — fail**

```bash
npm test -w @linkdesk/signaling-server -- session-manager
# Expected: FAIL
```

- [ ] **Step 3 : Implémenter `src/websocket/session-manager.ts`**

```typescript
import type { WebSocket } from "ws";
import type { ActiveClient } from "@/types/client";

interface RegisterInput {
  machineId: string;
  socket: WebSocket;
  pin: string;
  pinExpiresAt: Date;
}

// In-memory registry of connected clients.
// Keeps two indexes for O(1) lookup: by machine_id AND by current PIN.
// Phase 2: data is lost on server restart (acceptable per PRD §5 "éphémère").
export class SessionManager {
  private readonly byMachineId = new Map<string, ActiveClient>();
  private readonly byPin = new Map<string, string>(); // pin → machineId

  register(input: RegisterInput): ActiveClient {
    // If the same machine_id is already connected, close the old socket first.
    const existing = this.byMachineId.get(input.machineId);
    if (existing) {
      try {
        existing.socket.close();
      } catch {
        // Ignore close errors - the socket may already be half-closed.
      }
      if (existing.currentPin) this.byPin.delete(existing.currentPin);
    }

    const client: ActiveClient = {
      machineId: input.machineId,
      socketId: crypto.randomUUID(),
      socket: input.socket,
      connectedAt: new Date(),
      currentPin: input.pin,
      pinExpiresAt: input.pinExpiresAt,
      lastPingAt: new Date(),
    };
    this.byMachineId.set(input.machineId, client);
    this.byPin.set(input.pin, input.machineId);
    return client;
  }

  // Updates the PIN of an already-registered client and refreshes the PIN index.
  // Does nothing if the machine is not currently registered.
  updatePin(machineId: string, newPin: string, newExpiresAt?: Date): void {
    const client = this.byMachineId.get(machineId);
    if (!client) return;

    if (client.currentPin) this.byPin.delete(client.currentPin);
    this.byPin.set(newPin, machineId);
    client.currentPin = newPin;
    if (newExpiresAt) client.pinExpiresAt = newExpiresAt;
  }

  // Touches the heartbeat timestamp. Used by the ping handler.
  touch(machineId: string, at: Date = new Date()): void {
    const client = this.byMachineId.get(machineId);
    if (client) client.lastPingAt = at;
  }

  remove(machineId: string): void {
    const client = this.byMachineId.get(machineId);
    if (!client) return;
    if (client.currentPin) this.byPin.delete(client.currentPin);
    this.byMachineId.delete(machineId);
  }

  findByMachineId(machineId: string): ActiveClient | undefined {
    return this.byMachineId.get(machineId);
  }

  findByPin(pin: string): ActiveClient | undefined {
    const machineId = this.byPin.get(pin);
    return machineId ? this.byMachineId.get(machineId) : undefined;
  }

  count(): number {
    return this.byMachineId.size;
  }
}
```

- [ ] **Step 4 : Lancer tests — pass**

```bash
npm test -w @linkdesk/signaling-server -- session-manager
# Expected: 6 passing
```

- [ ] **Step 5 : Commit**

```bash
git add signaling-server/src/websocket/session-manager.ts signaling-server/tests/websocket/session-manager.test.ts
git commit -m "feat(signaling): add in-memory session manager with pin index"
```

---

## Task 6 : Register handler (TDD)

**Files :**
- Create : `signaling-server/src/features/register/register-handler.ts`
- Create : `signaling-server/tests/features/register/register-handler.test.ts`

- [ ] **Step 1 : Test**

`tests/features/register/register-handler.test.ts` :

```typescript
import { handleRegister, handleUpdatePin } from "@/features/register/register-handler";
import { SessionManager } from "@/websocket/session-manager";
import type { WebSocket } from "ws";

function mockSocket() {
  const sent: string[] = [];
  return {
    sent,
    close: () => undefined,
    send: (data: string) => { sent.push(data); },
  } as unknown as WebSocket & { sent: string[] };
}

const machineA = "550e8400-e29b-41d4-a716-446655440000";

describe("handleRegister", () => {
  it("registers and sends a registered ack", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    handleRegister(
      {
        type: "register",
        machine_id: machineA,
        pin: "111-222-333",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      { manager, socket },
    );

    expect(manager.findByMachineId(machineA)).toBeDefined();
    const ack = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(ack).toEqual({ type: "registered", machine_id: machineA });
  });
});

describe("handleUpdatePin", () => {
  it("updates the pin and acks", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    handleRegister(
      {
        type: "register",
        machine_id: machineA,
        pin: "111-222-333",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      { manager, socket },
    );
    (socket as { sent: string[] }).sent.length = 0;

    handleUpdatePin(
      {
        type: "update_pin",
        machine_id: machineA,
        new_pin: "999-888-777",
        new_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      { manager, socket },
    );

    expect(manager.findByPin("111-222-333")).toBeUndefined();
    expect(manager.findByPin("999-888-777")?.machineId).toBe(machineA);
    const ack = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(ack).toEqual({ type: "pin_updated" });
  });

  it("ignores update_pin for an unknown machine_id", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    handleUpdatePin(
      {
        type: "update_pin",
        machine_id: machineA,
        new_pin: "999-888-777",
        new_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      { manager, socket },
    );

    // No error sent; just silently drops. (An unknown machine shouldn't be updating PINs.)
    expect(manager.count()).toBe(0);
  });
});
```

- [ ] **Step 2 : Fail**

```bash
npm test -w @linkdesk/signaling-server -- register-handler
```

- [ ] **Step 3 : Implémenter `src/features/register/register-handler.ts`**

```typescript
import type { WebSocket } from "ws";
import type { SessionManager } from "@/websocket/session-manager";
import type {
  RegisterMessageSchema,
  UpdatePinMessageSchema,
} from "@/websocket/schemas";
import type { z } from "zod";

interface HandlerContext {
  manager: SessionManager;
  socket: WebSocket;
}

type RegisterMessage = z.infer<typeof RegisterMessageSchema>;
type UpdatePinMessage = z.infer<typeof UpdatePinMessageSchema>;

// Handles a validated "register" message: records the client and acks.
export function handleRegister(
  msg: RegisterMessage,
  ctx: HandlerContext,
): void {
  ctx.manager.register({
    machineId: msg.machine_id,
    socket: ctx.socket,
    pin: msg.pin,
    pinExpiresAt: new Date(msg.pin_expires_at),
  });
  const ack = { type: "registered" as const, machine_id: msg.machine_id };
  ctx.socket.send(JSON.stringify(ack));
}

// Handles a validated "update_pin" message. Silently drops if the machine is unknown
// (this should not happen in a well-behaved client - but we don't surface an error
// to avoid leaking server state).
export function handleUpdatePin(
  msg: UpdatePinMessage,
  ctx: HandlerContext,
): void {
  if (!ctx.manager.findByMachineId(msg.machine_id)) return;
  ctx.manager.updatePin(
    msg.machine_id,
    msg.new_pin,
    new Date(msg.new_expires_at),
  );
  const ack = { type: "pin_updated" as const };
  ctx.socket.send(JSON.stringify(ack));
}
```

- [ ] **Step 4 : Pass**

```bash
npm test -w @linkdesk/signaling-server -- register-handler
# Expected: 3 passing
```

- [ ] **Step 5 : Commit**

```bash
git add signaling-server/src/features/register signaling-server/tests/features
git commit -m "feat(signaling): add register and update_pin handlers"
```

---

## Task 7 : Message router + WebSocket handler

**Files :**
- Create : `signaling-server/src/websocket/message-router.ts`
- Create : `signaling-server/src/websocket/handler.ts`
- Create : `signaling-server/tests/websocket/message-router.test.ts`

- [ ] **Step 1 : Test du router**

`tests/websocket/message-router.test.ts` :

```typescript
import { routeMessage } from "@/websocket/message-router";
import { SessionManager } from "@/websocket/session-manager";
import type { WebSocket } from "ws";

function mockSocket() {
  const sent: string[] = [];
  return {
    sent,
    close: () => undefined,
    send: (data: string) => { sent.push(data); },
  } as unknown as WebSocket & { sent: string[] };
}

const machineA = "550e8400-e29b-41d4-a716-446655440000";

describe("routeMessage", () => {
  it("routes register to its handler", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    routeMessage(
      JSON.stringify({
        type: "register",
        machine_id: machineA,
        pin: "111-222-333",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
      { manager, socket },
    );
    expect(manager.count()).toBe(1);
    expect((socket as { sent: string[] }).sent[0]).toContain("registered");
  });

  it("replies pong to ping and touches the client", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    // Register first so ping has something to touch.
    routeMessage(
      JSON.stringify({
        type: "register",
        machine_id: machineA,
        pin: "111-222-333",
        pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
      { manager, socket },
    );
    (socket as { sent: string[] }).sent.length = 0;

    routeMessage(JSON.stringify({ type: "ping" }), { manager, socket, machineId: machineA });

    const pong = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(pong).toEqual({ type: "pong" });
  });

  it("sends an error message on invalid JSON", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    routeMessage("not-json", { manager, socket });

    const err = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(err.type).toBe("error");
    expect(err.code).toBe("invalid_json");
  });

  it("sends an error message on unknown type", () => {
    const manager = new SessionManager();
    const socket = mockSocket();
    routeMessage(JSON.stringify({ type: "bogus" }), { manager, socket });

    const err = JSON.parse((socket as { sent: string[] }).sent[0]);
    expect(err.type).toBe("error");
    expect(err.code).toBe("invalid_message");
  });
});
```

- [ ] **Step 2 : Fail**

```bash
npm test -w @linkdesk/signaling-server -- message-router
```

- [ ] **Step 3 : Implémenter `src/websocket/message-router.ts`**

```typescript
import type { WebSocket } from "ws";
import type { SessionManager } from "./session-manager";
import { parseClientMessage } from "./schemas";
import { handleRegister, handleUpdatePin } from "@/features/register/register-handler";

interface RouterContext {
  manager: SessionManager;
  socket: WebSocket;
  machineId?: string; // Set after register succeeds
}

function sendError(socket: WebSocket, code: string, message: string): void {
  socket.send(JSON.stringify({ type: "error", code, message }));
}

// Routes a raw (string) incoming message to the appropriate handler.
// Unknown or malformed messages yield a structured error response.
export function routeMessage(raw: string, ctx: RouterContext): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
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
      handleRegister(msg, ctx);
      return;
    case "update_pin":
      handleUpdatePin(msg, ctx);
      return;
    case "ping":
      if (ctx.machineId) ctx.manager.touch(ctx.machineId);
      ctx.socket.send(JSON.stringify({ type: "pong" }));
      return;
  }
}
```

- [ ] **Step 4 : Implémenter `src/websocket/handler.ts` (pas de test unitaire — testé via integration en Task 9)**

```typescript
import type { WebSocket } from "ws";
import type { Logger } from "pino";
import type { SessionManager } from "./session-manager";
import { routeMessage } from "./message-router";
import { maskPin } from "@/lib/logger";

// Max silence before forced disconnect (DEV-RULES §7 — 30s ping + 10s timeout + slack).
const HEARTBEAT_TIMEOUT_MS = 45_000;
const HEARTBEAT_CHECK_INTERVAL_MS = 15_000;

interface ConnectionOptions {
  manager: SessionManager;
  logger: Logger;
}

// Wires all lifecycle events on a freshly accepted WebSocket.
// Closure tracks the resolved machineId (set after a successful register)
// so we can clean up on disconnect without parsing outbound messages.
export function handleConnection(socket: WebSocket, opts: ConnectionOptions): void {
  let machineId: string | undefined;
  const log = opts.logger.child({ socket_id: crypto.randomUUID() });

  log.info("client connected");

  socket.on("message", (raw) => {
    const text = typeof raw === "string" ? raw : raw.toString("utf-8");
    // Route first; if the message was a register, reflect the resolved machineId.
    routeMessage(text, { manager: opts.manager, socket, machineId });
    // Cheap way to detect a successful register: inspect state post-routing.
    // This avoids making the router return a result type for Phase 2.
    const scan = JSON.parse(text) as { type?: string; machine_id?: string };
    if (scan.type === "register" && typeof scan.machine_id === "string" && opts.manager.findByMachineId(scan.machine_id)) {
      machineId = scan.machine_id;
    }
    if (scan.type === "update_pin" && typeof scan.machine_id === "string") {
      log.debug({ machineId: scan.machine_id, pin: maskPin((scan as { new_pin?: string }).new_pin ?? "") }, "pin updated");
    }
  });

  const heartbeatTimer = setInterval(() => {
    if (!machineId) return;
    const client = opts.manager.findByMachineId(machineId);
    if (!client) return;
    const elapsed = Date.now() - client.lastPingAt.getTime();
    if (elapsed > HEARTBEAT_TIMEOUT_MS) {
      log.warn({ machineId, elapsed }, "heartbeat timeout — closing socket");
      socket.close();
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS);

  socket.on("close", () => {
    clearInterval(heartbeatTimer);
    if (machineId) {
      opts.manager.remove(machineId);
      log.info({ machineId }, "client disconnected");
    }
  });

  socket.on("error", (err) => {
    log.error({ err }, "socket error");
  });
}
```

- [ ] **Step 5 : Pass**

```bash
npm test -w @linkdesk/signaling-server -- message-router
# Expected: 4 passing
```

- [ ] **Step 6 : Commit**

```bash
git add signaling-server/src/websocket/message-router.ts signaling-server/src/websocket/handler.ts signaling-server/tests/websocket/message-router.test.ts
git commit -m "feat(signaling): add message router and connection lifecycle"
```

---

## Task 8 : Server bootstrap (Fastify + WS + health)

**Files :**
- Create : `signaling-server/src/server.ts`
- Create : `signaling-server/src/routes/health.ts`
- Modify : `signaling-server/src/index.ts`

- [ ] **Step 1 : `src/routes/health.ts`**

```typescript
import type { FastifyInstance } from "fastify";

// Minimal liveness endpoint. Phase 5 may expand with readiness checks.
export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));
}
```

- [ ] **Step 2 : `src/server.ts`**

```typescript
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
export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance & { sessions: SessionManager }> {
  const logger = createLogger(opts.env);
  const sessions = new SessionManager();

  const app = Fastify({ logger: false }); // We use our own pino instance.
  await app.register(websocket);
  await app.register(healthRoute);

  app.get("/signaling", { websocket: true }, (socket) => {
    handleConnection(socket, { manager: sessions, logger });
  });

  // Expose sessions for integration tests.
  (app as FastifyInstance & { sessions: SessionManager }).sessions = sessions;
  return app as FastifyInstance & { sessions: SessionManager };
}
```

- [ ] **Step 3 : `src/index.ts` (replace placeholder)**

```typescript
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
```

- [ ] **Step 4 : Démarrer en dev pour smoke test**

```bash
npm run -w @linkdesk/signaling-server dev
# In another terminal:
curl http://localhost:3001/health
# Expected: {"status":"ok"}
# Stop with Ctrl+C.
```

Si la connexion WS se teste, on le fait dans Task 9 (integration test).

- [ ] **Step 5 : `typecheck` + `lint`**

```bash
npm run -w @linkdesk/signaling-server typecheck
npm run -w @linkdesk/signaling-server lint
# Expected: both exit 0
```

- [ ] **Step 6 : Commit**

```bash
git add signaling-server/src
git commit -m "feat(signaling): bootstrap fastify server with websocket and health"
```

---

## Task 9 : Integration test (2 clients)

**Files :**
- Create : `signaling-server/tests/integration/register-flow.test.ts`

- [ ] **Step 1 : Écrire le test**

```typescript
import { buildServer } from "@/server";
import { loadEnv } from "@/lib/env";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import type { SessionManager } from "@/websocket/session-manager";

const MACHINE_A = "550e8400-e29b-41d4-a716-446655440000";
const MACHINE_B = "550e8400-e29b-41d4-a716-446655440001";

describe("register flow — 2 simultaneous clients", () => {
  let app: FastifyInstance & { sessions: SessionManager };
  let url: string;

  beforeAll(async () => {
    const env = loadEnv({ PORT: "0", NODE_ENV: "test", LOG_LEVEL: "error" });
    app = await buildServer({ env });
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    url = address.replace("http", "ws") + "/signaling";
  });

  afterAll(async () => {
    await app.close();
  });

  function awaitMessage(ws: WebSocket): Promise<unknown> {
    return new Promise((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString("utf-8"))));
      ws.once("error", reject);
    });
  }

  function connectedSocket(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
    });
  }

  it("registers two clients and tracks them independently", async () => {
    const wsA = await connectedSocket(url);
    const wsB = await connectedSocket(url);

    wsA.send(JSON.stringify({
      type: "register",
      machine_id: MACHINE_A,
      pin: "111-222-333",
      pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
    }));
    const ackA = await awaitMessage(wsA);
    expect(ackA).toEqual({ type: "registered", machine_id: MACHINE_A });

    wsB.send(JSON.stringify({
      type: "register",
      machine_id: MACHINE_B,
      pin: "444-555-666",
      pin_expires_at: new Date(Date.now() + 60_000).toISOString(),
    }));
    const ackB = await awaitMessage(wsB);
    expect(ackB).toEqual({ type: "registered", machine_id: MACHINE_B });

    expect(app.sessions.count()).toBe(2);
    expect(app.sessions.findByMachineId(MACHINE_A)).toBeDefined();
    expect(app.sessions.findByMachineId(MACHINE_B)).toBeDefined();
    expect(app.sessions.findByPin("111-222-333")?.machineId).toBe(MACHINE_A);

    wsA.close();
    wsB.close();

    // Allow the server's close handler to run.
    await new Promise((r) => setTimeout(r, 100));

    expect(app.sessions.count()).toBe(0);
  });
});
```

- [ ] **Step 2 : Lancer**

```bash
npm test -w @linkdesk/signaling-server
# Expected: ALL tests across all files passing. Integration test 1 passing.
```

- [ ] **Step 3 : Commit**

```bash
git add signaling-server/tests/integration
git commit -m "test(signaling): 2-client register flow integration"
```

---

## Task 10 : Client — message schemas (mirror) + types

**Files :**
- Create : `desktop-app/src/features/signaling/signaling.types.ts`
- Create : `desktop-app/src/features/signaling/message-schemas.ts`

- [ ] **Step 1 : `signaling.types.ts`**

```typescript
export type ConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "offline"
  | "disabled"; // URL missing from env

export interface SignalingState {
  connection: ConnectionState;
  lastError: string | null;
  registered: boolean;
}
```

- [ ] **Step 2 : `message-schemas.ts`**

Mirror du fichier serveur `schemas.ts`. On duplique volontairement en Phase 2 — la note dans `CLAUDE.md` trackera la dette pour Phase 5.

```typescript
import { z } from "zod";

const PinSchema = z.string().regex(/^\d{3}-\d{3}-\d{3}$/);
const IsoTimestampSchema = z.string().datetime();
const MachineIdSchema = z.string().uuid();

// Client → Server
export const RegisterMessageSchema = z.object({
  type: z.literal("register"),
  machine_id: MachineIdSchema,
  pin: PinSchema,
  pin_expires_at: IsoTimestampSchema,
});

export const UpdatePinMessageSchema = z.object({
  type: z.literal("update_pin"),
  machine_id: MachineIdSchema,
  new_pin: PinSchema,
  new_expires_at: IsoTimestampSchema,
});

export const PingMessageSchema = z.object({ type: z.literal("ping") });

export const ClientMessageSchema = z.discriminatedUnion("type", [
  RegisterMessageSchema,
  UpdatePinMessageSchema,
  PingMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server → Client
export const RegisteredAckSchema = z.object({
  type: z.literal("registered"),
  machine_id: MachineIdSchema,
});
export const PinUpdatedAckSchema = z.object({ type: z.literal("pin_updated") });
export const PongMessageSchema = z.object({ type: z.literal("pong") });
export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  RegisteredAckSchema,
  PinUpdatedAckSchema,
  PongMessageSchema,
  ErrorMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// Parses a raw (already JSON.parse'd) server message. Returns null on any failure
// (DEV-RULES §6 — callers never see malformed data).
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const parsed = ServerMessageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
```

- [ ] **Step 3 : Installer `zod` côté client** (vérifier que c'est dispo)

```bash
npm install -w desktop-app zod
```

Si déjà présent (Phase 1 l'aurait pu), l'install est idempotent.

- [ ] **Step 4 : Typecheck**

```bash
npm run -w desktop-app typecheck
# Expected: 0 error
```

- [ ] **Step 5 : Commit**

```bash
git add desktop-app/src/features/signaling package-lock.json desktop-app/package.json
git commit -m "feat(signaling): add client message schemas and types"
```

---

## Task 11 : `SignalingClient` class (TDD)

**Files :**
- Create : `desktop-app/src/features/signaling/signaling-client.ts`
- Create : `desktop-app/tests/features/signaling-client.test.ts`

- [ ] **Step 1 : Test**

```typescript
import { SignalingClient } from "@/features/signaling/signaling-client";

// Tiny WebSocket stub - lets us drive open/message/close events from tests.
class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
  // Test helpers
  simulateOpen(): void { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  simulateMessage(raw: unknown): void { this.onmessage?.({ data: JSON.stringify(raw) }); }
}

describe("SignalingClient", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function build() {
    const sockets: FakeWebSocket[] = [];
    const client = new SignalingClient({
      url: "ws://test/signaling",
      createSocket: (url: string) => {
        const s = new FakeWebSocket(url);
        sockets.push(s);
        return s as unknown as WebSocket;
      },
    });
    return { client, sockets };
  }

  it("opens a socket on connect()", () => {
    const { client, sockets } = build();
    client.connect();
    expect(sockets).toHaveLength(1);
    expect(client.state).toBe("connecting");
  });

  it("transitions to open on socket open", () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0].simulateOpen();
    expect(client.state).toBe("open");
  });

  it("send() writes to the open socket", () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0].simulateOpen();
    client.send({ type: "ping" });
    expect(sockets[0].sent[0]).toBe(JSON.stringify({ type: "ping" }));
  });

  it("reconnects with exponential backoff on close", () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0].simulateOpen();
    sockets[0].close();
    expect(client.state).toBe("reconnecting");

    // 1s backoff
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);

    sockets[1].close();
    // 2s backoff
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
  });

  it("notifies message listeners on parseable server messages", () => {
    const { client, sockets } = build();
    const received: unknown[] = [];
    client.onMessage((m) => received.push(m));
    client.connect();
    sockets[0].simulateOpen();

    sockets[0].simulateMessage({ type: "pong" });
    expect(received).toEqual([{ type: "pong" }]);
  });

  it("ignores unparseable server messages", () => {
    const { client, sockets } = build();
    const received: unknown[] = [];
    client.onMessage((m) => received.push(m));
    client.connect();
    sockets[0].simulateOpen();

    sockets[0].simulateMessage({ type: "nonsense" });
    expect(received).toEqual([]);
  });

  it("disconnect() closes the socket and stops reconnecting", () => {
    const { client, sockets } = build();
    client.connect();
    sockets[0].simulateOpen();
    client.disconnect();
    expect(client.state).toBe("offline");

    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });
});
```

- [ ] **Step 2 : Fail**

```bash
npm test -w desktop-app -- signaling-client
```

- [ ] **Step 3 : Implémenter `signaling-client.ts`**

```typescript
import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "./message-schemas";
import type { ConnectionState } from "./signaling.types";

// Backoff schedule (ms): 1s, 2s, 4s, 8s, 16s, 30s. Cap at 30s.
const BACKOFF_SCHEDULE = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export interface SignalingClientOptions {
  url: string;
  // Factory so tests can inject a fake WebSocket.
  createSocket?: (url: string) => WebSocket;
}

type MessageListener = (msg: ServerMessage) => void;

// Low-level WebSocket wrapper. Handles:
//  - open / close / error lifecycle
//  - exponential-backoff reconnect (resets on successful open)
//  - JSON (de)serialization with Zod validation on server messages
// This class is transport only — higher-level register / heartbeat logic lives in useSignaling.
export class SignalingClient {
  readonly url: string;
  state: ConnectionState = "offline";

  private socket: WebSocket | null = null;
  private readonly createSocket: (url: string) => WebSocket;
  private readonly listeners = new Set<MessageListener>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(opts: SignalingClientOptions) {
    this.url = opts.url;
    this.createSocket = opts.createSocket ?? ((url) => new WebSocket(url));
  }

  connect(): void {
    this.stopped = false;
    this.openSocket();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch { /* ignore */ }
      this.socket = null;
    }
    this.state = "offline";
  }

  send(msg: ClientMessage): boolean {
    if (!this.socket || this.state !== "open") return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private openSocket(): void {
    this.state = "connecting";
    const socket = this.createSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.state = "open";
      this.reconnectAttempt = 0;
    };
    socket.onmessage = (ev: MessageEvent) => {
      let raw: unknown;
      try { raw = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); }
      catch { return; }
      const msg = parseServerMessage(raw);
      if (!msg) return;
      for (const l of this.listeners) l(msg);
    };
    socket.onclose = () => {
      this.socket = null;
      if (this.stopped) return;
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      // Errors are always followed by a close event - we handle reconnection there.
    };
  }

  private scheduleReconnect(): void {
    this.state = "reconnecting";
    const delay = BACKOFF_SCHEDULE[Math.min(this.reconnectAttempt, BACKOFF_SCHEDULE.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.openSocket();
    }, delay);
  }
}
```

- [ ] **Step 4 : Pass**

```bash
npm test -w desktop-app -- signaling-client
# Expected: 7 tests passing
```

- [ ] **Step 5 : Commit**

```bash
git add desktop-app/src/features/signaling/signaling-client.ts desktop-app/tests/features/signaling-client.test.ts
git commit -m "feat(signaling): add signaling-client with reconnect backoff"
```

---

## Task 12 : `useSignaling` hook (TDD)

**Files :**
- Create : `desktop-app/src/features/signaling/use-signaling.ts`
- Create : `desktop-app/tests/features/use-signaling.test.tsx`

- [ ] **Step 1 : Test**

```tsx
import { act, renderHook } from "@testing-library/react";
import { useSignaling } from "@/features/signaling/use-signaling";
import type { SignalingClient } from "@/features/signaling/signaling-client";
import type { ServerMessage } from "@/features/signaling/message-schemas";

// Mock client factory
function createMockClient(): SignalingClient & {
  _emit: (m: ServerMessage) => void;
  _setState: (s: "connecting" | "open" | "reconnecting" | "offline") => void;
  _sent: unknown[];
} {
  const listeners: Array<(m: ServerMessage) => void> = [];
  let state: "connecting" | "open" | "reconnecting" | "offline" = "offline";
  const sent: unknown[] = [];
  return {
    url: "ws://test",
    get state() { return state; },
    connect: vi.fn(() => { state = "connecting"; }),
    disconnect: vi.fn(() => { state = "offline"; }),
    send: vi.fn((m: unknown) => { sent.push(m); return true; }),
    onMessage: (cb: (m: ServerMessage) => void) => {
      listeners.push(cb);
      return () => { listeners.splice(listeners.indexOf(cb), 1); };
    },
    _emit: (m: ServerMessage) => listeners.forEach((l) => l(m)),
    _setState: (s: "connecting" | "open" | "reconnecting" | "offline") => { state = s; },
    _sent: sent,
  } as unknown as SignalingClient & { _emit: (m: ServerMessage) => void; _setState: (s: "connecting" | "open" | "reconnecting" | "offline") => void; _sent: unknown[] };
}

describe("useSignaling", () => {
  it("connects on mount when machineId is present", () => {
    const client = createMockClient();
    renderHook(() => useSignaling({
      client,
      machineId: "550e8400-e29b-41d4-a716-446655440000",
      pin: "111-222-333",
      pinExpiresAt: new Date(Date.now() + 60_000),
    }));
    expect(client.connect).toHaveBeenCalled();
  });

  it("does not connect when machineId is null", () => {
    const client = createMockClient();
    renderHook(() => useSignaling({
      client,
      machineId: null,
      pin: null,
      pinExpiresAt: null,
    }));
    expect(client.connect).not.toHaveBeenCalled();
  });

  it("sends register when the socket opens and inputs are present", () => {
    const client = createMockClient();
    const machineId = "550e8400-e29b-41d4-a716-446655440000";
    const pin = "111-222-333";
    const pinExpiresAt = new Date(Date.now() + 60_000);
    const { rerender } = renderHook(
      (props: { state: "connecting" | "open" }) => {
        (client as unknown as { _setState: (s: string) => void })._setState(props.state);
        return useSignaling({ client, machineId, pin, pinExpiresAt });
      },
      { initialProps: { state: "connecting" } },
    );

    expect(client.send).not.toHaveBeenCalled();

    act(() => {
      rerender({ state: "open" });
    });

    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "register",
      machine_id: machineId,
      pin,
    }));
  });
});
```

- [ ] **Step 2 : Fail**

```bash
npm test -w desktop-app -- use-signaling
```

- [ ] **Step 3 : Implémenter `use-signaling.ts`**

```typescript
import { useEffect, useRef, useState } from "react";
import { SignalingClient } from "./signaling-client";
import type { SignalingState } from "./signaling.types";

// Inputs to the hook. All nullable at boot (useMachineId / usePin resolve async).
export interface UseSignalingOptions {
  machineId: string | null;
  pin: string | null;
  pinExpiresAt: Date | null;
  // Test / storybook injection point. Prod leaves this undefined.
  client?: SignalingClient;
  url?: string;
}

const DEFAULT_URL = import.meta.env.VITE_SIGNALING_WS_URL ?? "";
const PING_INTERVAL_MS = 30_000;

// React binding over SignalingClient. Owns:
//  - one client instance per mount
//  - register / update_pin lifecycle based on inputs
//  - ping timer
//  - exposed SignalingState for UI badges
export function useSignaling(opts: UseSignalingOptions): SignalingState {
  const [state, setState] = useState<SignalingState>({
    connection: "offline",
    lastError: null,
    registered: false,
  });
  const clientRef = useRef<SignalingClient | null>(null);
  const registeredPinRef = useRef<string | null>(null);

  if (!clientRef.current) {
    clientRef.current =
      opts.client ??
      (DEFAULT_URL
        ? new SignalingClient({ url: opts.url ?? DEFAULT_URL })
        : null);
  }
  const client = clientRef.current;

  // Connect lifecycle.
  useEffect(() => {
    if (!client || !opts.machineId) return;
    client.connect();
    return () => { client.disconnect(); };
  }, [client, opts.machineId]);

  // Poll client.state into React state. SignalingClient is plain JS so it doesn't
  // drive re-renders; this 250ms interval is cheap and simple for Phase 2.
  useEffect(() => {
    if (!client) {
      setState((s) => ({ ...s, connection: "disabled" }));
      return;
    }
    const id = window.setInterval(() => {
      setState((s) => (s.connection === client.state ? s : { ...s, connection: client.state }));
    }, 250);
    return () => window.clearInterval(id);
  }, [client]);

  // Register / update_pin when inputs are ready AND socket is open.
  useEffect(() => {
    if (!client) return;
    if (state.connection !== "open") return;
    if (!opts.machineId || !opts.pin || !opts.pinExpiresAt) return;

    if (!state.registered) {
      client.send({
        type: "register",
        machine_id: opts.machineId,
        pin: opts.pin,
        pin_expires_at: opts.pinExpiresAt.toISOString(),
      });
      registeredPinRef.current = opts.pin;
      setState((s) => ({ ...s, registered: true }));
      return;
    }

    if (registeredPinRef.current !== opts.pin) {
      client.send({
        type: "update_pin",
        machine_id: opts.machineId,
        new_pin: opts.pin,
        new_expires_at: opts.pinExpiresAt.toISOString(),
      });
      registeredPinRef.current = opts.pin;
    }
  }, [client, state.connection, state.registered, opts.machineId, opts.pin, opts.pinExpiresAt]);

  // Reset `registered` flag when the socket drops so we re-send register on the
  // next successful connect.
  useEffect(() => {
    if (state.connection === "reconnecting" || state.connection === "offline") {
      setState((s) => (s.registered ? { ...s, registered: false } : s));
      registeredPinRef.current = null;
    }
  }, [state.connection]);

  // 30s ping heartbeat.
  useEffect(() => {
    if (!client) return;
    if (state.connection !== "open") return;
    const id = window.setInterval(() => {
      client.send({ type: "ping" });
    }, PING_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [client, state.connection]);

  // Listen to server messages to surface errors (Phase 2 only processes `error`).
  useEffect(() => {
    if (!client) return;
    return client.onMessage((msg) => {
      if (msg.type === "error") {
        setState((s) => ({ ...s, lastError: `${msg.code}: ${msg.message}` }));
      }
    });
  }, [client]);

  return state;
}
```

- [ ] **Step 4 : Pass**

```bash
npm test -w desktop-app -- use-signaling
# Expected: 3 passing
```

- [ ] **Step 5 : Commit**

```bash
git add desktop-app/src/features/signaling/use-signaling.ts desktop-app/tests/features/use-signaling.test.tsx
git commit -m "feat(signaling): add useSignaling hook with register lifecycle"
```

---

## Task 13 : Hoist `usePin` + câbler `useSignaling` + `StatusBadge`

**Files :**
- Create : `desktop-app/src/components/status-badge.tsx`
- Modify : `desktop-app/src/App.tsx`
- Modify : `desktop-app/src/routes/home.tsx`
- Modify : `desktop-app/src/routes/host.tsx`
- Modify : `desktop-app/src/routes/controller.tsx`

**Stratégie :** on introduit un Context `AppStateContext` qui expose `{ machineId, pin, secondsRemaining, regeneratePin, signaling }`. Les routes consomment via `useAppState()`.

- [ ] **Step 1 : `components/status-badge.tsx`**

```tsx
import { Wifi, WifiOff, RotateCw, CircleOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ConnectionState } from "@/features/signaling/signaling.types";

interface StatusBadgeProps {
  state: ConnectionState;
  className?: string;
}

// Compact visual indicator for the signaling connection state.
// Renders icon + short French label; colors use the shadcn theme tokens.
export function StatusBadge({ state, className }: StatusBadgeProps) {
  const config = BADGES[state];
  const Icon = config.icon;
  return (
    <span
      role="status"
      aria-label={`Statut signaling : ${config.label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        config.className,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {config.label}
    </span>
  );
}

const BADGES: Record<ConnectionState, { icon: typeof Wifi; label: string; className: string }> = {
  open: { icon: Wifi, label: "Connecté", className: "bg-primary/10 text-primary" },
  connecting: { icon: RotateCw, label: "Connexion…", className: "bg-muted text-muted-foreground" },
  reconnecting: { icon: RotateCw, label: "Reconnexion…", className: "bg-amber-500/10 text-amber-600" },
  offline: { icon: WifiOff, label: "Hors ligne", className: "bg-destructive/10 text-destructive" },
  disabled: { icon: CircleOff, label: "Désactivé", className: "bg-muted text-muted-foreground" },
};
```

- [ ] **Step 2 : Réécrire `App.tsx` avec le context**

```tsx
import { createContext, useContext, useEffect } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { HomeRoute } from "@/routes/home";
import { HostRoute } from "@/routes/host";
import { ControllerRoute } from "@/routes/controller";
import { Toaster } from "@/components/ui/sonner";
import { useMachineId } from "@/features/machine-id/use-machine-id";
import { usePin } from "@/features/pin/use-pin";
import { useSignaling } from "@/features/signaling/use-signaling";
import type { PinSession } from "@/features/pin/pin.types";
import type { SignalingState } from "@/features/signaling/signaling.types";
import "./index.css";

export interface AppState {
  machineId: string | null;
  pinSession: PinSession;
  secondsRemaining: number;
  regeneratePin: () => void;
  signaling: SignalingState;
}

// Context consumed by all routes. `null` only before mount (impossible at render time).
const AppStateContext = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateContext.Provider");
  return ctx;
}

const router = createMemoryRouter(
  [
    { path: "/", element: <HomeRoute /> },
    { path: "/host", element: <HostRoute /> },
    { path: "/controller", element: <ControllerRoute /> },
  ],
  { initialEntries: ["/"] },
);

export default function App() {
  const machine = useMachineId();
  const { session: pinSession, secondsRemaining, regenerate: regeneratePin } = usePin();
  const signaling = useSignaling({
    machineId: machine.id,
    pin: pinSession.pin,
    pinExpiresAt: pinSession.expiresAt,
  });

  useEffect(() => {
    if (import.meta.env.DEV && machine.id) {
      // eslint-disable-next-line no-console
      console.debug("[linkdesk] machine id ready");
    }
  }, [machine.id]);

  const appState: AppState = {
    machineId: machine.id,
    pinSession,
    secondsRemaining,
    regeneratePin,
    signaling,
  };

  return (
    <AppStateContext.Provider value={appState}>
      <RouterProvider router={router} />
      <Toaster />
    </AppStateContext.Provider>
  );
}
```

- [ ] **Step 3 : `routes/home.tsx` — ajouter `StatusBadge` dans le header**

```tsx
import { HeroButtons } from "@/components/hero-buttons";
import { StatusBadge } from "@/components/status-badge";
import { useAppState } from "@/App";

export function HomeRoute() {
  const { signaling } = useAppState();
  return (
    <main
      data-testid="home-route"
      className="flex min-h-screen flex-col items-center justify-center gap-12 bg-background p-8"
    >
      <header className="text-center">
        <div className="flex justify-center">
          <StatusBadge state={signaling.connection} />
        </div>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">LinkDesk</h1>
        <p className="mt-2 text-muted-foreground">Que souhaitez-vous faire ?</p>
      </header>
      <HeroButtons />
    </main>
  );
}
```

- [ ] **Step 4 : `routes/host.tsx` — consommer le context au lieu de `usePin` local**

```tsx
import { CopyButton } from "@/components/copy-button";
import { PinDisplay } from "@/components/pin-display";
import { PinTimer } from "@/components/pin-timer";
import { RegenerateButton } from "@/components/regenerate-button";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_PIN_ROTATION_MS } from "@/features/pin/pin.types";
import { useAppState } from "@/App";

export function HostRoute() {
  const { pinSession, secondsRemaining, regeneratePin, signaling } = useAppState();
  const totalSeconds = Math.round(DEFAULT_PIN_ROTATION_MS / 1000);

  return (
    <main
      data-testid="host-route"
      className="flex min-h-screen items-center justify-center bg-background p-8"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <StatusBadge state={signaling.connection} />
          </div>
          <CardTitle className="mt-2 text-2xl">Votre code de connexion</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Communiquez ce code à la personne qui va se connecter.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <PinDisplay pin={pinSession.pin} />
          <PinTimer
            secondsRemaining={secondsRemaining}
            totalSeconds={totalSeconds}
            className="w-full"
          />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <CopyButton value={pinSession.pin} />
            <RegenerateButton onRegenerate={regeneratePin} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5 : `routes/controller.tsx` — ajouter `StatusBadge`**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { PinInput } from "@/components/pin-input";
import { formatPin } from "@/features/pin/pin-generator";
import { useAppState } from "@/App";

export function ControllerRoute() {
  const { signaling } = useAppState();
  const [pin, setPin] = useState("");

  const complete = pin.length === 9 && /^\d{9}$/.test(pin);

  function handleConnect() {
    if (!complete) return;
    toast.success("Code saisi", {
      description: `Connexion simulée avec ${formatPin(pin)} (réseau en Phase 3).`,
    });
  }

  return (
    <main
      data-testid="controller-route"
      className="flex min-h-screen items-center justify-center bg-background p-8"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <StatusBadge state={signaling.connection} />
          </div>
          <CardTitle className="mt-2 text-2xl">Saisissez le code</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Entrez les 9 chiffres communiqués par la personne que vous allez dépanner.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <PinInput value={pin} onChange={setPin} onComplete={() => undefined} />
          <Button size="lg" onClick={handleConnect} disabled={!complete} className="min-w-48">
            Se connecter
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 6 : Vérifier**

```bash
cd desktop-app
npm run typecheck
npm run lint
npm test
npx vite build
```

Expected : tous verts.

**Si `app.test.tsx` fait un `getByTestId("home-route")`** : toujours OK (on a préservé le testid). Le test ne se casse pas car le context est mocké indirectement (useMachineId, usePin, useSignaling s'exécutent mais avec les mocks de `tests/setup.ts`).

Si `useSignaling` cause un warning (genre "Can't perform a React state update on unmounted component"), diagnostic :
- vérifier que `setState` n'est pas appelé après `return cleanup` dans un useEffect
- les timers sont bien `clear` sur unmount

- [ ] **Step 7 : Commit**

```bash
git add desktop-app/src
git commit -m "feat(app): hoist usePin + useSignaling to AppState context"
```

---

## Task 14 : Vérif manuelle 2 clients + fin de phase

**Files :**
- Create : `docs/superpowers/reports/2026-04-21-phase-2-report.md`
- Modify : `CHANGELOG.md`
- Modify : `CLAUDE.md` (note Zod duplication)

### A. Vérif manuelle (DEV-RULES §11 étape 4)

- [ ] **Step 1 : Lancer le serveur**

Terminal 1 :
```bash
cd signaling-server
# Copier .env.example vers .env si besoin (les defaults fonctionnent)
npm run dev
```

Expected : log "signaling server listening { port: 3001 }".

- [ ] **Step 2 : Configurer desktop-app .env**

```bash
# desktop-app/.env (ou vérifier que .env.example suffit avec VITE_SIGNALING_WS_URL=ws://localhost:3001/signaling)
```

- [ ] **Step 3 : Lancer 2 instances Tauri dev**

Terminal 2 : `cd desktop-app && npm run tauri dev`
Terminal 3 : `cd desktop-app && npm run tauri dev` (une 2ème instance — ouvrira sur un autre port Vite)

**Attention** : chaque instance aura **son propre** `machine_id` (stocké dans des `app_local_data_dir` séparés par profil utilisateur Windows — en pratique, les 2 fenêtres partagent le même Stronghold).

Pour vraiment tester 2 clients distincts, option :
- Lancer 1 en dev + 1 via le MSI/NSIS (installé Phase 1) → 2 installations = 2 vaults différents
- OU modifier temporairement `STRONGHOLD_FILENAME` pour forcer un vault distinct

La façon la plus propre : 1 instance Tauri dev + 1 NSIS installé.

**Checklist de validation :**
- [ ] Les 2 clients affichent `StatusBadge = "Connecté"` dans les ~2s après ouverture
- [ ] Dans les logs du serveur, 2 `client connected` apparaissent, puis 2 acks `registered`
- [ ] Depuis le client hôte : régénérer le PIN → log serveur montre `pin updated` (avec PIN masqué)
- [ ] Fermer un client → log serveur `client disconnected`, l'autre reste connecté
- [ ] Couper le serveur (Ctrl+C dans terminal 1) → les clients passent en `Reconnexion…`
- [ ] Relancer le serveur → les clients reviennent en `Connecté` automatiquement et se ré-enregistrent

### B. Mettre à jour `CLAUDE.md`

Ajouter une ligne dans la section "Conventions qui dérogent aux préférences globales" :

```markdown
- **Schémas Zod dupliqués** entre `signaling-server/src/websocket/schemas.ts` et `desktop-app/src/features/signaling/message-schemas.ts` en Phase 2. _À consolider en package partagé en Phase 5_ (note de dette dans le rapport Phase 2).
```

Et retirer (ou mettre à jour) la ligne "Dette connue Phase 1" sur Zod qui vient d'être résolue en partie (les WS sont maintenant validés).

### C. Mettre à jour `CHANGELOG.md`

Au-dessus de la section `[0.1.0]`, insérer :

```markdown
## [0.2.0] — 2026-04-21 — Phase 2 : Signaling server + enregistrement

### Added
- Workspace `signaling-server` (Fastify + `@fastify/websocket` + Pino + Zod)
- Endpoint WS `/signaling` : messages `register`, `update_pin`, `ping`/`pong`
- `SessionManager` in-memory avec index par machine_id ET par PIN
- Endpoint GET `/health` (liveness)
- Client : `SignalingClient` + `useSignaling` (reconnect backoff exponentiel, heartbeat 30s)
- Context `AppState` au niveau `App.tsx` (hoisting `usePin` + `useSignaling`)
- Composant `StatusBadge` (4 états : Connecté / Connexion / Reconnexion / Hors ligne)

### Changed
- Routes `Home/Host/Controller` consomment `useAppState` au lieu de hooks locaux

### Notes
- Schémas Zod dupliqués client/serveur — à consolider en package partagé en Phase 5
- Pas de rate-limit, pas d'origin check, pas de Docker — périmètre strict PRD §9
```

### D. Rapport de phase

Créer `docs/superpowers/reports/2026-04-21-phase-2-report.md` :

```markdown
## Rapport Phase 2 — Signaling server + enregistrement

### Implémenté
- Workspace `signaling-server` bootstrappé (Fastify + WS + Pino + Zod)
- Messages : `register`, `update_pin`, `ping`/`pong` avec validation Zod systématique
- Session manager in-memory (indexé machine_id + PIN)
- Heartbeat serveur-side (timeout 45s grace) + client-side (ping 30s)
- Client : `SignalingClient` avec reconnect backoff exponentiel (1s → 30s), hook `useSignaling`
- Refactor App.tsx : context `AppState`, hoisting `usePin` + `useSignaling`
- `StatusBadge` UI sur les 3 écrans
- Tests : unit (schemas, session-manager, register-handler, message-router, signaling-client, use-signaling) + integration (2 clients simultanés)

### Non implémenté (et pourquoi)
- Rate limiting : Phase 5 (PRD §10)
- Origin whitelist strict : Phase 5 (PRD §10)
- Dockerfile + docker-compose : Phase 5 (déploiement)
- TTL purger périodique : YAGNI (cleanup sur close suffit en local)

### Décisions d'architecture
- **Hoisting `usePin` au niveau App** : le client est rôle-agnostique au boot (PRD §3 Module 2). Toute l'app partage le même PinSession.
- **Schémas Zod dupliqués** client/serveur : duplication contrôlée pour Phase 2. Un package partagé (`@linkdesk/protocol` par ex.) est prévu Phase 5.
- **Heartbeat applicatif** (pas protocole) : le browser WS API ne permet pas de piloter les ping frames natifs.
- **Pas de token d'auth** : Phase 2 se fie à machine_id comme identifiant opaque. La sécurité (TLS + origin check) vient Phase 5.

### Problèmes rencontrés
- [À remplir par l'exécuteur]

### Recommandations Phase 3
- **Signaling multi-destinataires** : le handler doit maintenant router des messages entre pairs (`connect_offer`, `sdp_*`, `ice_*`) — pas juste traiter la demande localement.
- **Popup consentement OS-level** : Rust — utiliser `tauri-plugin-dialog` + passer les infos du pair (machine_id résolu depuis PIN).
- **Trickle ICE** : décider si on les stream ou si on attend `iceGatheringState === complete` (DEV-RULES §7 préconise d'attendre).
- **Zod protocol package** : si Phase 3 ajoute encore plus de messages, le extracting en package partagé devient rentable (prendre la décision).

### Métriques (à compléter par Guillaume après vérif manuelle)
- Temps d'enregistrement cold-start : [mesurer — ouverture app → ack `registered`]
- Reconnect après kill serveur : [mesurer — durée jusqu'à retour "Connecté"]
- RAM serveur au repos avec 2 clients : [Task Manager / `top`]
```

### E. Run full checklist DEV-RULES §11

```bash
# Monorepo root
npm install

# Signaling server
cd signaling-server
npm run typecheck
npm run lint
npm test
npm run build
cd ..

# Desktop app
cd desktop-app
npm run typecheck
npm run lint
npm test
npx vite build
npm run tauri build
cd src-tauri
cargo clippy --all-targets -- -D warnings
cargo test
cd ../..
```

Expected : tout vert. Si un lint clippy remonte un warning (par exemple parce qu'un `unused import` a été introduit), le fixer avant de commit.

- [ ] **Step 1 : Commit final**

```bash
git add CHANGELOG.md CLAUDE.md docs/superpowers/reports/2026-04-21-phase-2-report.md
git commit -m "chore: complete phase 2"
```

- [ ] **Step 2 : Tag**

```bash
git tag v0.2-signaling
git log --oneline -3
git tag --list
```

**Ne pas pousser le tag** — l'utilisateur pousse après validation manuelle (même flow que Phase 1).

---

## Self-review (writing-plans skill §Self-Review)

### 1. Couverture du PRD Phase 2

| PRD §9 item | Tâche |
|---|---|
| Init Node.js + Fastify + ws + Pino | Tasks 1-3 |
| Endpoint WS `/signaling` avec auth par machine_id | Tasks 7-8 (machine_id passé dans register) |
| Table in-memory `active_clients` | Task 5 |
| Messages `register` / `update_pin` / `ping` / `pong` | Tasks 4, 6, 7 |
| Client: connexion WS auto + reconnect + push du PIN | Tasks 11-13 |
| Tests manuels : 2 clients enregistrés simultanément | Task 9 (integration auto) + Task 14 (manuel) |
| Tag `v0.2-signaling` | Task 14 |

### 2. Placeholder scan

Aucun `TBD`, `TODO`, "implement later" dans le plan. Le seul "à remplir par Guillaume" est dans le rapport de phase (section Problèmes + Métriques) — ce sont des mesures vivantes, pas des placeholders de code.

### 3. Cohérence de typage

- `ClientMessage` (Task 4) est importé tel quel par `SignalingClient.send()` (Task 11) ✅
- `ServerMessage` (Task 4) retourné par `parseServerMessage()` (Task 10) est consommé par `onMessage` listeners dans Task 11 + 12 ✅
- `ConnectionState` (Task 10) utilisé par `StatusBadge` (Task 13) et `SignalingClient.state` (Task 11) ✅
- `SignalingState` (Task 10) retourné par `useSignaling` (Task 12) → consommé par `AppState` (Task 13) ✅
- `ActiveClient` (Task 4) utilisé par `SessionManager` (Task 5) ✅
- Signatures `register`/`update_pin`/`ping`/`pong` cohérentes entre schemas serveur (Task 4), client (Task 10), handler (Task 6), et `useSignaling` (Task 12) ✅

### 4. Points d'attention pour l'exécuteur

1. **`useSignaling` poll state via setInterval** (Task 12) — approche naïve pour Phase 2. Si Phase 3 a besoin de réactivité sub-250ms, passer à un event-emitter sur `SignalingClient` (déjà presque structuré pour ça).

2. **`Tasks 7-8` : le handler pour `close` doit supprimer de `SessionManager`** — si l'implémenteur oublie, l'integration test Task 9 va rester "stuck" avec 2 clients après disconnect.

3. **Task 13 casse la structure de `usePin` telle que testée en Phase 1** (les tests de `use-pin.test.tsx` utilisent encore le hook). Vérifier que les tests existants continuent de passer sans modif (le hook n'est pas supprimé — juste appelé ailleurs).

4. **Context7 avant chaque API** — surtout pour `@fastify/websocket` dont le hook de gestion peut varier entre majors.

5. **Task 14 vérif manuelle** : nécessite 2 clients vraiment distincts (2 installations différentes OU 2 machine_id distincts). L'implementer ne peut pas le faire — c'est Guillaume.

---

**Fin du plan Phase 2.**
