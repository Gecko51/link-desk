# Changelog

## [Unreleased]

## [0.2.0] — 2026-04-21 — Phase 2 : Signaling server + enregistrement

### Added
- Workspace `signaling-server` (Fastify 4 + `@fastify/websocket` 10 + Pino 9 + Zod 3)
- Endpoint WS `/signaling` : messages `register`, `update_pin`, `ping`/`pong`
- `SessionManager` in-memory avec double index (`machine_id` + `current_pin`)
- Endpoint `GET /health` (liveness)
- Heartbeat serveur-side (timeout 45s grace) + client-side (ping 30s)
- Client : `SignalingClient` (WS wrapper + backoff exponentiel 1s → 30s + `WebSocketLike` interface) + hook `useSignaling`
- Refactor `App.tsx` : context `AppState` dans `src/app-state.tsx`, hoisting `usePin` + `useSignaling`
- Composant `StatusBadge` (5 états : Connecté / Connexion / Reconnexion / Hors ligne / Désactivé)
- Tests : server 26 (unit + 1 integration 2 clients simultanés), client 22

### Changed
- Routes `Home/Host/Controller` consomment `useAppState` au lieu de hooks locaux
- `tsconfig.json` du server sans `rootDir` (dette Phase 5 — split build vs typecheck)

### Notes
- Schémas Zod dupliqués client/serveur (duplication contrôlée, consolidation Phase 5)
- Pas de rate-limit, pas d'origin check strict, pas de Docker — strict périmètre PRD §9

## [0.1.0] — 2026-04-18 — Phase 1 : Setup & UI statique

### Added
- Init monorepo npm workspaces (`desktop-app`, `signaling-server` réservé)
- Scaffolding Tauri 2.x + React 18 + TypeScript strict + Vite
- Tailwind 3.x + shadcn/ui (button, card, input, dialog, sonner) en thème clair/sombre HSL
- React Router 6 mode memory
- Générateur PIN CSPRNG frontend + commande Rust `generate_pin_native`
- Commandes Rust `get_machine_id` / `generate_machine_id` via `iota_stronghold` (chiffrement at-rest)
- Hook `usePin` : rotation automatique 30 min + countdown 1Hz + régénération manuelle
- Hook `useMachineId` : fetch UUID persistant au boot
- Écran Accueil (HeroButtons vert/bleu)
- Écran Hôte (PinDisplay + PinTimer + CopyButton + RegenerateButton)
- Écran Contrôleur (PinInput 9 cases auto-focus + paste)
- Tests Vitest : `pin-generator.test.ts` (6), `use-pin.test.tsx` (5), `app.test.tsx` (1)

### Decisions
- `tauri-plugin-stronghold` retiré — usage direct `iota_stronghold` (plugin non utilisé côté JS, évite race condition sur vault)
- `sonner` remplace le `toast` shadcn legacy (API plus simple, standard v4)
- Zod validation sur les retours `tauriInvoke` reportée à Phase 2/3 (toutes les commandes actuelles retournent un simple string)
