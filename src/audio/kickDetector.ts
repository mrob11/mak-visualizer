// The weight of a kick sits around 45–90 Hz. Band-limiting to this range keeps guitars,
// vocals and cymbals out, and the onset test below separates the kick's sharp attack
// from sustained bass notes in the same band. The low-pass is applied twice for a
// steeper (24 dB/oct) cut so low-mid rumble doesn't leak in.
const HIGHPASS_HZ = 40;
const LOWPASS_HZ = 90;

// A hit is when the instant low-band level jumps this far above its recent average.
const ONSET_RATIO = 2;
// ...and reaches at least this fraction of the loudest recent hit, so only solid
// kicks count, not every bump in the low end.
const HIT_PEAK_FRACTION = 0.5;
// Each sensitivity step (the -/= keys) scales both thresholds by these factors:
// positive steps lower them (more hits), negative steps raise them. At +5 the onset
// ratio is ~1.3 and the peak fraction ~0.2; at -5 only the loudest kicks get through.
const ONSET_STEP = 0.8;
const PEAK_FRACTION_STEP = 0.85;
const MAX_PEAK_FRACTION = 0.9;

function thresholds(sensitivity: number) {
  return {
    // Scales the margin above 1, so the ratio can never drop to "any level counts".
    onsetRatio: 1 + (ONSET_RATIO - 1) * ONSET_STEP ** sensitivity,
    peakFraction: Math.min(MAX_PEAK_FRACTION, HIT_PEAK_FRACTION * PEAK_FRACTION_STEP ** sensitivity),
  };
}
// Seconds the running average takes to follow the level. Long enough that a kick
// doesn't raise its own threshold, short enough to track a song getting louder.
const AVERAGE_SECONDS = 0.4;
// Ignore anything below this RMS (about -36 dBFS) so hum and room rumble don't fire.
const NOISE_FLOOR = 0.015;
// The "loudest recent hit" reference never drops below this (about -26 dBFS).
// Without it, a quiet room's noise becomes its own reference and pulses at full size.
const MIN_PEAK = 0.05;
// Minimum gap between hits. A fast double-kick at 200 BPM 16ths is still ~75 ms apart.
const LOCKOUT_SECONDS = 0.09;
// Seconds the loudest-recent-hit reference takes to relax, so pulse size adapts to
// the mixer level instead of needing a fixed gain.
const PEAK_RELEASE_SECONDS = 4;

export interface KickReading {
  // True on the frame a kick lands.
  hit: boolean;
  // 0–1 low-band level relative to recent peaks: on a hit frame it's the hit's
  // strength, otherwise it's the continuous low-end energy.
  level: number;
}

export interface KickDetector {
  // `sensitivity` is the -/= key setting; 0 uses the thresholds above unchanged.
  read: (dtSeconds: number, sensitivity?: number) => KickReading;
  dispose: () => void;
}

export function createKickDetector(context: BaseAudioContext, source: AudioNode): KickDetector {
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = HIGHPASS_HZ;

  const lowpasses = [0, 1].map(() => {
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = LOWPASS_HZ;
    return filter;
  });

  const analyser = context.createAnalyser();
  // ~21 ms window at 48 kHz: short enough to catch the attack, long enough to hold a
  // full cycle of a 50 Hz kick.
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;

  source.connect(highpass);
  highpass.connect(lowpasses[0]);
  lowpasses[0].connect(lowpasses[1]);
  lowpasses[1].connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  let average = 0;
  let peak = MIN_PEAK;
  let sinceHit = Infinity;

  const read = (dt: number, sensitivity = 0): KickReading => {
    const { onsetRatio, peakFraction } = thresholds(sensitivity);
    analyser.getFloatTimeDomainData(samples);
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
    const rms = Math.sqrt(sumSquares / samples.length);

    sinceHit += dt;
    peak = Math.max(rms, peak * Math.exp(-dt / PEAK_RELEASE_SECONDS), MIN_PEAK);

    // Compare against the average *before* folding this frame in.
    const hit =
      rms > NOISE_FLOOR &&
      rms > average * onsetRatio &&
      rms >= peak * peakFraction &&
      sinceHit >= LOCKOUT_SECONDS;
    if (hit) sinceHit = 0;

    average += (rms - average) * (1 - Math.exp(-dt / AVERAGE_SECONDS));

    return { hit, level: Math.min(1, rms / peak) };
  };

  return {
    read,
    dispose: () => {
      source.disconnect(highpass);
      highpass.disconnect();
      lowpasses.forEach((filter) => filter.disconnect());
    },
  };
}
