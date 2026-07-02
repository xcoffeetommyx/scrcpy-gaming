use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::backend::resolve_backend;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Profile {
    Competitive,
    Balanced,
    Quality,
}

impl Profile {
    fn as_str(self) -> &'static str {
        match self {
            Self::Competitive => "competitive",
            Self::Balanced => "balanced",
            Self::Quality => "quality",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    serial: String,
    profile: Profile,
}

#[derive(Clone, Debug, Serialize)]
pub struct LaunchResult {
    pid: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct LogEvent {
    source: &'static str,
    message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStateEvent {
    running: bool,
    exit_code: Option<i32>,
}

#[derive(Clone)]
struct RunningProcess {
    pid: u32,
    child: Arc<Mutex<Child>>,
}

#[derive(Default)]
pub struct LauncherState {
    running: Mutex<Option<RunningProcess>>,
}

impl LauncherState {
    pub fn stop(&self) -> Result<(), String> {
        let running = self
            .running
            .lock()
            .map_err(|_| "Process state is unavailable.")?;
        let Some(process) = running.as_ref() else {
            return Err("No mirroring session is running.".to_owned());
        };

        let result = process
            .child
            .lock()
            .map_err(|_| "Mirroring process is unavailable.")?
            .kill()
            .map_err(|_| "Could not stop the mirroring session.".to_owned());
        result
    }
}

fn build_arguments(request: &LaunchRequest) -> Result<Vec<String>, String> {
    let serial = request.serial.trim();
    if serial.is_empty() || serial.len() > 256 || serial.chars().any(char::is_control) {
        return Err("The selected device identifier is invalid.".to_owned());
    }

    Ok(vec![
        format!("--serial={serial}"),
        format!("--game-mode-profile={}", request.profile.as_str()),
    ])
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

fn stream_logs<R>(app: AppHandle, source: &'static str, reader: R)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                let _ = app.emit(
                    "scrcpy-log",
                    LogEvent {
                        source,
                        message: trimmed.to_owned(),
                    },
                );
            }
        }
    });
}

fn monitor_process(app: AppHandle, process: RunningProcess) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(200));

        let status = {
            let mut child = match process.child.lock() {
                Ok(child) => child,
                Err(_) => return,
            };
            child.try_wait().unwrap_or_default()
        };

        if let Some(status) = status {
            let state = app.state::<LauncherState>();
            if let Ok(mut running) = state.running.lock() {
                if running
                    .as_ref()
                    .is_some_and(|active| active.pid == process.pid)
                {
                    *running = None;
                }
            }
            let _ = app.emit(
                "scrcpy-process-state",
                ProcessStateEvent {
                    running: false,
                    exit_code: status.code(),
                },
            );
            return;
        }
    });
}

#[tauri::command]
pub fn launch_scrcpy(
    app: AppHandle,
    state: tauri::State<'_, LauncherState>,
    request: LaunchRequest,
) -> Result<LaunchResult, String> {
    let arguments = build_arguments(&request)?;
    let backend = resolve_backend(&app)?;

    let mut running = state
        .running
        .lock()
        .map_err(|_| "Process state is unavailable.")?;
    if let Some(active) = running.as_ref() {
        let still_running = active
            .child
            .lock()
            .map_err(|_| "Mirroring process is unavailable.")?
            .try_wait()
            .map_err(|_| "Could not inspect the mirroring process.")?
            .is_none();
        if still_running {
            return Err("A mirroring session is already running.".to_owned());
        }
        *running = None;
    }

    let mut command = Command::new(&backend.scrcpy);
    command
        .args(arguments)
        .current_dir(&backend.directory)
        .env("ADB", &backend.adb)
        .env("SCRCPY_SERVER_PATH", &backend.server)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut command);

    let mut child = command
        .spawn()
        .map_err(|_| "Could not start scrcpy. Check the launcher installation.")?;
    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let process = RunningProcess {
        pid,
        child: Arc::new(Mutex::new(child)),
    };
    *running = Some(process.clone());
    drop(running);

    if let Some(stdout) = stdout {
        stream_logs(app.clone(), "scrcpy", stdout);
    }
    if let Some(stderr) = stderr {
        stream_logs(app.clone(), "scrcpy", stderr);
    }
    monitor_process(app, process);

    Ok(LaunchResult { pid })
}

#[tauri::command]
pub fn stop_scrcpy(state: tauri::State<'_, LauncherState>) -> Result<(), String> {
    state.stop()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_profiles_to_scrcpy_arguments() {
        for (profile, expected) in [
            (Profile::Competitive, "competitive"),
            (Profile::Balanced, "balanced"),
            (Profile::Quality, "quality"),
        ] {
            let request = LaunchRequest {
                serial: "device-123".to_owned(),
                profile,
            };
            assert_eq!(
                build_arguments(&request).unwrap(),
                vec![
                    "--serial=device-123",
                    &format!("--game-mode-profile={expected}")
                ]
            );
        }
    }

    #[test]
    fn rejects_invalid_serials() {
        let request = LaunchRequest {
            serial: "\n".to_owned(),
            profile: Profile::Balanced,
        };
        assert!(build_arguments(&request).is_err());
    }
}
