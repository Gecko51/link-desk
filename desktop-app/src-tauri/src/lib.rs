//! LinkDesk desktop-app Rust library.
//! All business logic lives here; `main.rs` is a thin wrapper.

pub mod commands;
pub mod core;
pub mod errors;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::pin::generate_pin_native,
            commands::machine_id::get_machine_id,
            commands::machine_id::generate_machine_id,
        ])
        .run(tauri::generate_context!())
        // Boot failure is fatal with no recovery path - DEV-RULES §2 exception.
        .expect("error while running tauri application");
}
