# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

**LinkDesk** — application de contrôle à distance type TeamViewer. Stack : Tauri 2.x + React 18 / TypeScript strict + Rust + WebRTC + Node.js signaling.

Monorepo npm workspaces :
- `desktop-app/` — client Tauri (host + controller, frontend React + backend Rust natif)
- `signaling-server/` — serveur WebSocket de signaling (Fastify + ws, opérationnel depuis Phase 2)

## À lire avant de toucher au code

1. **`PRD.md`** — spec produit complète : 5 phases (v0.1 → v1.0), user stories, data model, commandes Tauri, messages WS/data-channel, contraintes perf/sécu.
2. **`STRUCTURE.md`** — arborescence cible du monorepo. Respecter les chemins et le nommage (`kebab-case.tsx` côté frontend, `snake_case.rs` côté Rust).
3. **`DEV-RULES.md`** — règles de code, UI/UX, sécurité, git, debug. **Non négociable.**
4. **`docs/superpowers/plans/`** — plan d'implémentation détaillé par phase (Phases 1-3 complètes).

## Conventions qui dérogent aux préférences globales

- **Commentaires de code en anglais** (DEV-RULES §1 — convention internationale). Seuls la prose utilisateur, les READMEs, CHANGELOG et documents restent en français.
- **TypeScript strict** obligatoire : pas de `any`, pas de `as unknown as`. Props typées systématiquement. Extend des props HTML via `React.ComponentProps<'button'>`.
- **Rust** : pas de `.unwrap()` / `.expect()` en prod, erreurs via `thiserror`, zéro warning `clippy` toléré (`#![deny(warnings)]` en Phase 5).
- **Zod** obligatoire pour valider toute donnée venant de l'extérieur (WS, data channel, commandes Tauri, localStorage). _Dette Phase 1 encore ouverte :_ le wrapper `src/lib/tauri.ts` ne valide toujours pas les résultats Tauri (commandes actuelles = string simple) — à câbler quand une commande structurée arrivera (Phase 3/4).
- **Schémas Zod dupliqués** entre `signaling-server/src/websocket/schemas.ts` et `desktop-app/src/features/signaling/message-schemas.ts` depuis Phase 2 (duplication contrôlée). _À consolider en package partagé en Phase 5_ — évite de coupler le bundler Tauri au workspace serveur.
- **Context7 MCP** : requis avant de coder une API de librairie (tauri, tauri-plugin-stronghold, react-router-dom, fastify, ws, zod, shadcn). Ne jamais coder une API de mémoire sans check.

## Commandes courantes

Depuis la racine :
```bash
npm install                  # installe tous les workspaces
npm run dev                  # lance tauri dev (desktop-app)
npm run build                # tauri build
npm run lint                 # lint dans chaque workspace
npm test                     # vitest dans chaque workspace
```

Depuis `desktop-app/` :
```bash
npm run tauri dev            # fenêtre dev
npm run tauri build          # bundle release (MSI/DMG/AppImage)
npm run typecheck            # tsc --noEmit
npm test                     # tous les tests vitest
npm test -- <pattern>        # un seul fichier/nom de test
npx vite build               # build frontend uniquement (sans Tauri)
```

Depuis `desktop-app/src-tauri/` :
```bash
cargo check
cargo clippy --all-targets -- -D warnings
cargo test
```

## Architecture (grands traits)

Le client `desktop-app` est une app Tauri : un webview React pilote des commandes Rust natives via `invoke()`. Le frontend a 3 couches :
- `routes/` — écrans (accueil, hôte, contrôleur, sessions) orchestrés par un `MemoryRouter` (pas de deep links).
- `features/xxx/` — logique métier par domaine (pin, signaling, webrtc, screen-capture, input-capture/injection, consent, session). Chaque feature expose un hook + des types + (optionnel) des schemas Zod.
- `components/` — UI présentationnel (shadcn/ui comme base). Zéro logique métier inline.

Toute communication frontend ↔ Rust passe par des wrappers typés dans `src/lib/tauri.ts` (DEV-RULES §5 : jamais d'`invoke()` direct dans un composant). Les types Rust exposés sont mirroirés dans `src/types/tauri-commands.ts`.

Côté Rust (`src-tauri/`), l'entrée est `lib.rs` qui enregistre les commandes via `tauri::generate_handler![]`. Les commandes sont groupées par domaine dans `commands/` (machine_id, pin, input_injection, consent, overlay, session_log). Le code bas-niveau OS (Stronghold, mapping keycodes, infos écrans) vit dans `core/`. Toutes les commandes retournent `Result<T, AppError>` (serde-serializable).

Le handshake WebRTC (implémenté en Phase 3) : les 2 clients s'enregistrent auprès du signaling server avec leur machine_id + PIN courant. Le contrôleur envoie le PIN au serveur, qui relaie un `connect_offer` à l'hôte ; l'hôte affiche une popup OS-level de consentement (`tauri-plugin-dialog`, timeout 30s) ; si accepté, le serveur relaie les messages SDP/ICE jusqu'à établissement du data channel P2P. Ensuite plus aucun trafic ne passe par le signaling (vidéo + inputs sont pair-à-pair chiffrés DTLS/SRTP — Phase 4).

## Git

- `master` : prod uniquement. `dev` : branche d'intégration. `feat/xxx`, `fix/xxx` : branches de travail.
- Commits : `type(scope): description` (types : `feat | fix | refactor | docs | chore | test | perf`). Exemple : `feat(pin): add PIN rotation timer`.
- **Jamais `--no-verify`, jamais amender un commit poussé.**
- Tag à chaque fin de phase : `git tag v0.X-label && git push --tags`.
- `.env`, `node_modules/`, `target/`, `dist/`, logs, clés : jamais commit.

## Workflow phase (DEV-RULES §11)

À la fin de chaque phase, exécuter **dans l'ordre strict** : build → lint (ESLint + clippy) → tests → vérif manuelle end-to-end → mise à jour README + `.env.example` → commit final → tag Git → rapport de phase dans `docs/superpowers/reports/`.

## Debug (DEV-RULES §12)

Processus obligatoire en 6 étapes : **observer** (lire, reproduire, ne rien modifier) → **diagnostiquer** (cause racine, pas symptôme) → **formuler 2-3 hypothèses** → **valider avec Guillaume** → **corriger** (fix minimal, pas de refactor simultané) → **expliquer** dans le commit.

Garde-fous : ne jamais modifier > 1 fichier à la fois sans le signaler. API de librairie en cause → Context7 avant tout code. Changement de schéma (BDD, messages WS) → **STOP** et alerter.

## Spécifique WebRTC / Tauri

- WebRTC : activer `chrome://webrtc-internals` (ou équivalent) pour diagnostic ICE/DTLS. "connection failed" → vérifier successivement STUN, TURN, firewall, NAT.
- Tauri : erreur "command not found" → vérifier `.invoke_handler` dans `lib.rs`. Permissions refusées → vérifier `tauri.conf.json` + `capabilities/default.json`. Build release qui échoue → isoler via `cargo build --release`.
