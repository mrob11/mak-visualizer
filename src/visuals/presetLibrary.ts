import { useSyncExternalStore } from "react";
import butterchurnPresets from "butterchurn-presets";
import { customPresets } from "./presets";

export const presets = { ...butterchurnPresets.getPresets(), ...customPresets };
// Alphabetical, ignoring case, for the menu.
export const presetNames = Object.keys(presets).sort((a, b) =>
  a.localeCompare(b, undefined, { sensitivity: "base" }),
);

// The preset currently on screen, published by the Visualizer for the menu.
let currentPreset: string | null = null;
const listeners = new Set<() => void>();

export function setCurrentPreset(name: string) {
  currentPreset = name;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurrentPreset(): string | null {
  return useSyncExternalStore(subscribe, () => currentPreset);
}

// Requests from the menu to play a specific preset now; the Visualizer listens.
const requestListeners = new Set<(name: string) => void>();

export function requestPreset(name: string) {
  requestListeners.forEach((listener) => listener(name));
}

export function onPresetRequest(listener: (name: string) => void) {
  requestListeners.add(listener);
  return () => {
    requestListeners.delete(listener);
  };
}
