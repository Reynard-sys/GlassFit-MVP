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

export interface CanvasBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocalLightingAnalysis {
  meanRgb: [number, number, number];
  ambientRgb: [number, number, number];
  ambientHex: string;
  meanIntensity: number;
  contrast: number;
  saturation: number;
  warmth: number;
  tint: number;
  noise?: number;
  sampleBounds: CanvasBounds;
}

export interface LocalAmbientAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  colorMix: number;
  color: [number, number, number];
  blurPx: number;
  grain: number;
  shadowOpacityMultiplier: number;
}

export interface LocalAmbientState {
  enabled: boolean;
  lighting?: LocalLightingAnalysis;
  adjustments?: LocalAmbientAdjustments;
}

export interface LightingGridCell {
  row: number;
  col: number;
  meanRgb: [number, number, number];
  meanIntensity: number;
  contrast: number;
  saturation: number;
}

export interface SpatialLightingMap {
  bounds: CanvasBounds;
  rows: number;
  cols: number;
  globalMeanIntensity: number;
  cells: LightingGridCell[];
  lightDirection?: {
    x: number;
    y: number;
  };
}

export interface SpatialRelightSettings {
  enabled: boolean;
  intensity: number;
  colorInfluence: number;
  directionalInfluence: number;
  gridSize: 3 | 5;
}

export interface SpatialRelightResult {
  lightingMap: SpatialLightingMap;
  applied: boolean;
}

export interface PerspectiveSettings {
  enabled: boolean;
  skewX: number;
  skewY: number;
  verticalTilt: number;
  floorAngle: number;
  perspectiveX: number;
  perspectiveY: number;
}

export interface FloorAnchorSettings {
  enabled: boolean;
  anchorX: number;
  anchorY: number;
  showGuide: boolean;
  snapBottomToAnchor: boolean;
}

export interface GroundingShadowSettings {
  enabled: boolean;
  baseContactStrength: number;
  legContactStrength: number;
  contactBlur: number;
  floorFade: number;
  useFootPoints: boolean;
}

export interface CameraMatchSettings {
  enabled: boolean;
  blurPx: number;
  grainAmount: number;
  edgeFeatherPx: number;
  compressionSoftness: number;
}

export interface GroundingRealismSettings {
  perspective: PerspectiveSettings;
  floorAnchor: FloorAnchorSettings;
  groundingShadow: GroundingShadowSettings;
  cameraMatch: CameraMatchSettings;
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
  positionBasedAmbientEnabled?: boolean;
  localAmbient?: LocalAmbientState;
  spatialRelight?: SpatialRelightSettings;
  spatialRelightResult?: SpatialRelightResult;
  groundingRealism?: GroundingRealismSettings;
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
  positionBasedAmbientEnabled?: boolean;
  spatialRelight?: SpatialRelightSettings;
  groundingRealism?: GroundingRealismSettings;
  occlusionObjectIds: string[];
  windowGlass?: WindowGlassSettings;
}

export interface FlattenedOverlayResult {
  dataUrl: string;
  localAmbient?: LocalAmbientState;
  spatialRelightResult?: SpatialRelightResult;
}

export interface CanvasEditorHandle {
  exportImage: () => Promise<string>;
  flattenActiveOverlay: () => Promise<FlattenedOverlayResult>;
}
