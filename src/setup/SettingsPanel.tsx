import { KeyboardEvent, useState } from "react";
import { SavedInput } from "../audio/inputDevices";
import { PresetList } from "../visuals/PresetMenu";
import { GeneralSettings } from "./GeneralSettings";

const PAGES = [
  { id: "general", label: "General" },
  { id: "visualizations", label: "Visualizations" },
] as const;

type PageId = (typeof PAGES)[number]["id"];

interface Props {
  saved: SavedInput | null;
  onSave: (input: SavedInput) => void;
  onClose: () => void;
}

// Keys a focused dropdown or slider would otherwise act on itself: arrows would switch
// the audio input (or nudge the slider) as well as change preset, and type-to-select
// would jump the input dropdown on hotkey letters. The hotkeys still see the event.
function keepHotkeysOffControls(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const isControl =
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement && target.type === "range");
  if (isControl && e.key !== "Tab" && e.key !== " " && e.key !== "Enter") e.preventDefault();
}

// Toggled with D, over whatever the stage is showing, so changes can be seen live and
// every other hotkey keeps working while it's open. Shown on its own (and can't be
// closed) until an input has been chosen.
export function SettingsPanel({ saved, onSave, onClose }: Props) {
  const [page, setPage] = useState<PageId>("general");

  return (
    <div className="settings-backdrop">
      <div className="settings-panel" onKeyDown={keepHotkeysOffControls}>
        <nav className="settings-nav">
          <ul>
            {PAGES.map(({ id, label }) => (
              <li key={id}>
                <button className={id === page ? "active" : undefined} onClick={() => setPage(id)}>
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">
            <kbd>D</kbd> to close
          </p>
          <button onClick={onClose} disabled={!saved}>
            Done
          </button>
        </nav>
        <div className="settings-content">
          {page === "general" && <GeneralSettings saved={saved} onSave={onSave} />}
          {page === "visualizations" && <PresetList />}
        </div>
      </div>
    </div>
  );
}
