use crate::errors::AppError;

/// Generates a 9-digit PIN using the OS-level CSPRNG (`OsRng`).
/// Returned unformatted — the frontend applies the "XXX-XXX-XXX" presentation.
#[tauri::command]
pub fn generate_pin_native() -> Result<String, AppError> {
    use rand::Rng;
    let mut rng = rand::rngs::OsRng;
    let mut out = String::with_capacity(9);
    for _ in 0..9 {
        let digit: u8 = rng.gen_range(0..10);
        out.push(char::from_digit(u32::from(digit), 10).ok_or_else(|| {
            AppError::InvalidState("pin digit out of range".into())
        })?);
    }
    Ok(out)
}
