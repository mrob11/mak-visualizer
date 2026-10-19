import { useEffect, useMemo, useRef } from "react";
import { updateSettings, useSettings } from "../settings";
import { presetNames, requestPreset, useCurrentPreset } from "./presetLibrary";

// Checked presets are in the cycle; the one on screen is marked. Clicking a row plays
// that preset; only the checkbox itself changes the cycle. The visuals keep running
// behind it, and ←/→ still work while it's open, so you can preview presets and cull
// them as you go. Shown on its own by V, and as a page of the D settings panel.
// `onClose` adds a Close button (the panel has its own).
export function PresetList({ onClose }: { onClose?: () => void }) {
  const { disabledPresets } = useSettings();
  const current = useCurrentPreset();
  const disabled = useMemo(() => new Set(disabledPresets), [disabledPresets]);
  const enabledCount = presetNames.length - presetNames.filter((name) => disabled.has(name)).length;
  const currentRowRef = useRef<HTMLLIElement>(null);

  // Open with the current preset in view. Only on open, so the list doesn't jump
  // around while you're scrolling and the preset changes underneath.
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const toggle = (name: string) => {
    if (disabled.has(name)) {
      updateSettings({ disabledPresets: disabledPresets.filter((n) => n !== name) });
    } else if (enabledCount > 1) {
      updateSettings({ disabledPresets: [...disabledPresets, name] });
    }
  };

  return (
    <div className="preset-list">
      <header>
        <div>
          <h2>Visualizations</h2>
          <p>
            {enabledCount} of {presetNames.length} in rotation
          </p>
        </div>
        <div className="preset-menu-actions">
          <button onClick={() => updateSettings({ disabledPresets: [] })} disabled={disabled.size === 0}>
            Enable all
          </button>
          {onClose && <button onClick={onClose}>Close</button>}
        </div>
      </header>
      <ul>
        {presetNames.map((name) => {
          const isCurrent = name === current;
          const enabled = !disabled.has(name);
          return (
            <li
              key={name}
              ref={isCurrent ? currentRowRef : undefined}
              className={isCurrent ? "current" : undefined}
            >
              <div className="preset-row" onClick={() => requestPreset(name)}>
                <input
                  type="checkbox"
                  checked={enabled}
                  // Keep at least one preset in the cycle.
                  disabled={enabled && enabledCount === 1}
                  onChange={() => toggle(name)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className={enabled ? "preset-name" : "preset-name off"}>{name}</span>
                {isCurrent && <span className="now-playing">Now playing</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Toggled with V.
export function PresetMenu({ onClose }: { onClose: () => void }) {
  return (
    <aside className="preset-menu">
      <PresetList onClose={onClose} />
    </aside>
  );
}
