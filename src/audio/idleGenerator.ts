// A soft synthetic groove fed into the engine's bus while the real input is silent or
// disconnected. Many Butterchurn presets go dark or freeze with no audio, so this
// keeps them moving, and its kick keeps the logo pulsing, instead of the TV sitting
// on a dead screen. It never reaches the speakers: the bus isn't connected to the
// context's destination.

const BPM = 92;
const LEVEL = 0.35;
// Seconds to fade in when the input goes quiet, and to get out of the way when the
// band comes back.
const FADE_IN_SECONDS = 1;
const FADE_OUT_SECONDS = 0.08;
// How far ahead beats are scheduled; must exceed the engine's monitor interval.
const LOOKAHEAD_SECONDS = 0.25;

export interface IdleGenerator {
  setActive: (on: boolean) => void;
  // Schedules upcoming beats; call regularly.
  tick: () => void;
  stop: () => void;
}

export function createIdleGenerator(context: AudioContext, destination: AudioNode): IdleGenerator {
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(destination);

  // Pad: an open A chord of slightly detuned saws through a slowly swept low-pass, so
  // waveform presets have mid-range content to draw.
  const padFilter = context.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.Q.value = 4;
  const padGain = context.createGain();
  padGain.gain.value = 0.08;
  padFilter.connect(padGain);
  padGain.connect(master);

  const sweep = context.createOscillator();
  sweep.frequency.value = 0.07;
  const sweepDepth = context.createGain();
  sweepDepth.gain.value = 600;
  sweep.connect(sweepDepth);
  sweepDepth.connect(padFilter.frequency);

  const pad = [110, 164.81, 220].map((hz, i) => {
    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = hz;
    osc.detune.value = (i - 1) * 7;
    osc.connect(padFilter);
    return osc;
  });

  // Kick: a pitch-dropping sine, retriggered on each beat.
  const kick = context.createOscillator();
  const kickGain = context.createGain();
  kickGain.gain.value = 0;
  kick.connect(kickGain);
  kickGain.connect(master);

  const sources = [sweep, kick, ...pad];
  sources.forEach((osc) => osc.start());

  let active = false;
  let nextBeat = 0;

  const scheduleKick = (t: number) => {
    kick.frequency.setValueAtTime(130, t);
    kick.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    kickGain.gain.setValueAtTime(0.0001, t);
    kickGain.gain.linearRampToValueAtTime(1, t + 0.005);
    kickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  };

  return {
    setActive: (on) => {
      if (on === active) return;
      active = on;
      master.gain.setTargetAtTime(
        on ? LEVEL : 0,
        context.currentTime,
        on ? FADE_IN_SECONDS : FADE_OUT_SECONDS,
      );
    },
    tick: () => {
      if (!active) return;
      const now = context.currentTime;
      if (nextBeat < now) nextBeat = now + 0.05;
      while (nextBeat < now + LOOKAHEAD_SECONDS) {
        scheduleKick(nextBeat);
        nextBeat += 60 / BPM;
      }
    },
    stop: () => {
      sources.forEach((osc) => osc.stop());
      master.disconnect();
    },
  };
}
