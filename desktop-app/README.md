# LinkDesk — desktop-app

Application Tauri 2.x client (host + controller).

## Prérequis

- Rust stable 1.77+
- Node 20 LTS (Node 22 OK)
- Dépendances système Tauri selon OS : https://v2.tauri.app/start/prerequisites/

## Dev

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Tests & qualité

```bash
npm test
npm run typecheck
npm run lint
cargo clippy --all-targets -- -D warnings --manifest-path src-tauri/Cargo.toml
```

## Phase 1 — implémenté

- Monorepo npm workspaces
- Scaffolding Tauri 2.x + React 18 + TypeScript strict + Vite
- Tailwind 3.x + shadcn/ui (thème clair/sombre HSL)
- React Router 6 en mode memory
- Générateur PIN CSPRNG (frontend) + commande native Rust (OsRng)
- Persistence machine id via iota_stronghold (chiffrement at-rest)
- Hook `usePin` : rotation automatique 30 min, countdown, régénération manuelle
- Hook `useMachineId` : fetch UUID persistant au boot
- 3 écrans : Accueil · Hôte (PIN rotatif + copie + regénération) · Contrôleur (saisie 9 cases)

Aucune logique réseau à ce stade (prévue Phase 2+).
