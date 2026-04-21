# Changelog

## [Unreleased]

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
