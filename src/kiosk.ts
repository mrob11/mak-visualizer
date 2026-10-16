import { invoke, isTauri } from "@tauri-apps/api/core";

// In the app, kiosk mode is simple fullscreen + always-on-top, handled in Rust
// (src-tauri/src/lib.rs). In a plain browser (`pnpm dev`) fall back to the
// Fullscreen API so F still does something useful.
export async function toggleKiosk(): Promise<void> {
  if (isTauri()) {
    await invoke<boolean>("toggle_kiosk");
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
}
