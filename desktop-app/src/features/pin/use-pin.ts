import { useCallback, useEffect, useState } from "react";
import { generatePin } from "./pin-generator";
import {
  DEFAULT_PIN_ROTATION_MS,
  type PinRotationConfig,
  type PinSession,
} from "./pin.types";

interface UsePinReturn {
  session: PinSession;
  secondsRemaining: number;
  regenerate: () => void;
}

// Manages the rotating PIN lifecycle:
// - Generates a PIN on mount.
// - Rotates automatically every `rotationIntervalMs` (default 30 min).
// - Exposes a 1Hz countdown for the UI (see PinTimer component).
// - regenerate() invalidates the current PIN and starts a new rotation cycle.
export function usePin(
  config: Partial<PinRotationConfig> = {},
): UsePinReturn {
  const rotationMs = config.rotationIntervalMs ?? DEFAULT_PIN_ROTATION_MS;

  const [session, setSession] = useState<PinSession>(() => createSession(rotationMs));
  // `now` is a 1Hz-ticking timestamp used to derive secondsRemaining during render.
  // Keeping a single setState (in the interval callback only) keeps us clear of the
  // react-hooks/set-state-in-effect rule while ensuring the derived countdown is
  // always computed against the freshest session.expiresAt (no stale 1s window).
  const [now, setNow] = useState(() => Date.now());
  const secondsRemaining = secondsUntil(session.expiresAt, now);

  // 1Hz tick - drives the PinTimer progress display via `now`.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Rotation scheduler - schedules a single timeout for the current session.
  // When it fires, we generate a new session, which triggers a re-render and
  // this effect reschedules for the next rotation.
  useEffect(() => {
    const delay = Math.max(0, session.expiresAt.getTime() - Date.now());
    const id = window.setTimeout(() => {
      setSession(createSession(rotationMs));
    }, delay);
    return () => window.clearTimeout(id);
  }, [session.expiresAt, rotationMs]);

  const regenerate = useCallback(() => {
    // Re-seed `now` so the derived secondsRemaining immediately reflects the
    // full interval instead of waiting up to 1s for the next tick.
    setNow(Date.now());
    setSession(createSession(rotationMs));
  }, [rotationMs]);

  return { session, secondsRemaining, regenerate };
}

function createSession(rotationMs: number): PinSession {
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + rotationMs);
  return { pin: generatePin(), generatedAt, expiresAt };
}

function secondsUntil(date: Date, nowMs: number): number {
  return Math.max(0, Math.ceil((date.getTime() - nowMs) / 1000));
}
