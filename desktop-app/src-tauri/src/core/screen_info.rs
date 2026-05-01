//! Read primary display resolution and DPI scale factor.
//! Windows implementation uses GetSystemMetrics + GetDpiForSystem.

use crate::errors::AppError;
use serde::Serialize;

/// Host display metadata sent to the controller for coordinate mapping.
#[derive(Debug, Serialize)]
pub struct ScreenInfo {
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// Reads the primary display's resolution and DPI scale factor.
#[cfg(target_os = "windows")]
pub fn read_screen_info() -> Result<ScreenInfo, AppError> {
    use windows_sys::Win32::UI::HiDpi::GetDpiForSystem;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

    // SAFETY: Win32 FFI calls — no pointers, no aliasing, no invariants to uphold.
    let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
    let dpi = unsafe { GetDpiForSystem() };

    if width <= 0 || height <= 0 {
        return Err(AppError::ScreenInfo(
            "failed to read display metrics".into(),
        ));
    }

    Ok(ScreenInfo {
        width: width as u32,
        height: height as u32,
        // 96 DPI is the Windows baseline (100% scale = 96 DPI).
        scale_factor: dpi as f64 / 96.0,
    })
}

/// Fallback stub for non-Windows platforms (macOS, Linux).
#[cfg(not(target_os = "windows"))]
pub fn read_screen_info() -> Result<ScreenInfo, AppError> {
    Ok(ScreenInfo {
        width: 1920,
        height: 1080,
        scale_factor: 1.0,
    })
}
