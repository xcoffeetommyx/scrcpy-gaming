use std::env;
use std::path::{Path, PathBuf};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

const REQUIRED_FILES: [&str; 3] = ["scrcpy.exe", "adb.exe", "scrcpy-server"];

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
        if validate_backend_dir(&resource_dir).is_ok() {
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

        assert!(validate_backend_dir(&directory).is_ok());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn reports_missing_backend_files() {
        let directory = temporary_directory();
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("adb.exe"), []).unwrap();

        let error = validate_backend_dir(&directory).unwrap_err();
        assert!(error.contains("scrcpy.exe"));
        assert!(error.contains("scrcpy-server"));
        fs::remove_dir_all(directory).unwrap();
    }
}
