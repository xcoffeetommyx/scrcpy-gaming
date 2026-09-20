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

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
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
    pub count: usize,
    pub ready_count: usize,
    pub devices: Vec<AdbDevice>,
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
        if let Some(index) = tokens
            .windows(2)
            .position(|pair| pair == ["no", "permissions"])
        {
            if index > 0 {
                devices.push(AdbDevice {
                    serial: tokens[..index].join(" "),
                    state: "no permissions".to_owned(),
                    model: None,
                });
            }
            continue;
        }
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
    let ready_count = devices
        .iter()
        .filter(|device| device.state == "device")
        .count();

    if devices.is_empty() {
        return DeviceSnapshot {
            kind: "noDevice",
            title: "Looking for your Android device".to_owned(),
            message: "Connect your phone with USB debugging enabled.".to_owned(),
            count: 0,
            ready_count: 0,
            devices: Vec::new(),
        };
    }

    if ready_count > 0 {
        let message = if ready_count == 1 && devices.len() == 1 {
            "Connected and ready to launch.".to_owned()
        } else if ready_count == 1 {
            "One device is ready. Other connected devices need attention.".to_owned()
        } else {
            format!("Choose one of the {ready_count} ready devices to mirror.")
        };
        return DeviceSnapshot {
            kind: "connected",
            title: if ready_count == 1 {
                "Device connected".to_owned()
            } else {
                "Devices connected".to_owned()
            },
            message,
            count: devices.len(),
            ready_count,
            devices: devices.to_vec(),
        };
    }

    let needs_authorization = devices
        .iter()
        .any(|device| matches!(device.state.as_str(), "unauthorized" | "authorizing"));
    let needs_usb_access = devices
        .iter()
        .any(|device| device.state == "no permissions");
    DeviceSnapshot {
        kind: if needs_authorization {
            "unauthorized"
        } else {
            "unavailable"
        },
        title: if needs_usb_access {
            "Allow USB access".to_owned()
        } else if needs_authorization {
            "Approve this computer".to_owned()
        } else {
            "Devices unavailable".to_owned()
        },
        message: if needs_usb_access {
            "Choose Set up USB access below, approve the administrator prompt, then reconnect your phone.".to_owned()
        } else if needs_authorization {
            "Unlock the device and accept the USB debugging prompt.".to_owned()
        } else {
            "No connected device is ready. Reconnect USB and try again.".to_owned()
        },
        count: devices.len(),
        ready_count: 0,
        devices: devices.to_vec(),
    }
}

fn adb_error(message: impl Into<String>) -> DeviceSnapshot {
    DeviceSnapshot {
        kind: "adbError",
        title: "ADB unavailable".to_owned(),
        message: message.into(),
        count: 0,
        ready_count: 0,
        devices: Vec::new(),
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
    fn detects_linux_usb_permissions_without_hiding_the_phone() {
        let output = "List of devices attached\nphone-one no permissions (user in plugdev group; are your udev rules wrong?); see [http://developer.android.com/tools/device.html] usb:1-2\n";
        let devices = parse_adb_devices(output);
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].serial, "phone-one");
        assert_eq!(devices[0].state, "no permissions");
        let snapshot = classify_devices(&devices);
        assert_eq!(snapshot.ready_count, 0);
        assert_eq!(snapshot.title, "Allow USB access");
    }

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
    fn parses_physical_device_and_emulator_together() {
        let output = "List of devices attached\n\
R5CWB2H4YGD device product:dm2quew model:SM_S916U1 device:dm2q transport_id:30\n\
emulator-5554 device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64xa transport_id:20\n";

        let devices = parse_adb_devices(output);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].serial, "R5CWB2H4YGD");
        assert_eq!(devices[1].serial, "emulator-5554");
        assert!(devices.iter().all(|device| device.state == "device"));
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
        assert_eq!(
            classify_devices(std::slice::from_ref(&connected)).ready_count,
            1
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

        let multiple = classify_devices(&[connected, unauthorized]);
        assert_eq!(multiple.kind, "connected");
        assert_eq!(multiple.count, 2);
        assert_eq!(multiple.ready_count, 1);
        assert_eq!(multiple.devices.len(), 2);
    }

    #[test]
    fn exposes_all_ready_devices_for_selection() {
        let physical = AdbDevice {
            serial: "R5CWB2H4YGD".to_owned(),
            state: "device".to_owned(),
            model: Some("SM_S916U1".to_owned()),
        };
        let emulator = AdbDevice {
            serial: "emulator-5554".to_owned(),
            state: "device".to_owned(),
            model: Some("sdk_gphone64_x86_64".to_owned()),
        };

        let snapshot = classify_devices(&[emulator.clone(), physical.clone()]);
        assert_eq!(snapshot.kind, "connected");
        assert_eq!(snapshot.ready_count, 2);
        assert_eq!(snapshot.devices, vec![emulator, physical]);
    }
}
