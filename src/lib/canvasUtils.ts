import type {
  BrightnessAnalysis,
  BrightnessCategory,
  CanvasBounds,
  LocalAmbientAdjustments,
  LocalLightingAnalysis,
  LightingAnalysis,
  OverlayTransform,
  ShadowSettings,
} from "./types";

export const DEFAULT_OVERLAY_TRANSFORM: OverlayTransform = {
  x: 0,
  y: 0,
  scale: 0.26,
  rotation: 0,
  modelPitch: 8,
  modelYaw: -24,
  opacity: 1,
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

export function analyzeLocalImageRegion(
  imageData: ImageData,
  sampleBounds: CanvasBounds = {
    x: 0,
    y: 0,
    width: imageData.width,
    height: imageData.height,
  },
): LocalLightingAnalysis {
  const data = imageData.data;
  const totalPixels = imageData.width * imageData.height;
  const step = Math.max(1, Math.ceil(Math.sqrt(totalPixels / 250000)));
  const samples: Array<{
    blue: number;
    green: number;
    luminance: number;
    red: number;
    saturation: number;
  }> = [];

  for (let y = 0; y < imageData.height; y += step) {
    for (let x = 0; x < imageData.width; x += step) {
      const index = (y * imageData.width + x) * 4;
      const alpha = data[index + 3];
      if (alpha <= 0) {
        continue;
      }

      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luminance = getLuminance(red, green, blue);
      if (luminance < 5 || luminance > 250) {
        continue;
      }

      const strongestChannel = Math.max(red, green, blue, 1);
      const weakestChannel = Math.min(red, green, blue);
      samples.push({
        blue,
        green,
        luminance,
        red,
        saturation: (strongestChannel - weakestChannel) / strongestChannel,
      });
    }
  }

  if (samples.length === 0) {
    throw new Error("Local image region did not contain usable pixels.");
  }

  samples.sort((first, second) => first.luminance - second.luminance);
  const trimCount = Math.floor(samples.length * 0.05);
  const trimmedSamples =
    samples.length > trimCount * 2
      ? samples.slice(trimCount, samples.length - trimCount)
      : samples;
  const sampleCount = trimmedSamples.length;

  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let luminanceSum = 0;
  let saturationSum = 0;

  for (const sample of trimmedSamples) {
    redSum += sample.red;
    greenSum += sample.green;
    blueSum += sample.blue;
    luminanceSum += sample.luminance;
    saturationSum += sample.saturation;
  }

  const meanRed = redSum / sampleCount;
  const meanGreen = greenSum / sampleCount;
  const meanBlue = blueSum / sampleCount;
  const meanIntensity = luminanceSum / sampleCount;
  let varianceSum = 0;

  for (const sample of trimmedSamples) {
    varianceSum += (sample.luminance - meanIntensity) ** 2;
  }

  const luminanceDeviation = Math.sqrt(varianceSum / sampleCount);
  const contrast = clamp(luminanceDeviation / 64, 0.55, 1.45);
  const saturation = clamp(saturationSum / sampleCount, 0, 1.25);
  const meanRgb: [number, number, number] = [
    clampChannel(meanRed),
    clampChannel(meanGreen),
    clampChannel(meanBlue),
  ];

  return {
    meanRgb,
    ambientRgb: meanRgb,
    ambientHex: rgbToHex(meanRgb),
    meanIntensity: clamp(meanIntensity, 0, 255),
    contrast,
    saturation,
    warmth: clamp((meanRed - meanBlue) / 255, -1, 1),
    tint: clamp((meanGreen - (meanRed + meanBlue) / 2) / 255, -1, 1),
    noise: clamp(luminanceDeviation / 255, 0, 1),
    sampleBounds: {
      x: Math.round(sampleBounds.x),
      y: Math.round(sampleBounds.y),
      width: Math.round(sampleBounds.width),
      height: Math.round(sampleBounds.height),
    },
  };
}

export function deriveLocalAmbientAdjustments(
  localLighting: LocalLightingAnalysis,
  globalLighting?: LightingAnalysis,
): LocalAmbientAdjustments {
  const globalIntensity = globalLighting
    ? averageRgb(globalLighting.mean_rgb)
    : 128;
  const globalContrast = globalLighting?.contrast ?? 1;
  const globalSaturation = globalLighting?.saturation ?? localLighting.saturation;
  const intensityDelta = (localLighting.meanIntensity - globalIntensity) / 255;
  const contrastDelta = localLighting.contrast - globalContrast;
  const saturationDelta = localLighting.saturation - globalSaturation;
  const colorCastStrength =
    Math.abs(localLighting.warmth) + Math.abs(localLighting.tint);

  return {
    brightness: clamp(1 + intensityDelta * 0.55, 0.75, 1.25),
    contrast: clamp(1 + contrastDelta * 0.22, 0.8, 1.2),
    saturation: clamp(1 + saturationDelta * 0.4, 0.75, 1.25),
    colorMix: clamp(0.08 + Math.abs(intensityDelta) * 0.08 + colorCastStrength * 0.12, 0.05, 0.3),
    color: localLighting.ambientRgb,
    blurPx: clamp((1 - localLighting.contrast) * 0.65, 0, 2),
    grain: clamp((localLighting.noise ?? 0) * 0.16, 0, 0.25),
    shadowOpacityMultiplier: clamp(1 + intensityDelta * 0.35 + contrastDelta * 0.08, 0.75, 1.3),
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
    scale: 0.26,
    rotation: 0,
    modelPitch: 8,
    modelYaw: -24,
    opacity: 1,
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

function getLuminance(red: number, green: number, blue: number) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function averageRgb(rgb: [number, number, number]) {
  return (rgb[0] + rgb[1] + rgb[2]) / 3;
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(rgb: [number, number, number]) {
  return `#${rgb.map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}
