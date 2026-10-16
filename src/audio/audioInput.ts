import {
  SavedInput,
  findSavedInput,
  listInputDevices,
  unlockDeviceLabels,
} from "./inputDevices";

export class InputNotConnectedError extends Error {
  constructor(label: string) {
    super(`"${label}" isn't connected`);
    this.name = "InputNotConnectedError";
  }
}

// The browser's voice-call processing wrecks a music feed: auto gain flattens the
// dynamics the visuals react to, and noise suppression eats sustained notes.
function constraintsFor(deviceId: string): MediaStreamConstraints {
  return {
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  };
}

function isMissingDeviceError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "OverconstrainedError" || name === "NotFoundError";
}

export async function openInputStream(saved: SavedInput): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(constraintsFor(saved.deviceId));
  } catch (err) {
    if (!isMissingDeviceError(err)) throw err;
  }
  // The saved ID went stale (relaunch or USB reconnect); look the device up by label.
  await unlockDeviceLabels();
  const device = findSavedInput(await listInputDevices(), saved);
  if (!device) throw new InputNotConnectedError(saved.label);
  return navigator.mediaDevices.getUserMedia(constraintsFor(device.deviceId));
}
