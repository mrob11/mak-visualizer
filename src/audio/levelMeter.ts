// Broadband loudness from an analyser's time-domain data (smoothingTimeConstant only
// affects frequency data, so the shared analyser works as-is), normalised against
// recent peaks so it reads the same whatever the mixer gain.

// Seconds the peak reference takes to relax.
const PEAK_RELEASE_SECONDS = 5;
// Peak reference floor (about -30 dBFS) so a quiet room doesn't read as "loud".
const MIN_PEAK = 0.03;
// Seconds of smoothing on the output, so it drives slow motion rather than flicker.
const SMOOTH_SECONDS = 0.25;

export interface LevelMeter {
  // 0–1 loudness relative to recent peaks.
  read: (dtSeconds: number) => number;
}

export function createLevelMeter(analyser: AnalyserNode): LevelMeter {
  const samples = new Float32Array(analyser.fftSize);
  let peak = MIN_PEAK;
  let smoothed = 0;

  return {
    read: (dt) => {
      analyser.getFloatTimeDomainData(samples);
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
      const rms = Math.sqrt(sumSquares / samples.length);

      peak = Math.max(rms, peak * Math.exp(-dt / PEAK_RELEASE_SECONDS), MIN_PEAK);
      smoothed += (rms / peak - smoothed) * (1 - Math.exp(-dt / SMOOTH_SECONDS));
      return smoothed;
    },
  };
}
