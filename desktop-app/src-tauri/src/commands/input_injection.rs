//! Tauri commands for OS-level mouse/keyboard injection via enigo.
//!
//! `EnigoState` is registered as managed state in `lib.rs`.
//! All commands acquire the mutex, perform the injection, then release it.

use crate::core::input_mapper;
use crate::errors::AppError;
use enigo::{Axis, Coordinate, Enigo, Keyboard, Mouse};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::State;

/// Managed state wrapping the enigo instance.
/// Uses a Mutex because Tauri commands can be called concurrently.
pub struct EnigoState(pub Mutex<Enigo>);

/// Modifier keys state sent alongside each keyboard event.
/// Currently unused at injection time (modifiers arrive as separate keydown/keyup events).
#[derive(Debug, Deserialize)]
pub struct ModifierState {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
}

/// Injects a mouse event (move, button press/release, or scroll).
///
/// # Parameters
/// - `x`, `y`: absolute screen coordinates in host pixels.
/// - `button`: "left" | "right" | "middle" (ignored for "move" and "scroll").
/// - `action`: "move" | "down" | "up" | "scroll".
/// - `scroll_delta`: signed notch count (positive = down, negative = up); only for "scroll".
#[tauri::command]
pub fn inject_mouse_event(
    enigo: State<'_, EnigoState>,
    x: i32,
    y: i32,
    button: String,
    action: String,
    scroll_delta: Option<i32>,
) -> Result<(), AppError> {
    let mut enigo = enigo.0.lock().map_err(|e| {
        AppError::InputInjection(format!("enigo mutex poisoned: {e}"))
    })?;

    match action.as_str() {
        // Pure cursor move — no click.
        "move" => {
            enigo
                .move_mouse(x, y, Coordinate::Abs)
                .map_err(|e| AppError::InputInjection(format!("move_mouse failed: {e}")))?;
        }
        // Button press or release: move first to ensure accurate coordinates.
        "down" | "up" => {
            enigo
                .move_mouse(x, y, Coordinate::Abs)
                .map_err(|e| AppError::InputInjection(format!("move_mouse failed: {e}")))?;
            let btn = input_mapper::map_button(&button)?;
            let dir = input_mapper::map_direction(&action)?;
            enigo
                .button(btn, dir)
                .map_err(|e| AppError::InputInjection(format!("button failed: {e}")))?;
        }
        // Scroll wheel: move first, then emit the scroll event.
        "scroll" => {
            enigo
                .move_mouse(x, y, Coordinate::Abs)
                .map_err(|e| AppError::InputInjection(format!("move_mouse failed: {e}")))?;
            let delta = scroll_delta.unwrap_or(0);
            enigo
                .scroll(delta, Axis::Vertical)
                .map_err(|e| AppError::InputInjection(format!("scroll failed: {e}")))?;
        }
        other => {
            return Err(AppError::InputInjection(format!(
                "unknown mouse action: {other}"
            )));
        }
    }

    Ok(())
}

/// Injects a keyboard event (key press or release).
///
/// # Parameters
/// - `key`: KeyboardEvent.key value (e.g. "a", "Enter", "ArrowUp").
/// - `code`: KeyboardEvent.code value (e.g. "KeyA", "F1") — used as fallback.
/// - `_modifiers`: snapshot of modifier state. Unused here; modifiers arrive as
///   their own keydown/keyup events from the controller side.
/// - `action`: "down" | "up".
#[tauri::command]
pub fn inject_keyboard_event(
    enigo: State<'_, EnigoState>,
    key: String,
    code: String,
    _modifiers: ModifierState,
    action: String,
) -> Result<(), AppError> {
    let mut enigo = enigo.0.lock().map_err(|e| {
        AppError::InputInjection(format!("enigo mutex poisoned: {e}"))
    })?;

    let mapped_key = input_mapper::map_key(&key, &code)?;
    let direction = input_mapper::map_direction(&action)?;

    enigo
        .key(mapped_key, direction)
        .map_err(|e| AppError::InputInjection(format!("key injection failed: {e}")))?;

    Ok(())
}
