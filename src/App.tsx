import { useEffect, useState } from "react";
import { SavedInput, loadSavedInput } from "./audio/inputDevices";
import { toggleKiosk } from "./kiosk";
import { SettingsPanel } from "./setup/SettingsPanel";
import { Stage } from "./Stage";
import { StageErrorBoundary } from "./StageErrorBoundary";
import "./App.css";

function App() {
  const [savedInput, setSavedInput] = useState<SavedInput | null>(loadSavedInput);
  const [showSetup, setShowSetup] = useState(savedInput === null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "d" || e.key === "D") setShowSetup((open) => !open);
      if (e.key === "Escape") setShowSetup(false);
      if (e.key === "f" || e.key === "F") {
        toggleKiosk().catch((err) => console.error("[kiosk] toggle failed", err));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The panel sits over the stage rather than replacing it, so the visuals (and their
  // hotkeys) keep running and setting changes show up live.
  return (
    <>
      {savedInput && (
        <StageErrorBoundary>
          <Stage input={savedInput} />
        </StageErrorBoundary>
      )}
      {(showSetup || !savedInput) && (
        <SettingsPanel
          saved={savedInput}
          onSave={setSavedInput}
          onClose={() => setShowSetup(false)}
        />
      )}
    </>
  );
}

export default App;
