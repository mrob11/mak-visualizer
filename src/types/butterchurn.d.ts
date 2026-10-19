// Butterchurn 2.x ships no types; this covers the parts we use.

declare module "butterchurn" {
  export type Preset = object;

  export interface RendererSizeOptions {
    pixelRatio?: number;
    textureRatio?: number;
    meshWidth?: number;
    meshHeight?: number;
  }

  export interface VisualizerOptions extends RendererSizeOptions {
    width?: number;
    height?: number;
  }

  // Extra textures presets can sample as `uniform sampler2D sampler_<name>;`.
  export interface ExtraImage {
    data: string; // An image URL, usually a data: URL.
    width: number;
    height: number;
  }

  export interface Visualizer {
    connectAudio(node: AudioNode): void;
    loadExtraImages(images: Record<string, ExtraImage>): void;
    disconnectAudio(node: AudioNode): void;
    loadPreset(preset: Preset, blendSeconds?: number): void;
    setRendererSize(width: number, height: number, opts?: RendererSizeOptions): void;
    render(): void;
  }

  const butterchurn: {
    createVisualizer(
      context: AudioContext,
      canvas: HTMLCanvasElement,
      opts?: VisualizerOptions,
    ): Visualizer;
  };
  export default butterchurn;
}

declare module "butterchurn-presets" {
  import type { Preset } from "butterchurn";

  const butterchurnPresets: {
    getPresets(): Record<string, Preset>;
  };
  export default butterchurnPresets;
}
