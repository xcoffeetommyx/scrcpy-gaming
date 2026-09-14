mod backend;
mod devices;
mod process;

use process::LauncherState;
use tauri::Manager;

pub fn run() {
    let app = tauri::Builder::default()
        .manage(LauncherState::default())
        .invoke_handler(tauri::generate_handler![
            devices::get_device_status,
            process::launch_scrcpy,
            process::stop_scrcpy
        ])
        .build(tauri::generate_context!())
        .expect("error while building Scrcpy GO");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app_handle.state::<LauncherState>();
            state.stop_all();
        }
    });
}
