//! LinkDesk desktop-app Rust library.
//! All business logic lives here; `main.rs` is a thin wrapper.

pub mod commands;
pub mod core;
pub mod errors;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle();

            // Derive a deterministic password from the install-specific data dir.
            // See `core::stronghold::derive_password` for the security rationale.
            let password = core::stronghold::derive_password(handle)?;
            let v_path = core::stronghold::vault_path(handle)?;

            // Open (or create) the encrypted snapshot via iota_stronghold directly
            // and register as managed state. Commands receive it via
            // `State<'_, StrongholdState>`.
            let stronghold_state =
                core::stronghold::StrongholdState::open(v_path, password)
                    .map_err(|e| Box::new(std::io::Error::other(e.to_string())))?;
            app.manage(stronghold_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pin::generate_pin_native,
            commands::machine_id::get_machine_id,
            commands::machine_id::generate_machine_id,
            commands::consent::show_consent_dialog,
        ])
        .run(tauri::generate_context!())
        // Boot failure is fatal with no recovery path - DEV-RULES §2 exception.
        .expect("error while running tauri application");
}
