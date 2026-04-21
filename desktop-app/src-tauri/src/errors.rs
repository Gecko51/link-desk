use serde::Serialize;
use thiserror::Error;

/// Top-level error surface exposed to the frontend.
/// Every Tauri command returns `Result<T, AppError>` so the frontend can
/// display a toast with a stable error kind + message.
///
/// `#[serde(tag = "kind", content = "message")]` serialises to:
///   { "kind": "InvalidState", "message": "..." }
/// which makes exhaustive matching straightforward in TypeScript.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    /// Errors originating from the Stronghold vault layer.
    #[error("stronghold vault error: {0}")]
    Stronghold(String),

    /// Invariant violations or "not yet implemented" stubs.
    #[error("invalid state: {0}")]
    InvalidState(String),

    /// Filesystem / OS I/O errors (surfaced as strings to keep serde simple).
    #[error("io error: {0}")]
    Io(String),
}

/// Automatic conversion from std::io::Error so `?` works in I/O code paths.
impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        AppError::Io(value.to_string())
    }
}
