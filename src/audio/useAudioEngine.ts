import { useEffect, useState, useSyncExternalStore } from "react";
import { AudioEngine, EngineStatus } from "./audioEngine";
import { SavedInput } from "./inputDevices";

const noSubscribe = () => () => {};
const noStatus = () => null;

// One engine for as long as the caller is mounted; switching the saved input
// reconnects inside it rather than rebuilding it.
export function useAudioEngine(saved: SavedInput): {
  engine: AudioEngine | null;
  status: EngineStatus | null;
} {
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  const { deviceId, label } = saved;

  useEffect(() => {
    const created = new AudioEngine();
    setEngine(created);
    return () => {
      setEngine(null);
      created.dispose();
    };
  }, []);

  useEffect(() => {
    engine?.setInput({ deviceId, label });
  }, [engine, deviceId, label]);

  const status = useSyncExternalStore(
    engine ? engine.subscribe : noSubscribe,
    engine ? engine.getStatus : noStatus,
  );
  return { engine, status };
}
