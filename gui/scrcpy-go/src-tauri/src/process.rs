use std::collections::HashMap;
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
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum DisplayMode {
    Native,
    Gaming1080,
    Performance720,
    Custom { width: u32, height: u32 },
}

impl Default for DisplayMode {
    fn default() -> Self {
        Self::Native
    }
}

impl DisplayMode {
    fn dimensions(&self) -> Result<Option<(u32, u32)>, String> {
        let dimensions = match *self {
            Self::Native => return Ok(None),
            Self::Gaming1080 => (1920, 1080),
            Self::Performance720 => (1280, 720),
            Self::Custom { width, height } => (width, height),
        };
        if [dimensions.0, dimensions.1]
            .iter()
            .any(|value| !(320..=8192).contains(value) || value % 8 != 0)
        {
            return Err(
                "Use display dimensions from 320 to 8192 pixels, in multiples of 8.".to_owned(),
            );
        }
        Ok(Some(dimensions))
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    serial: String,
    profile: Profile,
    #[serde(default)]
    display: DisplayMode,
    #[serde(default)]
    start_app: Option<String>,
    #[serde(default)]
    window_mode: WindowMode,
    #[serde(default)]
    frame_pacing: FramePacing,
    #[serde(default)]
    phone_screen_off: bool,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowMode {
    #[default]
    Windowed,
    Borderless,
    Exclusive,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FramePacing {
    #[default]
    Smooth60,
    Smooth120,
    LowLatency,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pid: u32,
    serial: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    source: &'static str,
    serial: String,
    message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStateEvent {
    serial: String,
    pid: u32,
    running: bool,
    exit_code: Option<i32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceEvent {
    serial: String,
    pid: u32,
    rendered_fps: u32,
    skipped_frames: u32,
    average_frame_ms: Option<f64>,
    longest_frame_ms: Option<f64>,
}

#[derive(Clone)]
struct RunningProcess {
    pid: u32,
    serial: String,
    child: Arc<Mutex<Child>>,
}

#[derive(Default)]
pub struct LauncherState {
    running: Mutex<HashMap<String, RunningProcess>>,
}

impl LauncherState {
    pub fn stop(&self, serial: &str) -> Result<(), String> {
        let child = {
            let running = self
                .running
                .lock()
                .map_err(|_| "Process state is unavailable.")?;
            let Some(process) = running.get(serial) else {
                return Err("No mirroring session is running for this device.".to_owned());
            };
            Arc::clone(&process.child)
        };

        let result = child
            .lock()
            .map_err(|_| "Mirroring process is unavailable.")?
            .kill()
            .map_err(|_| "Could not stop the mirroring session.".to_owned());
        result
    }

    pub fn stop_all(&self) {
        let processes = match self.running.lock() {
            Ok(running) => running.values().cloned().collect::<Vec<_>>(),
            Err(_) => return,
        };

        for process in processes {
            if let Ok(mut child) = process.child.lock() {
                let _ = child.kill();
            }
        }
    }
}

fn normalize_serial(serial: &str) -> Result<&str, String> {
    let serial = serial.trim();
    if serial.is_empty() || serial.len() > 256 || serial.chars().any(char::is_control) {
        return Err("The selected device identifier is invalid.".to_owned());
    }
    Ok(serial)
}

fn build_arguments(request: &LaunchRequest) -> Result<Vec<String>, String> {
    let serial = normalize_serial(&request.serial)?;

    let mut arguments = vec![
        format!("--serial={serial}"),
        format!("--game-mode-profile={}", request.profile.as_str()),
        "--print-fps".to_owned(),
    ];
    let (fps, buffer_ms, vsync) = match request.frame_pacing {
        FramePacing::Smooth60 => (60, 35, true),
        FramePacing::Smooth120 => (120, 20, true),
        FramePacing::LowLatency => (120, 0, false),
    };
    arguments.push(format!("--max-fps={fps}"));
    arguments.push(format!("--video-buffer={buffer_ms}"));
    if vsync {
        arguments.push("--render-vsync".to_owned());
    }
    if request.phone_screen_off {
        arguments.push("--turn-screen-off".to_owned());
        // Keep Android awake while charging so its lock timeout does not
        // suspend the virtual display. scrcpy restores this setting on exit.
        arguments.push("--stay-awake".to_owned());
    }
    match request.window_mode {
        WindowMode::Windowed => {}
        WindowMode::Borderless => arguments.push("--fullscreen".to_owned()),
        WindowMode::Exclusive => {
            arguments.push("--fullscreen-exclusive".to_owned());
            if vsync {
                arguments.push(format!("--fullscreen-refresh-rate={fps}"));
            }
        }
    }
    if let Some((width, height)) = request.display.dimensions()? {
        arguments.push(format!("--new-display={width}x{height}"));
        // Profiles cap the longest edge at 720/1080. Keep the explicitly
        // selected virtual display size instead of silently downscaling it.
        arguments.push("--max-size=0".to_owned());
        arguments.push("--keep-active".to_owned());
        if let Some(package) = request
            .start_app
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            if package.len() > 255
                || !package.contains('.')
                || !package.split('.').all(|part| {
                    part.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
                        && part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
                })
            {
                return Err(
                    "Enter a valid Android package name, such as com.example.game.".to_owned(),
                );
            }
            arguments.push(format!("--start-app={package}"));
        }
    }
    Ok(arguments)
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

fn parse_fps_line(line: &str) -> Option<(u32, u32)> {
    let line = line.split(" [frame-time ").next()?;
    let fps_suffix = " fps";
    let fps_index = line.rfind(fps_suffix)?;
    let fps_prefix = &line[..fps_index];
    let fps_text = fps_prefix
        .rsplit(|character: char| !character.is_ascii_digit())
        .next()?;
    if fps_text.is_empty() {
        return None;
    }
    let rendered_fps = fps_text.parse().ok()?;

    let remainder = line[fps_index + fps_suffix.len()..].trim();
    if remainder.is_empty() {
        return Some((rendered_fps, 0));
    }

    let skipped_text = remainder
        .strip_prefix("(+")?
        .strip_suffix(" frames skipped)")?;
    let skipped_frames = skipped_text.parse().ok()?;
    Some((rendered_fps, skipped_frames))
}

fn parse_frame_times(line: &str) -> Option<(f64, f64)> {
    let stats = line
        .split_once(" [frame-time avg=")?
        .1
        .strip_suffix(" ms]")?;
    let (average, longest) = stats.split_once(" max=")?;
    let average: f64 = average.parse().ok()?;
    let longest: f64 = longest.parse().ok()?;
    (average.is_finite() && longest.is_finite() && average >= 0.0 && longest >= average)
        .then_some((average, longest))
}

fn stream_logs<R>(app: AppHandle, serial: String, pid: u32, source: &'static str, reader: R)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                if let Some((rendered_fps, skipped_frames)) = parse_fps_line(trimmed) {
                    let times = parse_frame_times(trimmed);
                    let _ = app.emit(
                        "scrcpy-performance",
                        PerformanceEvent {
                            serial: serial.clone(),
                            pid,
                            rendered_fps,
                            skipped_frames,
                            average_frame_ms: times.map(|(average, _)| average),
                            longest_frame_ms: times.map(|(_, longest)| longest),
                        },
                    );
                    continue;
                }
                let _ = app.emit(
                    "scrcpy-log",
                    LogEvent {
                        source,
                        serial: serial.clone(),
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
            let serial = process.serial.clone();
            let state = app.state::<LauncherState>();
            let removed = if let Ok(mut running) = state.running.lock() {
                if running
                    .get(&serial)
                    .is_some_and(|active| active.pid == process.pid)
                {
                    running.remove(&serial);
                    true
                } else {
                    false
                }
            } else {
                false
            };
            if removed {
                let _ = app.emit(
                    "scrcpy-process-state",
                    ProcessStateEvent {
                        serial,
                        pid: process.pid,
                        running: false,
                        exit_code: status.code(),
                    },
                );
            }
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
    let serial = normalize_serial(&request.serial)?.to_owned();
    let backend = resolve_backend(&app)?;

    let mut running = state
        .running
        .lock()
        .map_err(|_| "Process state is unavailable.")?;
    if let Some(active) = running.get(&serial) {
        let still_running = active
            .child
            .lock()
            .map_err(|_| "Mirroring process is unavailable.")?
            .try_wait()
            .map_err(|_| "Could not inspect the mirroring process.")?
            .is_none();
        if still_running {
            return Err("A mirroring session is already running for this device.".to_owned());
        }
        running.remove(&serial);
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
        serial: serial.clone(),
        child: Arc::new(Mutex::new(child)),
    };
    running.insert(serial.clone(), process.clone());
    drop(running);

    if let Some(stdout) = stdout {
        stream_logs(app.clone(), serial.clone(), pid, "scrcpy", stdout);
    }
    if let Some(stderr) = stderr {
        stream_logs(app.clone(), serial.clone(), pid, "scrcpy", stderr);
    }
    monitor_process(app, process);

    Ok(LaunchResult { pid, serial })
}

#[tauri::command]
pub fn stop_scrcpy(state: tauri::State<'_, LauncherState>, serial: String) -> Result<(), String> {
    let serial = normalize_serial(&serial)?;
    state.stop(serial)
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
                display: DisplayMode::Native,
                start_app: None,
                window_mode: WindowMode::Windowed,
                frame_pacing: FramePacing::Smooth60,
                phone_screen_off: false,
            };
            assert_eq!(
                build_arguments(&request).unwrap(),
                vec![
                    "--serial=device-123",
                    &format!("--game-mode-profile={expected}"),
                    "--print-fps",
                    "--max-fps=60",
                    "--video-buffer=35",
                    "--render-vsync",
                ]
            );
        }
    }

    #[test]
    fn rejects_invalid_serials() {
        let request = LaunchRequest {
            serial: "\n".to_owned(),
            profile: Profile::Balanced,
            display: DisplayMode::Native,
            start_app: None,
            window_mode: WindowMode::Windowed,
            frame_pacing: FramePacing::Smooth60,
            phone_screen_off: false,
        };
        assert!(build_arguments(&request).is_err());
    }

    #[test]
    fn normalizes_device_serials() {
        let request = LaunchRequest {
            serial: "  device-123  ".to_owned(),
            profile: Profile::Balanced,
            display: DisplayMode::Native,
            start_app: None,
            window_mode: WindowMode::Windowed,
            frame_pacing: FramePacing::Smooth60,
            phone_screen_off: false,
        };
        assert_eq!(build_arguments(&request).unwrap()[0], "--serial=device-123");
        assert_eq!(normalize_serial(&request.serial).unwrap(), "device-123");
    }

    #[test]
    fn virtual_displays_preserve_resolution_for_every_profile() {
        for profile in [Profile::Competitive, Profile::Balanced, Profile::Quality] {
            for (display, size) in [
                (DisplayMode::Gaming1080, "1920x1080"),
                (DisplayMode::Performance720, "1280x720"),
                (
                    DisplayMode::Custom {
                        width: 2560,
                        height: 1440,
                    },
                    "2560x1440",
                ),
            ] {
                let request = LaunchRequest {
                    serial: "device-123".to_owned(),
                    profile,
                    display,
                    start_app: None,
                    window_mode: WindowMode::Windowed,
                    frame_pacing: FramePacing::Smooth60,
                    phone_screen_off: false,
                };
                let args = build_arguments(&request).unwrap();
                assert!(args.contains(&format!("--new-display={size}")));
                assert!(args.contains(&"--max-size=0".to_owned()));
                assert!(args.contains(&"--keep-active".to_owned()));
                assert!(!args.iter().any(|arg| arg.starts_with("--start-app")));
                assert!(!args.iter().any(|arg| arg.starts_with("--render-fit")));
            }
        }
    }

    #[test]
    fn validates_custom_resolution_and_optional_app() {
        let mut request = LaunchRequest {
            serial: "device-123".to_owned(),
            profile: Profile::Balanced,
            display: DisplayMode::Gaming1080,
            start_app: Some("  com.example.game  ".to_owned()),
            window_mode: WindowMode::Windowed,
            frame_pacing: FramePacing::Smooth60,
            phone_screen_off: false,
        };
        assert!(build_arguments(&request)
            .unwrap()
            .contains(&"--start-app=com.example.game".to_owned()));
        for package in [
            "--no-control",
            "com..game",
            "com.game;cmd",
            "+com.example.game",
            "com.game\nextra",
        ] {
            request.start_app = Some(package.to_owned());
            assert!(build_arguments(&request).is_err(), "{package}");
        }
        request.start_app = None;
        for (width, height) in [
            (0, 1080),
            (1920, 0),
            (319, 1080),
            (1921, 1080),
            (8193, 1080),
        ] {
            request.display = DisplayMode::Custom { width, height };
            assert!(build_arguments(&request).is_err());
        }
        request.display = DisplayMode::Native;
        request.start_app = Some("com.example.game".to_owned());
        assert_eq!(build_arguments(&request).unwrap().len(), 6);
    }

    #[test]
    fn maps_fullscreen_and_pacing_without_profile_overrides() {
        for profile in [Profile::Competitive, Profile::Balanced, Profile::Quality] {
            for (pacing, fps, buffer) in [
                (FramePacing::Smooth60, 60, 35),
                (FramePacing::Smooth120, 120, 20),
                (FramePacing::LowLatency, 120, 0),
            ] {
                let mut request = LaunchRequest {
                    serial: "device-123".to_owned(),
                    profile,
                    display: DisplayMode::Gaming1080,
                    start_app: None,
                    window_mode: WindowMode::Exclusive,
                    frame_pacing: pacing,
                    phone_screen_off: false,
                };
                let args = build_arguments(&request).unwrap();
                assert!(args.contains(&"--fullscreen-exclusive".to_owned()));
                assert!(!args.contains(&"--fullscreen".to_owned()));
                assert!(args.contains(&format!("--max-fps={fps}")));
                assert!(args.contains(&format!("--video-buffer={buffer}")));
                assert_eq!(args.contains(&"--render-vsync".to_owned()), buffer > 0);
                assert_eq!(
                    args.contains(&format!("--fullscreen-refresh-rate={fps}")),
                    buffer > 0
                );
                request.window_mode = WindowMode::Borderless;
                let args = build_arguments(&request).unwrap();
                assert!(args.contains(&"--fullscreen".to_owned()));
                assert!(!args
                    .iter()
                    .any(|arg| arg.starts_with("--fullscreen-refresh-rate")));
            }
        }
    }

    #[test]
    fn parses_presentation_frame_times() {
        let line = "INFO: 60 fps (+0 frames skipped) [frame-time avg=16.67 max=19.24 ms]";
        assert_eq!(parse_fps_line(line), Some((60, 0)));
        assert_eq!(parse_frame_times(line), Some((16.67, 19.24)));
        assert_eq!(parse_frame_times("INFO: 60 fps"), None);
        assert_eq!(parse_frame_times(" [frame-time avg=NaN max=20 ms]"), None);
        assert_eq!(parse_frame_times(" [frame-time avg=20 max=10 ms]"), None);
    }

    #[test]
    fn phone_screen_off_keeps_android_awake_without_power_key_locking() {
        for display in [DisplayMode::Native, DisplayMode::Gaming1080] {
            let mut request = LaunchRequest {
                serial: "device-123".to_owned(),
                profile: Profile::Balanced,
                display,
                start_app: None,
                window_mode: WindowMode::Windowed,
                frame_pacing: FramePacing::Smooth60,
                phone_screen_off: true,
            };
            let args = build_arguments(&request).unwrap();
            assert!(args.contains(&"--turn-screen-off".to_owned()));
            assert!(args.contains(&"--stay-awake".to_owned()));
            assert!(!args.contains(&"--power-off-on-close".to_owned()));
            assert!(!args.contains(&"--no-cleanup".to_owned()));
            request.phone_screen_off = false;
            let args = build_arguments(&request).unwrap();
            assert!(!args.contains(&"--turn-screen-off".to_owned()));
            assert!(!args.contains(&"--stay-awake".to_owned()));
        }
    }

    #[test]
    fn parses_fps_samples() {
        assert_eq!(parse_fps_line("INFO: 120 fps"), Some((120, 0)));
        assert_eq!(
            parse_fps_line("INFO: 117 fps (+3 frames skipped)"),
            Some((117, 3))
        );
        assert_eq!(parse_fps_line("INFO: FPS counter started"), None);
        assert_eq!(parse_fps_line("INFO: 60 fps (invalid)"), None);
    }
}
