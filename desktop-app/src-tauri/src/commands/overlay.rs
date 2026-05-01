//! Tauri commands for the always-on-top overlay window.
//!
//! The overlay is a small frameless window displayed on the host machine during
//! an active remote session, showing connection status and a disconnect button.
//! It lives at the "/overlay" route in the React frontend.

use crate::errors::AppError;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Creates the overlay window if it does not already exist.
///
/// The window is positioned at the top-right corner (9999, 8), frameless,
/// always on top, and excluded from the taskbar.
/// If the window already exists this is a no-op (idempotent).
#[tauri::command]
pub async fn create_overlay_window(app: AppHandle) -> Result<(), AppError> {
    // Guard: do not create a second overlay if one already exists.
    if app.get_webview_window("overlay").is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "overlay", WebviewUrl::App("/overlay".into()))
        .title("LinkDesk Session")
        .inner_size(280.0, 60.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        // Large x value floats the window to the right side of most screens.
        .position(9999.0, 8.0)
        .build()
        .map_err(|e| AppError::Overlay(format!("failed to create overlay window: {e}")))?;

    Ok(())
}

/// Closes the overlay window if it is open.
///
/// If the window does not exist this is a no-op.
#[tauri::command]
pub async fn close_overlay_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("overlay") {
        window
            .close()
            .map_err(|e| AppError::Overlay(format!("failed to close overlay: {e}")))?;
    }
    Ok(())
}
