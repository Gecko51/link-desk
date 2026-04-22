import { createContext, useContext } from "react";
import type { PinSession } from "@/features/pin/pin.types";
import type { SignalingApi } from "@/features/signaling/signaling.types";
import type { UseSessionApi } from "@/features/session/use-session";

// Aggregated application state shared across all routes via React Context.
export interface AppState {
  machineId: string | null;
  pinSession: PinSession;
  secondsRemaining: number;
  regeneratePin: () => void;
  // Signaling: état de connexion WS + send + onMessage (encapsulé, pas de leak de client).
  signaling: SignalingApi;
  // Session: orchestrateur WebRTC (état, connexion, envoi de messages, fin).
  session: UseSessionApi;
}

// Context consumed by all routes. `null` only before mount (impossible at render time).
export const AppStateContext = createContext<AppState | null>(null);

// Typed hook — throws if consumed outside the provider (programming error, not runtime edge case).
export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateContext.Provider");
  return ctx;
}
