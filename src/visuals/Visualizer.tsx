import { useEffect, useRef, useState } from "react";
import butterchurnModule from "butterchurn";
import { AudioEngine } from "../audio/audioEngine";
import { getSettings, subscribeSettings } from "../settings";
import { onPresetRequest, presetNames, presets, setCurrentPreset } from "./presetLibrary";
import { customPresetImages } from "./presets";

// Butterchurn's UMD build exports `{ default: Butterchurn }`, and Vite's CJS interop
// doesn't always unwrap it, so take whichever shape arrives.
const butterchurn =
  (butterchurnModule as unknown as { default?: typeof butterchurnModule }).default ??
  butterchurnModule;

const PRESET_SECONDS = 30;
const BLEND_SECONDS = 2.7;
// Arrow-key changes blend faster so they feel like a response to the key press.
const MANUAL_BLEND_SECONDS = 0.7;
// The TV runs at 1x anyway. Rendering at Retina density on the laptop costs a lot
// of GPU for nothing anyone on stage will see.
const MAX_PIXEL_RATIO = 1;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function Visualizer({ engine }: { engine: AudioEngine }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the GPU drops our WebGL context, to rebuild on a fresh canvas.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // A fresh canvas per mount: the cleanup below kills its WebGL context, and a
    // reused canvas would hand that dead context back on the next mount.
    const canvas = document.createElement("canvas");
    container.appendChild(canvas);

    // GPU resets and driver hiccups can take the context away mid-set. Rebuild rather
    // than leave a frozen frame on the TV.
    const onContextLost = (e: Event) => {
      e.preventDefault();
      console.warn("[visualizer] WebGL context lost, rebuilding");
      setGeneration((g) => g + 1);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const fitCanvas = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      return [width, height] as const;
    };

    const [width, height] = fitCanvas();
    let visualizer: ReturnType<typeof butterchurn.createVisualizer>;
    try {
      visualizer = butterchurn.createVisualizer(engine.context, canvas, { width, height, pixelRatio });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.remove();
      return;
    }
    visualizer.connectAudio(engine.bus);
    visualizer.loadExtraImages(customPresetImages());

    const loadPreset = (name: string, blendSeconds: number): boolean => {
      try {
        visualizer.loadPreset(presets[name], blendSeconds);
        console.info(`[preset] ${name}`);
        setCurrentPreset(name);
        return true;
      } catch (err) {
        console.warn(`[preset] skipping "${name}"`, err);
        return false;
      }
    };

    // Presets unchecked in the V menu are skipped everywhere: the shuffle bag, and
    // walking the history with the arrow keys.
    const isEnabled = (name: string) => !getSettings().disabledPresets.includes(name);
    const enabledNames = () => presetNames.filter(isEnabled);

    // Shuffle-bag order so nothing repeats until every enabled preset has played.
    // Everything shown is kept in `history` so ← can walk back to an earlier preset.
    let bag: string[] = [];
    const history: string[] = [];
    let position = -1;

    const forward = (blendSeconds: number) => {
      for (let i = position + 1; i < history.length; i++) {
        if (isEnabled(history[i]) && loadPreset(history[i], blendSeconds)) {
          position = i;
          return;
        }
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        bag = bag.filter(isEnabled);
        if (bag.length === 0) bag = shuffled(enabledNames());
        const name = bag.pop();
        if (!name) return;
        if (loadPreset(name, blendSeconds)) {
          history.push(name);
          position = history.length - 1;
          return;
        }
      }
    };

    const back = (blendSeconds: number) => {
      for (let i = position - 1; i >= 0; i--) {
        if (isEnabled(history[i]) && loadPreset(history[i], blendSeconds)) {
          position = i;
          return;
        }
      }
    };

    // A timeout rather than an interval, so a manual change restarts the countdown
    // instead of being replaced a few seconds later.
    let cycle = 0;
    const scheduleNext = () => {
      window.clearTimeout(cycle);
      cycle = window.setTimeout(() => {
        forward(BLEND_SECONDS);
        scheduleNext();
      }, PRESET_SECONDS * 1000);
    };

    forward(0);
    scheduleNext();

    // When the enabled set changes: reshuffle so newly enabled presets join the
    // rotation now rather than after the current bag runs out, and move off the
    // current preset straight away if it was just unchecked.
    let lastDisabled = getSettings().disabledPresets;
    const unsubscribeSettings = subscribeSettings(() => {
      const { disabledPresets } = getSettings();
      if (disabledPresets === lastDisabled) return;
      lastDisabled = disabledPresets;
      const current = history[position];
      bag = shuffled(enabledNames().filter((name) => name !== current));
      if (current && !isEnabled(current)) {
        forward(MANUAL_BLEND_SECONDS);
        scheduleNext();
      }
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") forward(MANUAL_BLEND_SECONDS);
      else if (e.key === "ArrowLeft") back(MANUAL_BLEND_SECONDS);
      else return;
      e.preventDefault();
      scheduleNext();
    };
    window.addEventListener("keydown", onKeyDown);

    // Clicking a name in the V menu plays it next in the history, so ← still returns
    // to whatever was on before. Disabled presets can be previewed this way too.
    const unsubscribeRequests = onPresetRequest((name) => {
      if (name === history[position] || !loadPreset(name, MANUAL_BLEND_SECONDS)) return;
      history.splice(position + 1, 0, name);
      position++;
      scheduleNext();
    });

    const resizeObserver = new ResizeObserver(() => {
      const [w, h] = fitCanvas();
      visualizer.setRendererSize(w, h);
    });
    resizeObserver.observe(container);

    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      visualizer.render();
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(cycle);
      window.removeEventListener("keydown", onKeyDown);
      unsubscribeSettings();
      unsubscribeRequests();
      resizeObserver.disconnect();
      visualizer.disconnectAudio(engine.bus);
      // Browsers cap live WebGL contexts (~16) and toggling the setup screen remounts
      // this, so release the context now instead of waiting on GC. Unhook the loss
      // handler first, or releasing it would trigger a rebuild.
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [engine, generation]);

  if (error) {
    return (
      <main className="stage">
        <p className="warning">Visualizer failed to start: {error}</p>
      </main>
    );
  }

  return <div ref={containerRef} className="visualizer" />;
}
