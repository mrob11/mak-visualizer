import { useEffect, useRef } from "react";
import { AudioEngine, EngineStatus } from "../audio/audioEngine";

// Level-check view: spectrum, waveform and RMS/clip of what the visuals are hearing.

const BAR_COUNT = 64;
const MIN_HZ = 30;
const MAX_HZ = 16000;

// Log-spaced bins so the bass isn't crammed into the first couple of bars.
function barRanges(analyser: AnalyserNode): Array<[number, number]> {
  const sampleRate = analyser.context.sampleRate;
  const binHz = sampleRate / analyser.fftSize;
  const maxHz = Math.min(MAX_HZ, sampleRate / 2);
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const lo = MIN_HZ * (maxHz / MIN_HZ) ** (i / BAR_COUNT);
    const hi = MIN_HZ * (maxHz / MIN_HZ) ** ((i + 1) / BAR_COUNT);
    const start = Math.floor(lo / binHz);
    const end = Math.min(analyser.frequencyBinCount, Math.max(start + 1, Math.ceil(hi / binHz)));
    ranges.push([start, end]);
  }
  return ranges;
}

interface Props {
  engine: AudioEngine;
  status: EngineStatus;
}

export function DebugBars({ engine, status }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { analyser } = engine;
    const ranges = barRanges(analyser);
    const freq = new Uint8Array(analyser.frequencyBinCount);
    const wave = new Float32Array(analyser.fftSize);
    let frame = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);

      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      analyser.getByteFrequencyData(freq);
      analyser.getFloatTimeDomainData(wave);

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      // Spectrum, bottom 70%.
      const barsHeight = h * 0.7;
      const slot = w / BAR_COUNT;
      const gap = 2 * dpr;
      ranges.forEach(([start, end], i) => {
        let peak = 0;
        for (let k = start; k < end; k++) peak = Math.max(peak, freq[k]);
        const barHeight = (peak / 255) * barsHeight;
        ctx.fillStyle = `hsl(${45 - (i / BAR_COUNT) * 45}, 80%, ${35 + (peak / 255) * 30}%)`;
        ctx.fillRect(i * slot + gap / 2, h - barHeight, slot - gap, barHeight);
      });

      // Waveform, top band.
      const waveTop = h * 0.08;
      const waveHeight = h * 0.15;
      let sumSquares = 0;
      let clipped = false;
      ctx.strokeStyle = "#c9a227";
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let k = 0; k < wave.length; k++) {
        const v = wave[k];
        sumSquares += v * v;
        if (Math.abs(v) >= 0.99) clipped = true;
        const x = (k / (wave.length - 1)) * w;
        const y = waveTop + waveHeight * (0.5 - v / 2);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const rms = Math.sqrt(sumSquares / wave.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      ctx.font = `${14 * dpr}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = clipped ? "#f55" : "#888";
      ctx.fillText(
        `RMS ${db.toFixed(1)} dBFS${clipped ? "  CLIP" : ""}`,
        16 * dpr,
        waveTop + waveHeight + 28 * dpr,
      );
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  const { contextState } = status;

  return (
    <main className="debug">
      <canvas ref={canvasRef} />
      <div className="debug-info">
        {status.trackLabel ?? "no input"} · {engine.context.sampleRate} Hz ·{" "}
        {status.channelCount ?? "?"} ch · input {status.connection}
        {status.idle && " · idle groove playing"} · context {contextState}
        {status.message && ` — ${status.message}`}
        {contextState === "suspended" && " — click or press a key to start audio"}
      </div>
    </main>
  );
}
