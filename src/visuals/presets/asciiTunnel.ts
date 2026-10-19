import type { Preset } from "butterchurn";
import { COLOURS_GLSL, GLYPH_GLSL, KICK_EQS, KICK_INIT, glyphIndices } from "./shaderLib";

// A spiralling tunnel rendered as ASCII art in MAK red: the tunnel is sampled once
// per text cell and drawn with a glyph from a light-to-dense ramp. Stateless, like
// Red Rain; the frame equations feed it:
// - q1: distance travelled down the tunnel. Bass pushes it along, kicks lunge forward.
// - q2: spiral twist. Drifts on its own, faster with the treble.
// - q3: kick flash.

const ROWS = 30;
// Lightest to densest. Below the first step the cell is left blank.
const RAMP = ".,:-=+*#%@";

const frameEqs = `
${KICK_EQS}
a.lunge = a.lunge * Math.pow(0.03, dt) + a.hit * 1.6;
a.travel += (0.35 + 0.9 * Math.max(0, a.bass_att - 0.8) + a.lunge) * dt;
a.twist += (0.04 + 0.25 * Math.max(0, a.treb_att - 0.9)) * dt;
a.flash = Math.max(a.flash * Math.pow(0.01, dt), a.hit * Math.min(1, a.bass - 0.8));
a.q1 = a.travel;
a.q2 = a.twist;
a.q3 = a.flash;
`;

const comp = `
${GLYPH_GLSL}
${COLOURS_GLSL}

#define RAMP_LEN ${RAMP.length}.0
const float RAMP[${RAMP.length}] = ${glyphIndices(RAMP)};

shader_body {
  float cellH = resolution.y / ${ROWS}.0;
  vec2 cellSize = vec2(cellH * CELL_ASPECT, cellH);
  vec2 grid = uv * resolution / cellSize;
  vec2 cell = floor(grid);

  // The tunnel at this cell's centre, so the whole cell shows one glyph. The
  // vanishing point wanders a little so it doesn't sit dead centre all night.
  vec2 centre = (cell + 0.5) * cellSize / resolution;
  vec2 drift = 0.1 * vec2(sin(time * 0.21), cos(time * 0.17));
  vec2 p = (centre - 0.5 - drift) * vec2(resolution.x / resolution.y, 1.0);
  float r = max(length(p), 0.001);
  float theta = atan(p.y, p.x);
  float depth = 0.32 / r + q1;

  float rings = 0.5 + 0.5 * sin(depth * 6.2832 * 1.6);
  float spokes = 0.5 + 0.5 * sin(theta * 6.0 + depth * 1.3 + q2 * 6.2832);
  float v = pow(rings, 1.5) * (0.35 + 0.65 * spokes);
  // Fades into the distance, so the middle reads as depth rather than a blank hole.
  v *= smoothstep(0.02, 0.45, r);
  v = clamp(v * (0.95 + 0.5 * q3), 0.0, 1.0);

  float level = floor(v * (RAMP_LEN + 1.0)) - 1.0;
  float glyph = level < 0.0 ? 0.0 : glyphAt(RAMP[int(min(level, RAMP_LEN - 1.0))], fract(grid), grid);

  vec3 col = mix(RED * 0.55, RED, smoothstep(0.2, 0.7, v));
  col = mix(col, HOT, smoothstep(0.8, 1.0, v) * 0.7);
  ret = col * glyph * (0.35 + 0.9 * v) * (1.0 + 0.6 * q3);
}
`;

export const asciiTunnel: Preset = {
  baseVals: { decay: 0, wave_a: 0, ob_a: 0, ib_a: 0, mv_a: 0 },
  shapes: [],
  waves: [],
  init_eqs_str: `${KICK_INIT}a.lunge=0;a.travel=0;a.twist=0;a.flash=0;`,
  frame_eqs_str: frameEqs,
  pixel_eqs_str: "",
  warp: "shader_body {\n  ret = vec3(0.0);\n}\n",
  comp,
};
