use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, Runtime, WebviewWindow, Window, WindowEvent};

/// Whether the main window is in kiosk mode (simple fullscreen + always on top).
struct Kiosk(AtomicBool);

fn kiosk_on<R: Runtime, M: Manager<R>>(manager: &M) -> bool {
    manager.state::<Kiosk>().0.load(Ordering::Relaxed)
}

// Uses macOS "simple" fullscreen, which covers the screen in place. Native fullscreen
// moves the window to its own Space, and macOS slides that Space away the moment
// another app takes focus (a notification, an updater dialog), putting the desktop on
// the TV. Always-on-top keeps other windows behind us even when they do take focus.
// On other platforms set_simple_fullscreen falls back to regular fullscreen.
fn set_kiosk(window: &WebviewWindow, on: bool) -> tauri::Result<()> {
    window.set_simple_fullscreen(on)?;
    window.set_always_on_top(on)?;
    window.state::<Kiosk>().0.store(on, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn kiosk_enabled(window: WebviewWindow) -> bool {
    kiosk_on(&window)
}

#[tauri::command]
fn toggle_kiosk(window: WebviewWindow) -> tauri::Result<bool> {
    let on = !kiosk_on(&window);
    set_kiosk(&window, on)?;
    Ok(on)
}

// In kiosk mode, undo anything that takes the window off screen (Cmd+M, Cmd+H, a
// stray click on the dock). Focus itself is left alone so the laptop stays usable;
// always-on-top keeps the visuals in front either way.
fn keep_on_screen<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if !matches!(event, WindowEvent::Resized(_) | WindowEvent::Focused(false)) {
        return;
    }
    if !kiosk_on(window) {
        return;
    }
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    if !window.is_visible().unwrap_or(true) {
        let _ = window.show();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Kiosk(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![kiosk_enabled, toggle_kiosk])
        .setup(|app| {
            // Hold display- and idle-sleep assertions for as long as the app runs: no
            // screensaver, no display sleep, no system sleep mid-set. macOS releases
            // them when the process exits, so leaking the guard is fine.
            match keepawake::Builder::default()
                .display(true)
                .idle(true)
                .reason("Showing live visuals")
                .app_name("MAK Visualizer")
                .app_reverse_domain("com.menamongstkings.visualizer")
                .create()
            {
                Ok(guard) => std::mem::forget(guard),
                Err(err) => eprintln!("could not prevent sleep: {err}"),
            }

            // Release builds launch straight into kiosk mode. Dev builds start windowed
            // so the editor and devtools stay reachable; F toggles either way.
            if !cfg!(debug_assertions) {
                if let Some(window) = app.get_webview_window("main") {
                    set_kiosk(&window, true)?;
                }
            }
            Ok(())
        })
        .on_window_event(keep_on_screen)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
