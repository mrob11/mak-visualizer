import { useSyncExternalStore } from "react";

// Live-tweakable settings, persisted so a relaunch (including the crash-restart one)
// comes back exactly as tuned at soundcheck.

export interface Settings {
  logoVisible: boolean;
  // Steps either side of the default kick detection thresholds; see kickDetector.ts.
  kickSensitivity: number;
  // Preset names left out of the cycle (the V menu). Stored as the disabled set so
  // presets added in a future pack start out enabled.
  disabledPresets: string[];
}

export const KICK_SENSITIVITY_RANGE = 5;

const STORAGE_KEY = "mak.settings";
const DEFAULTS: Settings = { logoVisible: true, kickSensitivity: 0, disabledPresets: [] };

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value = JSON.parse(raw);
      return {
        logoVisible: typeof value?.logoVisible === "boolean" ? value.logoVisible : DEFAULTS.logoVisible,
        kickSensitivity: Number.isInteger(value?.kickSensitivity)
          ? clampSensitivity(value.kickSensitivity)
          : DEFAULTS.kickSensitivity,
        disabledPresets: Array.isArray(value?.disabledPresets)
          ? value.disabledPresets.filter((name: unknown) => typeof name === "string")
          : DEFAULTS.disabledPresets,
      };
    }
  } catch {
    // Unreadable storage falls back to defaults.
  }
  return DEFAULTS;
}

function clampSensitivity(steps: number): number {
  return Math.max(-KICK_SENSITIVITY_RANGE, Math.min(KICK_SENSITIVITY_RANGE, steps));
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...current, ...patch };
  next.kickSensitivity = clampSensitivity(next.kickSensitivity);
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Still applies for this session.
  }
  listeners.forEach((listener) => listener());
  return current;
}

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
