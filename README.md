# LinkDesk

Application de contrôle à distance (Tauri + WebRTC + Node.js signaling).

Solution type TeamViewer, locale-first et sans compte : un hôte affiche un PIN à 9 chiffres rotatif, un contrôleur le saisit pour prendre la main. Chiffrement bout-en-bout via DTLS/SRTP (WebRTC natif), aucun flux vidéo ne transite par le serveur.

## Structure

Monorepo npm workspaces :

- `desktop-app/` — Client Tauri 2.x (host + controller). Frontend React 18 + TypeScript strict + Tailwind + shadcn/ui, backend Rust (Stronghold pour la persistence du machine_id, enigo pour l'injection d'inputs en Phase 4).
- `signaling-server/` — Serveur WebSocket Fastify (Node 20 + Zod + Pino). Rôle : handshake WebRTC uniquement, aucune donnée persistée.

## Prérequis

- **Node.js** 20 LTS (ou plus récent) + npm 10+
- **Rust** stable 1.77+
- **Dépendances système Tauri** selon l'OS : https://v2.tauri.app/start/prerequisites/

## Quick start

```bash
# Install all workspaces
npm install

# Terminal 1 — signaling server (écoute sur :3001 par défaut)
cd signaling-server && npm run dev

# Terminal 2 — client Tauri (ouvre la fenêtre desktop)
cd desktop-app && npm run tauri dev
```

> **Note** : si le port 3001 est déjà occupé (exclusion Windows / Hyper-V), utilise `PORT=3099 npm run dev` côté serveur et crée un `desktop-app/.env` avec `VITE_SIGNALING_WS_URL=ws://localhost:3099/signaling`.

## Scripts principaux

Depuis la racine :

```bash
npm run dev       # lance tauri dev (desktop-app)
npm run build     # tauri build (bundle release MSI/DMG/AppImage)
npm run lint      # lint sur tous les workspaces
npm test          # vitest sur tous les workspaces
```

Par workspace, voir `desktop-app/README.md` et `signaling-server/README.md`.

## Tests

- **Frontend (desktop-app)** : 22 tests Vitest (générateur PIN, hook usePin, SignalingClient, useSignaling, smoke routing)
- **Serveur (signaling-server)** : 26 tests Vitest (schemas Zod, SessionManager, handlers, message-router, env, + 1 integration 2 clients simultanés)
- **Rust** : `cargo test` (réservé aux modules natifs — arrive en Phase 4+)

## Avancement

- [x] **Phase 1** — Setup & UI statique (tag `v0.1-setup`)
- [x] **Phase 2** — Signaling server + enregistrement (tag `v0.2-signaling`)
- [ ] **Phase 3** — Handshake WebRTC + consentement OS-level
- [ ] **Phase 4** — Streaming écran + injection inputs (enigo)
- [ ] **Phase 5** — Polish, TURN, rate-limit, packaging signé, release v1.0

Plans détaillés : `docs/superpowers/plans/`. Rapports de phase : `docs/superpowers/reports/`.

## Documentation projet

- **`PRD.md`** — spec produit complète (5 phases, user stories, stack, data model)
- **`STRUCTURE.md`** — arborescence cible du monorepo
- **`DEV-RULES.md`** — règles de code, sécurité, git, debug (non négociable)
- **`CLAUDE.md`** — guide pour les sessions Claude Code

## Licence

MIT
