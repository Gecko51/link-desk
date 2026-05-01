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
        .setup(|app| {
            let handle = app.handle();

            // Register global-shortcut plugin via its Builder (API v2 requirement).
            #[cfg(desktop)]
            handle.plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

            let password = core::stronghold::derive_password(handle)?;
            let v_path = core::stronghold::vault_path(handle)?;

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
