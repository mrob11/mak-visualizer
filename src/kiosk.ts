import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

// In the app, kiosk mode is simple fullscreen + always-on-top, handled in Rust
// (src-tauri/src/lib.rs). In a plain browser (`pnpm dev`) fall back to the
// Fullscreen API so F still does something useful.

// Mirrors the real state so the settings panel checkbox stays in step with F.
let kioskOn = false;
const listeners = new Set<() => void>();

function setKioskOn(on: boolean) {
  if (on === kioskOn) return;
  kioskOn = on;
  listeners.forEach((listener) => listener());
}

if (isTauri()) {
  invoke<boolean>("kiosk_enabled")
    .then(setKioskOn)
    .catch((err) => console.error("[kiosk] state query failed", err));
} else {
  kioskOn = document.fullscreenElement !== null;
  document.addEventListener("fullscreenchange", () => setKioskOn(document.fullscreenElement !== null));
}

export async function toggleKiosk(): Promise<void> {
  if (isTauri()) {
    setKioskOn(await invoke<boolean>("toggle_kiosk"));
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useKiosk(): boolean {
  return useSyncExternalStore(subscribe, () => kioskOn);
}
