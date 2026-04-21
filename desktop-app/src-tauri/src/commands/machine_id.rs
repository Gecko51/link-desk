use crate::core::stronghold::StrongholdState;
use crate::errors::AppError;
use tauri::State;
use uuid::Uuid;

// ── Stronghold addressing ────────────────────────────────────────────────────

/// Logical client name inside the Stronghold vault.
const CLIENT_NAME: &[u8] = b"linkdesk-machine";

/// Key used to store the machine UUID in the client's store.
const KEY_MACHINE_ID: &[u8] = b"machine_id";

// ── Commands ─────────────────────────────────────────────────────────────────

/// Returns the persisted machine UUID for this installation.
///
/// Idempotent: on first call a UUID v4 is generated, stored in Stronghold and
/// returned.  All subsequent calls return the same UUID without touching the
/// vault (read-only path).
///
/// The UUID is NEVER logged — DEV-RULES §10.
#[tauri::command]
pub async fn get_machine_id(
    stronghold: State<'_, StrongholdState>,
) -> Result<String, AppError> {
    // Try to read an existing machine_id from the vault
    if let Some(bytes) = stronghold.get(CLIENT_NAME, KEY_MACHINE_ID).await? {
        return String::from_utf8(bytes)
            .map_err(|e| AppError::Stronghold(format!("invalid utf-8 in stored id: {e}")));
    }

    // First call: generate, persist and return a new UUID
    let new_id = Uuid::new_v4().to_string();
    stronghold
        .insert_and_save(CLIENT_NAME, KEY_MACHINE_ID, new_id.as_bytes().to_vec())
        .await?;

    Ok(new_id)
}

/// Forces regeneration of the machine UUID (used for testing / factory reset).
///
/// Always writes a new UUID v4, overwriting any previously stored value.
/// Returns the newly written UUID.
///
/// The UUID is NEVER logged — DEV-RULES §10.
#[tauri::command]
pub async fn generate_machine_id(
    stronghold: State<'_, StrongholdState>,
) -> Result<String, AppError> {
    let new_id = Uuid::new_v4().to_string();
    stronghold
        .insert_and_save(CLIENT_NAME, KEY_MACHINE_ID, new_id.as_bytes().to_vec())
        .await?;
    Ok(new_id)
}
