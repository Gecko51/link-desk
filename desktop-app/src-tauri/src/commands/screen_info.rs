//! Tauri command: exposes host display info to the frontend.

use crate::core::screen_info;
use crate::errors::AppError;

/// Returns the primary display's width, height, and DPI scale factor.
/// Called by the controller to map remote coordinates correctly.
#[tauri::command]
pub fn get_screen_info() -> Result<screen_info::ScreenInfo, AppError> {
    screen_info::read_screen_info()
}
