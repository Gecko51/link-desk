# LinkDesk — STRUCTURE

Arborescence complète du projet. Monorepo avec 2 packages :
- `desktop-app/` — Application Tauri (client host + controller)
- `signaling-server/` — Serveur Node.js de signaling WebRTC

---

## Racine du monorepo

```
linkdesk/
├── desktop-app/                  # Application Tauri (client)
├── signaling-server/             # Serveur WS de signaling
├── .gitignore                    # Ignore node_modules, target, dist, .env
├── .editorconfig                 # Config d'indentation partagée
├── README.md                     # Vue d'ensemble + setup global
├── CHANGELOG.md                  # Historique des versions
├── LICENSE                       # MIT (recommandé pour open source)
└── package.json                  # Workspace root (npm workspaces)
```

---

## desktop-app/ (Tauri + React)

```
desktop-app/
├── src/                          # Frontend React (webview)
│   ├── main.tsx                  # Entrypoint React, monte <App />
│   ├── App.tsx                   # Root component, router
│   ├── index.css                 # Import Tailwind + variables globales
│   │
│   ├── routes/                   # Vues de haut niveau (1 fichier par écran)
│   │   ├── home.tsx              # Écran d'accueil (2 gros CTA)
│   │   ├── host.tsx              # Écran hôte: PIN + timer + consentement
│   │   ├── host-session.tsx      # Hôte en session active (indicateur "Votre écran est partagé")
│   │   ├── controller.tsx        # Saisie du PIN par le contrôleur
│   │   ├── controller-connecting.tsx  # Spinner pendant le handshake
│   │   └── controller-session.tsx     # Vue <video> + capture inputs
│   │
│   ├── components/               # Composants UI réutilisables
│   │   ├── ui/                   # shadcn/ui (auto-générés, ne pas éditer)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── toast.tsx
│   │   ├── hero-buttons.tsx      # Les 2 CTA de l'accueil
│   │   ├── pin-display.tsx       # Affichage XXX-XXX-XXX en gros
│   │   ├── pin-timer.tsx         # Compte à rebours avant rotation
│   │   ├── pin-input.tsx         # 9 cases auto-focus pour saisie
│   │   ├── regenerate-button.tsx # Bouton "Régénérer maintenant"
│   │   ├── consent-modal.tsx     # Popup "Untel veut le contrôle"
│   │   ├── remote-screen.tsx     # <video> + capture events
│   │   ├── session-toolbar.tsx   # Barre d'outils en session (qualité, déconnecter)
│   │   ├── status-badge.tsx      # Indicateur connecté/déconnecté
│   │   └── copy-button.tsx       # Bouton de copie au clipboard
│   │
│   ├── features/                 # Logique métier par domaine
│   │   ├── pin/
│   │   │   ├── use-pin.ts        # Hook React: lifecycle du PIN (génération, rotation, timer)
│   │   │   ├── pin-generator.ts  # Génère un PIN 9 chiffres via CSPRNG
│   │   │   └── pin.types.ts      # Types: Pin, PinRotationConfig
│   │   ├── signaling/
│   │   │   ├── use-signaling.ts  # Hook WS, reconnect auto, heartbeat
│   │   │   ├── signaling-client.ts   # Classe encapsulant la WebSocket
│   │   │   ├── message-schemas.ts    # Zod schemas des messages WS
│   │   │   └── signaling.types.ts
│   │   ├── webrtc/
│   │   │   ├── use-peer-connection.ts  # Hook RTCPeerConnection (ICE, SDP)
│   │   │   ├── use-data-channel.ts     # Hook pour le data channel (inputs)
│   │   │   ├── peer-config.ts          # Config ICE servers (STUN/TURN)
│   │   │   ├── offer-answer.ts         # Helpers createOffer/createAnswer
│   │   │   └── webrtc.types.ts
│   │   ├── screen-capture/
│   │   │   ├── use-screen-capture.ts   # getDisplayMedia() + gestion stream
│   │   │   └── capture.types.ts
│   │   ├── input-capture/
│   │   │   ├── use-input-capture.ts    # Capture souris/clavier côté contrôleur
│   │   │   ├── event-mapper.ts         # Mapping coords pixel → ratio 0-1
│   │   │   └── input.types.ts
│   │   ├── input-injection/
│   │   │   ├── inject-commands.ts      # Wrappers des commandes Tauri Rust
│   │   │   └── coord-mapper.ts         # Ratio 0-1 → pixel selon écran hôte
│   │   ├── consent/
│   │   │   ├── use-consent.ts          # Hook pour gérer la popup consentement
│   │   │   └── consent.types.ts
│   │   └── session/
│   │       ├── use-session.ts          # State machine: idle → connecting → active → ended
│   │       ├── session-logger.ts       # Écrit dans le log local via Tauri
│   │       └── session.types.ts
│   │
│   ├── lib/                      # Utilitaires transverses
│   │   ├── tauri.ts              # Wrappers typés invoke() / listen()
│   │   ├── logger.ts             # Logger frontend (console + fichier via Tauri)
│   │   ├── cn.ts                 # Helper classnames (clsx + tailwind-merge)
│   │   ├── env.ts                # Parse des variables Tauri
│   │   └── crypto.ts             # Wrappers CSPRNG
│   │
│   ├── types/                    # Types globaux partagés
│   │   ├── messages.ts           # Types des messages WS et data channel
│   │   ├── session.ts            # Types de session
│   │   └── tauri-commands.ts     # Types des commandes Rust (miroir Rust)
│   │
│   └── assets/                   # Images, icônes, fonts
│       ├── logo.svg
│       └── icons/
│
├── src-tauri/                    # Backend Rust (natif)
│   ├── Cargo.toml                # Dépendances Rust (enigo, tauri, serde, etc.)
│   ├── Cargo.lock
│   ├── build.rs                  # Script de build Tauri
│   ├── tauri.conf.json           # Config Tauri (fenêtres, permissions, bundler)
│   │
│   ├── src/
│   │   ├── main.rs               # Entrypoint, enregistrement des commandes
│   │   ├── lib.rs                # Exports de la lib
│   │   │
│   │   ├── commands/             # Commandes Tauri exposées au frontend
│   │   │   ├── mod.rs
│   │   │   ├── machine_id.rs     # generate_machine_id, get_machine_id
│   │   │   ├── pin.rs            # generate_pin (CSPRNG Rust)
│   │   │   ├── input_injection.rs # inject_mouse_event, inject_keyboard_event
│   │   │   ├── consent.rs        # show_consent_dialog (native OS)
│   │   │   ├── overlay.rs        # show/hide_disconnect_overlay
│   │   │   └── session_log.rs    # log_session_event, get_session_log
│   │   │
│   │   ├── core/                 # Logique métier native
│   │   │   ├── mod.rs
│   │   │   ├── stronghold.rs     # Wrapper Tauri Stronghold (stockage chiffré)
│   │   │   ├── input_mapper.rs   # Mapping des keycodes (browser → enigo)
│   │   │   └── screen_info.rs    # Info écrans (résolution, scale factor)
│   │   │
│   │   └── errors.rs             # Types d'erreur + From<> impls
│   │
│   ├── icons/                    # Icônes de l'app (ico, icns, png)
│   │   ├── icon.ico
│   │   ├── icon.icns
│   │   └── icon.png
│   │
│   └── capabilities/             # Tauri 2.x security permissions
│       └── default.json
│
├── public/                       # Assets statiques servis directement
│   └── favicon.ico
│
├── tests/                        # Tests frontend (Vitest)
│   ├── features/
│   │   ├── pin-generator.test.ts
│   │   ├── signaling-client.test.ts
│   │   └── coord-mapper.test.ts
│   └── setup.ts                  # Setup Vitest + mocks Tauri
│
├── .env.example                  # VITE_SIGNALING_WS_URL, VITE_STUN_SERVERS, etc.
├── .eslintrc.json                # ESLint config (React + TS strict)
├── .prettierrc                   # Prettier config
├── index.html                    # Entrypoint HTML du webview
├── vite.config.ts                # Config Vite (plugins, aliases @/)
├── tailwind.config.js            # Config Tailwind (thème, shadcn)
├── tsconfig.json                 # TS strict, paths @/*
├── tsconfig.node.json            # TS pour les fichiers de build
├── components.json               # Config shadcn/ui
├── package.json                  # Deps React, Tauri, React Router, Zod, etc.
└── README.md                     # Setup spécifique à l'app
```

---

## signaling-server/ (Node.js + Fastify)

```
signaling-server/
├── src/
│   ├── index.ts                  # Entrypoint, démarre Fastify
│   ├── server.ts                 # Config Fastify + plugins
│   │
│   ├── websocket/                # Logique WebSocket
│   │   ├── handler.ts            # Gestion des connexions WS entrantes
│   │   ├── message-router.ts     # Dispatch des messages par type
│   │   ├── session-manager.ts    # Map des sessions actives en mémoire
│   │   └── schemas.ts            # Zod schemas des messages
│   │
│   ├── features/
│   │   ├── register/
│   │   │   └── register-handler.ts     # Traite register / update_pin
│   │   ├── signaling/
│   │   │   ├── connect-handler.ts      # Traite connect_request
│   │   │   ├── consent-handler.ts      # Relaie consent_response
│   │   │   └── sdp-relay.ts            # Relaie sdp_offer/answer/ice
│   │   └── cleanup/
│   │       └── ttl-purger.ts           # Tâche périodique de purge des sessions expirées
│   │
│   ├── lib/
│   │   ├── logger.ts             # Pino logger
│   │   ├── rate-limiter.ts       # Rate limiting par IP
│   │   └── env.ts                # Parse .env + validation Zod
│   │
│   ├── types/
│   │   ├── client.ts             # ActiveClient
│   │   ├── session.ts            # ConnectionRequest
│   │   └── messages.ts           # Types des messages (miroir du client)
│   │
│   └── routes/
│       └── health.ts             # GET /health (liveness/readiness)
│
├── tests/
│   ├── websocket/
│   │   ├── register.test.ts
│   │   ├── connect-flow.test.ts
│   │   └── sdp-relay.test.ts
│   └── setup.ts
│
├── .env.example                  # PORT, TRUSTED_ORIGINS, RATE_LIMIT_MAX, etc.
├── .eslintrc.json
├── .prettierrc
├── Dockerfile                    # Image production (Alpine + Node 20)
├── docker-compose.yml            # Dev local (server + optionnel Redis)
├── tsconfig.json
├── package.json                  # fastify, ws, pino, zod, vitest
└── README.md                     # Deploy guide (Railway/Fly.io)
```

---

## Notes sur la structure

**Conventions de nommage** :
- Fichiers React/TS : `kebab-case.tsx` (ex: `pin-display.tsx`)
- Fichiers Rust : `snake_case.rs` (ex: `input_injection.rs`)
- Composants React : `PascalCase` à l'export (ex: `export function PinDisplay`)
- Hooks : `use-xxx.ts` et `useXxx` à l'export

**Alias TypeScript** (configurés dans `tsconfig.json` et `vite.config.ts`) :
- `@/*` → `src/*`
- `@/components/*` → `src/components/*`
- `@/features/*` → `src/features/*`

**Séparation logique** :
- `components/` = présentationnel pur (props in, JSX out)
- `features/` = hooks + logique métier par domaine
- `lib/` = utilitaires transverses sans logique métier
- `routes/` = orchestration (consomme features + components)

**Séparation frontend ↔ Rust** :
- Toute communication passe par des commandes Tauri typées (dans `src/lib/tauri.ts`).
- Les types Rust exposés sont miroirés dans `src/types/tauri-commands.ts` pour cohérence.
- Jamais de logique métier dupliquée entre Rust et TS : chaque responsabilité dans un seul endroit.
