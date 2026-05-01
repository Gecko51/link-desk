//! Maps JavaScript key/code strings to enigo types.
//!
//! The frontend sends events from the browser's KeyboardEvent and MouseEvent APIs.
//! This module translates those strings into the enigo types used for OS injection.

use crate::errors::AppError;
use enigo::{Button, Direction, Key};

/// Maps a mouse button string ("left", "right", "middle") to an enigo Button.
pub fn map_button(button: &str) -> Result<Button, AppError> {
    match button {
        "left" => Ok(Button::Left),
        "right" => Ok(Button::Right),
        "middle" => Ok(Button::Middle),
        other => Err(AppError::InputInjection(format!(
            "unknown button: {other}"
        ))),
    }
}

/// Maps an action string ("down" / "up") to an enigo Direction.
pub fn map_direction(action: &str) -> Result<Direction, AppError> {
    match action {
        "down" => Ok(Direction::Press),
        "up" => Ok(Direction::Release),
        other => Err(AppError::InputInjection(format!(
            "unknown direction: {other}"
        ))),
    }
}

/// Maps a JS KeyboardEvent.key + KeyboardEvent.code pair to an enigo Key.
///
/// Strategy:
/// 1. Single-character keys → Key::Unicode (covers letters, digits, punctuation).
/// 2. Named keys ("Enter", "ArrowUp", …) → explicit mapping.
/// 3. Function keys (F1–F12) → fallback to `map_key_by_code`.
pub fn map_key(key: &str, code: &str) -> Result<Key, AppError> {
    // Single printable character: delegate directly to Unicode variant.
    if key.len() == 1 {
        if let Some(ch) = key.chars().next() {
            return Ok(Key::Unicode(ch));
        }
    }

    match key {
        "Enter" => Ok(Key::Return),
        "Tab" => Ok(Key::Tab),
        "Backspace" => Ok(Key::Backspace),
        "Delete" => Ok(Key::Delete),
        "Escape" => Ok(Key::Escape),
        " " => Ok(Key::Space),
        "ArrowUp" => Ok(Key::UpArrow),
        "ArrowDown" => Ok(Key::DownArrow),
        "ArrowLeft" => Ok(Key::LeftArrow),
        "ArrowRight" => Ok(Key::RightArrow),
        "Home" => Ok(Key::Home),
        "End" => Ok(Key::End),
        "PageUp" => Ok(Key::PageUp),
        "PageDown" => Ok(Key::PageDown),
        "Control" => Ok(Key::Control),
        "Alt" => Ok(Key::Alt),
        "Shift" => Ok(Key::Shift),
        "Meta" => Ok(Key::Meta),
        "CapsLock" => Ok(Key::CapsLock),
        // Fall through to code-based lookup for function keys and others.
        _ => map_key_by_code(code),
    }
}

/// Secondary lookup by KeyboardEvent.code — handles function keys.
fn map_key_by_code(code: &str) -> Result<Key, AppError> {
    match code {
        "F1" => Ok(Key::F1),
        "F2" => Ok(Key::F2),
        "F3" => Ok(Key::F3),
        "F4" => Ok(Key::F4),
        "F5" => Ok(Key::F5),
        "F6" => Ok(Key::F6),
        "F7" => Ok(Key::F7),
        "F8" => Ok(Key::F8),
        "F9" => Ok(Key::F9),
        "F10" => Ok(Key::F10),
        "F11" => Ok(Key::F11),
        "F12" => Ok(Key::F12),
        other => Err(AppError::InputInjection(format!(
            "unsupported key code: {other}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_printable_char() {
        assert!(matches!(map_key("a", "KeyA"), Ok(Key::Unicode('a'))));
    }

    #[test]
    fn maps_enter() {
        assert!(matches!(map_key("Enter", "Enter"), Ok(Key::Return)));
    }

    #[test]
    fn maps_f1() {
        assert!(matches!(map_key("F1", "F1"), Ok(Key::F1)));
    }

    #[test]
    fn maps_arrow_keys() {
        assert!(matches!(map_key("ArrowUp", "ArrowUp"), Ok(Key::UpArrow)));
    }

    #[test]
    fn rejects_unknown_key() {
        assert!(map_key("Unidentified", "Unidentified").is_err());
    }

    #[test]
    fn maps_button_left() {
        assert!(matches!(map_button("left"), Ok(Button::Left)));
    }

    #[test]
    fn rejects_unknown_button() {
        assert!(map_button("extra").is_err());
    }

    #[test]
    fn maps_direction_down() {
        assert!(matches!(map_direction("down"), Ok(Direction::Press)));
    }
}
