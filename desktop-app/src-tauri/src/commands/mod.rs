//! Tauri command handlers exposed to the frontend via `invoke()`.
//!
//! Each submodule hosts one responsibility (PRD §6).
//! All commands must return `Result<T, crate::errors::AppError>`.

pub mod consent;
pub mod machine_id;
pub mod pin;
