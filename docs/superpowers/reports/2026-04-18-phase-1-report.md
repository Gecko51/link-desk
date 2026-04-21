## Rapport Phase 1 — Setup & UI statique

### Implémenté
- Monorepo npm workspaces
- Tauri 2.x + React 18 + TS strict + Vite + Tailwind + shadcn/ui
- Générateur PIN CSPRNG (frontend + Rust)
- Persistence machine id via iota_stronghold
- Hooks `usePin` (rotation 30 min) et `useMachineId`
- 3 écrans : Accueil, Hôte, Contrôleur

### Non implémenté (et pourquoi)
- Logique réseau : hors scope Phase 1 (prévu Phase 2+)
- Commandes Rust `inject_*`, `show_consent_dialog`, overlay : Phase 3/4
- Tests composants React : volontairement minimaux (PRD §8 stratégie MVP — tests logique uniquement, E2E en Phase 5)
- Validation Zod sur les commandes Tauri : reportée (tous les retours sont des string simples — voir CLAUDE.md)

### Décisions d'architecture
- `tauri-plugin-stronghold` retiré au profit d'un usage direct de `iota_stronghold` : le plugin ne réexposait pas sa `StrongholdCollection` en Rust, et n'était utilisé par aucun code JS en Phase 1. Le conserver aurait créé un risque de race condition sur le vault.
- `sonner` remplace le pattern `useToast` shadcn legacy (absent du registry nova). API plus simple.
- Master password Stronghold dérivé déterministiquement via SHA-256(salt + `app_local_data_dir`) — pas de prompt utilisateur, pas de keyring OS. Préserve le cold-start < 2s du PRD.

### Problèmes rencontrés
- ESLint v10 a supprimé `.eslintrc.*` ; migration vers flat config `eslint.config.js`
- Nova preset shadcn v4 génère oklch au lieu de HSL ; restauré à HSL pour cohérence
- `tauri-plugin-stronghold` v2 n'expose pas son `StrongholdCollection` en Rust → pivot architectural
- Plusieurs cycles spec/quality review sur les premières tâches (normal en début de plan)

### Recommandations Phase 2
- **Signaling server** : démarrer fresh dans `signaling-server/` (Fastify + ws + Pino + Zod)
- **Zod** : wire les schemas sur `tauriInvoke` ET sur chaque message WS entrant
- **Stronghold** : si JS a besoin d'accès en Phase 3, re-introduire `tauri-plugin-stronghold` MAIS sur un fichier SÉPARÉ pour éviter la race documentée dans le code review Task 8
- **Dette technique** : consolider `cn.ts` / `utils.ts` en un seul fichier; envisager split `tsconfig.app.json` / `tsconfig.test.json` pour que les globals vitest ne fuitent pas dans `src/`

### Métriques (à compléter par Guillaume après vérif manuelle)
- Taille bundle release : MSI 3.3 MB (`LinkDesk_0.1.0_x64_en-US.msi`) · NSIS 2.2 MB (`LinkDesk_0.1.0_x64-setup.exe`)
- Temps de démarrage à froid : [à mesurer — stopwatch visuel au lancement]
- RAM au repos : [à mesurer — Task Manager sur la fenêtre ouverte]

### État du code
- 13 commits atomiques sur `feat/phase-1-setup`
- `cargo check` + `cargo clippy --all-targets -- -D warnings` : clean
- `npm run typecheck` + `npm run lint` : clean
- 12 tests Vitest au vert
- `vite build` + `npm run tauri build` : OK (MSI 3.3 MB + NSIS 2.2 MB générés sur Windows x64)
