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
