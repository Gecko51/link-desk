// Mirror of Rust command signatures. Any change on the Rust side
// MUST be reflected here - there is no codegen for Tauri commands.
export interface TauriCommandMap {
  get_machine_id: {
    args: Record<string, never>;
    result: string; // UUID v4
  };
  generate_machine_id: {
    args: Record<string, never>;
    result: string;
  };
  generate_pin_native: {
    args: Record<string, never>;
    result: string; // raw 9 digits, unformatted
  };
}

// Shape matching AppError serialization (see errors.rs).
export interface TauriError {
  kind: "Stronghold" | "InvalidState" | "Io";
  message: string;
}
