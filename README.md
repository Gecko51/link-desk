# LinkDesk

Application de contrôle à distance (Tauri + WebRTC + Node.js signaling).

## Structure

- `desktop-app/` — App Tauri (client host & controller)
- `signaling-server/` — Serveur WebSocket de signaling (Phase 2+)

## Quick start (Phase 1)

```bash
npm install
npm run dev
```

## Avancement

- [x] Phase 1 — Setup & UI statique (en cours)
- [ ] Phase 2 — Signaling server
- [ ] Phase 3 — Handshake WebRTC
- [ ] Phase 4 — Streaming & contrôle
- [ ] Phase 5 — Polish & MVP release
