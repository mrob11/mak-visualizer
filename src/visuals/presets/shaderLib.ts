import { GLYPHS, GLYPH_COLS, GLYPH_ROWS } from "./glyphAtlas";

// Snippets shared by our presets. Shader snippets go in the text before `shader_body`,
// which Butterchurn keeps as the shader's header; equation snippets go at the top of
// frame_eqs_str.
//
// Butterchurn wraps the shader_body in its own main(), which already declares `ret`,
// `uv`, `rad` and `ang` (plus `uv_orig` and `hue_shader` in comp), so don't redeclare
// those. A shader that fails to compile renders black without any console error.
//
// Frame equations get bass/mid/treb and their _att versions, but no vol or vol_att
// (those exist only as shader uniforms); an undefined var turns into NaN silently.

// The logo's red (#df1c3a), and the pale hot red used for the brightest highlights.
export const COLOURS_GLSL = `
const vec3 RED = vec3(0.875, 0.11, 0.227);
const vec3 HOT = vec3(1.0, 0.5, 0.55);
`;

export const HASH_GLSL = `
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
`;

// Glyph lookup in the atlas from glyphAtlas.ts. `local` is the 0–1 position inside
// the on-screen cell and `grid` the continuous cell coordinate it came from: the
// gradients are taken from `grid`, so the per-cell wrap doesn't pick a tiny mip level
// and draw seams along the cell edges.
export const GLYPH_GLSL = `
uniform sampler2D sampler_glyphs;

#define GLYPH_COLS ${GLYPH_COLS}.0
#define GLYPH_ROWS ${GLYPH_ROWS}.0
// Cell width as a fraction of its height; matches the atlas cells.
#define CELL_ASPECT 0.625

float glyphAt(float index, vec2 local, vec2 grid) {
  vec2 atlasGrid = vec2(GLYPH_COLS, GLYPH_ROWS);
  vec2 atlasUv = (vec2(mod(index, GLYPH_COLS), floor(index / GLYPH_COLS)) + local) / atlasGrid;
  return textureGrad(sampler_glyphs, atlasUv, dFdx(grid) / atlasGrid, dFdy(grid) / atlasGrid).a;
}
`;

// Atlas indices of `chars`, as a GLSL float array literal.
export function glyphIndices(chars: string): string {
  const indices = [...chars].map((c) => {
    const i = GLYPHS.indexOf(c);
    if (i < 0) throw new Error(`"${c}" isn't in the glyph atlas`);
    return `${i}.0`;
  });
  return `float[${indices.length}](${indices.join(", ")})`;
}

// Frame-equation prelude: `dt` for this frame, and `a.hit` set to 1 on a kick-like
// bass onset (well above its running average), at most every 0.22 s.
export const KICK_EQS = `
var dt = 1 / Math.max(a.fps, 15);
a.kick_cool = Math.max(0, a.kick_cool - dt);
a.hit = 0;
if (a.kick_cool <= 0 && a.bass > 1.3 && a.bass > a.bass_att * 1.12) {
  a.hit = 1;
  a.kick_cool = 0.22;
}
`;
export const KICK_INIT = "a.kick_cool=0;a.hit=0;";
