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
