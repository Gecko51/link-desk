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
