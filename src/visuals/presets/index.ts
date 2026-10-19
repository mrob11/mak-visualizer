import type { Preset } from "butterchurn";
import { glyphAtlasImage } from "./glyphAtlas";
import { asciiTunnel } from "./asciiTunnel";
import { crownKaleidoscope } from "./crownKaleidoscope";
import { neonRaceway } from "./neonRaceway";
import { redPhosphor } from "./redPhosphor";
import { redRain } from "./redRain";

// Our own presets, merged into the base pack by presetLibrary.ts. Names are prefixed
// "MAK - " so they sort together in the menu.
export const customPresets: Record<string, Preset> = {
  "MAK - ASCII Tunnel": asciiTunnel,
  "MAK - Crown Kaleidoscope": crownKaleidoscope,
  "MAK - Neon Raceway": neonRaceway,
  "MAK - Red Phosphor": redPhosphor,
  "MAK - Red Rain": redRain,
};

// Extra textures the custom presets sample, for Visualizer to hand to loadExtraImages.
export function customPresetImages() {
  return { glyphs: glyphAtlasImage() };
}
