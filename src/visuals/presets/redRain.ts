import type { Preset } from "butterchurn";
import { GLYPHS, GLYPH_GRID } from "./glyphAtlas";

// Matrix-style digital rain in MAK red. Everything is drawn in the comp shader from
// the frame equations' running totals, so nothing depends on the feedback buffer:
// - q1: rows fallen so far. The fall speeds up with the bass, and integrating it here
//   (rather than multiplying time by speed in the shader) keeps it from jumping.
// - q2: glyph clock. Runs faster with the treble, so busy cymbals scramble the text.
// - q3: kick flash, a decaying spike on bass hits that brightens everything.
// - q4: rows on screen, which sets the glyph size.

const ROWS = 36;

const frameEqs = `
var dt = 1 / Math.max(a.fps, 15);
a.fall += (6 + 10 * Math.max(0, a.bass_att - 0.8)) * dt;
a.glyph_clock += (1 + 3 * Math.max(0, a.treb_att - 0.9)) * dt;
a.flash = Math.max(a.flash * Math.pow(0.004, dt), Math.min(1, Math.max(0, a.bass - 1.25)));
a.q1 = a.fall;
a.q2 = a.glyph_clock;
a.q3 = a.flash;
a.q4 = ${ROWS};
`;

const comp = `
uniform sampler2D sampler_glyphs;

#define GLYPH_GRID ${GLYPH_GRID}.0
#define GLYPH_COUNT ${GLYPHS.length}.0
// Cell width as a fraction of its height; matches the atlas cells (40 × 64).
#define CELL_ASPECT 0.625

const vec3 RED = vec3(0.875, 0.11, 0.227);
// The leading glyph: a hot, pale red rather than white.
const vec3 HOT = vec3(1.0, 0.5, 0.55);

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

shader_body {
  float rows = q4;
  float cellH = resolution.y / rows;
  // uv.y is 0 at the top here, so rows count downward and the rain falls with them.
  vec2 grid = uv * resolution / vec2(cellH * CELL_ASPECT, cellH);
  vec2 cell = floor(grid);
  vec2 local = fract(grid);

  // Two drops per column at different speeds, lengths and gaps, so columns overlap
  // and the screen never empties out.
  float trailLight = 0.0;
  float head = 0.0;
  for (int k = 0; k < 2; k++) {
    float seed = cell.x * 2.0 + float(k);
    float speed = mix(0.55, 1.35, hash11(seed * 7.13));
    float trail = mix(8.0, 28.0, hash11(seed * 3.71));
    float period = rows + trail + rows * hash11(seed * 1.93);
    float headRow = mod(q1 * speed + hash11(seed * 5.37) * period, period);
    float behind = floor(headRow) - cell.y;
    if (behind >= 0.0 && behind < trail) {
      trailLight = max(trailLight, pow(1.0 - behind / trail, 1.6));
      if (behind < 1.0) head = 1.0;
    }
  }

  // Each cell flips to a new glyph at its own rate; a few change constantly.
  float cellSeed = hash21(cell);
  float rate = cellSeed > 0.9 ? 8.0 : mix(0.15, 1.2, cellSeed);
  float tick = mod(floor(q2 * rate + cellSeed * 50.0), 4096.0);
  float g = floor(hash21(cell + tick * 17.0) * GLYPH_COUNT);
  vec2 lp = local;
  // Half the glyphs mirrored, as in the film.
  if (hash21(cell * 1.7 + 3.0) > 0.5) lp.x = 1.0 - lp.x;
  vec2 atlasUv = (vec2(mod(g, GLYPH_GRID), floor(g / GLYPH_GRID)) + lp) / GLYPH_GRID;
  // Gradients from the continuous grid, so the per-cell wrap doesn't pick a tiny mip
  // level and draw seams along the cell edges.
  float glyph = textureGrad(sampler_glyphs, atlasUv, dFdx(grid) / GLYPH_GRID, dFdy(grid) / GLYPH_GRID).a;

  float flash = 1.0 + 0.9 * q3;
  vec3 col = RED * glyph * trailLight * flash;
  // Soft glow around lit cells, and a brighter leading glyph.
  col += RED * trailLight * 0.08 * flash;
  col = mix(col, HOT * glyph * flash, head * 0.75);
  // Faint glyphs everywhere, so the gaps between drops still read as a wall of text.
  col += RED * glyph * 0.035;

  ret = col;
}
`;

export const redRain: Preset = {
  baseVals: {
    decay: 0,
    wave_a: 0,
    ob_a: 0,
    ib_a: 0,
    mv_a: 0,
  },
  shapes: [],
  waves: [],
  init_eqs_str: "a.fall=0;a.glyph_clock=0;a.flash=0;",
  frame_eqs_str: frameEqs,
  pixel_eqs_str: "",
  warp: "shader_body {\n  ret = vec3(0.0);\n}\n",
  comp,
};
