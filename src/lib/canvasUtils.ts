import type {
  BrightnessAnalysis,
  BrightnessCategory,
  LightingAnalysis,
  OverlayTransform,
  ShadowSettings,
} from "./types";

export const DEFAULT_OVERLAY_TRANSFORM: OverlayTransform = {
  x: 0,
  y: 0,
  scale: 0.34,
  rotation: 0,
  modelPitch: 8,
  modelYaw: -24,
  opacity: 0.92,
};

export const DEFAULT_SHADOW_SETTINGS: ShadowSettings = {
  enabled: true,
  contactEnabled: true,
  castEnabled: true,
  opacity: 0.24,
  blur: 18,
  directionX: 0.3,
  directionY: 0.8,
  length: 0.85,
  contactOpacity: 0.32,
  contactScale: 0.78,
  autoFromLighting: true,
};

export function getAmbientCanvasFilter(
  category: BrightnessCategory | undefined,
  lighting: LightingAnalysis | undefined,
  enabled: boolean,
) {
  if (!enabled) {
    return "none";
  }

  if (lighting) {
    const filter = [lighting.suggested.blur_px > 0.05 ? `blur(${lighting.suggested.blur_px}px)` : ""]
      .filter(Boolean)
      .join(" ");
    return filter || "none";
  }

  switch (category) {
    case "dim":
      return "brightness(0.85) contrast(0.95)";
    case "bright":
      return "brightness(1.12) contrast(1.05)";
    case "normal":
    default:
      return "brightness(1) contrast(1)";
  }
}

export function getAmbientLabel(category: BrightnessCategory | undefined) {
  switch (category) {
    case "dim":
      return "Dim";
    case "bright":
      return "Bright";
    case "normal":
      return "Normal";
    default:
      return "Not analyzed";
  }
}

export function deriveShadowSettingsFromLighting(
  lighting?: LightingAnalysis,
  brightness?: BrightnessAnalysis,
): ShadowSettings {
  const baseOpacity =
    lighting?.suggested.shadow_opacity ??
    (brightness?.category === "bright"
      ? 0.28
      : brightness?.category === "dim"
        ? 0.18
        : DEFAULT_SHADOW_SETTINGS.opacity);
  const contrast = lighting?.contrast ?? 1;
  const blurByBrightness =
    brightness?.category === "bright"
      ? 22
      : brightness?.category === "dim"
        ? 20
        : 16;
  const blur = clamp(blurByBrightness + (1 - contrast) * 8, 8, 32);
  const lightX = lighting?.light_direction?.x ?? -0.25;
  const lightY = lighting?.light_direction?.y ?? -0.45;
  const directionX = normalizeShadowDirection(-lightX, 0.28);
  const directionY = clamp(Math.abs(lightY) + 0.42, 0.3, 1);

  return {
    enabled: true,
    contactEnabled: true,
    castEnabled: true,
    opacity: clamp(baseOpacity * (brightness?.category === "bright" ? 1.08 : 0.92), 0.08, 0.48),
    blur,
    directionX,
    directionY,
    length: clamp(0.82 + (1 - contrast) * 0.22, 0.45, 1.35),
    contactOpacity: clamp(baseOpacity * 1.2, 0.12, 0.5),
    contactScale: clamp(0.74 + contrast * 0.05, 0.62, 0.9),
    autoFromLighting: true,
  };
}

export function loadCanvasImage(src: string, crossOrigin?: "anonymous") {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    if (crossOrigin) {
      image.crossOrigin = crossOrigin;
    }

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

export function getInitialOverlayTransform(
  canvasWidth: number,
  canvasHeight: number,
): OverlayTransform {
  return {
    x: canvasWidth * 0.52,
    y: canvasHeight * 0.57,
    scale: 0.34,
    rotation: 0,
    modelPitch: 8,
    modelYaw: -24,
    opacity: 0.92,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

function normalizeShadowDirection(value: number, fallback: number) {
  if (Math.abs(value) < 0.08) {
    return fallback;
  }

  return clamp(value, -1, 1);
}
