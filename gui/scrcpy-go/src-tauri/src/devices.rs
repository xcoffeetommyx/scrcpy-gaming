use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;
use tokio::process::Command;
use tokio::time::timeout;

use crate::backend::resolve_backend;

const ADB_TIMEOUT: Duration = Duration::from_secs(5);
const KNOWN_STATES: [&str; 11] = [
    "device",
    "unauthorized",
    "offline",
    "bootloader",
    "host",
    "recovery",
    "rescue",
    "sideload",
    "authorizing",
    "connecting",
    "detached",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AdbDevice {
    pub serial: String,
    pub state: String,
    pub model: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSnapshot {
    pub kind: &'static str,
    pub title: String,
    pub message: String,
    pub serial: Option<String>,
    pub model: Option<String>,
    pub count: usize,
}

fn is_known_state(token: &str) -> bool {
    KNOWN_STATES.contains(&token)
}

pub fn parse_adb_devices(output: &str) -> Vec<AdbDevice> {
    let mut header_found = false;
    let mut devices = Vec::new();

    for raw_line in output.lines() {
        let line = raw_line.trim_end_matches('\r').trim();
        if !header_found {
            if line.starts_with("List of devices attached") {
                header_found = true;
            }
            continue;
        }

        if line.is_empty() || line.starts_with('*') || line.starts_with("adb server") {
            continue;
        }

        let tokens: Vec<&str> = line.split_whitespace().collect();
        let Some(state_index) = tokens.iter().position(|token| is_known_state(token)) else {
            continue;
        };
        if state_index == 0 {
            continue;
        }

        let serial = tokens[..state_index].join(" ");
        let state = tokens[state_index].to_owned();
        let model = tokens[state_index + 1..]
            .iter()
            .find_map(|token| token.strip_prefix("model:"))
            .map(str::to_owned);

        devices.push(AdbDevice {
            serial,
            state,
            model,
        });
    }

    devices
}

pub fn classify_devices(devices: &[AdbDevice]) -> DeviceSnapshot {
    match devices {
        [] => DeviceSnapshot {
            kind: "noDevice",
            title: "Looking for your Android device".to_owned(),
            message: "Connect your phone with USB debugging enabled.".to_owned(),
            serial: None,
            model: None,
            count: 0,
        },
        [device] if device.state == "device" => DeviceSnapshot {
            kind: "connected",
            title: "Device connected".to_owned(),
            message: "Connected and ready to launch.".to_owned(),
            serial: Some(device.serial.clone()),
            model: device.model.clone(),
            count: 1,
        },
        [device] if matches!(device.state.as_str(), "unauthorized" | "authorizing") => {
            DeviceSnapshot {
                kind: "unauthorized",
                title: "Approve this computer".to_owned(),
                message: "Unlock your phone and accept the USB debugging prompt.".to_owned(),
                serial: Some(device.serial.clone()),
                model: device.model.clone(),
                count: 1,
            }
        }
        [device] => DeviceSnapshot {
            kind: "unavailable",
            title: "Device unavailable".to_owned(),
            message: format!(
                "The device reports “{}”. Reconnect USB and try again.",
                device.state
            ),
            serial: Some(device.serial.clone()),
            model: device.model.clone(),
            count: 1,
        },
        devices => DeviceSnapshot {
            kind: "multipleDevices",
            title: "Multiple devices connected".to_owned(),
            message: "Disconnect extra devices, then refresh to continue.".to_owned(),
            serial: None,
            model: None,
            count: devices.len(),
        },
    }
}

fn adb_error(message: impl Into<String>) -> DeviceSnapshot {
    DeviceSnapshot {
        kind: "adbError",
        title: "ADB unavailable".to_owned(),
        message: message.into(),
        serial: None,
        model: None,
        count: 0,
    }
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    command.creation_flags(0x0800_0000);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

#[tauri::command]
pub async fn get_device_status(app: AppHandle) -> DeviceSnapshot {
    let backend = match resolve_backend(&app) {
        Ok(backend) => backend,
        Err(error) => return adb_error(error),
    };

    let mut command = Command::new(&backend.adb);
    command
        .args(["devices", "-l"])
        .current_dir(&backend.directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    hide_console(&mut command);

    let output = match timeout(ADB_TIMEOUT, command.output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(_)) => return adb_error("ADB could not start. Check the launcher installation."),
        Err(_) => return adb_error("ADB did not respond. Reconnect the device and try again."),
    };

    if !output.status.success() {
        return adb_error("ADB could not list devices. Reconnect USB and try again.");
    }

    classify_devices(&parse_adb_devices(&String::from_utf8_lossy(&output.stdout)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_authorized_device_and_model() {
        let output = "List of devices attached\r\n\
R5CWB2H4YGD device product:dm3quew model:SM_S916U1 device:dm3q transport_id:1\r\n";

        assert_eq!(
            parse_adb_devices(output),
            vec![AdbDevice {
                serial: "R5CWB2H4YGD".to_owned(),
                state: "device".to_owned(),
                model: Some("SM_S916U1".to_owned()),
            }]
        );
    }

    #[test]
    fn parses_unauthorized_and_offline_devices() {
        let output = "* daemon started successfully *\n\
List of devices attached\n\
phone-one unauthorized usb:1-2 transport_id:1\n\
192.168.1.5:5555 offline transport_id:2\n";

        let devices = parse_adb_devices(output);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].state, "unauthorized");
        assert_eq!(devices[1].state, "offline");
    }

    #[test]
    fn preserves_serials_containing_spaces() {
        let output = "List of devices attached\nserial with spaces device model:Pixel_9\n";
        let devices = parse_adb_devices(output);
        assert_eq!(devices[0].serial, "serial with spaces");
    }

    #[test]
    fn classifies_all_phase_one_states() {
        assert_eq!(classify_devices(&[]).kind, "noDevice");

        let connected = AdbDevice {
            serial: "one".to_owned(),
            state: "device".to_owned(),
            model: Some("Phone".to_owned()),
        };
        assert_eq!(
            classify_devices(std::slice::from_ref(&connected)).kind,
            "connected"
        );

        let unauthorized = AdbDevice {
            state: "unauthorized".to_owned(),
            ..connected.clone()
        };
        assert_eq!(
            classify_devices(std::slice::from_ref(&unauthorized)).kind,
            "unauthorized"
        );

        let offline = AdbDevice {
            state: "offline".to_owned(),
            ..connected.clone()
        };
        assert_eq!(classify_devices(&[offline]).kind, "unavailable");
        assert_eq!(
            classify_devices(&[connected, unauthorized]).kind,
            "multipleDevices"
        );
    }
}
