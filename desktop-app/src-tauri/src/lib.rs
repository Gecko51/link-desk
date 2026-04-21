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
        .setup(|app| {
            let handle = app.handle();

            // Resolve the argon2 salt path — tauri-plugin-stronghold uses this
            // file to generate/store a random salt for key derivation.
            let s_path = core::stronghold::salt_path(handle)?;

            // Register the Stronghold plugin with argon2 key derivation.
            // `with_argon2` reads/writes the salt file automatically.
            handle.plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&s_path).build(),
            )?;

            // Derive a deterministic password for our own Rust-side vault access.
            // This is independent of the JS-side plugin — it opens the same file
            // but uses our own iota_stronghold instance for Rust commands.
            let password = core::stronghold::derive_password(handle)?;
            let v_path = core::stronghold::vault_path(handle)?;

            // Open (or create) the encrypted snapshot and register as managed state.
            // Commands receive this via `State<'_, StrongholdState>`.
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
        ])
        .run(tauri::generate_context!())
        // Boot failure is fatal with no recovery path - DEV-RULES §2 exception.
        .expect("error while running tauri application");
}
