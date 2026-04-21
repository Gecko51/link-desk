import { createContext, useContext } from "react";
import type { PinSession } from "@/features/pin/pin.types";
import type { SignalingState } from "@/features/signaling/signaling.types";

// Aggregated application state shared across all routes via React Context.
export interface AppState {
  machineId: string | null;
  pinSession: PinSession;
  secondsRemaining: number;
  regeneratePin: () => void;
  signaling: SignalingState;
}

// Context consumed by all routes. `null` only before mount (impossible at render time).
export const AppStateContext = createContext<AppState | null>(null);

// Typed hook — throws if consumed outside the provider (programming error, not runtime edge case).
export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateContext.Provider");
  return ctx;
}
