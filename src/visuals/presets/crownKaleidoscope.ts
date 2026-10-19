import type { Preset } from "butterchurn";
import { COLOURS_GLSL, KICK_EQS, KICK_INIT } from "./shaderLib";

// A slowly turning kaleidoscope in red, black and gold, ringed by a crown whose points
// match the mirror segments. Butterchurn's circular waveform swirls through the
// feedback buffer (zoom, rotation and mesh warp from baseVals); the comp shader folds
// that into mirrored segments and maps it onto a black → red → gold palette.
// - q1: kaleidoscope rotation. Kicks shove it, alternating direction.
// - q2: number of segments (and crown points). Moves on every 16 kicks.
// - q3: kick flash (crown glow and a brighter palette).

const frameEqs = `
${KICK_EQS}
a.kicks += a.hit;
a.spin = a.spin * Math.pow(0.15, dt) + a.hit * (a.kicks % 2 ? 1.4 : -1.4);
a.angle += (0.06 + a.spin) * dt;
a.flash = Math.max(a.flash * Math.pow(0.01, dt), a.hit * Math.min(1, a.bass - 0.8));
// The trace drifts between red and gold.
var gold = 0.5 + 0.5 * Math.sin(a.time * 0.23);
a.wave_r = 1;
a.wave_g = 0.15 + 0.55 * gold;
a.wave_b = 0.2 * (1 - gold);
a.q1 = a.angle;
a.q2 = 5 + Math.floor(a.kicks / 16) % 4;
a.q3 = a.flash;
`;

const warp = `
shader_body {
  ret = texture(sampler_main, uv).rgb * 0.965 - 0.002;
}
`;

const comp = `
${COLOURS_GLSL}
const vec3 GOLD = vec3(1.0, 0.74, 0.25);

shader_body {
  float aspectR = resolution.x / resolution.y;
  vec2 p = (uv - 0.5) * vec2(aspectR, 1.0);
  float r = length(p);
  float n = q2;
  float seg = 6.2832 / n;

  // Fold into n mirrored wedges, turning with q1. a = 0 down the middle of a wedge.
  float a = mod(atan(p.y, p.x) + q1, seg);
  a = abs(a - seg * 0.5);
  vec2 k = vec2(cos(a), sin(a)) * r;
  vec2 suv = k / vec2(aspectR, 1.0) + 0.5;

  vec3 src = texture(sampler_main, suv).rgb
           + 0.7 * (texture(sampler_blur1, suv).rgb * scale1 + bias1);
  float l = clamp(dot(src, vec3(0.45, 0.4, 0.15)) * 1.5 * (1.0 + 0.4 * q3), 0.0, 1.0);
  vec3 col = mix(vec3(0.0), vec3(0.3, 0.015, 0.05), smoothstep(0.0, 0.25, l));
  col = mix(col, RED, smoothstep(0.2, 0.6, l));
  col = mix(col, GOLD, smoothstep(0.65, 1.0, l));

  // The crown: a band whose outer edge rises to a point in the middle of each wedge,
  // with a jewel at each tip.
  float base = 0.34;
  float tip = base + 0.09 * (1.0 - a / (seg * 0.5));
  float lineW = 0.004 + 0.003 * q3;
  float crown = exp(-abs(r - base) / lineW) + exp(-abs(r - tip) / lineW);
  float jewel = exp(-length(k - vec2(base + 0.09, 0.0)) / 0.012);
  float glow = 0.55 + 0.9 * q3;
  col += GOLD * crown * glow * 0.6 + mix(GOLD, RED, 0.4) * jewel * glow;

  ret = col * (1.0 - smoothstep(0.55, 0.95, r) * 0.6);
}
`;

export const crownKaleidoscope: Preset = {
  baseVals: {
    decay: 1,
    zoom: 1.025,
    rot: 0.012,
    warp: 0.35,
    warpscale: 1.3,
    warpanimspeed: 0.6,
    wave_mode: 0,
    wave_a: 0.85,
    wave_scale: 0.9,
    wave_smoothing: 0.5,
    wave_thick: 1,
    additivewave: 1,
    modwavealphabyvolume: 0,
    ob_a: 0,
    ib_a: 0,
    mv_a: 0,
  },
  shapes: [],
  waves: [],
  init_eqs_str: `${KICK_INIT}a.kicks=0;a.spin=0;a.angle=0;a.flash=0;`,
  frame_eqs_str: frameEqs,
  pixel_eqs_str: "",
  warp,
  comp,
};
