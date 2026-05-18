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

export type ProductModelType = "cabinet" | "window";

export interface ProductModelOption {
  id: ProductModelType;
  name: string;
  modelPath: string;
  fallback: "drawer" | "window";
}

export type GlassViewMode = "transparent" | "frosted" | "outdoor" | "solid";

export interface WindowGlassSettings {
  mode: GlassViewMode;
  opacity: number;
  tintColor: string;
  outdoorTexturePath?: string;
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

export interface PlacedOverlay {
  id: string;
  name: string;
  modelType: ProductModelType;
  modelPath: string;
  transform: OverlayTransform;
  shadowSettings: ShadowSettings;
  occlusionObjectIds: string[];
  ambientEnabled: boolean;
  visible: boolean;
  windowGlass?: WindowGlassSettings;
  locked?: boolean;
  flattenedImageDataUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveOverlayState {
  mode: "adding" | "editing";
  overlayId?: string;
  name: string;
  modelType: ProductModelType;
  modelPath: string;
  transform: OverlayTransform;
  shadowSettings: ShadowSettings;
  ambientEnabled: boolean;
  occlusionObjectIds: string[];
  windowGlass?: WindowGlassSettings;
}

export interface CanvasEditorHandle {
  exportImage: () => Promise<string>;
  flattenActiveOverlay: () => Promise<string>;
}
