## Rapport Phase 2 — Signaling server + enregistrement

### Implémenté
- Workspace `signaling-server` bootstrappé (Fastify + WS + Pino + Zod)
- Messages : `register`, `update_pin`, `ping`/`pong` avec validation Zod systématique
- Session manager in-memory (indexé `machine_id` + `pin`)
- Heartbeat serveur-side (timeout 45s grace) + client-side (ping 30s)
- Client : `SignalingClient` avec reconnect backoff exponentiel (1s → 30s), hook `useSignaling`
- Refactor App.tsx : context `AppState` extrait dans `src/app-state.tsx`, hoisting `usePin` + `useSignaling`
- `StatusBadge` UI sur les 3 écrans
- Tests : unit server (6 session-manager, 8 schemas, 3 register-handler, 4 message-router, 4 env) + integration server (1) + client (7 signaling-client, 3 use-signaling, 12 existants)

### Non implémenté (et pourquoi)
- Rate limiting : Phase 5 (PRD §10)
- Origin whitelist strict : Phase 5 (PRD §10)
- Dockerfile + docker-compose : Phase 5 (déploiement)
- TTL purger périodique : YAGNI (cleanup sur close suffit en local)
- Package Zod partagé client/serveur : Phase 5 (duplication contrôlée pour Phase 2)

### Décisions d'architecture
- **Hoisting `usePin` au niveau App** : le client est rôle-agnostique au boot (PRD §3 Module 2). Toute l'app partage le même PinSession. Context extrait dans `src/app-state.tsx` à cause de la règle ESLint `react-refresh/only-export-components`.
- **Schémas Zod dupliqués** client/serveur : duplication contrôlée pour Phase 2. Package partagé (`@linkdesk/protocol`) prévu Phase 5.
- **Heartbeat applicatif** (pas protocole) : le browser WS API ne permet pas de piloter les ping frames natifs.
- **`WebSocketLike` interface** côté client : évite `as unknown as WebSocket` dans les tests (DEV-RULES §1). Structural typing parfait.
- **Struct return de `buildServer`** : `{ app, sessions }` au lieu d'augmenter FastifyInstance — évite `as unknown as`.

### Problèmes rencontrés
- `z.coerce.number().positive()` rejette PORT=0 → dans l'integration test, passé PORT=3001 à `loadEnv` et `port=0` directement à `app.listen()`.
- ESLint `react-hooks` v7 plus strict qu'attendu : `useSignaling` a été restructuré pour consolider register/update_pin/reset-on-drop dans le callback de l'interval polling (pas dans des useEffect séparés).
- `tsconfig.json` sans `rootDir` produit `dist/src/` + `dist/tests/` — dette Phase 5 pour split `tsconfig.build.json`.

### Recommandations Phase 3
- **Signaling multi-destinataires** : le handler doit maintenant router des messages entre pairs (`connect_offer`, `sdp_*`, `ice_*`) — pas juste traiter la demande localement.
- **Popup consentement OS-level** : Rust — utiliser `tauri-plugin-dialog` + passer les infos du pair (machine_id résolu depuis PIN).
- **Trickle ICE** : décider si on stream ou si on attend `iceGatheringState === complete` (DEV-RULES §7 préconise d'attendre).
- **Zod protocol package** : si Phase 3 ajoute beaucoup plus de messages, consolider maintenant en package partagé.

### Métriques (à compléter par Guillaume après vérif manuelle)
- Temps d'enregistrement cold-start : [mesurer — ouverture app → StatusBadge "Connecté"]
- Reconnect après kill serveur : [mesurer — durée jusqu'à retour "Connecté"]
- RAM serveur au repos avec 2 clients : [Task Manager / `top`]
- Bundle sizes (inchangé vs Phase 1 attendu mais vérifier)
