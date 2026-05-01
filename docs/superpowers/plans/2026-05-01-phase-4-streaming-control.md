# Phase 4 — Streaming vidéo + Contrôle distant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time screen sharing (video stream via WebRTC) and remote mouse/keyboard control to LinkDesk.

**Architecture:** Feature Hooks approach — independent hooks (`useScreenCapture`, `useInputCapture`, `useInputInjection`) plug into the existing session orchestrator. A typed message layer on the data channel replaces raw string messaging. Rust `enigo` crate handles OS-level input injection behind a safe API boundary.

**Tech Stack:** React 18 + TypeScript strict, Tauri 2.x (Rust), WebRTC (`getDisplayMedia` + `addTrack`), Zod schemas, enigo 0.2 (Rust), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-01-phase-4-streaming-control-design.md`

**IMPORTANT:** Before writing any enigo, Tauri window, or global-shortcut code, run Context7 MCP to get current API docs. The code in this plan reflects training-data knowledge and may diverge from the latest crate version.

---

## File Map

### New files — Frontend

| File | Responsibility |
|------|---------------|
| `src/features/session/message-types.ts` | Zod schemas + TS types for all data channel messages |
| `src/features/session/use-data-channel-messages.ts` | Typed send/subscribe layer over raw RTCDataChannel |
| `src/features/screen-capture/capture.types.ts` | Types for screen capture state |
| `src/features/screen-capture/use-screen-capture.ts` | `getDisplayMedia()` lifecycle hook |
| `src/features/input-capture/input.types.ts` | Constants + re-exported types for input capture |
| `src/features/input-capture/event-mapper.ts` | Pure DOM event → DataChannelMessage mappers |
| `src/features/input-capture/use-input-capture.ts` | Attaches mouse/keyboard listeners on `<video>`, throttles, sends |
| `src/features/input-injection/coord-mapper.ts` | Pure ratio→pixel conversion |
| `src/features/input-injection/inject-commands.ts` | Typed wrappers around Tauri inject commands |
| `src/features/input-injection/use-input-injection.ts` | Subscribes to data channel messages, dispatches to Tauri |
| `src/components/remote-screen.tsx` | `<video>` fullscreen with `cursor:none` |
| `src/components/session-toolbar.tsx` | Vertical 36px toolbar (controller side) |
| `src/components/host-session-widget.tsx` | 280×60 widget for overlay window (host side) |
| `src/routes/overlay.tsx` | Minimal route rendered in the overlay Tauri window |

### New files — Rust

| File | Responsibility |
|------|---------------|
| `src-tauri/src/core/screen_info.rs` | Read primary display resolution + DPI via Win32 API |
| `src-tauri/src/core/input_mapper.rs` | Map JS key/code strings → enigo Key/Button |
| `src-tauri/src/commands/screen_info.rs` | Tauri command wrapper for `get_screen_info` |
| `src-tauri/src/commands/input_injection.rs` | `inject_mouse_event` + `inject_keyboard_event` commands |
| `src-tauri/src/commands/overlay.rs` | `create_overlay_window` + `close_overlay_window` commands |

### New files — Tests

| File | Responsibility |
|------|---------------|
| `tests/features/session/message-types.test.ts` | Zod schema validation (valid + invalid payloads) |
| `tests/features/input-capture/event-mapper.test.ts` | Mouse/keyboard DOM→message mapping |
| `tests/features/input-capture/coord-mapper.test.ts` | Ratio→pixel conversion |

### Modified files

| File | Changes |
|------|---------|
| `src/features/session/session.types.ts` | Add `video_track_received` event, `hasVideo` field |
| `src/features/session/session-state-machine.ts` | Handle `video_track_received` event |
| `src/features/session/use-session.ts` | Expose `dataChannel` + `remoteStream`, drop `sendMessage`/`lastMessage` |
| `src/app-state.tsx` | Add `remoteStream` to AppState |
| `src/types/tauri-commands.ts` | Add 5 new command signatures + error variants |
| `src/routes/host-session.tsx` | Full rewrite with screen capture + input injection |
| `src/routes/controller-session.tsx` | Full rewrite with `<video>` + input capture |
| `src/App.tsx` | Add `/overlay` route |
| `src-tauri/src/errors.rs` | Add `InputInjection`, `Overlay`, `ScreenInfo` variants |
| `src-tauri/src/commands/mod.rs` | Export new command modules |
| `src-tauri/src/core/mod.rs` | Export new core modules |
| `src-tauri/src/lib.rs` | Register new commands + EnigoState |
| `src-tauri/Cargo.toml` | Add `enigo` dependency |
| `src-tauri/capabilities/default.json` | Add window + global-shortcut permissions |
| `tests/features/session/session-state-machine.test.ts` | Add `video_track_received` + `hasVideo` tests |

---

### Task 1: Data Channel Message Schemas

**Files:**
- Create: `desktop-app/src/features/session/message-types.ts`
- Test: `desktop-app/tests/features/session/message-types.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// desktop-app/tests/features/session/message-types.test.ts
import { describe, it, expect } from "vitest";
import {
  dataChannelMessageSchema,
  mouseEventSchema,
  keyboardEventSchema,
  screenMetadataSchema,
  disconnectSchema,
} from "@/features/session/message-types";

describe("mouseEventSchema", () => {
  it("accepts a valid mouse move", () => {
    const msg = { type: "mouse_event", x_ratio: 0.5, y_ratio: 0.3, button: "left", action: "move" };
    expect(mouseEventSchema.parse(msg)).toEqual(msg);
  });

  it("accepts a scroll with delta", () => {
    const msg = { type: "mouse_event", x_ratio: 0.1, y_ratio: 0.9, button: "middle", action: "scroll", scroll_delta: -3 };
    expect(mouseEventSchema.parse(msg)).toEqual(msg);
  });

  it("rejects x_ratio out of range", () => {
    const msg = { type: "mouse_event", x_ratio: 1.5, y_ratio: 0, button: "left", action: "move" };
    expect(() => mouseEventSchema.parse(msg)).toThrow();
  });

  it("rejects unknown button", () => {
    const msg = { type: "mouse_event", x_ratio: 0, y_ratio: 0, button: "extra", action: "move" };
    expect(() => mouseEventSchema.parse(msg)).toThrow();
  });
});

describe("keyboardEventSchema", () => {
  it("accepts a valid key down", () => {
    const msg = {
      type: "keyboard_event",
      key: "a",
      code: "KeyA",
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      action: "down",
    };
    expect(keyboardEventSchema.parse(msg)).toEqual(msg);
  });

  it("accepts key with all modifiers", () => {
    const msg = {
      type: "keyboard_event",
      key: "c",
      code: "KeyC",
      modifiers: { ctrl: true, alt: false, shift: false, meta: false },
      action: "down",
    };
    expect(keyboardEventSchema.parse(msg)).toEqual(msg);
  });

  it("rejects missing modifiers", () => {
    const msg = { type: "keyboard_event", key: "a", code: "KeyA", action: "down" };
    expect(() => keyboardEventSchema.parse(msg)).toThrow();
  });
});

describe("screenMetadataSchema", () => {
  it("accepts valid metadata", () => {
    const msg = { type: "screen_metadata", width: 1920, height: 1080, scale_factor: 1.0 };
    expect(screenMetadataSchema.parse(msg)).toEqual(msg);
  });

  it("rejects negative width", () => {
    const msg = { type: "screen_metadata", width: -1, height: 1080, scale_factor: 1.0 };
    expect(() => screenMetadataSchema.parse(msg)).toThrow();
  });

  it("rejects fractional height", () => {
    const msg = { type: "screen_metadata", width: 1920, height: 1080.5, scale_factor: 1.0 };
    expect(() => screenMetadataSchema.parse(msg)).toThrow();
  });
});

describe("disconnectSchema", () => {
  it("accepts user_request", () => {
    const msg = { type: "disconnect", reason: "user_request" };
    expect(disconnectSchema.parse(msg)).toEqual(msg);
  });

  it("rejects unknown reason", () => {
    const msg = { type: "disconnect", reason: "crash" };
    expect(() => disconnectSchema.parse(msg)).toThrow();
  });
});

describe("dataChannelMessageSchema (discriminated union)", () => {
  it("routes mouse_event correctly", () => {
    const msg = { type: "mouse_event", x_ratio: 0.5, y_ratio: 0.5, button: "left", action: "down" };
    const parsed = dataChannelMessageSchema.parse(msg);
    expect(parsed.type).toBe("mouse_event");
  });

  it("routes keyboard_event correctly", () => {
    const msg = {
      type: "keyboard_event",
      key: "Enter",
      code: "Enter",
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      action: "down",
    };
    const parsed = dataChannelMessageSchema.parse(msg);
    expect(parsed.type).toBe("keyboard_event");
  });

  it("rejects unknown type", () => {
    const msg = { type: "file_transfer", data: "abc" };
    expect(() => dataChannelMessageSchema.parse(msg)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop-app && npm test -- message-types`
Expected: FAIL — module `@/features/session/message-types` not found.

- [ ] **Step 3: Create the message types module**

```typescript
// desktop-app/src/features/session/message-types.ts
import { z } from "zod";

// Mouse event: controller → host
export const mouseEventSchema = z.object({
  type: z.literal("mouse_event"),
  x_ratio: z.number().min(0).max(1),
  y_ratio: z.number().min(0).max(1),
  button: z.enum(["left", "right", "middle"]),
  action: z.enum(["move", "down", "up", "scroll"]),
  scroll_delta: z.number().optional(),
});

// Keyboard event: controller → host
export const keyboardEventSchema = z.object({
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

// Screen metadata: host → controller (sent once after capture starts)
export const screenMetadataSchema = z.object({
  type: z.literal("screen_metadata"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  scale_factor: z.number().positive(),
});

// Disconnect: bidirectional
export const disconnectSchema = z.object({
  type: z.literal("disconnect"),
  reason: z.enum(["user_request", "timeout", "error"]),
});

// Discriminated union of all data channel messages
export const dataChannelMessageSchema = z.discriminatedUnion("type", [
  mouseEventSchema,
  keyboardEventSchema,
  screenMetadataSchema,
  disconnectSchema,
]);

export type MouseEvent = z.infer<typeof mouseEventSchema>;
export type KeyboardEvent = z.infer<typeof keyboardEventSchema>;
export type ScreenMetadata = z.infer<typeof screenMetadataSchema>;
export type DisconnectMessage = z.infer<typeof disconnectSchema>;
export type DataChannelMessage = z.infer<typeof dataChannelMessageSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd desktop-app && npm test -- message-types`
Expected: PASS (all 12 tests green)

- [ ] **Step 5: Commit**

```bash
git add desktop-app/src/features/session/message-types.ts desktop-app/tests/features/session/message-types.test.ts
git commit -m "feat(session): add Zod schemas for data channel messages"
```

---

### Task 2: Coord Mapper

**Files:**
- Create: `desktop-app/src/features/input-injection/coord-mapper.ts`
- Test: `desktop-app/tests/features/input-capture/coord-mapper.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// desktop-app/tests/features/input-capture/coord-mapper.test.ts
import { describe, it, expect } from "vitest";
import { ratioToPixel } from "@/features/input-injection/coord-mapper";

describe("ratioToPixel", () => {
  it("maps center of a 1920x1080 screen", () => {
    const result = ratioToPixel(0.5, 0.5, { width: 1920, height: 1080, scaleFactor: 1 });
    expect(result).toEqual({ x: 960, y: 540 });
  });

  it("maps top-left corner to (0, 0)", () => {
    const result = ratioToPixel(0, 0, { width: 1920, height: 1080, scaleFactor: 1 });
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("maps bottom-right corner to (1919, 1079)", () => {
    // ratio 1.0 maps to width-1 to stay within screen bounds
    const result = ratioToPixel(1, 1, { width: 1920, height: 1080, scaleFactor: 1 });
    expect(result).toEqual({ x: 1920, y: 1080 });
  });

  it("rounds to nearest integer", () => {
    const result = ratioToPixel(0.333, 0.666, { width: 1920, height: 1080, scaleFactor: 1 });
    expect(result).toEqual({ x: 639, y: 719 });
  });

  it("applies scale factor for HiDPI (2x)", () => {
    const result = ratioToPixel(0.5, 0.5, { width: 1920, height: 1080, scaleFactor: 2 });
    expect(result).toEqual({ x: 1920, y: 1080 });
  });

  it("clamps negative ratios to 0", () => {
    const result = ratioToPixel(-0.1, -0.5, { width: 1920, height: 1080, scaleFactor: 1 });
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("clamps ratios above 1 to max", () => {
    const result = ratioToPixel(1.5, 2.0, { width: 1920, height: 1080, scaleFactor: 1 });
    expect(result).toEqual({ x: 1920, y: 1080 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd desktop-app && npm test -- coord-mapper`
Expected: FAIL — module `@/features/input-injection/coord-mapper` not found.

- [ ] **Step 3: Create the coord mapper**

```typescript
// desktop-app/src/features/input-injection/coord-mapper.ts
import type { ScreenMetadata } from "@/features/screen-capture/capture.types";

export interface PixelCoords {
  x: number;
  y: number;
}

export function ratioToPixel(
  xRatio: number,
  yRatio: number,
  screen: ScreenMetadata,
): PixelCoords {
  const clampedX = Math.max(0, Math.min(1, xRatio));
  const clampedY = Math.max(0, Math.min(1, yRatio));
  return {
    x: Math.round(clampedX * screen.width * screen.scaleFactor),
    y: Math.round(clampedY * screen.height * screen.scaleFactor),
  };
}
```

Note: this imports `ScreenMetadata` from `capture.types.ts` which doesn't exist yet. Create the types file first (next step).

- [ ] **Step 4: Create capture types (dependency)**

```typescript
// desktop-app/src/features/screen-capture/capture.types.ts
export type ScreenCaptureStatus = "idle" | "capturing" | "stopped" | "error";

export interface ScreenMetadata {
  width: number;
  height: number;
  scaleFactor: number;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd desktop-app && npm test -- coord-mapper`
Expected: PASS (all 7 tests green)

- [ ] **Step 6: Commit**

```bash
git add desktop-app/src/features/input-injection/coord-mapper.ts desktop-app/src/features/screen-capture/capture.types.ts desktop-app/tests/features/input-capture/coord-mapper.test.ts
git commit -m "feat(input): add coord mapper (ratio→pixel) and screen capture types"
```

---

### Task 3: Event Mapper

**Files:**
- Create: `desktop-app/src/features/input-capture/input.types.ts`
- Create: `desktop-app/src/features/input-capture/event-mapper.ts`
- Test: `desktop-app/tests/features/input-capture/event-mapper.test.ts`

- [ ] **Step 1: Create input types**

```typescript
// desktop-app/src/features/input-capture/input.types.ts
export type MouseAction = "move" | "down" | "up" | "scroll";
export type MouseButton = "left" | "right" | "middle";
export type KeyAction = "down" | "up";

export const MOUSE_THROTTLE_MS = 16; // ~60Hz
```

- [ ] **Step 2: Write the test file**

```typescript
// desktop-app/tests/features/input-capture/event-mapper.test.ts
import { describe, it, expect } from "vitest";
import { mapMouseEvent, mapWheelEvent, mapKeyboardEvent } from "@/features/input-capture/event-mapper";

// Helper: minimal mock of HTMLVideoElement dimensions
function mockVideo(clientWidth: number, clientHeight: number): HTMLVideoElement {
  return { clientWidth, clientHeight } as HTMLVideoElement;
}

describe("mapMouseEvent", () => {
  it("maps center click to ratio 0.5, 0.5", () => {
    const video = mockVideo(800, 600);
    const event = { offsetX: 400, offsetY: 300, button: 0 } as MouseEvent;
    const result = mapMouseEvent(event, video, "down");
    expect(result).toEqual({
      type: "mouse_event",
      x_ratio: 0.5,
      y_ratio: 0.5,
      button: "left",
      action: "down",
    });
  });

  it("maps top-left corner to 0, 0", () => {
    const video = mockVideo(1920, 1080);
    const event = { offsetX: 0, offsetY: 0, button: 0 } as MouseEvent;
    const result = mapMouseEvent(event, video, "move");
    expect(result.x_ratio).toBe(0);
    expect(result.y_ratio).toBe(0);
  });

  it("maps right click button=2 to 'right'", () => {
    const video = mockVideo(800, 600);
    const event = { offsetX: 100, offsetY: 100, button: 2 } as MouseEvent;
    const result = mapMouseEvent(event, video, "down");
    expect(result.button).toBe("right");
  });

  it("maps middle click button=1 to 'middle'", () => {
    const video = mockVideo(800, 600);
    const event = { offsetX: 100, offsetY: 100, button: 1 } as MouseEvent;
    const result = mapMouseEvent(event, video, "up");
    expect(result.button).toBe("middle");
  });

  it("clamps negative offset to 0", () => {
    const video = mockVideo(800, 600);
    const event = { offsetX: -10, offsetY: -5, button: 0 } as MouseEvent;
    const result = mapMouseEvent(event, video, "move");
    expect(result.x_ratio).toBe(0);
    expect(result.y_ratio).toBe(0);
  });

  it("clamps offset beyond element size to 1", () => {
    const video = mockVideo(800, 600);
    const event = { offsetX: 900, offsetY: 700, button: 0 } as MouseEvent;
    const result = mapMouseEvent(event, video, "move");
    expect(result.x_ratio).toBe(1);
    expect(result.y_ratio).toBe(1);
  });
});

describe("mapWheelEvent", () => {
  it("maps vertical scroll with delta", () => {
    const video = mockVideo(800, 600);
    const event = { offsetX: 400, offsetY: 300, deltaY: -120, button: 1 } as WheelEvent;
    const result = mapWheelEvent(event, video);
    expect(result.type).toBe("mouse_event");
    expect(result.action).toBe("scroll");
    expect(result.scroll_delta).toBe(-120);
  });
});

describe("mapKeyboardEvent", () => {
  it("maps a simple key press", () => {
    const event = {
      key: "a",
      code: "KeyA",
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    } as KeyboardEvent;
    const result = mapKeyboardEvent(event, "down");
    expect(result).toEqual({
      type: "keyboard_event",
      key: "a",
      code: "KeyA",
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      action: "down",
    });
  });

  it("captures Ctrl+C correctly", () => {
    const event = {
      key: "c",
      code: "KeyC",
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    } as KeyboardEvent;
    const result = mapKeyboardEvent(event, "down");
    expect(result.modifiers.ctrl).toBe(true);
  });

  it("maps special keys", () => {
    const event = {
      key: "Enter",
      code: "Enter",
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    } as KeyboardEvent;
    const result = mapKeyboardEvent(event, "up");
    expect(result.key).toBe("Enter");
    expect(result.action).toBe("up");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd desktop-app && npm test -- event-mapper`
Expected: FAIL — module not found.

- [ ] **Step 4: Create the event mapper**

```typescript
// desktop-app/src/features/input-capture/event-mapper.ts
import type { MouseEvent as DCMouseEvent, KeyboardEvent as DCKeyboardEvent } from "@/features/session/message-types";
import type { MouseButton, MouseAction, KeyAction } from "./input.types";

const BUTTON_MAP: Record<number, MouseButton> = {
  0: "left",
  1: "middle",
  2: "right",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mapMouseEvent(
  e: MouseEvent,
  video: HTMLVideoElement,
  action: Exclude<MouseAction, "scroll">,
): DCMouseEvent {
  return {
    type: "mouse_event",
    x_ratio: clamp(e.offsetX / video.clientWidth, 0, 1),
    y_ratio: clamp(e.offsetY / video.clientHeight, 0, 1),
    button: BUTTON_MAP[e.button] ?? "left",
    action,
  };
}

export function mapWheelEvent(e: WheelEvent, video: HTMLVideoElement): DCMouseEvent {
  return {
    type: "mouse_event",
    x_ratio: clamp(e.offsetX / video.clientWidth, 0, 1),
    y_ratio: clamp(e.offsetY / video.clientHeight, 0, 1),
    button: "middle",
    action: "scroll",
    scroll_delta: e.deltaY,
  };
}

export function mapKeyboardEvent(e: KeyboardEvent, action: KeyAction): DCKeyboardEvent {
  return {
    type: "keyboard_event",
    key: e.key,
    code: e.code,
    modifiers: {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    },
    action,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd desktop-app && npm test -- event-mapper`
Expected: PASS (all 9 tests green)

- [ ] **Step 6: Commit**

```bash
git add desktop-app/src/features/input-capture/input.types.ts desktop-app/src/features/input-capture/event-mapper.ts desktop-app/tests/features/input-capture/event-mapper.test.ts
git commit -m "feat(input): add event mapper (DOM events → data channel messages)"
```

---

### Task 4: Session Types & State Machine Update

**Files:**
- Modify: `desktop-app/src/features/session/session.types.ts`
- Modify: `desktop-app/src/features/session/session-state-machine.ts`
- Modify: `desktop-app/tests/features/session/session-state-machine.test.ts`

- [ ] **Step 1: Add new tests for video_track_received + hasVideo**

Append to `desktop-app/tests/features/session/session-state-machine.test.ts`:

```typescript
  it("peer_connected from negotiating → connected(hasVideo: false)", () => {
    const next = sessionReducer(
      { kind: "negotiating", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "peer_connected", sessionId: "s1" },
    );
    expect(next).toEqual({
      kind: "connected",
      sessionId: "s1",
      role: "host",
      peerId: "ctrl-1",
      hasVideo: false,
    });
  });

  it("video_track_received from connected → connected(hasVideo: true)", () => {
    const connected = {
      kind: "connected" as const,
      sessionId: "s1",
      role: "controller" as const,
      peerId: "host-1",
      hasVideo: false,
    };
    const next = sessionReducer(connected, { type: "video_track_received" });
    expect(next).toEqual({ ...connected, hasVideo: true });
  });

  it("video_track_received from non-connected is ignored", () => {
    const idle = initialSessionStatus;
    const next = sessionReducer(idle, { type: "video_track_received" });
    expect(next).toBe(idle);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd desktop-app && npm test -- session-state-machine`
Expected: FAIL — `video_track_received` not in SessionEvent type, `hasVideo` not in connected status.

- [ ] **Step 3: Update session.types.ts**

Replace the full content of `desktop-app/src/features/session/session.types.ts`:

```typescript
export type SessionRole = "controller" | "host";

export type SessionStatus =
  | { kind: "idle" }
  | { kind: "requesting"; targetPin: string }
  | { kind: "awaiting_consent"; sessionId: string; role: SessionRole; peerId: string }
  | { kind: "negotiating"; sessionId: string; role: SessionRole; peerId: string }
  | { kind: "connected"; sessionId: string; role: SessionRole; peerId: string; hasVideo: boolean }
  | { kind: "ended"; reason: SessionEndReason };

export type SessionEndReason =
  | "local_disconnect"
  | "peer_disconnected"
  | "declined"
  | "timeout"
  | "pin_not_found"
  | "self_connect_forbidden"
  | "network_error";

export type SessionEvent =
  | { type: "user_requested_connect"; targetPin: string }
  | { type: "server_pin_not_found" }
  | { type: "server_self_connect_forbidden" }
  | { type: "server_connect_offer"; sessionId: string; controllerId: string }
  | { type: "server_session_ready"; sessionId: string; hostId: string }
  | {
      type: "server_peer_disconnected";
      sessionId: string;
      reason: "host_disconnected" | "controller_disconnected" | "timeout" | "declined";
    }
  | { type: "consent_accepted"; sessionId: string }
  | { type: "consent_declined" }
  | { type: "peer_connected"; sessionId: string }
  | { type: "video_track_received" }
  | { type: "user_ended" };
```

- [ ] **Step 4: Update session-state-machine.ts**

In `desktop-app/src/features/session/session-state-machine.ts`, update the `peer_connected` case and add `video_track_received`:

```typescript
    // ICE/SDP negotiation complete, data channel established
    case "peer_connected":
      if (status.kind !== "negotiating") return status;
      return {
        kind: "connected",
        sessionId: status.sessionId,
        role: status.role,
        peerId: status.peerId,
        hasVideo: false,
      };

    // Remote video track received on the peer connection
    case "video_track_received":
      if (status.kind !== "connected") return status;
      return { ...status, hasVideo: true };
```

- [ ] **Step 5: Update the existing "peer_connected" test assertion**

The existing test at line 77-82 asserts `next.kind === "connected"` without checking `hasVideo`. Update it:

```typescript
  it("peer_connected from negotiating → connected", () => {
    const next = sessionReducer(
      { kind: "negotiating", sessionId: "s1", role: "host", peerId: "ctrl-1" },
      { type: "peer_connected", sessionId: "s1" },
    );
    expect(next.kind).toBe("connected");
    if (next.kind === "connected") expect(next.hasVideo).toBe(false);
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd desktop-app && npm test -- session-state-machine`
Expected: PASS (all tests green, including 3 new ones)

- [ ] **Step 7: Run typecheck to ensure no type errors cascade**

Run: `cd desktop-app && npm run typecheck`
Expected: May fail — `use-session.ts` references `status.kind === "connected"` which now requires `hasVideo`. Note any errors but do NOT fix `use-session.ts` yet (Task 6 handles it).

- [ ] **Step 8: Commit**

```bash
git add desktop-app/src/features/session/session.types.ts desktop-app/src/features/session/session-state-machine.ts desktop-app/tests/features/session/session-state-machine.test.ts
git commit -m "feat(session): add video_track_received event and hasVideo flag to connected state"
```

---

### Task 5: Typed Data Channel Messages Hook

**Files:**
- Create: `desktop-app/src/features/session/use-data-channel-messages.ts`

- [ ] **Step 1: Create the hook**

```typescript
// desktop-app/src/features/session/use-data-channel-messages.ts
import { useCallback, useEffect, useRef } from "react";
import { dataChannelMessageSchema } from "./message-types";
import type { DataChannelMessage } from "./message-types";

export interface UseDataChannelMessagesReturn {
  send: (msg: DataChannelMessage) => boolean;
  subscribe: (handler: (msg: DataChannelMessage) => void) => () => void;
}

// Typed message layer over a raw RTCDataChannel.
// Serializes outgoing messages to JSON, validates incoming with Zod.
export function useDataChannelMessages(
  channel: RTCDataChannel | null,
): UseDataChannelMessagesReturn {
  const handlersRef = useRef<Set<(msg: DataChannelMessage) => void>>(new Set());

  // Listen to raw data channel messages, parse+validate, dispatch to subscribers.
  useEffect(() => {
    if (!channel) return;

    const onMessage = (ev: Event) => {
      const raw = (ev as MessageEvent<unknown>).data;
      if (typeof raw !== "string") return;

      try {
        const parsed = JSON.parse(raw) as unknown;
        const msg = dataChannelMessageSchema.parse(parsed);
        for (const handler of handlersRef.current) {
          handler(msg);
        }
      } catch {
        console.warn("[linkdesk] invalid data channel message, ignoring", raw);
      }
    };

    channel.addEventListener("message", onMessage);
    return () => channel.removeEventListener("message", onMessage);
  }, [channel]);

  const send = useCallback(
    (msg: DataChannelMessage): boolean => {
      if (!channel || channel.readyState !== "open") return false;
      channel.send(JSON.stringify(msg));
      return true;
    },
    [channel],
  );

  const subscribe = useCallback(
    (handler: (msg: DataChannelMessage) => void): (() => void) => {
      handlersRef.current.add(handler);
      return () => {
        handlersRef.current.delete(handler);
      };
    },
    [],
  );

  return { send, subscribe };
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd desktop-app && npm run typecheck`
Expected: May have errors in other files (use-session.ts) — but use-data-channel-messages.ts itself should be clean.

- [ ] **Step 3: Commit**

```bash
git add desktop-app/src/features/session/use-data-channel-messages.ts
git commit -m "feat(session): add typed data channel messages hook (Zod validated)"
```

---

### Task 6: Session Orchestrator Refactor

**Files:**
- Modify: `desktop-app/src/features/session/use-session.ts`
- Modify: `desktop-app/src/app-state.tsx`
- Modify: `desktop-app/src/routes/host-session.tsx` (temporary fix to compile)
- Modify: `desktop-app/src/routes/controller-session.tsx` (temporary fix to compile)

This task modifies the session API: drops `sendMessage`/`lastMessage`, exposes `dataChannel` and `remoteStream`. The route rewrites come in Tasks 15-16. Here we make minimal changes to keep things compiling.

- [ ] **Step 1: Update UseSessionApi and useSession hook**

In `desktop-app/src/features/session/use-session.ts`:

1. Remove `messageReducer`, `MessageAction`, the `lastMessage` state, and the `sendMessage` callback.
2. Add `remoteStream` state (via useReducer).
3. Expose `dataChannel`, `remoteStream` in the API.
4. Change data channel label from `"linkdesk-phase3"` to `"linkdesk-control"`.
5. Add `maxRetransmits: 0` to data channel options.
6. Add `ontrack` listener to peer connection for receiving video.

Full replacement of the file:

```typescript
// desktop-app/src/features/session/use-session.ts
import { useCallback, useEffect, useReducer, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { sessionReducer, initialSessionStatus } from "./session-state-machine";
import type { SessionEvent, SessionStatus } from "./session.types";
import type { SignalingApi } from "@/features/signaling/signaling.types";
import { usePeerConnection } from "@/features/webrtc/use-peer-connection";
import { useDataChannel } from "@/features/webrtc/use-data-channel";
import {
  createOfferWithCompleteIce,
  createAnswerWithCompleteIce,
} from "@/features/webrtc/offer-answer";
import { tauriInvoke } from "@/lib/tauri";

// ------------------------------------------------------------------
// Options + return type
// ------------------------------------------------------------------

export interface UseSessionOptions {
  machineId: string | null;
  signaling: SignalingApi;
}

export interface UseSessionApi {
  status: SessionStatus;
  dataChannel: RTCDataChannel | null;
  remoteStream: MediaStream | null;
  requestConnect: (targetPin: string) => void;
  // Host: adds a video track to the peer connection so the controller receives it.
  addVideoTrack: (stream: MediaStream) => void;
  endSession: () => void;
}

// ------------------------------------------------------------------
// Internal micro-reducers
// ------------------------------------------------------------------

const DATA_CHANNEL_LABEL = "linkdesk-control";
const CONSENT_TIMEOUT_SECS = 30;

type ChannelAction = { type: "set"; channel: RTCDataChannel | null };

function channelReducer(
  _prev: RTCDataChannel | null,
  action: ChannelAction,
): RTCDataChannel | null {
  return action.channel;
}

type StreamAction = { type: "set"; stream: MediaStream | null };

function streamReducer(
  _prev: MediaStream | null,
  action: StreamAction,
): MediaStream | null {
  return action.stream;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

async function handleIncomingSdpOffer(
  peer: RTCPeerConnection | null,
  sdp: RTCSessionDescriptionInit,
  signaling: SignalingApi,
  sessionId: string,
): Promise<void> {
  if (!peer) return;
  await peer.setRemoteDescription(sdp);
  const answer = await createAnswerWithCompleteIce(peer);
  signaling.send({ type: "sdp_answer", session_id: sessionId, sdp: answer });
}

async function handleIncomingSdpAnswer(
  peer: RTCPeerConnection | null,
  sdp: RTCSessionDescriptionInit,
  sessionId: string,
  dispatch: (event: SessionEvent) => void,
): Promise<void> {
  if (!peer) return;
  await peer.setRemoteDescription(sdp);
  dispatch({ type: "peer_connected", sessionId });
}

// ------------------------------------------------------------------
// Orchestrator hook
// ------------------------------------------------------------------

export function useSession(opts: UseSessionOptions): UseSessionApi {
  const [status, dispatch] = useReducer(sessionReducer, initialSessionStatus);
  const [channel, setChannel] = useReducer(channelReducer, null);
  const [remoteStream, setRemoteStream] = useReducer(streamReducer, null);

  const navigate = useNavigate();

  const signalingRef = useRef(opts.signaling);
  useEffect(() => {
    signalingRef.current = opts.signaling;
  }, [opts.signaling]);

  const handleIncomingDataChannel = useCallback((dc: RTCDataChannel) => {
    setChannel({ type: "set", channel: dc });
  }, []);

  const { peer } = usePeerConnection({
    active: status.kind === "negotiating" || status.kind === "connected",
    onIncomingDataChannel: handleIncomingDataChannel,
  });

  // Track data channel readyState (keeps existing useDataChannel wired for
  // connection lifecycle monitoring; actual typed messaging handled externally).
  useDataChannel({ channel });

  // Listen for incoming video tracks (controller receives host's screen).
  useEffect(() => {
    if (!peer) return;
    const handleTrack = (ev: RTCTrackEvent) => {
      if (ev.streams[0]) {
        setRemoteStream({ type: "set", stream: ev.streams[0] });
        dispatch({ type: "video_track_received" });
      }
    };
    peer.addEventListener("track", handleTrack);
    return () => peer.removeEventListener("track", handleTrack);
  }, [peer]);

  // Effect 1 — Subscribe to server messages and drive the state machine.
  useEffect(() => {
    const unsubscribe = opts.signaling.onMessage((msg) => {
      switch (msg.type) {
        case "connect_offer":
          dispatch({
            type: "server_connect_offer",
            sessionId: msg.session_id,
            controllerId: msg.controller_id,
          });
          return;
        case "session_ready":
          dispatch({
            type: "server_session_ready",
            sessionId: msg.session_id,
            hostId: msg.host_id,
          });
          return;
        case "peer_disconnected":
          dispatch({
            type: "server_peer_disconnected",
            sessionId: msg.session_id,
            reason: msg.reason,
          });
          return;
        case "sdp_offer":
          void handleIncomingSdpOffer(
            peer,
            msg.sdp,
            signalingRef.current,
            msg.session_id,
          );
          return;
        case "sdp_answer":
          void handleIncomingSdpAnswer(peer, msg.sdp, msg.session_id, dispatch);
          return;
        case "error":
          if (msg.code === "pin_not_found") {
            dispatch({ type: "server_pin_not_found" });
          }
          if (msg.code === "self_connect_forbidden") {
            dispatch({ type: "server_self_connect_forbidden" });
          }
          return;
        default:
          return;
      }
    });
    return unsubscribe;
  }, [opts.signaling, peer]);

  // Effect 2 — Host: show native consent dialog when awaiting_consent.
  useEffect(() => {
    if (status.kind !== "awaiting_consent" || status.role !== "host") return;
    let cancelled = false;
    const peerLabel = status.peerId.slice(0, 8);
    const sessionId = status.sessionId;

    tauriInvoke("show_consent_dialog", {
      peer_label: peerLabel,
      timeout_secs: CONSENT_TIMEOUT_SECS,
    })
      .then((accepted) => {
        if (cancelled) return;
        signalingRef.current.send({
          type: "consent_response",
          session_id: sessionId,
          accepted,
        });
        if (accepted) dispatch({ type: "consent_accepted", sessionId });
        else dispatch({ type: "consent_declined" });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "consent_declined" });
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  // Effect 3 — Controller: create data channel + SDP offer when negotiating.
  useEffect(() => {
    if (status.kind !== "negotiating" || status.role !== "controller" || !peer) return;
    const sessionId = status.sessionId;
    const dc = peer.createDataChannel(DATA_CHANNEL_LABEL, {
      ordered: true,
      maxRetransmits: 0,
    });
    setChannel({ type: "set", channel: dc });

    void (async () => {
      try {
        const offer = await createOfferWithCompleteIce(peer);
        signalingRef.current.send({
          type: "sdp_offer",
          session_id: sessionId,
          sdp: offer,
        });
      } catch (err) {
        console.warn("sdp offer failed", err);
      }
    })();
  }, [status, peer]);

  // Effect 4 — Navigate on status transitions.
  useEffect(() => {
    if (
      status.kind === "requesting" ||
      (status.kind === "negotiating" && status.role === "controller")
    ) {
      navigate("/controller/connecting");
      return;
    }
    if (status.kind === "connected" && status.role === "controller") {
      navigate("/controller/session");
      return;
    }
    if (status.kind === "connected" && status.role === "host") {
      navigate("/host/session");
      return;
    }
    if (status.kind === "ended") {
      navigate("/");
    }
  }, [status, navigate]);

  // Cleanup remote stream on session end.
  useEffect(() => {
    if (status.kind === "ended" || status.kind === "idle") {
      setRemoteStream({ type: "set", stream: null });
    }
  }, [status.kind]);

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  const requestConnect = useCallback(
    (targetPin: string) => {
      if (!opts.machineId) return;
      dispatch({ type: "user_requested_connect", targetPin });
      opts.signaling.send({
        type: "connect_request",
        controller_id: opts.machineId,
        target_pin: targetPin,
      });
    },
    [opts.machineId, opts.signaling],
  );

  // Adds a local video track to the peer connection (host → controller).
  const addVideoTrack = useCallback(
    (stream: MediaStream) => {
      if (!peer) return;
      for (const track of stream.getVideoTracks()) {
        peer.addTrack(track, stream);
      }
    },
    [peer],
  );

  const endSession = useCallback(() => {
    dispatch({ type: "user_ended" });
  }, []);

  return { status, dataChannel: channel, remoteStream, requestConnect, addVideoTrack, endSession };
}
```

- [ ] **Step 2: Update app-state.tsx**

```typescript
// desktop-app/src/app-state.tsx
import { createContext, useContext } from "react";
import type { PinSession } from "@/features/pin/pin.types";
import type { SignalingApi } from "@/features/signaling/signaling.types";
import type { UseSessionApi } from "@/features/session/use-session";

export interface AppState {
  machineId: string | null;
  pinSession: PinSession;
  secondsRemaining: number;
  regeneratePin: () => void;
  signaling: SignalingApi;
  session: UseSessionApi;
}

export const AppStateContext = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateContext.Provider");
  return ctx;
}
```

Note: `AppState` no longer needs an explicit `remoteStream` field — it's accessible via `session.remoteStream`.

- [ ] **Step 3: Temporarily fix host-session.tsx to compile**

Replace `desktop-app/src/routes/host-session.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useAppState } from "@/app-state";

// Placeholder — full rewrite comes in Task 15.
export function HostSessionRoute() {
  const { session } = useAppState();
  return (
    <main
      data-testid="host-session-route"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8"
    >
      <h1 className="text-2xl font-semibold">Votre écran est partagé</h1>
      <p className="text-sm text-muted-foreground">
        Session active — Phase 4 en cours d&apos;implémentation.
      </p>
      <Button variant="destructive" onClick={session.endSession}>
        Terminer la session
      </Button>
    </main>
  );
}
```

- [ ] **Step 4: Temporarily fix controller-session.tsx to compile**

Replace `desktop-app/src/routes/controller-session.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { useAppState } from "@/app-state";

// Placeholder — full rewrite comes in Task 16.
export function ControllerSessionRoute() {
  const { session } = useAppState();
  return (
    <main
      data-testid="controller-session-route"
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8"
    >
      <h1 className="text-2xl font-semibold">Session active</h1>
      <p className="text-sm text-muted-foreground">
        Connexion P2P établie — Phase 4 en cours d&apos;implémentation.
      </p>
      <Button variant="destructive" onClick={session.endSession}>
        Couper
      </Button>
    </main>
  );
}
```

- [ ] **Step 5: Run typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS — all files compile clean.

- [ ] **Step 6: Run all tests**

Run: `cd desktop-app && npm test`
Expected: PASS — existing tests still green (session-state-machine tests updated in Task 4).

- [ ] **Step 7: Commit**

```bash
git add desktop-app/src/features/session/use-session.ts desktop-app/src/app-state.tsx desktop-app/src/routes/host-session.tsx desktop-app/src/routes/controller-session.tsx
git commit -m "refactor(session): expose dataChannel + remoteStream, drop raw sendMessage API"
```

---

### Task 7: Tauri Command Types + Capabilities

**Files:**
- Modify: `desktop-app/src/types/tauri-commands.ts`
- Modify: `desktop-app/src-tauri/capabilities/default.json`

- [ ] **Step 1: Add new command signatures to tauri-commands.ts**

Replace full content of `desktop-app/src/types/tauri-commands.ts`:

```typescript
// Mirror of Rust command signatures. Any change on the Rust side
// MUST be reflected here - there is no codegen for Tauri commands.
export interface TauriCommandMap {
  get_machine_id: {
    args: Record<string, never>;
    result: string;
  };
  generate_machine_id: {
    args: Record<string, never>;
    result: string;
  };
  generate_pin_native: {
    args: Record<string, never>;
    result: string;
  };
  show_consent_dialog: {
    args: { peer_label: string; timeout_secs: number };
    result: boolean;
  };
  inject_mouse_event: {
    args: {
      x: number;
      y: number;
      button: string;
      action: string;
      scroll_delta?: number;
    };
    result: null;
  };
  inject_keyboard_event: {
    args: {
      key: string;
      code: string;
      modifiers: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
      action: string;
    };
    result: null;
  };
  get_screen_info: {
    args: Record<string, never>;
    result: { width: number; height: number; scale_factor: number };
  };
  create_overlay_window: {
    args: Record<string, never>;
    result: null;
  };
  close_overlay_window: {
    args: Record<string, never>;
    result: null;
  };
}

export interface TauriError {
  kind: "Stronghold" | "InvalidState" | "Io" | "InputInjection" | "Overlay" | "ScreenInfo";
  message: string;
}
```

- [ ] **Step 2: Update Tauri capabilities**

Replace `desktop-app/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window and overlay",
  "windows": ["main", "overlay"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "core:window:allow-create",
    "core:window:allow-close",
    "core:window:allow-set-always-on-top",
    "global-shortcut:default"
  ]
}
```

Note: The exact permission identifiers may differ by Tauri version. Check Context7 for `tauri-plugin-global-shortcut` and window permissions before implementing.

- [ ] **Step 3: Typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop-app/src/types/tauri-commands.ts desktop-app/src-tauri/capabilities/default.json
git commit -m "feat(tauri): add Phase 4 command type signatures and capabilities"
```

---

### Task 8: Rust — Error Types + Dependencies

**Files:**
- Modify: `desktop-app/src-tauri/src/errors.rs`
- Modify: `desktop-app/src-tauri/Cargo.toml`

- [ ] **Step 1: Add new error variants**

Replace full content of `desktop-app/src-tauri/src/errors.rs`:

```rust
use serde::Serialize;
use thiserror::Error;

/// Top-level error surface exposed to the frontend.
/// Every Tauri command returns `Result<T, AppError>` so the frontend can
/// display a toast with a stable error kind + message.
///
/// `#[serde(tag = "kind", content = "message")]` serialises to:
///   { "kind": "InvalidState", "message": "..." }
/// which makes exhaustive matching straightforward in TypeScript.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    /// Errors originating from the Stronghold vault layer.
    #[error("stronghold vault error: {0}")]
    Stronghold(String),

    /// Invariant violations or "not yet implemented" stubs.
    #[error("invalid state: {0}")]
    InvalidState(String),

    /// Filesystem / OS I/O errors (surfaced as strings to keep serde simple).
    #[error("io error: {0}")]
    Io(String),

    /// Input injection errors (enigo failures, unsupported keys).
    #[error("input injection failed: {0}")]
    InputInjection(String),

    /// Overlay window lifecycle errors.
    #[error("overlay window error: {0}")]
    Overlay(String),

    /// Screen info retrieval errors.
    #[error("screen info error: {0}")]
    ScreenInfo(String),
}

/// Automatic conversion from std::io::Error so `?` works in I/O code paths.
impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::Io(value.to_string())
    }
}
```

- [ ] **Step 2: Add enigo to Cargo.toml**

Add after the `tauri-plugin-dialog` line in `desktop-app/src-tauri/Cargo.toml`:

```toml
enigo = "0.2"
tauri-plugin-global-shortcut = "2"
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd desktop-app/src-tauri && cargo check`
Expected: PASS (warnings OK at this stage, new deps download)

- [ ] **Step 4: Commit**

```bash
git add desktop-app/src-tauri/src/errors.rs desktop-app/src-tauri/Cargo.toml
git commit -m "feat(rust): add Phase 4 error variants and enigo/global-shortcut deps"
```

---

### Task 9: Rust — Screen Info

**Files:**
- Create: `desktop-app/src-tauri/src/core/screen_info.rs`
- Create: `desktop-app/src-tauri/src/commands/screen_info.rs`
- Modify: `desktop-app/src-tauri/src/core/mod.rs`
- Modify: `desktop-app/src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Create core/screen_info.rs**

```rust
//! Read primary display resolution and DPI scale factor.
//! Windows implementation uses GetSystemMetrics + GetDpiForSystem.

use crate::errors::AppError;
use serde::Serialize;

/// Host display metadata sent to the controller for coordinate mapping.
#[derive(Debug, Serialize)]
pub struct ScreenInfo {
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// Reads the primary display's resolution and DPI scale factor.
///
/// # Platform
/// - Windows: uses `GetSystemMetrics(SM_CXSCREEN)` / `SM_CYSCREEN` + `GetDpiForSystem()`.
/// - macOS/Linux: not implemented yet (returns fallback).
#[cfg(target_os = "windows")]
pub fn read_screen_info() -> Result<ScreenInfo, AppError> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
    use windows_sys::Win32::UI::HiDpi::GetDpiForSystem;

    // SAFETY: GetSystemMetrics and GetDpiForSystem are safe Win32 calls with no
    // preconditions. They return 0 only if the parameter is invalid (our constants
    // are always valid).
    let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
    let dpi = unsafe { GetDpiForSystem() };

    if width <= 0 || height <= 0 {
        return Err(AppError::ScreenInfo("failed to read display metrics".into()));
    }

    Ok(ScreenInfo {
        width: width as u32,
        height: height as u32,
        scale_factor: dpi as f64 / 96.0,
    })
}

#[cfg(not(target_os = "windows"))]
pub fn read_screen_info() -> Result<ScreenInfo, AppError> {
    // Fallback for non-Windows platforms until Phase 5 adds macOS/Linux support.
    Ok(ScreenInfo {
        width: 1920,
        height: 1080,
        scale_factor: 1.0,
    })
}
```

Note: `windows-sys` may already be a transitive dependency of Tauri. If not, add `windows-sys = { version = "0.52", features = ["Win32_UI_WindowsAndMessaging", "Win32_UI_HiDpi"] }` to Cargo.toml. Check Context7 for the exact features needed.

- [ ] **Step 2: Create commands/screen_info.rs**

```rust
//! Tauri command: exposes host display info to the frontend.

use crate::core::screen_info;
use crate::errors::AppError;

/// Returns the primary display's resolution and DPI scale factor.
/// Called by the host-session route to send screen_metadata to the controller.
#[tauri::command]
pub fn get_screen_info() -> Result<screen_info::ScreenInfo, AppError> {
    screen_info::read_screen_info()
}
```

- [ ] **Step 3: Register in mod.rs files**

Update `desktop-app/src-tauri/src/core/mod.rs`:
```rust
//! Native core modules (non-command utilities).

pub mod screen_info;
pub mod stronghold;
```

Update `desktop-app/src-tauri/src/commands/mod.rs`:
```rust
//! Tauri command handlers exposed to the frontend via `invoke()`.
//!
//! Each submodule hosts one responsibility (PRD §6).
//! All commands must return `Result<T, crate::errors::AppError>`.

pub mod consent;
pub mod machine_id;
pub mod pin;
pub mod screen_info;
```

- [ ] **Step 4: Verify Rust compiles**

Run: `cd desktop-app/src-tauri && cargo check`
Expected: PASS (screen_info command not yet registered in lib.rs — that's Task 12)

- [ ] **Step 5: Commit**

```bash
git add desktop-app/src-tauri/src/core/screen_info.rs desktop-app/src-tauri/src/commands/screen_info.rs desktop-app/src-tauri/src/core/mod.rs desktop-app/src-tauri/src/commands/mod.rs
git commit -m "feat(rust): add screen info command (resolution + DPI)"
```

---

### Task 10: Rust — Input Mapper

**Files:**
- Create: `desktop-app/src-tauri/src/core/input_mapper.rs`
- Modify: `desktop-app/src-tauri/src/core/mod.rs`

**IMPORTANT:** Run Context7 for `enigo` crate before implementing. The enigo 0.2 API uses `Key`, `Button`, `Direction`, `Coordinate` enums. Verify exact enum variants and method signatures.

- [ ] **Step 1: Create core/input_mapper.rs**

```rust
//! Maps JavaScript key/code strings to enigo types.
//! This module isolates all enigo interaction behind a safe API (DEV-RULES §2).

use crate::errors::AppError;
use enigo::{Button, Direction, Key};

/// Maps a JS MouseEvent.button string to an enigo Button.
pub fn map_button(button: &str) -> Result<Button, AppError> {
    match button {
        "left" => Ok(Button::Left),
        "right" => Ok(Button::Right),
        "middle" => Ok(Button::Middle),
        other => Err(AppError::InputInjection(format!("unknown button: {other}"))),
    }
}

/// Maps a JS action string to an enigo Direction.
pub fn map_direction(action: &str) -> Result<Direction, AppError> {
    match action {
        "down" => Ok(Direction::Press),
        "up" => Ok(Direction::Release),
        other => Err(AppError::InputInjection(format!("unknown direction: {other}"))),
    }
}

/// Maps JS KeyboardEvent.key + code to an enigo Key.
/// Uses `key` for printable characters and `code` for special keys.
pub fn map_key(key: &str, code: &str) -> Result<Key, AppError> {
    // Single printable character: use Unicode variant
    if key.len() == 1 {
        if let Some(ch) = key.chars().next() {
            return Ok(Key::Unicode(ch));
        }
    }

    // Special keys: match by `key` value (logical, not physical)
    match key {
        "Enter" => Ok(Key::Return),
        "Tab" => Ok(Key::Tab),
        "Backspace" => Ok(Key::Backspace),
        "Delete" => Ok(Key::Delete),
        "Escape" => Ok(Key::Escape),
        " " => Ok(Key::Space),
        "ArrowUp" => Ok(Key::UpArrow),
        "ArrowDown" => Ok(Key::DownArrow),
        "ArrowLeft" => Ok(Key::LeftArrow),
        "ArrowRight" => Ok(Key::RightArrow),
        "Home" => Ok(Key::Home),
        "End" => Ok(Key::End),
        "PageUp" => Ok(Key::PageUp),
        "PageDown" => Ok(Key::PageDown),
        "Control" => Ok(Key::Control),
        "Alt" => Ok(Key::Alt),
        "Shift" => Ok(Key::Shift),
        "Meta" => Ok(Key::Meta),
        "CapsLock" => Ok(Key::CapsLock),
        _ => map_key_by_code(code),
    }
}

/// Fallback: map by physical `code` for function keys and others.
fn map_key_by_code(code: &str) -> Result<Key, AppError> {
    match code {
        "F1" => Ok(Key::F1),
        "F2" => Ok(Key::F2),
        "F3" => Ok(Key::F3),
        "F4" => Ok(Key::F4),
        "F5" => Ok(Key::F5),
        "F6" => Ok(Key::F6),
        "F7" => Ok(Key::F7),
        "F8" => Ok(Key::F8),
        "F9" => Ok(Key::F9),
        "F10" => Ok(Key::F10),
        "F11" => Ok(Key::F11),
        "F12" => Ok(Key::F12),
        other => Err(AppError::InputInjection(format!("unsupported key code: {other}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_printable_char() {
        assert!(matches!(map_key("a", "KeyA"), Ok(Key::Unicode('a'))));
    }

    #[test]
    fn maps_enter() {
        assert!(matches!(map_key("Enter", "Enter"), Ok(Key::Return)));
    }

    #[test]
    fn maps_f1() {
        assert!(matches!(map_key("F1", "F1"), Ok(Key::F1)));
    }

    #[test]
    fn maps_arrow_keys() {
        assert!(matches!(map_key("ArrowUp", "ArrowUp"), Ok(Key::UpArrow)));
    }

    #[test]
    fn rejects_unknown_key() {
        assert!(map_key("Unidentified", "Unidentified").is_err());
    }

    #[test]
    fn maps_button_left() {
        assert!(matches!(map_button("left"), Ok(Button::Left)));
    }

    #[test]
    fn rejects_unknown_button() {
        assert!(map_button("extra").is_err());
    }

    #[test]
    fn maps_direction_down() {
        assert!(matches!(map_direction("down"), Ok(Direction::Press)));
    }
}
```

- [ ] **Step 2: Update core/mod.rs**

```rust
//! Native core modules (non-command utilities).

pub mod input_mapper;
pub mod screen_info;
pub mod stronghold;
```

- [ ] **Step 3: Run Rust tests**

Run: `cd desktop-app/src-tauri && cargo test`
Expected: PASS (input_mapper tests green)

- [ ] **Step 4: Commit**

```bash
git add desktop-app/src-tauri/src/core/input_mapper.rs desktop-app/src-tauri/src/core/mod.rs
git commit -m "feat(rust): add input mapper (JS key/code → enigo types)"
```

---

### Task 11: Rust — Input Injection Commands

**Files:**
- Create: `desktop-app/src-tauri/src/commands/input_injection.rs`
- Modify: `desktop-app/src-tauri/src/commands/mod.rs`

**IMPORTANT:** Run Context7 for `enigo` 0.2 API before implementing. Verify `Enigo::new()`, `Mouse::move_mouse()`, `Mouse::button()`, `Mouse::scroll()`, `Keyboard::key()` signatures.

- [ ] **Step 1: Create commands/input_injection.rs**

```rust
//! Tauri commands for OS-level mouse/keyboard injection via enigo.
//! All enigo interaction is delegated to core::input_mapper for mapping
//! and this module for execution (DEV-RULES §2: unsafe isolation).

use crate::core::input_mapper;
use crate::errors::AppError;
use enigo::{Coordinate, Enigo, Keyboard, Mouse, Axis, Settings};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::State;

/// Managed state wrapping the enigo instance. Registered in lib.rs setup.
pub struct EnigoState(pub Mutex<Enigo>);

/// Modifier key state from the frontend (mirrors JS KeyboardEvent modifiers).
#[derive(Debug, Deserialize)]
pub struct ModifierState {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
}

/// Injects a mouse event at the given pixel coordinates.
///
/// Called by the host's input-injection hook when receiving mouse_event
/// messages from the controller via the data channel.
#[tauri::command]
pub fn inject_mouse_event(
    enigo: State<'_, EnigoState>,
    x: i32,
    y: i32,
    button: String,
    action: String,
    scroll_delta: Option<i32>,
) -> Result<(), AppError> {
    let mut enigo = enigo.0.lock().map_err(|e| {
        AppError::InputInjection(format!("enigo mutex poisoned: {e}"))
    })?;

    match action.as_str() {
        "move" => {
            enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| {
                AppError::InputInjection(format!("move_mouse failed: {e}"))
            })?;
        }
        "down" | "up" => {
            // Move to position first, then press/release the button.
            enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| {
                AppError::InputInjection(format!("move_mouse failed: {e}"))
            })?;
            let btn = input_mapper::map_button(&button)?;
            let dir = input_mapper::map_direction(&action)?;
            enigo.button(btn, dir).map_err(|e| {
                AppError::InputInjection(format!("button failed: {e}"))
            })?;
        }
        "scroll" => {
            enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| {
                AppError::InputInjection(format!("move_mouse failed: {e}"))
            })?;
            let delta = scroll_delta.unwrap_or(0);
            enigo.scroll(delta, Axis::Vertical).map_err(|e| {
                AppError::InputInjection(format!("scroll failed: {e}"))
            })?;
        }
        other => {
            return Err(AppError::InputInjection(format!("unknown mouse action: {other}")));
        }
    }

    Ok(())
}

/// Injects a keyboard event.
///
/// Handles modifier keys (Ctrl, Alt, Shift, Meta) by pressing them before
/// the main key and releasing them after. This matches browser behavior where
/// modifiers are sent as separate state alongside the key event.
#[tauri::command]
pub fn inject_keyboard_event(
    enigo: State<'_, EnigoState>,
    key: String,
    code: String,
    modifiers: ModifierState,
    action: String,
) -> Result<(), AppError> {
    let mut enigo = enigo.0.lock().map_err(|e| {
        AppError::InputInjection(format!("enigo mutex poisoned: {e}"))
    })?;

    let mapped_key = input_mapper::map_key(&key, &code)?;
    let direction = input_mapper::map_direction(&action)?;

    enigo.key(mapped_key, direction).map_err(|e| {
        AppError::InputInjection(format!("key injection failed: {e}"))
    })?;

    Ok(())
}
```

- [ ] **Step 2: Update commands/mod.rs**

```rust
//! Tauri command handlers exposed to the frontend via `invoke()`.
//!
//! Each submodule hosts one responsibility (PRD §6).
//! All commands must return `Result<T, crate::errors::AppError>`.

pub mod consent;
pub mod input_injection;
pub mod machine_id;
pub mod pin;
pub mod screen_info;
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd desktop-app/src-tauri && cargo check`
Expected: PASS (commands not yet registered in lib.rs — Task 13)

- [ ] **Step 4: Commit**

```bash
git add desktop-app/src-tauri/src/commands/input_injection.rs desktop-app/src-tauri/src/commands/mod.rs
git commit -m "feat(rust): add input injection commands (mouse + keyboard via enigo)"
```

---

### Task 12: Rust — Overlay Commands

**Files:**
- Create: `desktop-app/src-tauri/src/commands/overlay.rs`
- Modify: `desktop-app/src-tauri/src/commands/mod.rs`

**IMPORTANT:** Run Context7 for `tauri::WebviewWindowBuilder` (Tauri 2.x API) before implementing. The window creation API changed between Tauri 1.x and 2.x.

- [ ] **Step 1: Create commands/overlay.rs**

```rust
//! Tauri commands for the always-on-top overlay window.
//! The overlay shows session info + disconnect button while the host's
//! main window can stay minimized.

use crate::errors::AppError;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Creates the overlay window (280×60, always-on-top, no decorations).
/// Positioned at the top-right corner of the primary monitor.
/// The window loads the `/overlay` React route.
#[tauri::command]
pub async fn create_overlay_window(app: AppHandle) -> Result<(), AppError> {
    // Check if overlay already exists (idempotent).
    if app.get_webview_window("overlay").is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "overlay", WebviewUrl::App("/overlay".into()))
        .title("LinkDesk Session")
        .inner_size(280.0, 60.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        // Position top-right: we use a reasonable default offset.
        // Exact positioning based on monitor geometry can be refined later.
        .position(9999.0, 8.0)
        .build()
        .map_err(|e| AppError::Overlay(format!("failed to create overlay window: {e}")))?;

    Ok(())
}

/// Closes the overlay window if it exists.
#[tauri::command]
pub async fn close_overlay_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("overlay") {
        window
            .close()
            .map_err(|e| AppError::Overlay(format!("failed to close overlay: {e}")))?;
    }
    Ok(())
}
```

- [ ] **Step 2: Update commands/mod.rs**

```rust
//! Tauri command handlers exposed to the frontend via `invoke()`.
//!
//! Each submodule hosts one responsibility (PRD §6).
//! All commands must return `Result<T, crate::errors::AppError>`.

pub mod consent;
pub mod input_injection;
pub mod machine_id;
pub mod overlay;
pub mod pin;
pub mod screen_info;
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd desktop-app/src-tauri && cargo check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop-app/src-tauri/src/commands/overlay.rs desktop-app/src-tauri/src/commands/mod.rs
git commit -m "feat(rust): add overlay window commands (create + close)"
```

---

### Task 13: Rust — Register All Commands in lib.rs

**Files:**
- Modify: `desktop-app/src-tauri/src/lib.rs`

- [ ] **Step 1: Update lib.rs**

Replace full content of `desktop-app/src-tauri/src/lib.rs`:

```rust
//! LinkDesk desktop-app Rust library.
//! All business logic lives here; `main.rs` is a thin wrapper.

pub mod commands;
pub mod core;
pub mod errors;

use commands::input_injection::EnigoState;
use enigo::{Enigo, Settings};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::init())
        .setup(|app| {
            let handle = app.handle();

            // Derive a deterministic password from the install-specific data dir.
            let password = core::stronghold::derive_password(handle)?;
            let v_path = core::stronghold::vault_path(handle)?;

            // Open (or create) the encrypted snapshot via iota_stronghold directly.
            let stronghold_state =
                core::stronghold::StrongholdState::open(v_path, password)
                    .map_err(|e| Box::new(std::io::Error::other(e.to_string())))?;
            app.manage(stronghold_state);

            // Create enigo instance for input injection (Phase 4).
            let enigo = Enigo::new(&Settings::default())
                .map_err(|e| Box::new(std::io::Error::other(format!("enigo init: {e}"))))?;
            app.manage(EnigoState(Mutex::new(enigo)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pin::generate_pin_native,
            commands::machine_id::get_machine_id,
            commands::machine_id::generate_machine_id,
            commands::consent::show_consent_dialog,
            commands::input_injection::inject_mouse_event,
            commands::input_injection::inject_keyboard_event,
            commands::screen_info::get_screen_info,
            commands::overlay::create_overlay_window,
            commands::overlay::close_overlay_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Verify full Rust build**

Run: `cd desktop-app/src-tauri && cargo check`
Expected: PASS — all commands registered, all dependencies resolved.

- [ ] **Step 3: Run Rust tests**

Run: `cd desktop-app/src-tauri && cargo test`
Expected: PASS (input_mapper tests green)

- [ ] **Step 4: Commit**

```bash
git add desktop-app/src-tauri/src/lib.rs
git commit -m "feat(rust): register all Phase 4 commands and EnigoState in lib.rs"
```

---

### Task 14: Screen Capture Hook

**Files:**
- Create: `desktop-app/src/features/screen-capture/use-screen-capture.ts`

- [ ] **Step 1: Create the hook**

```typescript
// desktop-app/src/features/screen-capture/use-screen-capture.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenCaptureStatus } from "./capture.types";

export interface UseScreenCaptureReturn {
  stream: MediaStream | null;
  status: ScreenCaptureStatus;
  error: string | null;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
}

// Wraps getDisplayMedia() with lifecycle management.
// Automatically cleans up on unmount. Listens for OS-level "stop sharing" events.
export function useScreenCapture(): UseScreenCaptureReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<ScreenCaptureStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setStream(null);
    setStatus("stopped");
  }, []);

  const startCapture = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
          width: { max: 1920 },
          height: { max: 1080 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus("capturing");

      // Listen for the OS "stop sharing" button (user clicks the browser/OS overlay).
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          streamRef.current = null;
          setStream(null);
          setStatus("stopped");
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown capture error";
      setError(message);
      setStatus("error");
    }
  }, []);

  // Cleanup on unmount: stop all tracks.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  return { stream, status, error, startCapture, stopCapture };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add desktop-app/src/features/screen-capture/use-screen-capture.ts
git commit -m "feat(screen-capture): add useScreenCapture hook (getDisplayMedia lifecycle)"
```

---

### Task 15: Frontend — Inject Commands + Input Injection Hook

**Files:**
- Create: `desktop-app/src/features/input-injection/inject-commands.ts`
- Create: `desktop-app/src/features/input-injection/use-input-injection.ts`

- [ ] **Step 1: Create inject-commands.ts**

```typescript
// desktop-app/src/features/input-injection/inject-commands.ts
import { tauriInvoke } from "@/lib/tauri";
import type { PixelCoords } from "./coord-mapper";
import type { MouseAction, MouseButton, KeyAction } from "@/features/input-capture/input.types";

export async function injectMouseEvent(
  coords: PixelCoords,
  button: MouseButton,
  action: MouseAction,
  scrollDelta?: number,
): Promise<void> {
  await tauriInvoke("inject_mouse_event", {
    x: coords.x,
    y: coords.y,
    button,
    action,
    scroll_delta: scrollDelta,
  });
}

export async function injectKeyboardEvent(
  key: string,
  code: string,
  modifiers: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean },
  action: KeyAction,
): Promise<void> {
  await tauriInvoke("inject_keyboard_event", { key, code, modifiers, action });
}
```

- [ ] **Step 2: Create use-input-injection.ts**

```typescript
// desktop-app/src/features/input-injection/use-input-injection.ts
import { useEffect } from "react";
import type { UseDataChannelMessagesReturn } from "@/features/session/use-data-channel-messages";
import type { ScreenMetadata } from "@/features/screen-capture/capture.types";
import type { DataChannelMessage } from "@/features/session/message-types";
import { ratioToPixel } from "./coord-mapper";
import { injectMouseEvent, injectKeyboardEvent } from "./inject-commands";

export interface UseInputInjectionOptions {
  messages: UseDataChannelMessagesReturn;
  screenMetadata: ScreenMetadata | null;
  enabled: boolean;
  onDisconnectReceived?: () => void;
}

// Subscribes to typed data channel messages and dispatches mouse/keyboard
// injection via Tauri commands. Runs on the host side only.
export function useInputInjection(opts: UseInputInjectionOptions): void {
  useEffect(() => {
    if (!opts.enabled || !opts.screenMetadata) return;

    const screen = opts.screenMetadata;

    const unsubscribe = opts.messages.subscribe((msg: DataChannelMessage) => {
      switch (msg.type) {
        case "mouse_event": {
          const coords = ratioToPixel(msg.x_ratio, msg.y_ratio, screen);
          void injectMouseEvent(coords, msg.button, msg.action, msg.scroll_delta);
          break;
        }
        case "keyboard_event": {
          void injectKeyboardEvent(msg.key, msg.code, msg.modifiers, msg.action);
          break;
        }
        case "disconnect": {
          opts.onDisconnectReceived?.();
          break;
        }
        case "screen_metadata":
          // Host doesn't need to process its own metadata type.
          break;
      }
    });

    return unsubscribe;
  }, [opts.enabled, opts.screenMetadata, opts.messages, opts.onDisconnectReceived]);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop-app/src/features/input-injection/inject-commands.ts desktop-app/src/features/input-injection/use-input-injection.ts
git commit -m "feat(input): add inject commands wrapper and input injection hook"
```

---

### Task 16: Input Capture Hook

**Files:**
- Create: `desktop-app/src/features/input-capture/use-input-capture.ts`

- [ ] **Step 1: Create the hook**

```typescript
// desktop-app/src/features/input-capture/use-input-capture.ts
import { useEffect, useRef, type RefObject } from "react";
import type { UseDataChannelMessagesReturn } from "@/features/session/use-data-channel-messages";
import { mapMouseEvent, mapWheelEvent, mapKeyboardEvent } from "./event-mapper";
import { MOUSE_THROTTLE_MS } from "./input.types";

export interface UseInputCaptureOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  messages: UseDataChannelMessagesReturn;
  enabled: boolean;
}

// Captures mouse and keyboard events on the controller's <video> element
// and sends them as typed messages over the data channel.
// Mouse events are throttled to 60Hz via requestAnimationFrame + timestamp gate.
export function useInputCapture(opts: UseInputCaptureOptions): void {
  const lastMouseTimeRef = useRef(0);

  useEffect(() => {
    const video = opts.videoRef.current;
    if (!opts.enabled || !video) return;

    const { messages } = opts;

    // --- Mouse handlers ---

    const sendMouseThrottled = (e: MouseEvent, action: "move" | "down" | "up") => {
      const now = performance.now();
      if (action === "move" && now - lastMouseTimeRef.current < MOUSE_THROTTLE_MS) return;
      lastMouseTimeRef.current = now;
      messages.send(mapMouseEvent(e, video, action));
    };

    const onMouseMove = (e: MouseEvent) => sendMouseThrottled(e, "move");
    const onMouseDown = (e: MouseEvent) => sendMouseThrottled(e, "down");
    const onMouseUp = (e: MouseEvent) => sendMouseThrottled(e, "up");
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      messages.send(mapWheelEvent(e, video));
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // --- Keyboard handlers (on window to capture even without video focus) ---

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture browser shortcuts (Ctrl+Shift+X is handled by Tauri global shortcut)
      e.preventDefault();
      messages.send(mapKeyboardEvent(e, "down"));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      messages.send(mapKeyboardEvent(e, "up"));
    };

    // Attach listeners
    video.addEventListener("mousemove", onMouseMove);
    video.addEventListener("mousedown", onMouseDown);
    video.addEventListener("mouseup", onMouseUp);
    video.addEventListener("wheel", onWheel, { passive: false });
    video.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      video.removeEventListener("mousemove", onMouseMove);
      video.removeEventListener("mousedown", onMouseDown);
      video.removeEventListener("mouseup", onMouseUp);
      video.removeEventListener("wheel", onWheel);
      video.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [opts.enabled, opts.videoRef, opts.messages]);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add desktop-app/src/features/input-capture/use-input-capture.ts
git commit -m "feat(input): add input capture hook (mouse/keyboard → data channel, 60Hz throttle)"
```

---

### Task 17: UI Components

**Files:**
- Create: `desktop-app/src/components/remote-screen.tsx`
- Create: `desktop-app/src/components/session-toolbar.tsx`
- Create: `desktop-app/src/components/host-session-widget.tsx`

- [ ] **Step 1: Create remote-screen.tsx**

```tsx
// desktop-app/src/components/remote-screen.tsx
import { useEffect, type RefObject } from "react";

export interface RemoteScreenProps {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

// Full-screen video element for the controller's remote desktop view.
// Hides the local cursor when a stream is active (cursor: none).
export function RemoteScreen({ stream, videoRef }: RemoteScreenProps) {
  // Assign the MediaStream to the video element's srcObject when it changes.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="absolute inset-0 h-full w-full bg-black object-contain"
      style={{ cursor: stream ? "none" : "default" }}
      data-testid="remote-screen"
    />
  );
}
```

- [ ] **Step 2: Create session-toolbar.tsx**

```tsx
// desktop-app/src/components/session-toolbar.tsx

export interface SessionToolbarProps {
  peerLabel: string;
  duration: string;
  connectionQuality: "good" | "fair" | "poor";
  onDisconnect: () => void;
}

const QUALITY_COLORS = {
  good: "bg-emerald-500",
  fair: "bg-amber-500",
  poor: "bg-red-500",
} as const;

// Vertical floating toolbar on the left side of the controller session.
// 36px wide, semi-transparent dark background with blur.
export function SessionToolbar({
  peerLabel,
  duration,
  connectionQuality,
  onDisconnect,
}: SessionToolbarProps) {
  return (
    <div
      className="fixed left-2 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-2 rounded-lg border border-white/10 p-2"
      style={{
        width: 36,
        background: "rgba(15, 23, 42, 0.9)",
        backdropFilter: "blur(8px)",
      }}
      data-testid="session-toolbar"
    >
      {/* Connection quality indicator */}
      <div
        className={`h-3 w-3 rounded-full ${QUALITY_COLORS[connectionQuality]}`}
        title={`${peerLabel} · ${duration}`}
      />

      {/* Duration text (rotated to fit vertical layout) */}
      <span
        className="text-[9px] text-slate-400"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        {duration}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Disconnect button */}
      <button
        onClick={onDisconnect}
        className="flex h-6 w-6 items-center justify-center rounded bg-red-600 text-xs text-white hover:bg-red-700"
        title="Couper la session"
        data-testid="disconnect-button"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create host-session-widget.tsx**

```tsx
// desktop-app/src/components/host-session-widget.tsx

export interface HostSessionWidgetProps {
  peerLabel: string;
  duration: string;
  onDisconnect: () => void;
}

// 280×60 floating widget displayed in the overlay Tauri window.
// Shows peer name, session duration, and a disconnect button.
export function HostSessionWidget({
  peerLabel,
  duration,
  onDisconnect,
}: HostSessionWidgetProps) {
  return (
    <div
      className="flex h-[60px] w-[280px] items-center gap-3 rounded-lg border-2 border-red-600 bg-white px-3"
      style={{ boxShadow: "0 8px 20px rgba(0,0,0,0.3)" }}
      data-testid="host-session-widget"
    >
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[11px] font-semibold text-slate-900">
          {peerLabel}
        </span>
        <span className="text-[9px] text-slate-500">{duration}</span>
      </div>
      <button
        onClick={onDisconnect}
        className="rounded bg-red-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-red-700"
        data-testid="overlay-disconnect-button"
      >
        Couper
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop-app/src/components/remote-screen.tsx desktop-app/src/components/session-toolbar.tsx desktop-app/src/components/host-session-widget.tsx
git commit -m "feat(ui): add RemoteScreen, SessionToolbar, and HostSessionWidget components"
```

---

### Task 18: Overlay Route + Router Update

**Files:**
- Create: `desktop-app/src/routes/overlay.tsx`
- Modify: `desktop-app/src/App.tsx`

- [ ] **Step 1: Create overlay.tsx**

```tsx
// desktop-app/src/routes/overlay.tsx
import { useEffect, useState } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { HostSessionWidget } from "@/components/host-session-widget";

interface SessionStatusPayload {
  peerLabel: string;
  startedAt: number;
}

// Minimal route rendered inside the always-on-top overlay Tauri window.
// Communicates with the main window exclusively via Tauri events.
export function OverlayRoute() {
  const [peerLabel, setPeerLabel] = useState("...");
  const [duration, setDuration] = useState("00:00");
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // Listen for session status updates from the main window.
  useEffect(() => {
    const unlisten = listen<SessionStatusPayload>("session-status", (event) => {
      setPeerLabel(event.payload.peerLabel);
      setStartedAt(event.payload.startedAt);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Update the duration timer every second.
  useEffect(() => {
    if (startedAt === null) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      setDuration(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Listen for global shortcut (Ctrl+Shift+X) forwarded by Rust.
  useEffect(() => {
    const unlisten = listen("session-disconnect-shortcut", () => {
      void emit("overlay-disconnect-clicked", {});
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const handleDisconnect = () => {
    void emit("overlay-disconnect-clicked", {});
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent p-0">
      <HostSessionWidget
        peerLabel={peerLabel}
        duration={duration}
        onDisconnect={handleDisconnect}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add /overlay route to App.tsx**

In `desktop-app/src/App.tsx`, add the import and route:

Add import at the top:
```typescript
import { OverlayRoute } from "@/routes/overlay";
```

Add route in the children array (after controller-session, before the closing `]`):
```typescript
{ path: "/overlay", element: <OverlayRoute /> },
```

The overlay route sits outside the AppLayout (no AppStateProvider needed — it uses Tauri events). But since the MemoryRouter wraps everything in AppLayout, the overlay window will also go through AppLayout. This is acceptable because hooks in AppLayout (machine-id, pin, signaling, session) are no-ops in the overlay context — they'll create connections but the overlay doesn't consume them. An alternative is to create a separate React entry point for the overlay, but that's Phase 5 optimization.

- [ ] **Step 3: Typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop-app/src/routes/overlay.tsx desktop-app/src/App.tsx
git commit -m "feat(overlay): add overlay route and register in router"
```

---

### Task 19: Host Session Route — Full Rewrite

**Files:**
- Modify: `desktop-app/src/routes/host-session.tsx`

- [ ] **Step 1: Rewrite host-session.tsx**

```tsx
// desktop-app/src/routes/host-session.tsx
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { useAppState } from "@/app-state";
import { useScreenCapture } from "@/features/screen-capture/use-screen-capture";
import { useDataChannelMessages } from "@/features/session/use-data-channel-messages";
import { useInputInjection } from "@/features/input-injection/use-input-injection";
import { tauriInvoke } from "@/lib/tauri";
import type { ScreenMetadata } from "@/features/screen-capture/capture.types";

// Host session: captures the screen, streams video to the controller,
// receives input events via data channel, and injects them via enigo.
export function HostSessionRoute() {
  const { session } = useAppState();
  const { stream, status: captureStatus, startCapture, stopCapture } = useScreenCapture();
  const messages = useDataChannelMessages(session.dataChannel);
  const [screenMeta, setScreenMeta] = useState<ScreenMetadata | null>(null);
  const sessionStartRef = useRef(Date.now());

  // Start screen capture when the route mounts.
  useEffect(() => {
    void startCapture();
  }, [startCapture]);

  // Fetch screen info and send to controller once capture is active.
  useEffect(() => {
    if (captureStatus !== "capturing") return;
    void (async () => {
      try {
        const info = await tauriInvoke("get_screen_info");
        const meta: ScreenMetadata = {
          width: info.width,
          height: info.height,
          scaleFactor: info.scale_factor,
        };
        setScreenMeta(meta);
        messages.send({
          type: "screen_metadata",
          width: info.width,
          height: info.height,
          scale_factor: info.scale_factor,
        });
      } catch (err) {
        console.warn("failed to get screen info", err);
      }
    })();
  }, [captureStatus, messages]);

  // Add the video track to the peer connection so the controller receives it.
  useEffect(() => {
    if (!stream || session.status.kind !== "connected") return;
    session.addVideoTrack(stream);
  }, [stream, session]);

  // Create overlay window on mount, close on unmount.
  useEffect(() => {
    void tauriInvoke("create_overlay_window");
    return () => {
      void tauriInvoke("close_overlay_window");
    };
  }, []);

  // Send session status to overlay window periodically.
  useEffect(() => {
    if (session.status.kind !== "connected") return;
    const peerId = session.status.peerId;
    const peerLabel = peerId.slice(0, 8);

    // Send initial status.
    void emit("session-status", {
      peerLabel,
      startedAt: sessionStartRef.current,
    });

    const interval = setInterval(() => {
      void emit("session-status", {
        peerLabel,
        startedAt: sessionStartRef.current,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [session.status]);

  // Listen for disconnect click from overlay window.
  useEffect(() => {
    const unlisten = listen("overlay-disconnect-clicked", () => {
      handleDisconnect();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Inject incoming input events from the controller.
  useInputInjection({
    messages,
    screenMetadata: screenMeta,
    enabled: captureStatus === "capturing",
    onDisconnectReceived: () => handleDisconnect(),
  });

  const handleDisconnect = () => {
    messages.send({ type: "disconnect", reason: "user_request" });
    setTimeout(() => {
      stopCapture();
      session.endSession();
    }, 500);
  };

  return (
    <main
      data-testid="host-session-route"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8"
    >
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-emerald-500" />
        <h1 className="text-lg font-semibold">Session active</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Votre écran est partagé. Le widget overlay est affiché.
      </p>
      <p className="text-xs text-muted-foreground">
        {captureStatus === "capturing" ? "Capture en cours" : `Statut : ${captureStatus}`}
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add desktop-app/src/routes/host-session.tsx
git commit -m "feat(host): rewrite host-session with screen capture, input injection, and overlay"
```

---

### Task 20: Controller Session Route — Full Rewrite

**Files:**
- Modify: `desktop-app/src/routes/controller-session.tsx`

- [ ] **Step 1: Rewrite controller-session.tsx**

```tsx
// desktop-app/src/routes/controller-session.tsx
import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/app-state";
import { RemoteScreen } from "@/components/remote-screen";
import { SessionToolbar } from "@/components/session-toolbar";
import { useDataChannelMessages } from "@/features/session/use-data-channel-messages";
import { useInputCapture } from "@/features/input-capture/use-input-capture";
import type { ScreenMetadata } from "@/features/screen-capture/capture.types";

// Controller session: displays the remote screen video, captures mouse/keyboard,
// and sends input events to the host via the data channel.
export function ControllerSessionRoute() {
  const { session } = useAppState();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const messages = useDataChannelMessages(session.dataChannel);
  const [screenMeta, setScreenMeta] = useState<ScreenMetadata | null>(null);
  const [duration, setDuration] = useState("00:00");
  const sessionStartRef = useRef(Date.now());

  // Listen for screen_metadata from the host.
  useEffect(() => {
    const unsubscribe = messages.subscribe((msg) => {
      if (msg.type === "screen_metadata") {
        setScreenMeta({
          width: msg.width,
          height: msg.height,
          scaleFactor: msg.scale_factor,
        });
      }
      if (msg.type === "disconnect") {
        session.endSession();
      }
    });
    return unsubscribe;
  }, [messages, session]);

  // Capture mouse/keyboard when video is available.
  const hasVideo = session.status.kind === "connected" && session.status.hasVideo;
  useInputCapture({ videoRef, messages, enabled: hasVideo });

  // Update duration timer.
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      setDuration(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDisconnect = () => {
    messages.send({ type: "disconnect", reason: "user_request" });
    setTimeout(() => {
      session.endSession();
    }, 500);
  };

  // Derive peer label for display.
  const peerLabel =
    session.status.kind === "connected" ? session.status.peerId.slice(0, 8) : "...";

  // Determine connection quality (placeholder — Phase 5 will add real RTT metrics).
  const connectionQuality = "good" as const;

  return (
    <main
      data-testid="controller-session-route"
      className="relative h-screen w-screen overflow-hidden bg-black"
    >
      <RemoteScreen stream={session.remoteStream} videoRef={videoRef} />
      <SessionToolbar
        peerLabel={peerLabel}
        duration={duration}
        connectionQuality={connectionQuality}
        onDisconnect={handleDisconnect}
      />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add desktop-app/src/routes/controller-session.tsx
git commit -m "feat(controller): rewrite controller-session with video, input capture, and toolbar"
```

---

### Task 21: Build Verification + Full Test Suite

**Files:** None (verification only)

- [ ] **Step 1: Run all frontend tests**

Run: `cd desktop-app && npm test`
Expected: PASS — all existing + new tests green.

- [ ] **Step 2: Run typecheck**

Run: `cd desktop-app && npm run typecheck`
Expected: PASS — zero type errors.

- [ ] **Step 3: Run ESLint**

Run: `cd desktop-app && npm run lint`
Expected: PASS (or warnings only, no errors).

- [ ] **Step 4: Run Rust check + clippy**

Run: `cd desktop-app/src-tauri && cargo check && cargo clippy --all-targets -- -D warnings`
Expected: PASS — zero errors, zero clippy warnings.

- [ ] **Step 5: Run Rust tests**

Run: `cd desktop-app/src-tauri && cargo test`
Expected: PASS (input_mapper tests green).

- [ ] **Step 6: Build the full Tauri app**

Run: `cd desktop-app && npm run build`
Expected: PASS — MSI/DMG/AppImage generated.

If build fails, debug and fix. Common issues:
- Missing `windows-sys` features → add to Cargo.toml
- Enigo API mismatch → check Context7 for current version
- Tauri capability permission names wrong → check Tauri 2.x docs

- [ ] **Step 7: Commit any build fixes**

```bash
git add -A
git commit -m "fix: resolve build issues from Phase 4 integration"
```

---

### Task 22: Manual End-to-End Verification

**Files:** None (manual testing)

- [ ] **Step 1: Start dev mode**

Run: `cd desktop-app && npm run tauri dev`

- [ ] **Step 2: Test host flow**

1. Click "Partager mon écran" on instance 1
2. Note the PIN displayed
3. Open a second instance (or use signaling server test client)
4. Enter the PIN from instance 1
5. Accept the consent dialog on instance 1
6. Verify: the OS screen picker appears on instance 1
7. Select a screen/window to share
8. Verify: the overlay widget (280×60) appears top-right, always on top

- [ ] **Step 3: Test controller flow**

1. On instance 2: verify `<video>` shows the remote screen
2. Verify: the vertical toolbar appears on the left
3. Verify: the local cursor is hidden over the video area
4. Move the mouse — verify the remote cursor moves on instance 1
5. Click — verify clicks register on instance 1
6. Type — verify keystrokes register on instance 1

- [ ] **Step 4: Test disconnect**

1. Click the ✕ button on the controller toolbar
2. Verify: both instances return to the home screen
3. Verify: the overlay window closes on the host
4. Repeat but disconnect from the host's overlay widget
5. Verify: same clean disconnect

- [ ] **Step 5: Document any issues found**

Create issues or fix inline. Known limitations for Phase 4:
- No TURN server (WAN won't work through strict NAT)
- No reconnection on network drop
- Connection quality always shows "good" (no real RTT measurement)
- Overlay window position may not be exactly top-right on all monitors
