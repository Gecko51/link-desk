import { useCallback, useEffect, useRef, useState } from "react";
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
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    secondsUntil(session.expiresAt),
  );

  // Keep the latest expiry in a ref so the countdown tick reads the current
  // value without re-subscribing to the interval on every state update.
  // Updated inside an effect to comply with react-hooks/refs (no ref writes during render).
  const expiresAtRef = useRef(session.expiresAt);
  useEffect(() => {
    expiresAtRef.current = session.expiresAt;
  }, [session.expiresAt]);

  // 1Hz countdown tick - drives the PinTimer progress display.
  // Reads expiresAtRef so it always sees the latest expiry without re-creating the interval.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsRemaining(secondsUntil(expiresAtRef.current));
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
  }, [session, rotationMs]);

  const regenerate = useCallback(() => {
    setSession(createSession(rotationMs));
  }, [rotationMs]);

  return { session, secondsRemaining, regenerate };
}

function createSession(rotationMs: number): PinSession {
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + rotationMs);
  return { pin: generatePin(), generatedAt, expiresAt };
}

function secondsUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
}
