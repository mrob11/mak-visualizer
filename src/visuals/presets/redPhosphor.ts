import type { Preset } from "butterchurn";
import { COLOURS_GLSL, HASH_GLSL, KICK_EQS, KICK_INIT } from "./shaderLib";

// The live waveform on an old red-phosphor oscilloscope. Butterchurn's own waveform
// (single-line mode) draws the trace into the feedback buffer, low on the screen, and a
// custom spectrum wave draws a dimmer analyser line along the bottom. The warp shader
// lets old traces drift up and away into the tube as they fade, so the screen fills
// with a waterfall of recent waveforms; the comp shader turns that into a curved,
// scanlined CRT with a graticule, bloom, ghosting and static. Frame equations feed it:
// - q1: kick flash (tube surge, picture shake, a few scanline bands torn sideways).
// - q2: vertical roll, kicked off by a big hit (at most every 6 s, so it stays a
//   moment rather than a constant) and settling back like a vertical hold.

const frameEqs = `
${KICK_EQS}
a.flash = Math.max(a.flash * Math.pow(0.002, dt), a.hit * Math.min(1, a.bass - 0.9));
a.roll_cool = Math.max(0, a.roll_cool - dt);
if (a.hit && a.bass > 2 && a.roll_cool <= 0) {
  a.roll_v += 0.6;
  a.roll_cool = 6;
}
a.roll_v *= Math.pow(0.05, dt);
a.roll = (a.roll + a.roll_v * dt) * Math.pow(0.15, dt);
// The trace swells with the mix and spikes on kicks.
a.wave_scale = 1.6 + 2.2 * Math.min(1.5, (a.bass_att + a.mid_att + a.treb_att) / 3) + 2.5 * a.flash;
a.q1 = a.flash;
a.q2 = a.roll;
`;

const warp = `
shader_body {
  // Phosphor afterglow: old traces fade while drifting up the screen and narrowing
  // toward the middle, like a waterfall receding into the tube.
  // The drift keeps successive traces apart, so they read as separate lines.
  vec2 from = vec2(0.5 + (uv.x - 0.5) * 1.006, uv.y + 0.012);
  ret = texture(sampler_main, from).rgb * 0.9 - 0.003;
}
`;

const comp = `
${COLOURS_GLSL}
${HASH_GLSL}

shader_body {
  // Curve the picture like the face of a tube.
  vec2 c = uv - 0.5;
  c *= 1.0 + dot(c, c) * 0.22;
  vec2 suv = c + 0.5;
  float onScreen = smoothstep(0.0, 0.01, suv.x) * smoothstep(1.0, 0.99, suv.x)
                 * smoothstep(0.0, 0.01, suv.y) * smoothstep(1.0, 0.99, suv.y);

  // Kicks shake the picture and tear a few bands sideways; big hits roll it.
  float frameStep = floor(time * 24.0);
  suv += q1 * 0.012 * (vec2(hash11(frameStep), hash11(frameStep + 9.0)) - 0.5);
  float bandId = floor(suv.y * 28.0);
  float torn = step(0.75, hash11(bandId * 3.1 + frameStep));
  suv.x += q1 * torn * 0.06 * (hash11(bandId + frameStep * 1.7) - 0.5);
  suv.y = fract(suv.y + q2);

  vec3 w = vec3(0.4, 0.35, 0.25);
  float beam = dot(texture(sampler_main, suv).rgb, w);
  // A faint ghost a little to the right, like a badly terminated cable.
  float ghost = dot(texture(sampler_main, suv - vec2(0.012, 0.0)).rgb, w);
  float bloom = dot(texture(sampler_blur1, suv).rgb * scale1 + bias1, w);

  float surge = 1.0 + 0.8 * q1;
  vec3 col = RED * (beam * 1.8 + ghost * 0.25 + bloom * 2.2) * surge;
  col += HOT * pow(clamp(beam, 0.0, 1.0), 2.5) * surge;

  // Graticule: 10 × 8 divisions with finer ticks along the centre lines.
  vec2 div = suv * vec2(10.0, 8.0);
  vec2 lineDist = abs(fract(div + 0.5) - 0.5) / fwidth(div);
  float grid = 1.0 - clamp(min(lineDist.x, lineDist.y), 0.0, 1.0);
  col += RED * grid * 0.09;

  // Scanlines, faint static, a touch of flicker, and a vignette.
  col *= 0.72 + 0.28 * pow(sin(suv.y * resolution.y * 1.5708), 2.0);
  col += RED * hash21(floor(suv * resolution) + frameStep) * 0.035;
  col *= 0.97 + 0.03 * hash11(frameStep);
  col *= 1.0 - dot(c, c) * 1.1;

  ret = col * onScreen;
}
`;

export const redPhosphor: Preset = {
  baseVals: {
    decay: 1,
    zoom: 1,
    rot: 0,
    warp: 0,
    wave_mode: 6,
    // In single-line mode wave_x sets the line's height: 0.32 puts it low, leaving the
    // top for the waterfall.
    wave_x: 0.32,
    wave_a: 1,
    wave_r: 1,
    wave_g: 0.35,
    wave_b: 0.4,
    wave_scale: 1.2,
    wave_smoothing: 0.3,
    wave_thick: 1,
    additivewave: 1,
    wave_brighten: 0,
    modwavealphabyvolume: 0,
    ob_a: 0,
    ib_a: 0,
    mv_a: 0,
  },
  shapes: [],
  waves: [
    {
      // Spectrum analyser along the bottom, low frequencies on the left.
      baseVals: { enabled: 1, samples: 256, spectrum: 1, scaling: 1, smoothing: 0.4, thick: 1, additive: 1, r: 1, g: 0.25, b: 0.32, a: 0.75 },
      init_eqs_str: "",
      frame_eqs_str: "",
      point_eqs_str: "a.x = 0.04 + 0.92 * a.sample; a.y = 0.06 + Math.min(0.32, Math.abs(a.value1) * 0.35);",
    },
  ],
  init_eqs_str: `${KICK_INIT}a.flash=0;a.roll=0;a.roll_v=0;a.roll_cool=0;`,
  frame_eqs_str: frameEqs,
  pixel_eqs_str: "",
  warp,
  comp,
};
