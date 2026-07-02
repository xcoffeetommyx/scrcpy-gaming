use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

const REQUIRED_FILES: [&str; 3] = ["scrcpy.exe", "adb.exe", "scrcpy-server"];
const OUTDATED_BACKEND_ERROR: &str = "Backend is outdated. Rebuild or restage Scrcpy GO backend.";

static VALIDATED_BACKENDS: OnceLock<Mutex<HashMap<PathBuf, Result<(), String>>>> = OnceLock::new();

#[derive(Clone, Debug)]
pub struct BackendPaths {
    pub directory: PathBuf,
    pub scrcpy: PathBuf,
    pub adb: PathBuf,
    pub server: PathBuf,
}

impl BackendPaths {
    fn from_directory(directory: PathBuf) -> Result<Self, String> {
        validate_backend_dir(&directory)?;
        Ok(Self {
            scrcpy: directory.join("scrcpy.exe"),
            adb: directory.join("adb.exe"),
            server: directory.join("scrcpy-server"),
            directory,
        })
    }
}

pub fn validate_backend_dir(directory: &Path) -> Result<(), String> {
    validate_required_files(directory)?;
    validate_backend_version_once(directory)
}

fn validate_required_files(directory: &Path) -> Result<(), String> {
    if !directory.is_dir() {
        return Err(format!(
            "Backend folder was not found: {}",
            directory.display()
        ));
    }

    let missing: Vec<&str> = REQUIRED_FILES
        .iter()
        .copied()
        .filter(|name| !directory.join(name).is_file())
        .collect();

    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Installation incomplete. Missing {}.",
            missing.join(", ")
        ))
    }
}

fn validate_help_output(output: &str) -> Result<(), String> {
    if output.contains("--game-mode-profile") {
        Ok(())
    } else {
        Err(OUTDATED_BACKEND_ERROR.to_owned())
    }
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    command.creation_flags(0x0800_0000);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

fn validate_backend_version(directory: &Path) -> Result<(), String> {
    let mut command = Command::new(directory.join("scrcpy.exe"));
    command
        .arg("--help")
        .current_dir(directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut command);

    let output = command.output().map_err(|_| {
        "Could not validate Scrcpy GO backend. Rebuild or restage the backend.".to_owned()
    })?;

    if !output.status.success() {
        return Err(
            "Could not validate Scrcpy GO backend. Rebuild or restage the backend.".to_owned(),
        );
    }

    let help = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    validate_help_output(&help)
}

fn validate_backend_version_once(directory: &Path) -> Result<(), String> {
    let key = fs::canonicalize(directory).unwrap_or_else(|_| directory.to_path_buf());
    let cache = VALIDATED_BACKENDS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut cache = cache
        .lock()
        .map_err(|_| "Backend validation is unavailable.".to_owned())?;

    if let Some(result) = cache.get(&key) {
        return result.clone();
    }

    let result = validate_backend_version(directory);
    cache.insert(key, result.clone());
    result
}

fn repository_fallback() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .expect("src-tauri must remain under gui/scrcpy-go")
        .join("release")
        .join("work")
        .join("build-win64")
        .join("dist")
}

pub fn resolve_backend(app: &AppHandle) -> Result<BackendPaths, String> {
    if let Some(override_dir) = env::var_os("SCRCPY_GO_BACKEND_DIR") {
        return BackendPaths::from_directory(PathBuf::from(override_dir));
    }

    if let Ok(resource_dir) = app.path().resolve("backend", BaseDirectory::Resource) {
        if validate_required_files(&resource_dir).is_ok() {
            return BackendPaths::from_directory(resource_dir);
        }
    }

    BackendPaths::from_directory(repository_fallback())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_directory() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!("scrcpy-go-backend-{nonce}"))
    }

    #[test]
    fn validates_required_backend_files() {
        let directory = temporary_directory();
        fs::create_dir_all(&directory).unwrap();
        for name in REQUIRED_FILES {
            fs::write(directory.join(name), []).unwrap();
        }

        assert!(validate_required_files(&directory).is_ok());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn reports_missing_backend_files() {
        let directory = temporary_directory();
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("adb.exe"), []).unwrap();

        let error = validate_required_files(&directory).unwrap_err();
        assert!(error.contains("scrcpy.exe"));
        assert!(error.contains("scrcpy-server"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn accepts_backend_with_game_mode_profiles() {
        assert!(validate_help_output("  --game-mode-profile=competitive|balanced|quality").is_ok());
    }

    #[test]
    fn rejects_outdated_backend_help() {
        let error = validate_help_output("Usage: scrcpy [options]").unwrap_err();
        assert_eq!(error, OUTDATED_BACKEND_ERROR);
    }
}
