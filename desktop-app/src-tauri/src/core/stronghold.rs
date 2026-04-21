//! Stronghold vault wrapper for LinkDesk.
//!
//! Provides deterministic password derivation and a managed state type
//! (`StrongholdState`) so Rust commands can read/write the vault directly
//! without going through the JS layer.
//!
//! Architecture note: `tauri-plugin-stronghold` only exposes store operations
//! to the frontend via its own Tauri commands.  For Rust-side access we manage
//! our own `iota_stronghold::Stronghold` instance through `app.manage()`.

use crate::errors::AppError;
use iota_stronghold::{KeyProvider, SnapshotPath};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager};
use zeroize::Zeroizing;

// ── Constants ────────────────────────────────────────────────────────────────

/// Filename for the encrypted Stronghold snapshot on disk.
const STRONGHOLD_FILENAME: &str = "linkdesk.stronghold";

/// Argon2 salt file — used by `tauri-plugin-stronghold`'s `Builder::with_argon2`.
/// The plugin reads/writes this file automatically.
pub const SALT_FILENAME: &str = "linkdesk-stronghold.salt";

/// Hardcoded domain-separation salt baked into the password derivation.
/// NOT a user secret — just prevents casual file-system inspection.
const PASSWORD_SALT: &[u8] = b"linkdesk-v1-stronghold-salt";

// ── Path helpers ─────────────────────────────────────────────────────────────

/// Returns the absolute path to the Stronghold snapshot file.
/// Creates the app-local-data directory if it does not exist yet.
pub fn vault_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Stronghold(format!("app_local_data_dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(STRONGHOLD_FILENAME))
}

/// Returns the absolute path to the argon2 salt file.
/// Used when initialising `tauri-plugin-stronghold::Builder::with_argon2`.
pub fn salt_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Stronghold(format!("app_local_data_dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(SALT_FILENAME))
}

// ── Password derivation ───────────────────────────────────────────────────────

/// Derives a 32-byte deterministic key from the install-specific data directory
/// path combined with a hardcoded domain-separation salt.
///
/// Security note: this is NOT a user secret — the goal is merely to prevent
/// casual inspection of the snapshot file on disk.  The machine_id itself is
/// not sensitive per DEV-RULES §10 (it is an install identifier, not a secret).
pub fn derive_password(app: &AppHandle) -> Result<Zeroizing<Vec<u8>>, AppError> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Stronghold(format!("app_local_data_dir: {e}")))?;
    let mut hasher = Sha256::new();
    hasher.update(PASSWORD_SALT);
    hasher.update(dir.to_string_lossy().as_bytes());
    // Sha256 output is exactly 32 bytes — Stronghold's required key length.
    Ok(Zeroizing::new(hasher.finalize().to_vec()))
}

// ── Managed state ────────────────────────────────────────────────────────────

/// Thread-safe wrapper around a `iota_stronghold::Stronghold` instance.
///
/// Registered via `app.manage(StrongholdState::new(...))` in `lib.rs`.
/// Commands receive it as `State<'_, StrongholdState>`.
pub struct StrongholdState {
    inner: Arc<Mutex<StrongholdInner>>,
}

struct StrongholdInner {
    stronghold: iota_stronghold::Stronghold,
    path: SnapshotPath,
    key_provider: KeyProvider,
}

impl StrongholdState {
    /// Opens (or creates) the Stronghold snapshot at `path` using `password`.
    /// If the snapshot file already exists it is loaded immediately.
    pub fn open(path: PathBuf, password: Zeroizing<Vec<u8>>) -> Result<Self, AppError> {
        let snapshot_path = SnapshotPath::from_path(&path);
        let key_provider = KeyProvider::try_from(password)
            .map_err(|e| AppError::Stronghold(format!("KeyProvider: {e}")))?;
        let stronghold = iota_stronghold::Stronghold::default();

        // Load existing snapshot if the file is already on disk
        if path.exists() {
            stronghold
                .load_snapshot(&key_provider, &snapshot_path)
                .map_err(|e| AppError::Stronghold(format!("load_snapshot: {e}")))?;
        }

        Ok(Self {
            inner: Arc::new(Mutex::new(StrongholdInner {
                stronghold,
                path: snapshot_path,
                key_provider,
            })),
        })
    }

    /// Reads a byte value from the named client's store, returns `None` if absent.
    pub fn get(&self, client_name: &[u8], key: &[u8]) -> Result<Option<Vec<u8>>, AppError> {
        let guard = self
            .inner
            .lock()
            .map_err(|e| AppError::Stronghold(format!("mutex poisoned: {e}")))?;

        // `get_client` returns the client if it exists, error otherwise.
        // Map the "not found" case to `None`.
        let client = match guard.stronghold.get_client(client_name) {
            Ok(c) => c,
            Err(_) => return Ok(None),
        };

        client
            .store()
            .get(key)
            .map_err(|e| AppError::Stronghold(format!("store.get: {e}")))
    }

    /// Writes `value` into the named client's store under `key`, then commits
    /// the snapshot to disk so the data survives a restart.
    pub fn insert_and_save(
        &self,
        client_name: &[u8],
        key: &[u8],
        value: Vec<u8>,
    ) -> Result<(), AppError> {
        let guard = self
            .inner
            .lock()
            .map_err(|e| AppError::Stronghold(format!("mutex poisoned: {e}")))?;

        // Load existing client or create a new one
        let client = guard
            .stronghold
            .load_client(client_name)
            .or_else(|_| guard.stronghold.create_client(client_name))
            .map_err(|e| AppError::Stronghold(format!("load/create client: {e}")))?;

        // `insert` returns the previous value (if any); we discard it
        client
            .store()
            .insert(key.to_vec(), value, None)
            .map_err(|e| AppError::Stronghold(format!("store.insert: {e}")))?;

        // Commit snapshot to disk
        guard
            .stronghold
            .commit_with_keyprovider(&guard.path, &guard.key_provider)
            .map_err(|e| AppError::Stronghold(format!("commit_with_keyprovider: {e}")))?;

        Ok(())
    }
}
