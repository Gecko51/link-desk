# LinkDesk — PRD

| Champ | Valeur |
|-------|--------|
| **Date** | 18 avril 2026 |
| **Version** | v0.1 (MVP) |
| **Auteur** | AI-Generated PRD |
| **Stack** | Tauri 2.x + React/TS + Rust + WebRTC + Node.js (signaling) |

> **[HYPOTHÈSE]** — Le nom "LinkDesk" est une proposition. Remplacer par le nom final avant Phase 1.

---

## 1. Vision & Problème

1. **Problème concret** — Les particuliers et petites structures qui veulent dépanner un proche à distance (parents, collègues non-tech, clients) n'ont pas d'outil simple, gratuit et qui fonctionne en une minute. Les solutions existantes (TeamViewer, AnyDesk) imposent création de compte, bannières d'installation intrusives, ou blocage à l'usage "commercial" détecté automatiquement.

2. **Cible** — Utilisateur non-technique, 30-70 ans, sur Windows ou macOS, qui veut soit **donner** l'accès à sa machine (côté hôte), soit **prendre** le contrôle d'une machine à distance (côté contrôleur). Pas de compétences réseau, pas de configuration de routeur, pas de VPN.

3. **Résultat attendu** — En moins de 60 secondes, l'hôte communique un code PIN à 9 chiffres au contrôleur, qui le saisit et prend le contrôle total de l'écran et des inputs de l'hôte. Connexion chiffrée de bout en bout, aucune donnée ne transite par un serveur tiers (sauf signaling éphémère).

4. **Différenciation** — 
   - Aucun compte requis pour le MVP (PIN éphémère uniquement)
   - Interface simplifiée à 2 actions : "Partager mon écran" / "Prendre le contrôle"
   - Open source, pas de détection commerciale
   - PIN rotatif 30 min (sécurité) mais connexion active maintenue tant que la session est ouverte

---

## 2. User Stories (MVP)

### 🔴 Must-have

> **En tant qu'** hôte, **je veux** un code PIN visible dès l'ouverture de l'app, **afin de** le transmettre immédiatement à quelqu'un qui va me dépanner.

> **En tant qu'** hôte, **je veux** que le PIN soit renouvelé automatiquement toutes les 30 minutes, **afin de** garantir que personne ne puisse se reconnecter avec un ancien code.

> **En tant qu'** hôte, **je veux** voir une popup claire "Untel veut prendre le contrôle, accepter ?" avant chaque connexion, **afin de** ne jamais subir un contrôle non consenti.

> **En tant que** contrôleur, **je veux** saisir un PIN dans un champ unique, **afin de** me connecter en une action.

> **En tant que** contrôleur, **je veux** voir l'écran de l'hôte en temps réel avec une latence faible (< 200ms), **afin de** travailler confortablement.

> **En tant que** contrôleur, **je veux** déplacer la souris et taper au clavier sur la machine distante, **afin d'** effectuer les actions nécessaires.

> **En tant qu'** hôte, **je veux** un bouton "Couper la connexion" toujours visible et accessible, **afin de** reprendre le contrôle instantanément en cas de doute.

### 🟡 Should-have

> **En tant qu'** utilisateur, **je veux** que la connexion soit chiffrée de bout en bout (DTLS/SRTP), **afin de** ne pas craindre l'interception.

> **En tant que** contrôleur, **je veux** pouvoir adapter la qualité d'image (haute / équilibrée / économie de bande passante), **afin de** gérer les connexions lentes.

### 🟢 Nice-to-have

> **En tant qu'** hôte, **je veux** pouvoir déplacer ma souris librement pendant le contrôle distant, **afin de** reprendre la main si besoin (co-contrôle).

> **En tant qu'** utilisateur, **je veux** un chat texte intégré, **afin de** communiquer pendant la session sans appeler au téléphone.

---

## 3. Fonctionnalités Clés (MVP)

### Module 1 — Identité & Session

| Champ | Description |
|-------|-------------|
| **Nom** | Génération de l'ID machine |
| **Description** | Au premier lancement, génération d'un identifiant unique (UUID v4) stocké localement. Cet ID est l'adresse permanente de la machine sur le réseau de signaling. |
| **Critères d'acceptation** | ID persistant entre les redémarrages ; stocké chiffré via Tauri Stronghold ; jamais affiché à l'utilisateur (détail technique). |
| **Complexité** | Simple |

| Champ | Description |
|-------|-------------|
| **Nom** | Génération du PIN rotatif |
| **Description** | PIN à 9 chiffres (format `XXX-XXX-XXX`), régénéré toutes les 30 minutes. Affiché en gros sur l'écran principal de l'hôte. Un bouton "Régénérer maintenant" force la rotation. |
| **Critères d'acceptation** | PIN généré via CSPRNG ; timer visible (compte à rebours) ; copie au clipboard en 1 clic ; régénération manuelle invalide l'ancien PIN côté serveur. |
| **Complexité** | Simple |

### Module 2 — Signaling & Handshake

| Champ | Description |
|-------|-------------|
| **Nom** | Enregistrement auprès du signaling server |
| **Description** | Au lancement, l'app ouvre une WebSocket vers le signaling server. Elle envoie son ID machine et son PIN courant. Le serveur maintient une table `pin → machine_id` éphémère. |
| **Critères d'acceptation** | Reconnexion automatique en cas de perte WS ; rotation de PIN synchronisée avec le serveur ; ping/pong 30s pour détecter les déconnexions. |
| **Complexité** | Moyen |

| Champ | Description |
|-------|-------------|
| **Nom** | Handshake WebRTC via PIN |
| **Description** | Le contrôleur saisit le PIN, le serveur de signaling route les messages SDP et ICE entre les deux pairs. Dès que les ICE candidates s'échangent, la connexion P2P est établie et le signaling n'est plus utilisé. |
| **Critères d'acceptation** | Connexion établie en < 5s sur réseau standard ; fallback TURN si la P2P directe échoue ; PIN invalidé après usage ou expiration. |
| **Complexité** | Complexe |

### Module 3 — Streaming écran & Contrôle

| Champ | Description |
|-------|-------------|
| **Nom** | Capture et streaming de l'écran hôte |
| **Description** | Capture via `getDisplayMedia()` dans la webview Tauri, streamée via WebRTC (codec VP8/H.264). L'hôte choisit quel écran partager si multi-moniteur. |
| **Critères d'acceptation** | Latence < 200ms en LAN, < 500ms en WAN ; résolution adaptative (1080p max MVP) ; indication claire "Votre écran est partagé" sur l'hôte. |
| **Complexité** | Complexe |

| Champ | Description |
|-------|-------------|
| **Nom** | Injection d'inputs sur l'hôte |
| **Description** | Le contrôleur envoie les événements souris/clavier via un data channel WebRTC. Côté hôte, ces événements sont injectés au niveau OS via la crate Rust `enigo`. |
| **Critères d'acceptation** | Support clic gauche/droit/milieu, scroll, drag ; clavier complet (modifiers inclus) ; mapping correct des coordonnées (écran distant → écran local) ; throttling à 60Hz max. |
| **Complexité** | Complexe |

### Module 4 — UI & UX

| Champ | Description |
|-------|-------------|
| **Nom** | Écran d'accueil à 2 boutons |
| **Description** | Au lancement, écran plein format avec 2 gros boutons : "Partager mon écran" (vert) et "Prendre le contrôle d'un autre écran" (bleu). Aucun autre élément visible. |
| **Critères d'acceptation** | Boutons cliquables en < 500ms après lancement ; texte en Français clair ; icônes reconnaissables ; accessibilité clavier (Tab navigable). |
| **Complexité** | Simple |

| Champ | Description |
|-------|-------------|
| **Nom** | Popup de consentement de connexion |
| **Description** | Quand un contrôleur tente une connexion, popup modale non-dismissable sur l'hôte : "Quelqu'un veut prendre le contrôle de votre ordinateur. Accepter ?" avec timeout 30s (refus par défaut). |
| **Critères d'acceptation** | Popup toujours au premier plan (OS-level) ; son de notification ; refus automatique après 30s ; log de chaque tentative (accepté/refusé/timeout). |
| **Complexité** | Moyen |

| Champ | Description |
|-------|-------------|
| **Nom** | Bouton "Couper la connexion" permanent |
| **Description** | Pendant une session active, un bouton rouge fixe est affiché en overlay sur l'écran de l'hôte (toujours au-dessus des autres fenêtres). Clic = déconnexion immédiate. |
| **Critères d'acceptation** | Overlay système (pas juste fenêtre de l'app) ; raccourci clavier `Ctrl+Shift+X` ; déconnexion effective en < 1s ; Popup de confirmation "Session terminée". |
| **Complexité** | Moyen |

---

## 4. Stack Technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| **Framework desktop** | Tauri 2.x | Binaires légers (~10 MB vs ~100 MB Electron), backend Rust natif, sécurité par défaut, support Windows/macOS/Linux. |
| **Langage frontend** | TypeScript 5.x (strict) | Type safety, refactoring sûr, standard React moderne. |
| **UI framework** | React 18 | Écosystème mature, shadcn/ui compatible, connu du dev. |
| **Styling** | Tailwind CSS 3.x + shadcn/ui | Design system rapide, composants accessibles par défaut, thème clair/sombre natif. |
| **Langage backend natif** | Rust (stable) | Performance critique pour input injection, accès OS bas-niveau, sécurité mémoire. |
| **Capture d'écran** | Browser API `getDisplayMedia()` (MVP) | Simple à intégrer, permissions OS gérées par le webview, évite de maintenir du code Rust de capture cross-platform. |
| **Injection d'inputs** | Crate Rust `enigo` v0.2+ | Cross-platform (Windows/macOS/Linux), API simple (souris + clavier), stable. |
| **Transport P2P** | WebRTC (via browser API) | Standard P2P, codecs VP8/H.264 intégrés, NAT traversal (STUN/TURN) natif, chiffrement DTLS/SRTP automatique. |
| **Signaling server** | Node.js 20 + Fastify + `ws` (WebSocket) | Stack simple à déployer, faible footprint, facile à scaler horizontalement derrière un load balancer. |
| **STUN** | Google STUN (`stun.l.google.com:19302`) pour MVP | Gratuit, suffisant pour 80% des cas. Ajouter TURN self-hosted (Coturn) en Phase 5. |
| **Stockage local sécurisé** | Tauri Stronghold plugin | Chiffrement de l'ID machine, pas de stockage en clair. |
| **Packaging** | Tauri bundler (MSI/DMG/AppImage) | Installeurs natifs générés automatiquement, signature de code possible. |
| **Documentation IA** | Context7 MCP | Docs à jour de Tauri, WebRTC, enigo, Fastify → évite les hallucinations d'API. |

### Alternatives écartées

- **Electron** — trop lourd, consommation mémoire problématique pour une app "compagnon".
- **Rust natif full (sans webview)** — UI beaucoup plus longue à construire, inutile pour une app simple.
- **WebRTC en Rust (`webrtc-rs`)** — complexité inutile pour le MVP, le webview gère WebRTC nativement.
- **Capture via crate Rust (`scrap`, `xcap`)** — plus de contrôle mais maintenance cross-platform pénible. Reconsidérer si la qualité de `getDisplayMedia()` est insuffisante.

---

## 5. Modèle de Données

### Côté client (stockage local Tauri)

```sql
-- Fichier chiffré via Tauri Stronghold
table local_config {
  machine_id       uuid PK              -- généré au 1er lancement
  created_at       timestamp
  last_session_at  timestamp nullable
}

-- In-memory (non persisté)
struct current_session {
  pin              string(9)            -- format XXX-XXX-XXX
  pin_generated_at timestamp
  pin_expires_at   timestamp            -- +30 min
  ws_connected     bool
  active_peer      uuid nullable        -- machine_id du contrôleur en cours
}

-- Log local des sessions (pour audit utilisateur)
table session_log {
  id                uuid PK
  role              enum('host', 'controller')
  peer_id           uuid nullable
  started_at        timestamp
  ended_at          timestamp nullable
  end_reason        enum('user_disconnected', 'timeout', 'network_error', 'denied')
  
  index idx_started_at (started_at)
}
```

### Côté signaling server (in-memory, éphémère)

```sql
-- Redis ou Map JS pour MVP
table active_clients {
  machine_id     uuid PK
  current_pin    string(9) UNIQUE       -- unique pour éviter les collisions
  socket_id      string                 -- identifiant de la WS
  connected_at   timestamp
  pin_expires_at timestamp
  
  index idx_pin (current_pin)           -- lookup O(1) par PIN
}

-- Pour chaque tentative de connexion
table connection_requests {
  id              uuid PK
  controller_id   uuid
  host_id         uuid
  pin_used        string(9)
  status          enum('pending', 'accepted', 'denied', 'expired')
  created_at      timestamp
  ttl             30 seconds            -- auto-purge
}
```

**Note importante** : aucune donnée persistante côté serveur. Tout est éphémère et purgé à la déconnexion. RGPD-compliant par design.

---

## 6. Protocoles & Commandes

### Commandes Tauri (Rust → Frontend)

| Commande | Paramètres | Description |
|----------|-----------|-------------|
| `generate_machine_id` | — | Crée l'UUID au 1er lancement et le stocke (Stronghold) |
| `get_machine_id` | — | Retourne l'UUID machine |
| `generate_pin` | — | Génère un PIN 9 chiffres via CSPRNG |
| `inject_mouse_event` | `x, y, button, action` | Injecte un événement souris via `enigo` |
| `inject_keyboard_event` | `key, modifiers, action` | Injecte un événement clavier via `enigo` |
| `show_consent_dialog` | `peer_name` | Affiche popup OS-level de consentement |
| `show_disconnect_overlay` | — | Affiche l'overlay "Couper la connexion" |
| `hide_disconnect_overlay` | — | Cache l'overlay |
| `log_session_event` | `event_type, metadata` | Écrit dans le log local |

### Messages WebSocket (Frontend ↔ Signaling server)

| Type | Sens | Payload |
|------|------|---------|
| `register` | Client → Server | `{ machine_id, pin, pin_expires_at }` |
| `update_pin` | Client → Server | `{ machine_id, new_pin, new_expires_at }` |
| `connect_request` | Controller → Server | `{ controller_id, target_pin }` |
| `connect_offer` | Server → Host | `{ controller_id, session_id }` |
| `consent_response` | Host → Server | `{ session_id, accepted: bool }` |
| `sdp_offer` | Controller → Host (via server) | `{ session_id, sdp }` |
| `sdp_answer` | Host → Controller (via server) | `{ session_id, sdp }` |
| `ice_candidate` | Both directions | `{ session_id, candidate }` |
| `peer_disconnected` | Server → Both | `{ session_id }` |

### Messages Data Channel WebRTC (P2P direct)

| Type | Sens | Payload |
|------|------|---------|
| `mouse_event` | Controller → Host | `{ x_ratio, y_ratio, button, action }` |
| `keyboard_event` | Controller → Host | `{ key, modifiers, action }` |
| `screen_metadata` | Host → Controller | `{ width, height, scale_factor }` |
| `disconnect` | Both | `{ reason }` |

---

## 7. Écrans & Navigation

| Écran | Route (internal) | Composants clés | Contexte |
|-------|------------------|-----------------|----------|
| Accueil | `/` | `<HeroButtons />` (2 CTAs : Partager / Prendre le contrôle) | Lancement de l'app |
| Hôte — En attente | `/host` | `<PinDisplay />`, `<PinTimer />`, `<RegeneratePinButton />`, `<StatusBadge />` | Après clic "Partager mon écran" |
| Hôte — Consentement | Modal sur `/host` | `<ConsentModal />` (nom pair, timer 30s, accepter/refuser) | Tentative de connexion entrante |
| Hôte — Session active | `/host/session` | `<SessionInfo />`, overlay système `<DisconnectOverlay />` | Pendant la prise de contrôle |
| Contrôleur — Saisie PIN | `/controller` | `<PinInput />` (9 cases auto-focus), `<ConnectButton />` | Après clic "Prendre le contrôle" |
| Contrôleur — Connexion | `/controller/connecting` | `<ConnectingSpinner />`, `<CancelButton />` | Pendant le handshake WebRTC |
| Contrôleur — Session active | `/controller/session` | `<RemoteScreen />` (video WebRTC plein écran), `<SessionToolbar />` | Pendant la prise de contrôle |

**Navigation** :
- React Router DOM 6 en mode `memory` (pas de vraies URLs, juste du state).
- Flow principal : Accueil → (Hôte ou Contrôleur) → Session → Accueil.
- Aucune deep link, aucune URL exposée à l'utilisateur.

---

## 8. Contraintes Techniques

### Performance
- Latence input → action : **< 50ms** en LAN, **< 150ms** en WAN.
- Latence vidéo : **< 200ms** en LAN, **< 500ms** en WAN.
- CPU hôte pendant capture : **< 15%** sur machine de référence (i5 8e gen).
- RAM totale app : **< 200 MB**.
- Temps de démarrage à froid : **< 2s**.

### Sécurité
- Chiffrement P2P : DTLS/SRTP natif WebRTC (non-négociable).
- ID machine : stocké chiffré via Tauri Stronghold (jamais en clair).
- PIN : CSPRNG (`rand::rngs::OsRng` en Rust, `crypto.getRandomValues()` en JS).
- Signaling server : TLS obligatoire (WSS), pas de WS en clair.
- Consentement : toujours explicite côté hôte avant toute connexion.
- Aucune persistance des données de session côté serveur.
- Rate limiting sur le signaling : max 10 tentatives de PIN par IP / 5 min.
- Input injection : désactivée par défaut sur les champs mots de passe système (détection OS si possible).

### Tests (stratégie MVP)
- **Unit** : logique de génération PIN, parsing des messages WS, mapping coordonnées.
- **Integration** : handshake WebRTC complet entre 2 clients locaux, flow de consentement.
- **Manuel** : matrice Windows 10/11 + macOS 14 × latence LAN/WAN × qualité réseau.
- Outils : Vitest (frontend), `cargo test` (Rust), Playwright pour E2E Tauri (Phase 5 uniquement).

### Compatibilité
- **OS** : Windows 10/11 (x64), macOS 13+ (Intel + Apple Silicon), Linux Ubuntu 22.04+ (post-MVP).
- **Node.js signaling** : 20 LTS minimum.
- **Rust** : stable channel (1.77+).
- **Réseau** : fonctionne derrière NAT standard. Carrier-grade NAT → TURN requis (Phase 5).

### Accessibilité
- Navigation clavier complète (Tab, Enter, Escape).
- Labels ARIA sur tous les contrôles interactifs.
- Contraste WCAG AA minimum.
- Texte minimum 14px, CTA principaux à 18px.
- Support du mode sombre OS.

---

## 9. Milestones de développement

```
Phase 1 — Setup & UI statique                        → git tag v0.1-setup
  - Init Tauri 2.x + React + TS + Tailwind
  - Config shadcn/ui (bouton, card, input, dialog, toast)
  - Génération ID machine persistant (Stronghold)
  - Génération PIN rotatif 30 min (timer visible)
  - Écran d'accueil 2 boutons (Hôte / Contrôleur)
  - Écran Hôte (affichage PIN + timer + régénération)
  - Écran Contrôleur (input PIN à 9 chiffres, pas encore connecté)
  - Aucune logique réseau à cette étape

Phase 2 — Signaling server + enregistrement          → git tag v0.2-signaling
  - Init Node.js + Fastify + ws + Pino (logs)
  - Endpoint WS `/signaling` avec auth par machine_id
  - Table in-memory `active_clients`
  - Messages `register` / `update_pin` / `ping` / `pong`
  - Client: connexion WS auto + reconnect + push du PIN
  - Tests manuels : 2 clients enregistrés simultanément

Phase 3 — Handshake WebRTC & consentement            → git tag v0.3-webrtc
  - Messages `connect_request`, `connect_offer`, `sdp_*`, `ice_candidate`
  - Popup de consentement côté hôte (Tauri dialog natif)
  - Établissement RTCPeerConnection + data channel
  - Pas encore de vidéo, juste un data channel "hello world" qui s'échange
  - Gestion des timeouts (refus auto après 30s)

Phase 4 — Streaming vidéo + contrôle distant         → git tag v0.4-control
  - `getDisplayMedia()` côté hôte + addTrack sur la peer connection
  - `<video>` plein écran côté contrôleur
  - Capture événements souris/clavier côté contrôleur (canvas overlay)
  - Transmission via data channel
  - Commandes Tauri `inject_mouse_event` / `inject_keyboard_event` (Rust + enigo)
  - Mapping coordonnées (ratio 0-1 → pixels réels)
  - Overlay système "Couper la connexion" côté hôte

Phase 5 — Polish, sécurité & MVP Release             → git tag v1.0-mvp
  - Coturn self-hosted (TURN) + rotation credentials
  - Rate limiting signaling server (Fastify plugin)
  - Logs de session local (table session_log)
  - Gestion états: loading, error, empty, success sur tous les écrans
  - Packaging: MSI (Windows) + DMG (macOS) signés
  - README + page d'aide intégrée (FAQ 5 questions)
  - Tests E2E critiques (Playwright)
  - Déploiement signaling server (Railway ou Fly.io)
  - Release v1.0
```
