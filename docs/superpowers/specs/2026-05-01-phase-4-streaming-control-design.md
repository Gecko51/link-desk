# Phase 4 — Streaming vidéo + Contrôle distant — Design Spec

> **Date :** 2026-05-01
> **Branche :** `feat/phase-4-streaming-control`
> **Approche :** A — Feature Hooks (hooks indépendants branchés sur l'orchestrateur existant)
> **Prérequis :** Phase 3 complète (WebRTC handshake + data channel P2P opérationnel)

---

## 1. Décisions de design

| # | Sujet | Décision | Justification |
|---|-------|----------|---------------|
| Q1 | Multi-écran | Picker natif OS via `getDisplayMedia()` | Zéro code custom, UX standard, supporté partout |
| Q2 | Layout contrôleur | Toolbar verticale flottante gauche 36px | Compact, perte horizontale minimale, style Discord/Figma |
| Q3 | UX hôte en session | Widget flottant unique ~280×60 always-on-top | Une seule surface UI, bureau dégagé |
| Q4 | Curseur contrôleur | Curseur local caché (`cursor: none`) | Seul le curseur distant visible dans le flux vidéo |
| Q5 | Scope clavier | Clavier complet dès Phase 4 | `enigo` gère tout nativement, pas de raison de limiter |
| Q6 | Déconnexion | Graceful (message `disconnect` + 500ms timeout), pas de retry | Retry nécessite re-négociation SDP, trop complexe pour Phase 4 |

---

## 2. Vue d'ensemble du flux de données

```
CONTROLLER                              HOST
──────────────────────────────────────────────────────────
                                        getDisplayMedia()
                                             │
                                        addTrack(videoTrack)
                                             │
                ◄── media track (VP8/H264, DTLS/SRTP) ──
                       │
                <video autoplay>
                       │
           mouse/keyboard listeners
                       │
           throttle 60Hz + ratio mapping
                       │
                ── data channel JSON (ordered) ──►
                                             │
                                        Zod validate
                                             │
                                        tauriInvoke()
                                             │
                                        enigo inject
```

---

## 3. Nouveaux fichiers frontend

### 3.1 Screen Capture (host)

**`features/screen-capture/use-screen-capture.ts`** (~60 lignes)

Hook qui encapsule `getDisplayMedia()` et gère le cycle de vie du `MediaStream`.

```typescript
interface UseScreenCaptureReturn {
  stream: MediaStream | null;
  status: "idle" | "capturing" | "stopped" | "error";
  error: string | null;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
}
```

Comportement :
- `startCapture()` appelle `navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: { max: 1920 }, height: { max: 1080 } } })`
- Écoute `track.onended` (l'utilisateur arrête le partage via le picker OS) → passe à `"stopped"`
- `stopCapture()` appelle `track.stop()` sur tous les tracks
- Cleanup automatique au unmount

**`features/screen-capture/capture.types.ts`** (~20 lignes)

```typescript
type ScreenCaptureStatus = "idle" | "capturing" | "stopped" | "error";

interface ScreenMetadata {
  width: number;
  height: number;
  scaleFactor: number;
}
```

### 3.2 Data Channel Messages (shared)

**`features/session/message-types.ts`** (~50 lignes)

Schemas Zod + types TypeScript pour tous les messages data channel Phase 4.

```typescript
// Mouse event (controller → host)
const mouseEventSchema = z.object({
  type: z.literal("mouse_event"),
  x_ratio: z.number().min(0).max(1),
  y_ratio: z.number().min(0).max(1),
  button: z.enum(["left", "right", "middle"]),
  action: z.enum(["move", "down", "up", "scroll"]),
  scroll_delta: z.number().optional(),
});

// Keyboard event (controller → host)
const keyboardEventSchema = z.object({
  type: z.literal("keyboard_event"),
  key: z.string(),
  code: z.string(),
  modifiers: z.object({
    ctrl: z.boolean(),
    alt: z.boolean(),
    shift: z.boolean(),
    meta: z.boolean(),
  }),
  action: z.enum(["down", "up"]),
});

// Screen metadata (host → controller, sent once after capture starts)
const screenMetadataSchema = z.object({
  type: z.literal("screen_metadata"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  scale_factor: z.number().positive(),
});

// Disconnect (bidirectional)
const disconnectSchema = z.object({
  type: z.literal("disconnect"),
  reason: z.enum(["user_request", "timeout", "error"]),
});

// Union
const dataChannelMessageSchema = z.discriminatedUnion("type", [
  mouseEventSchema,
  keyboardEventSchema,
  screenMetadataSchema,
  disconnectSchema,
]);

type DataChannelMessage = z.infer<typeof dataChannelMessageSchema>;
```

**`features/session/use-data-channel-messages.ts`** (~70 lignes)

Couche typée au-dessus du `RTCDataChannel` brut. Remplace `sendMessage(string)`.

```typescript
interface UseDataChannelMessagesReturn {
  send: (msg: DataChannelMessage) => boolean;
  subscribe: (handler: (msg: DataChannelMessage) => void) => () => void;
}

function useDataChannelMessages(channel: RTCDataChannel | null): UseDataChannelMessagesReturn;
```

Comportement :
- `send()` sérialise en JSON compact (`JSON.stringify`, pas de pretty-print) et appelle `channel.send()`
- `subscribe()` ajoute un listener `message` → parse JSON → validate Zod → dispatch au handler
- Messages invalides (Zod failure) : log `console.warn`, message ignoré (pas de crash)
- Retourne un unsubscribe function pour cleanup

### 3.3 Input Capture (controller)

**`features/input-capture/use-input-capture.ts`** (~120 lignes)

Hook qui attache les listeners mouse/keyboard sur le `<video>` et envoie les événements via data channel.

```typescript
interface UseInputCaptureOptions {
  videoRef: RefObject<HTMLVideoElement>;
  messages: UseDataChannelMessagesReturn;
  enabled: boolean;
}

function useInputCapture(opts: UseInputCaptureOptions): void;
```

Comportement :
- Attache `mousemove`, `mousedown`, `mouseup`, `wheel`, `contextmenu` sur `videoRef.current`
- Attache `keydown`, `keyup` sur `window` (pour capturer même sans focus sur le `<video>`)
- `contextmenu` : `preventDefault()` pour éviter le menu contextuel du navigateur
- Throttle mouse : `requestAnimationFrame` + gate 16ms (60Hz max)
- Keyboard : pas de throttle (événements discrets)
- `enabled: false` → détache tous les listeners
- Cleanup au unmount

**`features/input-capture/event-mapper.ts`** (~60 lignes)

Fonctions pures de conversion DOM events → `DataChannelMessage`.

```typescript
function mapMouseEvent(e: MouseEvent, video: HTMLVideoElement, action: "move" | "down" | "up"): MousePayload;
function mapWheelEvent(e: WheelEvent, video: HTMLVideoElement): MousePayload;
function mapKeyboardEvent(e: KeyboardEvent, action: "down" | "up"): KeyboardPayload;
```

Mapping souris :
- `x_ratio = e.offsetX / video.clientWidth` (0-1, clampé)
- `y_ratio = e.offsetY / video.clientHeight` (0-1, clampé)
- `button` : `e.button === 0` → `"left"`, `2` → `"right"`, `1` → `"middle"`

Mapping clavier :
- `key` : `e.key` (valeur logique, ex: `"a"`, `"Enter"`, `"F1"`)
- `code` : `e.code` (code physique, ex: `"KeyA"`, `"Enter"`, `"F1"`)
- `modifiers` : `{ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }`

**`features/input-capture/input.types.ts`** (~30 lignes)

Types réexportés depuis `message-types.ts` + constantes internes.

```typescript
type MouseAction = "move" | "down" | "up" | "scroll";
type MouseButton = "left" | "right" | "middle";
type KeyAction = "down" | "up";

const MOUSE_THROTTLE_MS = 16; // 60Hz
```

### 3.4 Input Injection (host)

**`features/input-injection/inject-commands.ts`** (~40 lignes)

Wrappers purs (non-hook) autour des commandes Tauri d'injection. Conforme à STRUCTURE.md.

```typescript
function injectMouseEvent(coords: PixelCoords, button: MouseButton, action: MouseAction, scrollDelta?: number): Promise<void>;
function injectKeyboardEvent(key: string, code: string, modifiers: ModifierState, action: KeyAction): Promise<void>;
```

Chaque fonction appelle `tauriInvoke()` avec le bon typage. Pas de state React — fonctions pures async.

**`features/input-injection/use-input-injection.ts`** (~80 lignes)

Hook côté hôte qui orchestre la réception des messages et appelle `inject-commands.ts`.

```typescript
interface UseInputInjectionOptions {
  messages: UseDataChannelMessagesReturn;
  screenMetadata: ScreenMetadata;
  enabled: boolean;
}

function useInputInjection(opts: UseInputInjectionOptions): void;
```

Comportement :
- `subscribe()` aux messages entrants
- `mouse_event` → `coord-mapper` → `injectMouseEvent()`
- `keyboard_event` → `injectKeyboardEvent()`
- `disconnect` → trigger `endSession()` via callback
- `enabled: false` → unsubscribe

**`features/input-injection/coord-mapper.ts`** (~25 lignes)

```typescript
interface PixelCoords { x: number; y: number; }

function ratioToPixel(
  x_ratio: number,
  y_ratio: number,
  screen: ScreenMetadata
): PixelCoords;
```

Calcul : `x = Math.round(x_ratio * screen.width)`, idem pour y. Scale factor appliqué si nécessaire pour les écrans HiDPI.

### 3.5 Composants UI

**`components/remote-screen.tsx`** (~40 lignes)

```typescript
interface RemoteScreenProps {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement>;
}
```

- `<video>` plein écran, `autoPlay`, `playsInline`, pas de `controls`
- `cursor: none` quand `stream` est actif
- `srcObject = stream` via `useEffect`
- Fond noir par défaut (pas de flash blanc)

**`components/session-toolbar.tsx`** (~60 lignes)

Toolbar verticale 36px à gauche de l'écran controller.

```typescript
interface SessionToolbarProps {
  peerLabel: string;
  duration: string;        // "02:14"
  connectionQuality: "good" | "fair" | "poor";
  onDisconnect: () => void;
  onSettings?: () => void;
}
```

- Icônes : pastille statut (vert/jaune/rouge), engrenage settings, bouton ✕ disconnect (rouge)
- Background : `rgba(15, 23, 42, 0.9)` + `backdrop-filter: blur(8px)`
- Border-radius : 8px, border subtle `rgba(255, 255, 255, 0.1)`

**`components/host-session-widget.tsx`** (~50 lignes)

Widget flottant 280×60 affiché dans la fenêtre overlay Tauri (always-on-top).

```typescript
interface HostSessionWidgetProps {
  peerLabel: string;
  duration: string;
  onDisconnect: () => void;
}
```

- Layout horizontal : infos (nom + durée) à gauche, bouton "Couper" rouge à droite
- Background blanc, border `2px solid #dc2626`, border-radius 8px
- Font compact (10-11px)

---

## 4. Nouveaux fichiers Rust

### 4.1 `commands/input_injection.rs`

Deux commandes Tauri pour l'injection souris et clavier via `enigo`.

```rust
#[tauri::command]
pub async fn inject_mouse_event(
    enigo: State<'_, EnigoState>,
    x: i32,
    y: i32,
    button: String,   // "left" | "right" | "middle"
    action: String,   // "move" | "down" | "up" | "scroll"
    scroll_delta: Option<i32>,
) -> Result<(), AppError>;

#[tauri::command]
pub async fn inject_keyboard_event(
    enigo: State<'_, EnigoState>,
    key: String,       // e.key value
    code: String,      // e.code value
    modifiers: ModifierState,
    action: String,    // "down" | "up"
) -> Result<(), AppError>;
```

- `EnigoState` : `Arc<Mutex<Enigo>>` enregistré comme state Tauri dans `lib.rs`
- Mapping `key`/`code` string → `enigo::Key` délégué à `core/input_mapper.rs`
- Gestion erreurs : `AppError::InputInjection(String)` (nouveau variant)

### 4.2 `commands/overlay.rs`

Gestion de la fenêtre overlay always-on-top.

```rust
#[tauri::command]
pub async fn create_overlay_window(app: AppHandle) -> Result<(), AppError>;

#[tauri::command]
pub async fn close_overlay_window(app: AppHandle) -> Result<(), AppError>;
```

- `create_overlay_window` : crée un `WebviewWindow` avec :
  - Label : `"overlay"`
  - URL : `/overlay`
  - Dimensions : 280×60
  - `always_on_top: true`, `decorations: false`, `resizable: false`, `skip_taskbar: true`
  - Position : coin supérieur droit du moniteur principal
- `close_overlay_window` : ferme la fenêtre par label
- Raccourci global `Ctrl+Shift+X` : enregistré via `app.global_shortcut()`, émet un event Tauri `"session-disconnect-shortcut"`

### 4.3 `core/input_mapper.rs`

Wrapper safe autour de `enigo`. Isolation du code potentiellement unsafe (DEV-RULES §2).

```rust
pub fn map_key(key: &str, code: &str) -> Result<enigo::Key, AppError>;
pub fn map_button(button: &str) -> Result<enigo::Button, AppError>;
pub fn map_mouse_action(action: &str) -> Result<MouseAction, AppError>;
```

- Mapping exhaustif des codes JavaScript → enigo keys
- Lettres/chiffres : via `key` (valeur logique)
- Touches spéciales (F1-F12, arrows, etc.) : via `code` (code physique)
- Modifiers : mapping direct `"ctrl"` → `enigo::Key::Control`, etc.
- Erreur explicite pour les touches non supportées (pas de panic)

### 4.4 `core/screen_info.rs` + `commands/screen_info.rs`

Séparation conforme à la convention du projet : logique native dans `core/`, commande Tauri dans `commands/`.

**`core/screen_info.rs`** — logique pure :

```rust
#[derive(Serialize)]
pub struct ScreenInfo {
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

pub fn read_screen_info() -> Result<ScreenInfo, AppError>;
```

- Windows : via `GetSystemMetrics` + `GetDpiForSystem` (Win32 API)
- Fallback raisonnable : 1920×1080, scale 1.0

**`commands/screen_info.rs`** — commande Tauri :

```rust
#[tauri::command]
pub fn get_screen_info() -> Result<ScreenInfo, AppError> {
    core::screen_info::read_screen_info()
}
```

### 4.5 Dépendances Cargo.toml

```toml
[dependencies]
enigo = "0.2"
```

Pas d'autres nouvelles dépendances nécessaires. L'API Win32 pour `screen_info` utilise les bindings déjà disponibles via `windows-sys` (dépendance transitive de Tauri).

---

## 5. Modifications aux fichiers existants

### 5.1 `features/session/use-session.ts`

**Supprimé :**
- `sendMessage(data: string)` de l'API publique
- `lastMessage` du state
- `messageReducer` interne

**Ajouté :**
- `dataChannel: RTCDataChannel | null` exposé dans `UseSessionApi`
- Événement `ontrack` sur le peer connection → stocke le `MediaStream` reçu
- `remoteStream: MediaStream | null` exposé dans `UseSessionApi`

**Modifié :**
- Label data channel : `"linkdesk-phase3"` → `"linkdesk-control"`
- Data channel options : `{ ordered: true, maxRetransmits: 0 }` (ajout `maxRetransmits: 0`)

### 5.2 `features/session/session-state-machine.ts`

**Ajouté :**
- Événement `video_track_received` dans `SessionEvent`
- Le status `connected` gagne un champ optionnel `hasVideo: boolean` (default `false`, passe à `true` sur `video_track_received`)

### 5.3 `features/session/session.types.ts`

**Ajouté :**
```typescript
// New event
| { kind: "video_track_received" }

// Connected status gains hasVideo
{ kind: "connected"; sessionId: string; role: SessionRole; peerId: string; hasVideo: boolean }
```

### 5.4 `routes/host-session.tsx` (réécriture)

Nouvelle logique :
1. `useScreenCapture()` → obtient le `MediaStream`
2. `useEffect` : quand `stream` ready + `peer` connected → `peer.addTrack(videoTrack, stream)`
3. `useEffect` : quand `stream` ready → appeler `get_screen_info()` → envoyer `screen_metadata` via data channel
4. `useDataChannelMessages(session.dataChannel)` → brancher `useInputInjection`
5. Appeler `create_overlay_window()` au mount, `close_overlay_window()` au unmount
6. UI minimale dans la fenêtre principale (peut être masquée puisque l'overlay est always-on-top)

### 5.5 `routes/controller-session.tsx` (réécriture)

Nouvelle logique :
1. `session.remoteStream` → passer à `<RemoteScreen stream={stream} videoRef={videoRef} />`
2. `useDataChannelMessages(session.dataChannel)` → obtenir l'objet `messages`
3. `useInputCapture({ videoRef, messages, enabled: session.status.hasVideo })`
4. `<SessionToolbar>` à gauche avec infos session + bouton disconnect
5. Écouter le message `screen_metadata` pour afficher les infos de résolution dans la toolbar

### 5.6 `routes/` — Nouvelle route overlay + config router

**`routes/overlay.tsx`** (~30 lignes)

Route minimaliste pour la fenêtre overlay Tauri :
- Écoute l'event Tauri `"session-status"` pour afficher peer name + timer
- Écoute l'event Tauri `"session-disconnect-shortcut"` (Ctrl+Shift+X)
- Bouton "Couper" émet l'event Tauri `"overlay-disconnect-clicked"`
- Pas de WebRTC ici — communication via events Tauri inter-fenêtres uniquement

**`App.tsx`** — Ajouter la route `/overlay` au `MemoryRouter` :

```tsx
<Route path="/overlay" element={<OverlayRoute />} />
```

Note : la fenêtre overlay Tauri charge l'URL `/overlay` dans un webview séparé. Ce webview a son propre React tree — il ne partage PAS le `AppStateProvider` de la fenêtre principale. Toute communication passe par les events Tauri (`emit`/`listen`).

### 5.7 `app-state.tsx`

**Ajouté :**
- `remoteStream: MediaStream | null` (proxy depuis `session.remoteStream`)

### 5.8 `types/tauri-commands.ts`

**Ajouté :**
```typescript
inject_mouse_event: {
  args: { x: number; y: number; button: string; action: string; scroll_delta?: number };
  result: null;
};
inject_keyboard_event: {
  args: { key: string; code: string; modifiers: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }; action: string };
  result: null;
};
get_screen_info: {
  args: {};
  result: { width: number; height: number; scale_factor: number };
};
create_overlay_window: {
  args: {};
  result: null;
};
close_overlay_window: {
  args: {};
  result: null;
};
```

### 5.9 `src-tauri/src/lib.rs`

**Ajouté :**
- Initialisation `EnigoState` dans setup (créer instance `Enigo`, wrap `Arc<Mutex>`, register state)
- Commandes dans `generate_handler![]` : `inject_mouse_event`, `inject_keyboard_event`, `get_screen_info`, `create_overlay_window`, `close_overlay_window`

### 5.10 `src-tauri/src/errors.rs`

**Ajouté :**
```rust
#[error("Input injection failed: {0}")]
InputInjection(String),

#[error("Overlay window error: {0}")]
Overlay(String),

#[error("Screen info error: {0}")]
ScreenInfo(String),
```

### 5.11 `src-tauri/src/commands/mod.rs`

**Ajouté :**
```rust
pub mod input_injection;
pub mod overlay;
pub mod screen_info;
```

### 5.12 `desktop-app/src-tauri/Cargo.toml`

**Ajouté :**
```toml
enigo = "0.2"
```

---

## 6. Configuration Tauri

### 6.1 `tauri.conf.json`

Ajouter la fenêtre overlay dans la config (ou la créer dynamiquement via code Rust — approche dynamique préférée pour éviter qu'elle s'ouvre au lancement).

### 6.2 `capabilities/default.json`

Ajouter les permissions pour :
- `global-shortcut:default` (Ctrl+Shift+X)
- `window:allow-create` (création dynamique de fenêtre overlay)
- Les nouvelles commandes invoke

---

## 7. Flux de déconnexion graceful

```
1. L'un des deux côtés déclenche la déconnexion :
   - Controller : clic bouton ✕ dans SessionToolbar
   - Host : clic bouton "Couper" dans le widget overlay OU Ctrl+Shift+X

2. Côté initiateur :
   a. Envoyer { type: "disconnect", reason: "user_request" } via data channel
   b. Attendre 500ms (laisser le message arriver)
   c. stopCapture() (host) ou détacher listeners (controller)
   d. close_overlay_window() (host)
   e. peer.close()
   f. Naviguer vers "/"

3. Côté receveur (reçoit le message disconnect) :
   a. stopCapture() (host) ou détacher listeners (controller)
   b. close_overlay_window() (host)
   c. peer.close()
   d. Naviguer vers "/"

4. Si le réseau coupe sans message :
   a. RTCPeerConnection.connectionState → "disconnected" → "failed"
   b. Timeout 5s après "failed" → forcer cleanup
   c. Même séquence de cleanup que ci-dessus
```

---

## 8. Contraintes de performance

| Métrique | Cible | Implémentation |
|----------|-------|----------------|
| Latence vidéo LAN | <200ms | `getDisplayMedia` natif, codec hardware-accelerated |
| Latence vidéo WAN | <500ms | Pas de TURN en Phase 4 (LAN only de facto) |
| Latence input LAN | <50ms | Data channel `ordered: true, maxRetransmits: 0` |
| Framerate mouse | 60Hz max | `requestAnimationFrame` + gate 16ms |
| CPU | <15% | Single RAF loop, pas de polling, stream natif |
| RAM | <200MB | Pas de buffer vidéo custom |
| Résolution | 1080p max | Contrainte `getDisplayMedia({ video: { width: { max: 1920 }, height: { max: 1080 } } })` |
| Framerate vidéo | 30fps | Contrainte `getDisplayMedia({ video: { frameRate: 30 } })` |

---

## 9. Hors scope Phase 4

- TURN server (NAT traversal WAN) → Phase 5
- Retry/reconnexion automatique → Phase 5
- File transfer → Phase 5
- Chat texte → Phase 5
- Multi-monitor switching en cours de session → Phase 5
- Audio capture → Phase 5
- Détection champs mot de passe (PRD §8) → Phase 5
- MessagePack (remplacement JSON) → Phase 5 si bande passante problématique
- Session logging (commande Rust `session_log.rs`) → Phase 5
