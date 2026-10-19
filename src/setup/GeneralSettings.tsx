import { useCallback, useEffect, useState } from "react";
import {
  SavedInput,
  findSavedInput,
  listInputDevices,
  saveInput,
  unlockDeviceLabels,
} from "../audio/inputDevices";
import { toggleKiosk, useKiosk } from "../kiosk";
import { KICK_SENSITIVITY_RANGE, updateSettings, useSettings } from "../settings";

type Status = "loading" | "ready" | "error";

interface Props {
  saved: SavedInput | null;
  onSave: (input: SavedInput) => void;
}

function formatSensitivity(steps: number): string {
  if (steps === 0) return "Default";
  return `${steps > 0 ? "+" : ""}${steps}`;
}

export function GeneralSettings({ saved, onSave }: Props) {
  const settings = useSettings();
  const kiosk = useKiosk();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const rescan = useCallback(async () => {
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
    rescan();
    // Re-list when the interface is plugged in or pulled out.
    const onDeviceChange = () => {
      listInputDevices().then(setDevices).catch(() => {});
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, [rescan]);

  const current = findSavedInput(devices, saved);

  const selectDevice = (deviceId: string) => {
    const device = devices.find((d) => d.deviceId === deviceId);
    if (device) onSave(saveInput(device));
  };

  return (
    <div className="settings-page">
      <h2>General</h2>

      <section className="setting">
        <label htmlFor="audio-input">Audio input</label>
        <p className="hint">The interface fed by the mixer.</p>
        <div className="setting-row">
          <select
            id="audio-input"
            value={current?.deviceId ?? ""}
            disabled={status !== "ready" || devices.length === 0}
            onChange={(e) => selectDevice(e.target.value)}
          >
            {!current && (
              <option value="" disabled>
                {status === "loading"
                  ? "Looking for input devices…"
                  : saved
                    ? `${saved.label} (not connected)`
                    : devices.length === 0
                      ? "No audio inputs found"
                      : "Choose an input…"}
              </option>
            )}
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Unnamed input"}
              </option>
            ))}
          </select>
          <button onClick={rescan} disabled={status === "loading"}>
            Rescan
          </button>
        </div>
        {status === "ready" && saved && !current && (
          <p className="warning">Saved input "{saved.label}" isn't connected.</p>
        )}
        {status === "error" && (
          <div className="error">
            <p>Couldn't access audio inputs.</p>
            <pre>{error}</pre>
            <p>
              Check that microphone access is allowed for MAK Visualizer in System Settings →
              Privacy &amp; Security.
            </p>
          </div>
        )}
      </section>

      <section className="setting">
        <label className="setting-check">
          <input
            type="checkbox"
            checked={settings.logoVisible}
            onChange={(e) => updateSettings({ logoVisible: e.target.checked })}
          />
          Show logo <kbd>L</kbd>
        </label>
      </section>

      <section className="setting">
        <label htmlFor="kick-sensitivity">
          Kick pulse sensitivity <kbd>-</kbd> <kbd>=</kbd>
        </label>
        <div className="setting-row">
          <input
            id="kick-sensitivity"
            type="range"
            min={-KICK_SENSITIVITY_RANGE}
            max={KICK_SENSITIVITY_RANGE}
            step={1}
            value={settings.kickSensitivity}
            onChange={(e) => updateSettings({ kickSensitivity: Number(e.target.value) })}
          />
          <span className="setting-value">{formatSensitivity(settings.kickSensitivity)}</span>
          <button
            onClick={() => updateSettings({ kickSensitivity: 0 })}
            disabled={settings.kickSensitivity === 0}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="setting">
        <label className="setting-check">
          <input
            type="checkbox"
            checked={kiosk}
            onChange={() => toggleKiosk().catch((err) => console.error("[kiosk] toggle failed", err))}
          />
          Fullscreen (kiosk mode) <kbd>F</kbd>
        </label>
      </section>
    </div>
  );
}
