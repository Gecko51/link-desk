import { invoke } from "@tauri-apps/api/core";
import type { TauriCommandMap, TauriError } from "@/types/tauri-commands";

type CommandName = keyof TauriCommandMap;

// Typed wrapper around invoke(). All frontend access to Rust goes through here
// (DEV-RULES §5: no raw invoke() in components).
export async function tauriInvoke<K extends CommandName>(
  name: K,
  args?: TauriCommandMap[K]["args"],
): Promise<TauriCommandMap[K]["result"]> {
  return invoke<TauriCommandMap[K]["result"]>(name, args as Record<string, unknown>);
}

// Narrows an unknown caught value into a TauriError when possible.
export function isTauriError(value: unknown): value is TauriError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "message" in value
  );
}
