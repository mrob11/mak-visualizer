export interface SavedInput {
  deviceId: string;
  label: string;
}

const STORAGE_KEY = "mak.audioInput";

// Chromium lists these alias entries alongside the real devices. Saving one would
// silently follow the OS default input, so only offer concrete devices.
const ALIAS_IDS = new Set(["default", "communications"]);

export function loadSavedInput(): SavedInput | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value?.deviceId === "string" && typeof value?.label === "string") {
      return { deviceId: value.deviceId, label: value.label };
    }
  } catch {
    // Unreadable storage is treated as "nothing saved".
  }
  return null;
}

export function saveInput(device: MediaDeviceInfo): SavedInput {
  const saved = { deviceId: device.deviceId, label: device.label };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Still usable for this session even if it can't be persisted.
  }
  return saved;
}

// Device labels (and in WebKit, most of the device list) stay hidden until the
// page has been granted microphone access once, so open and immediately close a stream.
export async function unlockDeviceLabels(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(
    (d) => d.kind === "audioinput" && d.deviceId !== "" && !ALIAS_IDS.has(d.deviceId),
  );
}

// Device IDs aren't guaranteed to survive a relaunch or a USB reconnect, so fall
// back to matching on the label ("Scarlett 4i4 USB" etc.).
export function findSavedInput(
  devices: MediaDeviceInfo[],
  saved: SavedInput | null,
): MediaDeviceInfo | null {
  if (!saved) return null;
  return (
    devices.find((d) => d.deviceId === saved.deviceId) ??
    devices.find((d) => d.label === saved.label) ??
    null
  );
}
