import { useEffect, useState } from "react";
import { EngineStatus } from "./audio/audioEngine";
import { SavedInput } from "./audio/inputDevices";
import { useAudioEngine } from "./audio/useAudioEngine";
import { getSettings, updateSettings, useSettings } from "./settings";
import { DebugBars } from "./debug/DebugBars";
import { LogoOverlay } from "./visuals/LogoOverlay";
import { PresetMenu } from "./visuals/PresetMenu";
import { Visualizer } from "./visuals/Visualizer";

// Small and dim on purpose: it's for whoever is running the laptop, not the crowd.
// Silence between songs is normal and gets no message; only a lost input does.
function InputStatus({ status }: { status: EngineStatus }) {
  if (status.connection !== "lost" && status.connection !== "blocked") return null;
  return (
    <p className="input-status">
      {status.message ?? "Input lost"}
      {status.connection === "lost" && " — reconnecting…"}
    </p>
  );
}

const TOAST_MS = 1500;

function formatSensitivity(steps: number): string {
  if (steps === 0) return "Kick sensitivity: default";
  return `Kick sensitivity: ${steps > 0 ? "+" : ""}${steps}`;
}

export function Stage({ input }: { input: SavedInput }) {
  const { engine, status } = useAudioEngine(input);
  const settings = useSettings();
  // B swaps in the analyser debug view, handy for checking levels at soundcheck.
  const [showDebug, setShowDebug] = useState(false);
  // V opens the preset menu.
  const [showMenu, setShowMenu] = useState(false);
  // Brief, dim confirmation when a control changes something not obvious on screen.
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const { kickSensitivity, logoVisible } = getSettings();
      switch (e.key) {
        case "b":
        case "B":
          setShowDebug((on) => !on);
          break;
        case "v":
        case "V":
          setShowMenu((open) => !open);
          break;
        case "Escape":
          setShowMenu(false);
          break;
        case "l":
        case "L":
          updateSettings({ logoVisible: !logoVisible });
          break;
        case "-":
        case "_":
          setToast(formatSensitivity(updateSettings({ kickSensitivity: kickSensitivity - 1 }).kickSensitivity));
          break;
        case "=":
        case "+":
          setToast(formatSensitivity(updateSettings({ kickSensitivity: kickSensitivity + 1 }).kickSensitivity));
          break;
        case "0":
          setToast(formatSensitivity(updateSettings({ kickSensitivity: 0 }).kickSensitivity));
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!engine || !status) return <main className="stage" />;

  if (showDebug) return <DebugBars engine={engine} status={status} />;

  // The visuals run no matter what the input is doing: the engine swaps in its idle
  // groove when the input is silent or gone, and reconnects underneath.
  return (
    <div className="layers">
      <Visualizer engine={engine} />
      <LogoOverlay engine={engine} visible={settings.logoVisible} />
      <InputStatus status={status} />
      {toast && <p className="toast">{toast}</p>}
      {showMenu && <PresetMenu onClose={() => setShowMenu(false)} />}
    </div>
  );
}
