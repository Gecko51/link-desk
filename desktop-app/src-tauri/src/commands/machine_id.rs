use crate::errors::AppError;

/// Stub — real body added in Task 8 once Stronghold is wired.
#[tauri::command]
pub async fn get_machine_id() -> Result<String, AppError> {
    Err(AppError::InvalidState(
        "get_machine_id: not yet implemented".into(),
    ))
}

/// Stub — real body added in Task 8 once Stronghold is wired.
#[tauri::command]
pub async fn generate_machine_id() -> Result<String, AppError> {
    Err(AppError::InvalidState(
        "generate_machine_id: not yet implemented".into(),
    ))
}
