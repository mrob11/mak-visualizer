// A texture of letters, digits and ASCII symbols for presets that draw text, handed
// to Butterchurn with loadExtraImages and sampled in a shader as `sampler_glyphs`.
// Drawn at startup rather than shipped as an image so it's easy to change the set.

export const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=<>?@[]{}|/\\^~:;!\"'-()";

// 8 × 8 cells, matching GLYPH_GRID in the shaders. Cells are taller than wide, like
// the on-screen cells, and each glyph sits well inside its cell so mipmapping doesn't
// bleed neighbours into each other.
export const GLYPH_GRID = 8;
const CELL_W = 40;
const CELL_H = 64;
const FONT = 'bold 44px Menlo, Monaco, "Courier New", monospace';

let dataUrl: string | null = null;

function drawAtlas(): string {
  const canvas = document.createElement("canvas");
  canvas.width = CELL_W * GLYPH_GRID;
  canvas.height = CELL_H * GLYPH_GRID;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for the glyph atlas");
  ctx.fillStyle = "#fff";
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  [...GLYPHS].forEach((glyph, i) => {
    const x = (i % GLYPH_GRID) * CELL_W + CELL_W / 2;
    const y = Math.floor(i / GLYPH_GRID) * CELL_H + CELL_H / 2;
    ctx.fillText(glyph, x, y);
  });
  return canvas.toDataURL("image/png");
}

// In the shape loadExtraImages expects. Drawn once and reused by every visualizer.
export function glyphAtlasImage() {
  dataUrl ??= drawAtlas();
  return { data: dataUrl, width: CELL_W * GLYPH_GRID, height: CELL_H * GLYPH_GRID };
}
