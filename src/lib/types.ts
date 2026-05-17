export type BrightnessCategory = "dim" | "normal" | "bright";

export interface BrightnessAnalysis {
  mean_pixel_intensity: number;
  category: BrightnessCategory;
}

export interface LightingAnalysis {
  mean_rgb: [number, number, number];
  ambient_rgb: [number, number, number];
  ambient_hex: string;
  contrast: number;
  saturation: number;
  warmth: number;
  tint: number;
  temperature: "cool" | "neutral" | "warm";
  sharpness: number;
  noise: number;
  light_direction: {
    x: number;
    y: number;
  };
  suggested: {
    brightness: number;
    contrast: number;
    saturation: number;
    color_mix: number;
    blur_px: number;
    grain: number;
    shadow_opacity: number;
  };
}

export interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
  mask_url: string;
}

export interface ImageAnalysisResponse {
  brightness: BrightnessAnalysis;
  lighting?: LightingAnalysis;
  objects: DetectedObject[];
  segmentation?: {
    mode: "auto" | "yolo" | "mock" | "none" | string;
    model: string | null;
  };
  warning?: string;
}

export interface ObjectToggleState {
  objectId: string;
  enabled: boolean;
}

export interface OverlayTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  modelPitch: number;
  modelYaw: number;
  opacity: number;
}

export interface ShadowSettings {
  enabled: boolean;
  contactEnabled: boolean;
  castEnabled: boolean;
  opacity: number;
  blur: number;
  directionX: number;
  directionY: number;
  length: number;
  contactOpacity: number;
  contactScale: number;
  autoFromLighting: boolean;
}

export interface CanvasEditorHandle {
  exportImage: () => Promise<string>;
}
