// Native OS-level consent dialog for incoming remote-control requests.
// Displayed when a controller attempts to connect (PRD §3 — host-side consent flow).

use crate::errors::AppError;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tokio::sync::oneshot;
use tokio::time::timeout;

/// Shows a native OS-level confirmation dialog asking the local user whether
/// they accept a remote-control request from `peer_label`.
///
/// # Behaviour
/// - Displays a Warning dialog with two custom buttons: "Accepter" / "Refuser".
/// - Waits at most `timeout_secs` seconds for the user to click.
/// - Returns `Ok(true)` if the user clicked "Accepter".
/// - Returns `Ok(false)` on refusal, dialog cancellation, or timeout (PRD §3: default-refuse).
#[tauri::command]
pub async fn show_consent_dialog(
    app: AppHandle,
    peer_label: String,
    timeout_secs: u64,
) -> Result<bool, AppError> {
    // Build the message shown to the local user.
    let message = format!(
        "{peer_label} veut prendre le contrôle de votre ordinateur.\n\nAccepter ?"
    );

    // oneshot channel: the dialog callback sends the user's answer to this task.
    let (tx, rx) = oneshot::channel::<bool>();

    // Spawn the native dialog asynchronously.
    // `show(FnOnce(bool))` fires the closure on the OS dialog thread; the bool
    // is `true` when the user clicks the first (Ok / left) button — here "Accepter".
    app.dialog()
        .message(&message)
        .title("LinkDesk — demande de connexion")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Accepter".into(),
            "Refuser".into(),
        ))
        .show(move |accepted| {
            // Ignore send errors: the receiver may have already timed out.
            let _ = tx.send(accepted);
        });

    // Race the dialog callback against the PRD-mandated 30 s timeout.
    match timeout(Duration::from_secs(timeout_secs), rx).await {
        // User answered in time.
        Ok(Ok(accepted)) => Ok(accepted),
        // Channel was dropped before a value arrived (shouldn't happen, but safe).
        Ok(Err(_)) => Ok(false),
        // Timeout elapsed — default-refuse per PRD §3.
        Err(_) => Ok(false),
    }
}
