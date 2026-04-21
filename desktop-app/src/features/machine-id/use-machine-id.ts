import { useEffect, useState } from "react";
import { tauriInvoke, isTauriError } from "@/lib/tauri";
import type { MachineIdState } from "./machine-id.types";

// Fetches the persistent machine UUID on mount.
// Idempotent: the Rust command generates-on-miss, so repeat calls are safe.
export function useMachineId(): MachineIdState {
  const [state, setState] = useState<MachineIdState>({
    id: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    tauriInvoke("get_machine_id")
      .then((id) => {
        if (!cancelled) setState({ id, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = isTauriError(err) ? err.message : String(err);
        setState({ id: null, isLoading: false, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
