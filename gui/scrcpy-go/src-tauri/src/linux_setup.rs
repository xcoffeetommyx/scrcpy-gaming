#[tauri::command]
pub fn supports_usb_setup() -> bool {
    cfg!(target_os = "linux")
}

#[tauri::command]
pub async fn setup_usb() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        // Root cannot necessarily read an AppImage's user-owned FUSE mount.
        // Pass only this compile-time, fixed script, never frontend input.
        let output = tokio::process::Command::new("pkexec")
            .args(["/bin/sh", "-c", include_str!("../linux/setup-usb.sh")])
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
        Err("USB setup is only needed on Linux.".to_owned())
    }
}
