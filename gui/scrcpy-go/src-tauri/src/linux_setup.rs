#[tauri::command]
pub fn supports_usb_setup() -> bool {
    cfg!(target_os = "linux")
}

#[tauri::command]
pub async fn setup_usb(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        use tauri::Manager;
        let script = app
            .path()
            .resolve("linux/setup-usb.sh", tauri::path::BaseDirectory::Resource)
            .map_err(|_| "USB setup is missing. Reinstall Scrcpy GO.")?;
        let output = tokio::process::Command::new("pkexec")
            .arg("/bin/sh").arg(script)
            .stdin(std::process::Stdio::null())
            .output().await
            .map_err(|_| "Could not open administrator authorization. Install your distribution's PolicyKit package using its software manager.")?;
        if !output.status.success() {
            return Err("USB setup was cancelled or could not finish. Try again and approve the administrator prompt.".to_owned());
        }
        Ok("USB access is ready. Unplug and reconnect your phone, then accept its USB debugging prompt.".to_owned())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        Err("USB setup is only needed on Linux.".to_owned())
    }
}
