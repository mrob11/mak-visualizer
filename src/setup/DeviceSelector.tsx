import { useCallback, useEffect, useState } from "react";
import {
  SavedInput,
  findSavedInput,
  listInputDevices,
  saveInput,
  unlockDeviceLabels,
} from "../audio/inputDevices";

type Status = "loading" | "ready" | "error";

interface Props {
  saved: SavedInput | null;
  onSave: (input: SavedInput) => void;
  onClose: () => void;
}

export function DeviceSelector({ saved, onSave, onClose }: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      await unlockDeviceLabels();
      setDevices(await listInputDevices());
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    refresh();
    // Re-list when the interface is plugged in or pulled out.
    const onDeviceChange = () => {
      listInputDevices().then(setDevices).catch(() => {});
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [refresh]);

  const current = findSavedInput(devices, saved);

  return (
    <main className="setup">
      <h1>Audio input</h1>
      <p className="hint">
        Pick the interface fed by the mixer. Press <kbd>D</kbd> to open or close this screen.
      </p>

      {status === "loading" && <p>Looking for input devices…</p>}

      {status === "error" && (
        <div className="error">
          <p>Couldn't access audio inputs.</p>
          <pre>{error}</pre>
          <p>Check that microphone access is allowed for MAK Visualizer in System Settings → Privacy &amp; Security.</p>
          <button onClick={refresh}>Try again</button>
        </div>
      )}

      {status === "ready" && devices.length === 0 && <p>No audio inputs found.</p>}

      {status === "ready" && devices.length > 0 && (
        <ul className="devices">
          {devices.map((device) => (
            <li key={device.deviceId}>
              <label>
                <input
                  type="radio"
                  name="audio-input"
                  checked={current?.deviceId === device.deviceId}
                  onChange={() => onSave(saveInput(device))}
                />
                {device.label || "Unnamed input"}
              </label>
            </li>
          ))}
        </ul>
      )}

      {status === "ready" && saved && !current && (
        <p className="warning">Saved input "{saved.label}" isn't connected.</p>
      )}

      <div className="actions">
        <button onClick={refresh} disabled={status === "loading"}>
          Rescan
        </button>
        <button onClick={onClose} disabled={!saved}>
          Done
        </button>
      </div>
    </main>
  );
}
