import { InputNotConnectedError, openInputStream } from "./audioInput";
import { IdleGenerator, createIdleGenerator } from "./idleGenerator";
import { SavedInput } from "./inputDevices";

export type Connection = "connecting" | "live" | "lost" | "blocked";

export interface EngineStatus {
  connection: Connection;
  // True while the synthetic idle groove is standing in for the real input.
  idle: boolean;
  trackLabel: string | null;
  channelCount: number | null;
  contextState: AudioContextState;
  // Why the input isn't live, for the operator.
  message: string | null;
}

// How often to retry a lost or missing input. USB reconnects also trigger a retry
// straight away via `devicechange`.
const RETRY_SECONDS = 2;
// Grace period after `devicechange` for a replugged interface to finish appearing.
const DEVICE_SETTLE_SECONDS = 0.5;
const MONITOR_MS = 100;
// Input below about -60 dBFS counts as silence. Going back to live needs about
// -54 dBFS, so hovering near the line doesn't flap.
const SILENCE_RMS = 0.001;
const SIGNAL_RMS = 0.002;
// Seconds of silence before the idle groove fades in (covers gaps between songs).
const IDLE_AFTER_SECONDS = 6;

function describeError(err: unknown): string {
  if (err instanceof InputNotConnectedError) return err.message;
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError") {
    return "Microphone access is blocked. Allow it for MAK Visualizer in System Settings → Privacy & Security.";
  }
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

// Owns one long-lived AudioContext. Everything downstream (Butterchurn, the kick
// detector, the analyser) listens to `bus`, which outlives the device: a USB dropout
// detaches the input and a reconnect re-attaches it, without anything downstream
// being rebuilt. While the input is gone or silent, the idle generator feeds the bus.
export class AudioEngine {
  readonly context = new AudioContext({ latencyHint: "interactive" });
  readonly bus: GainNode;
  // On the bus, so it sees whatever the visuals see (including the idle groove).
  readonly analyser: AnalyserNode;

  // On the raw input only, for silence detection.
  private readonly inputAnalyser: AnalyserNode;
  private readonly samples: Float32Array<ArrayBuffer>;
  private readonly idle: IdleGenerator;
  private readonly listeners = new Set<() => void>();
  private readonly monitorTimer: number;

  private status: EngineStatus;
  private saved: SavedInput | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  // Bumped to invalidate an in-flight open when the input changes or we shut down.
  private attempt = 0;
  private opening = false;
  private retryTimer = 0;
  private quietSeconds = IDLE_AFTER_SECONDS;
  private disposed = false;

  constructor() {
    this.bus = this.context.createGain();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.bus.connect(this.analyser);

    this.inputAnalyser = this.context.createAnalyser();
    this.inputAnalyser.fftSize = 2048;
    this.samples = new Float32Array(this.inputAnalyser.fftSize);

    this.idle = createIdleGenerator(this.context, this.bus);

    this.status = {
      connection: "connecting",
      idle: false,
      trackLabel: null,
      channelCount: null,
      contextState: this.context.state,
      message: null,
    };

    this.context.onstatechange = () => this.update({ contextState: this.context.state });
    navigator.mediaDevices.addEventListener("devicechange", this.onDeviceChange);
    // Autoplay policy can leave a new AudioContext suspended until a user gesture.
    window.addEventListener("pointerdown", this.resume);
    window.addEventListener("keydown", this.resume);
    this.monitorTimer = window.setInterval(this.monitor, MONITOR_MS);
  }

  // For useSyncExternalStore.
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getStatus = () => this.status;

  setInput(saved: SavedInput) {
    this.saved = saved;
    this.detach();
    this.update({ connection: "connecting", trackLabel: null, channelCount: null, message: null });
    this.attempt++;
    this.opening = false;
    void this.connect();
  }

  dispose() {
    this.disposed = true;
    this.attempt++;
    window.clearInterval(this.monitorTimer);
    window.clearTimeout(this.retryTimer);
    navigator.mediaDevices.removeEventListener("devicechange", this.onDeviceChange);
    window.removeEventListener("pointerdown", this.resume);
    window.removeEventListener("keydown", this.resume);
    this.context.onstatechange = null;
    this.detach();
    this.idle.stop();
    void this.context.close();
    this.listeners.clear();
  }

  private update(patch: Partial<EngineStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private connect = async () => {
    window.clearTimeout(this.retryTimer);
    const saved = this.saved;
    if (!saved || this.disposed || this.opening) return;

    const attempt = ++this.attempt;
    this.opening = true;
    try {
      const stream = await openInputStream(saved);
      if (attempt !== this.attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.attach(stream);
    } catch (err) {
      if (attempt !== this.attempt) return;
      const name = (err as { name?: unknown } | null)?.name;
      this.update({
        connection: name === "NotAllowedError" ? "blocked" : "lost",
        message: describeError(err),
      });
      this.scheduleRetry(RETRY_SECONDS);
    } finally {
      if (attempt === this.attempt) this.opening = false;
    }
  };

  private attach(stream: MediaStream) {
    const track = stream.getAudioTracks()[0];
    const source = this.context.createMediaStreamSource(stream);
    source.connect(this.bus);
    source.connect(this.inputAnalyser);
    track.onended = () => this.lose();

    this.stream = stream;
    this.source = source;
    this.quietSeconds = 0;
    this.update({
      connection: "live",
      trackLabel: track.label,
      channelCount: track.getSettings().channelCount ?? null,
      message: null,
    });
    this.resume();
  }

  private detach() {
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
  }

  private lose() {
    const label = this.status.trackLabel ?? this.saved?.label ?? "Input";
    this.detach();
    this.update({ connection: "lost", message: `"${label}" was disconnected` });
    this.scheduleRetry(RETRY_SECONDS);
  }

  private scheduleRetry(seconds: number) {
    window.clearTimeout(this.retryTimer);
    if (this.disposed) return;
    this.retryTimer = window.setTimeout(this.connect, seconds * 1000);
  }

  private onDeviceChange = () => {
    if (this.status.connection !== "live") this.scheduleRetry(DEVICE_SETTLE_SECONDS);
  };

  private resume = () => {
    const state = this.context.state as string;
    if (state !== "running" && state !== "closed") void this.context.resume().catch(() => {});
  };

  private monitor = () => {
    // Belt and braces: not every unplug fires `ended` promptly.
    if (this.stream?.getAudioTracks()[0]?.readyState === "ended") this.lose();
    this.resume();

    const live = this.status.connection === "live";
    if (live) {
      this.inputAnalyser.getFloatTimeDomainData(this.samples);
      let sumSquares = 0;
      for (let i = 0; i < this.samples.length; i++) sumSquares += this.samples[i] ** 2;
      const rms = Math.sqrt(sumSquares / this.samples.length);
      if (rms >= SIGNAL_RMS) this.quietSeconds = 0;
      else if (rms < SILENCE_RMS) this.quietSeconds += MONITOR_MS / 1000;
    }

    // A lost input goes idle immediately; a silent one waits out a song gap first.
    const idle = !live || this.quietSeconds >= IDLE_AFTER_SECONDS;
    this.idle.setActive(idle);
    this.idle.tick();
    if (idle !== this.status.idle) this.update({ idle });
  };
}
