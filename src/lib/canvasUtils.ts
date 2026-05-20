import type {
  AmbientLightAdjustmentSettings,
  AutoRealismResult,
  AutoRealismSettings,
  BrightnessAnalysis,
  BrightnessCategory,
  CanvasBounds,
  CameraMatchSettings,
  GroundingRealismSettings,
  LocalAmbientAdjustments,
  LocalLightingAnalysis,
  LightingAnalysis,
  OverlayTransform,
  PlacementType,
  ProductModelType,
  ShadowSettings,
  SpatialLightingMap,
  SpatialRelightSettings,
  WindowGlassSettings,
} from "./types";

interface SampledLightingStats {
  meanRgb: [number, number, number];
  meanIntensity: number;
  contrast: number;
  saturation: number;
  sampleCount: number;
}

interface InterpolatedLightingSample {
  meanRgb: [number, number, number];
  meanIntensity: number;
  contrast: number;
  saturation: number;
}

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

export const DEFAULT_SPATIAL_RELIGHT_SETTINGS: SpatialRelightSettings = {
  enabled: true,
  intensity: 0.35,
  colorInfluence: 0.08,
  directionalInfluence: 0.2,
  gridSize: 5,
};

export const DEFAULT_AMBIENT_LIGHT_ADJUSTMENT_SETTINGS: AmbientLightAdjustmentSettings = {
  enabled: true,
  useGlobalMatch: true,
  usePositionMatch: true,
  useSpatialRelight: true,
  spatialRelightStrength: 0.35,
};

export const DEFAULT_GROUNDING_REALISM: GroundingRealismSettings = {
  perspective: {
    enabled: true,
    skewX: 0,
    skewY: 0,
    verticalTilt: 0,
    floorAngle: 0,
    perspectiveX: 0,
    perspectiveY: 0,
  },
  floorAnchor: {
    enabled: true,
    anchorX: 0.5,
    anchorY: 0.85,
    showGuide: true,
    snapBottomToAnchor: false,
  },
  groundingShadow: {
    enabled: true,
    baseContactStrength: 0.35,
    legContactStrength: 0.45,
    contactBlur: 10,
    floorFade: 0.8,
    useFootPoints: true,
  },
  cameraMatch: {
    enabled: true,
    blurPx: 0.6,
    grainAmount: 0.06,
    edgeFeatherPx: 0.8,
    compressionSoftness: 0.08,
  },
};

export const DEFAULT_AUTO_REALISM_SETTINGS: AutoRealismSettings = {
  enabled: true,
  placementType: "floor-standing",
  autoPerspective: true,
  autoCameraMatch: true,
  autoGroundingShadow: false,
  autoEdgeBlend: true,
  autoFaceShading: true,
};

export function getDefaultAutoRealismSettings(
  modelType: ProductModelType,
): AutoRealismSettings {
  if (modelType === "window") {
    return {
      ...DEFAULT_AUTO_REALISM_SETTINGS,
      placementType: "wall-mounted",
      autoGroundingShadow: false,
    };
  }

  return { ...DEFAULT_AUTO_REALISM_SETTINGS };
}

export function normalizeAmbientLightAdjustmentSettings(
  source?: {
    ambientAdjustment?: AmbientLightAdjustmentSettings;
    ambientEnabled?: boolean;
    positionBasedAmbientEnabled?: boolean;
    spatialRelight?: SpatialRelightSettings;
  } | null,
): AmbientLightAdjustmentSettings {
  const explicit = source?.ambientAdjustment;
  const legacySpatial = source?.spatialRelight;

  if (explicit) {
    return {
      ...DEFAULT_AMBIENT_LIGHT_ADJUSTMENT_SETTINGS,
      ...explicit,
      spatialRelightStrength: clamp(
        explicit.spatialRelightStrength ??
          legacySpatial?.intensity ??
          DEFAULT_AMBIENT_LIGHT_ADJUSTMENT_SETTINGS.spatialRelightStrength,
        0,
        1,
      ),
    };
  }

  return {
    ...DEFAULT_AMBIENT_LIGHT_ADJUSTMENT_SETTINGS,
    enabled: source?.ambientEnabled ?? DEFAULT_AMBIENT_LIGHT_ADJUSTMENT_SETTINGS.enabled,
    usePositionMatch:
      source?.positionBasedAmbientEnabled ??
      DEFAULT_AMBIENT_LIGHT_ADJUSTMENT_SETTINGS.usePositionMatch,
    useSpatialRelight:
      legacySpatial?.enabled ??
      DEFAULT_AMBIENT_LIGHT_ADJUSTMENT_SETTINGS.useSpatialRelight,
    spatialRelightStrength: clamp(
      legacySpatial?.intensity ??
        DEFAULT_AMBIENT_LIGHT_ADJUSTMENT_SETTINGS.spatialRelightStrength,
      0,
      1,
    ),
  };
}

export function getSpatialRelightSettingsForAmbient(
  source?: {
    ambientAdjustment?: AmbientLightAdjustmentSettings;
    ambientEnabled?: boolean;
    positionBasedAmbientEnabled?: boolean;
    spatialRelight?: SpatialRelightSettings;
  } | null,
): SpatialRelightSettings {
  const ambientAdjustment = normalizeAmbientLightAdjustmentSettings(source);
  const legacySpatial = source?.spatialRelight ?? DEFAULT_SPATIAL_RELIGHT_SETTINGS;

  return {
    ...DEFAULT_SPATIAL_RELIGHT_SETTINGS,
    ...legacySpatial,
    enabled: ambientAdjustment.enabled && ambientAdjustment.useSpatialRelight,
    intensity: ambientAdjustment.spatialRelightStrength,
  };
}

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

export function deriveAutoRealismSettings({
  modelType,
  placementType,
  overlayBounds,
  canvasWidth,
  canvasHeight,
  localLighting,
  spatialLightingMap,
  globalLighting,
  imageSharpness,
  imageNoise,
}: {
  modelType: ProductModelType;
  placementType: PlacementType;
  overlayBounds: CanvasBounds | null;
  canvasWidth?: number;
  canvasHeight?: number;
  localLighting?: LocalLightingAnalysis;
  spatialLightingMap?: SpatialLightingMap;
  globalLighting?: LightingAnalysis;
  imageSharpness?: number;
  imageNoise?: number;
}): AutoRealismResult {
  const spatialContrast = spatialLightingMap
    ? spatialLightingMap.cells.reduce((sum, cell) => sum + cell.contrast, 0) /
      Math.max(spatialLightingMap.cells.length, 1)
    : undefined;
  const contrast =
    localLighting?.contrast ??
    spatialContrast ??
    globalLighting?.contrast ??
    1;
  const noise =
    imageNoise ??
    localLighting?.noise ??
    globalLighting?.noise ??
    globalLighting?.suggested.grain ??
    0.04;
  const sharpness = imageSharpness ?? globalLighting?.sharpness ?? 0.9;
  const suggestedBlur = globalLighting?.suggested.blur_px ?? 0.25;
  const normalizedSharpness = clamp(sharpness / 1.5, 0, 1);
  const softnessFromSharpness = 1 - normalizedSharpness;
  const overlayCenterX = overlayBounds
    ? overlayBounds.x + overlayBounds.width / 2
    : (canvasWidth ?? 1) * 0.5;
  const overlayBottom = overlayBounds
    ? overlayBounds.y + overlayBounds.height
    : (canvasHeight ?? 1) * 0.7;
  const horizontalOffset = canvasWidth
    ? clamp((overlayCenterX / canvasWidth - 0.5) * 2, -1, 1)
    : 0;
  const lowerImageFactor = canvasHeight
    ? clamp((overlayBottom / canvasHeight - 0.42) / 0.46, 0, 1)
    : 0.55;
  const placementGrounding = getPlacementGroundingProfile(
    placementType,
    modelType,
    lowerImageFactor,
    contrast,
  );
  const perspectiveAmount =
    placementType === "floor-standing"
      ? 1
      : placementType === "tabletop"
        ? 0.62
        : 0.35;
  const perspectiveSkewX = clamp(
    -horizontalOffset * 0.06 * perspectiveAmount,
    -0.08,
    0.08,
  );
  const perspectiveSkewY = clamp(
    horizontalOffset * 0.025 * perspectiveAmount,
    -0.04,
    0.04,
  );
  const verticalTilt = clamp(
    (lowerImageFactor - 0.38) * 0.085 * perspectiveAmount,
    -0.05,
    0.08,
  );
  const cameraBlurPx = clamp(
    0.14 + suggestedBlur * 0.24 + softnessFromSharpness * 0.38 + (1 - contrast) * 0.12,
    0.12,
    0.85,
  );
  const grainAmount = clamp(
    0.018 + noise * 0.12 + (globalLighting?.suggested.grain ?? 0) * 0.2,
    0.015,
    0.075,
  );
  const edgeFeatherPx = clamp(
    0.32 + cameraBlurPx * 0.32 + noise * 0.18,
    0.28,
    1,
  );
  const faceShadingStrength =
    modelType === "cabinet"
      ? clamp(0.16 + lowerImageFactor * 0.07 + (contrast - 1) * 0.06, 0.14, 0.32)
      : clamp(0.06 + (contrast - 1) * 0.04, 0.03, 0.12);
  const notes: string[] = [];

  if (!localLighting) {
    notes.push("Used global image analysis because local lighting was unavailable.");
  }
  if (!overlayBounds) {
    notes.push("Used safe overlay-position defaults for perspective.");
  }

  return {
    cameraBlurPx,
    grainAmount,
    edgeFeatherPx,
    contactShadowStrength: placementGrounding.contactShadowStrength,
    legShadowStrength: placementGrounding.legShadowStrength,
    shadowSoftness: placementGrounding.shadowSoftness,
    perspectiveSkewX,
    perspectiveSkewY,
    verticalTilt,
    faceShadingStrength,
    notes: notes.length > 0 ? notes : undefined,
  };
}

export function computeOverlaySampleBounds(
  transform: OverlayTransform,
  overlayWidth: number,
  overlayHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  paddingRatio = 0.15,
): CanvasBounds | null {
  if (
    canvasWidth <= 0 ||
    canvasHeight <= 0 ||
    overlayWidth <= 0 ||
    overlayHeight <= 0
  ) {
    return null;
  }

  const rotatedSize = getRotatedOverlaySize(
    overlayWidth,
    overlayHeight,
    transform.rotation,
  );
  const paddingX = rotatedSize.width * paddingRatio;
  const paddingY = rotatedSize.height * paddingRatio;
  const left = Math.floor(transform.x - rotatedSize.width / 2 - paddingX);
  const top = Math.floor(transform.y - rotatedSize.height / 2 - paddingY);
  const right = Math.ceil(transform.x + rotatedSize.width / 2 + paddingX);
  const bottom = Math.ceil(transform.y + rotatedSize.height / 2 + paddingY);
  const x = clamp(left, 0, canvasWidth - 1);
  const y = clamp(top, 0, canvasHeight - 1);
  const clampedRight = clamp(right, x + 1, canvasWidth);
  const clampedBottom = clamp(bottom, y + 1, canvasHeight);
  const width = Math.round(clampedRight - x);
  const height = Math.round(clampedBottom - y);

  if (width < 8 || height < 8) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
  };
}

export function buildSpatialLightingMap(
  context: CanvasRenderingContext2D,
  sampleBounds: CanvasBounds,
  rows: number,
  cols: number,
  globalLighting?: LightingAnalysis,
): SpatialLightingMap {
  const clampedRows = rows === 3 ? 3 : 5;
  const clampedCols = cols === 3 ? 3 : 5;
  const cells = [];

  for (let row = 0; row < clampedRows; row += 1) {
    for (let col = 0; col < clampedCols; col += 1) {
      const cellLeft = sampleBounds.x + (sampleBounds.width * col) / clampedCols;
      const cellTop = sampleBounds.y + (sampleBounds.height * row) / clampedRows;
      const cellRight = sampleBounds.x + (sampleBounds.width * (col + 1)) / clampedCols;
      const cellBottom = sampleBounds.y + (sampleBounds.height * (row + 1)) / clampedRows;
      const x = Math.round(cellLeft);
      const y = Math.round(cellTop);
      const width = Math.max(1, Math.round(cellRight - cellLeft));
      const height = Math.max(1, Math.round(cellBottom - cellTop));
      const imageData = context.getImageData(x, y, width, height);
      const stats = getImageDataLightingStats(imageData);

      cells.push({
        row,
        col,
        meanRgb: stats.meanRgb,
        meanIntensity: stats.meanIntensity,
        contrast: stats.contrast,
        saturation: stats.saturation,
      });
    }
  }

  const localMeanIntensity =
    cells.reduce((sum, cell) => sum + cell.meanIntensity, 0) /
    Math.max(cells.length, 1);

  return {
    bounds: {
      x: Math.round(sampleBounds.x),
      y: Math.round(sampleBounds.y),
      width: Math.round(sampleBounds.width),
      height: Math.round(sampleBounds.height),
    },
    rows: clampedRows,
    cols: clampedCols,
    globalMeanIntensity:
      Number.isFinite(localMeanIntensity)
        ? localMeanIntensity
        : globalLighting
          ? averageRgb(globalLighting.mean_rgb)
          : 128,
    cells,
    lightDirection: globalLighting?.light_direction,
  };
}

export function sampleLightingMapAtNormalizedPoint(
  lightingMap: SpatialLightingMap,
  normalizedX: number,
  normalizedY: number,
): InterpolatedLightingSample {
  const x = clamp(normalizedX, 0, 1) * (lightingMap.cols - 1);
  const y = clamp(normalizedY, 0, 1) * (lightingMap.rows - 1);
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(lightingMap.cols - 1, left + 1);
  const bottom = Math.min(lightingMap.rows - 1, top + 1);
  const amountX = x - left;
  const amountY = y - top;
  const topLeft = getLightingGridCell(lightingMap, top, left);
  const topRight = getLightingGridCell(lightingMap, top, right);
  const bottomLeft = getLightingGridCell(lightingMap, bottom, left);
  const bottomRight = getLightingGridCell(lightingMap, bottom, right);
  const topSample = interpolateLightingCells(topLeft, topRight, amountX);
  const bottomSample = interpolateLightingCells(bottomLeft, bottomRight, amountX);

  return interpolateLightingCells(topSample, bottomSample, amountY);
}

export function applySpatialRelightingToOverlayCanvas(
  modelCanvas: HTMLCanvasElement,
  lightingMap: SpatialLightingMap,
  settings: SpatialRelightSettings,
  globalLighting?: LightingAnalysis,
  modelType?: ProductModelType,
  windowGlass?: WindowGlassSettings,
): HTMLCanvasElement {
  if (!settings.enabled) {
    return modelCanvas;
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = modelCanvas.width;
  outputCanvas.height = modelCanvas.height;

  const outputContext = outputCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!outputContext) {
    return modelCanvas;
  }

  outputContext.drawImage(modelCanvas, 0, 0);

  const imageData = outputContext.getImageData(
    0,
    0,
    outputCanvas.width,
    outputCanvas.height,
  );
  const data = imageData.data;
  const outdoorWindow =
    modelType === "window" && windowGlass?.mode === "outdoor";
  const clearWindow =
    modelType === "window" && windowGlass?.mode === "clear";
  const brightnessMin = outdoorWindow ? 0.92 : clearWindow ? 0.9 : 0.88;
  const brightnessMax = outdoorWindow ? 1.14 : clearWindow ? 1.17 : 1.22;
  const colorInfluence = outdoorWindow
    ? settings.colorInfluence * 0.4
    : settings.colorInfluence * 0.75;
  const baseIntensity =
    Number.isFinite(lightingMap.globalMeanIntensity)
      ? lightingMap.globalMeanIntensity
      : globalLighting
        ? averageRgb(globalLighting.mean_rgb)
        : 128;
  const lightDirection = normalizeLightDirection(lightingMap.lightDirection);

  for (let y = 0; y < outputCanvas.height; y += 1) {
    const normalizedY = outputCanvas.height <= 1 ? 0.5 : y / (outputCanvas.height - 1);

    for (let x = 0; x < outputCanvas.width; x += 1) {
      const index = (y * outputCanvas.width + x) * 4;
      const alpha = data[index + 3] / 255;
      if (alpha <= 0.01) {
        continue;
      }

      const normalizedX = outputCanvas.width <= 1 ? 0.5 : x / (outputCanvas.width - 1);
      const sample = sampleLightingMapAtNormalizedPoint(
        lightingMap,
        normalizedX,
        normalizedY,
      );
      const localDelta = (sample.meanIntensity - baseIntensity) / 255;
      const brightnessMultiplier = clamp(
        1 + localDelta * settings.intensity,
        brightnessMin,
        brightnessMax,
      );
      const centeredX = normalizedX * 2 - 1;
      const centeredY = normalizedY * 2 - 1;
      const directionalFactor =
        centeredX * lightDirection.x + centeredY * lightDirection.y;
      const directionalAdjustment = clamp(
        1 + directionalFactor * settings.directionalInfluence * 0.15,
        0.94,
        1.12,
      );
      const finalBrightness = brightnessMultiplier * directionalAdjustment;

      data[index] = clampChannel(
        data[index] * finalBrightness * (1 - colorInfluence) +
          sample.meanRgb[0] * colorInfluence,
      );
      data[index + 1] = clampChannel(
        data[index + 1] * finalBrightness * (1 - colorInfluence) +
          sample.meanRgb[1] * colorInfluence,
      );
      data[index + 2] = clampChannel(
        data[index + 2] * finalBrightness * (1 - colorInfluence) +
          sample.meanRgb[2] * colorInfluence,
      );
    }
  }

  outputContext.putImageData(imageData, 0, 0);

  return outputCanvas;
}

export function applyBoxModelFaceShading(
  modelCanvas: HTMLCanvasElement,
  modelType: ProductModelType,
  strength: number,
): HTMLCanvasElement {
  if (modelType !== "cabinet" || strength <= 0.01) {
    return modelCanvas;
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = modelCanvas.width;
  outputCanvas.height = modelCanvas.height;

  const outputContext = outputCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!outputContext) {
    return modelCanvas;
  }

  outputContext.drawImage(modelCanvas, 0, 0);

  const imageData = outputContext.getImageData(
    0,
    0,
    outputCanvas.width,
    outputCanvas.height,
  );
  const data = imageData.data;
  const clampedStrength = clamp(strength, 0, 0.45);

  for (let y = 0; y < outputCanvas.height; y += 1) {
    const normalizedY = outputCanvas.height <= 1 ? 0.5 : y / (outputCanvas.height - 1);

    for (let x = 0; x < outputCanvas.width; x += 1) {
      const index = (y * outputCanvas.width + x) * 4;
      const alpha = data[index + 3] / 255;
      if (alpha <= 0.01) {
        continue;
      }

      const normalizedX = outputCanvas.width <= 1 ? 0.5 : x / (outputCanvas.width - 1);
      const sideDistance = Math.abs(normalizedX - 0.5) * 2;
      const topLift = normalizedY < 0.2 ? (0.2 - normalizedY) / 0.2 : 0;
      const lowerShade = normalizedY > 0.62 ? (normalizedY - 0.62) / 0.38 : 0;
      const sideShade = Math.max(0, sideDistance - 0.72) / 0.28;
      const undersideShade = normalizedY > 0.86 ? (normalizedY - 0.86) / 0.14 : 0;
      const brightness =
        1 +
        topLift * clampedStrength * 0.3 -
        lowerShade * clampedStrength * 0.12 -
        sideShade * clampedStrength * 0.18 -
        undersideShade * clampedStrength * 0.18;
      const contrast = 1 + clampedStrength * 0.12;

      data[index] = clampChannel((data[index] * brightness - 128) * contrast + 128);
      data[index + 1] = clampChannel((data[index + 1] * brightness - 128) * contrast + 128);
      data[index + 2] = clampChannel((data[index + 2] * brightness - 128) * contrast + 128);
    }
  }

  outputContext.putImageData(imageData, 0, 0);

  return outputCanvas;
}

export function applyCabinetMaterialVitality(
  modelCanvas: HTMLCanvasElement,
  modelType: ProductModelType,
): HTMLCanvasElement {
  if (modelType !== "cabinet") {
    return modelCanvas;
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = modelCanvas.width;
  outputCanvas.height = modelCanvas.height;

  const outputContext = outputCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!outputContext) {
    return modelCanvas;
  }

  outputContext.drawImage(modelCanvas, 0, 0);

  const imageData = outputContext.getImageData(
    0,
    0,
    outputCanvas.width,
    outputCanvas.height,
  );
  const data = imageData.data;

  for (let y = 0; y < outputCanvas.height; y += 1) {
    const normalizedY = outputCanvas.height <= 1 ? 0.5 : y / (outputCanvas.height - 1);

    for (let x = 0; x < outputCanvas.width; x += 1) {
      const index = (y * outputCanvas.width + x) * 4;
      const alpha = data[index + 3] / 255;
      if (alpha <= 0.01) {
        continue;
      }

      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luma = getLuminance(red, green, blue);

      if (luma < 44) {
        data[index] = clampChannel((red - 18) * 1.08 + 18);
        data[index + 1] = clampChannel((green - 18) * 1.08 + 18);
        data[index + 2] = clampChannel((blue - 18) * 1.08 + 18);
        continue;
      }

      const normalizedX = outputCanvas.width <= 1 ? 0.5 : x / (outputCanvas.width - 1);
      const topHighlight = 1 - smoothstep(0.05, 0.38, normalizedY);
      const frontLift =
        smoothstep(0.18, 0.38, normalizedY) *
        (1 - smoothstep(0.68, 0.86, normalizedY));
      const sideRollOff = Math.abs(normalizedX - 0.5) * 2;
      const rightFaceShade = normalizedX > 0.62 ? (normalizedX - 0.62) / 0.38 : 0;
      const lowerDepth = normalizedY > 0.62 ? (normalizedY - 0.62) / 0.38 : 0;
      const softTopShadow = smoothstep(0.18, 0.3, normalizedY) *
        (1 - smoothstep(0.3, 0.46, normalizedY));
      const materialLift =
        1.075 +
        topHighlight * 0.13 +
        frontLift * 0.045 -
        sideRollOff * 0.035 -
        rightFaceShade * 0.055 -
        lowerDepth * 0.035 -
        softTopShadow * 0.018;
      const clarity = 1.19;
      const saturation = 1.08;

      let nextRed = (red * materialLift - 128) * clarity + 128;
      let nextGreen = (green * materialLift - 128) * clarity + 128;
      let nextBlue = (blue * materialLift - 128) * clarity + 128;
      const nextLuma = getLuminance(nextRed, nextGreen, nextBlue);

      nextRed = nextLuma + (nextRed - nextLuma) * saturation;
      nextGreen = nextLuma + (nextGreen - nextLuma) * saturation;
      nextBlue = nextLuma + (nextBlue - nextLuma) * saturation;

      data[index] = clampChannel(nextRed + 5);
      data[index + 1] = clampChannel(nextGreen + 4);
      data[index + 2] = clampChannel(nextBlue + 2);
    }
  }

  outputContext.putImageData(imageData, 0, 0);

  return outputCanvas;
}

export function applyCameraMatchToOverlayCanvas(
  modelCanvas: HTMLCanvasElement,
  settings: CameraMatchSettings,
  seed = "camera-match",
): HTMLCanvasElement {
  if (!settings.enabled) {
    return modelCanvas;
  }

  const blurAmount = Math.max(0, settings.blurPx + settings.compressionSoftness * 1.2);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = modelCanvas.width;
  outputCanvas.height = modelCanvas.height;

  const outputContext = outputCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!outputContext) {
    return modelCanvas;
  }

  if (blurAmount > 0.01) {
    outputContext.filter = `blur(${blurAmount}px)`;
    outputContext.drawImage(modelCanvas, 0, 0);
    outputContext.filter = "none";
    outputContext.globalAlpha = clamp(1 - settings.compressionSoftness, 0.82, 1);
    outputContext.drawImage(modelCanvas, 0, 0);
    outputContext.globalAlpha = 1;
  } else {
    outputContext.drawImage(modelCanvas, 0, 0);
  }

  const featheredCanvas = applyAlphaFeather(outputCanvas, settings.edgeFeatherPx);
  const featheredContext = featheredCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!featheredContext || settings.grainAmount <= 0) {
    return featheredCanvas;
  }

  const imageData = featheredContext.getImageData(
    0,
    0,
    featheredCanvas.width,
    featheredCanvas.height,
  );
  const data = imageData.data;
  const grainStrength = clamp(settings.grainAmount, 0, 0.25) * 34;
  const seedValue = stringToSeed(seed);

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha <= 0.01) {
      continue;
    }

    const grain = (pseudoRandom(seedValue + index) - 0.5) * grainStrength * alpha;
    data[index] = clampChannel(data[index] + grain);
    data[index + 1] = clampChannel(data[index + 1] + grain);
    data[index + 2] = clampChannel(data[index + 2] + grain);
  }

  featheredContext.putImageData(imageData, 0, 0);

  return featheredCanvas;
}

export function applyAlphaFeather(
  canvas: HTMLCanvasElement,
  featherPx: number,
): HTMLCanvasElement {
  if (featherPx <= 0.05) {
    return canvas;
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;

  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) {
    return canvas;
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) {
    return canvas;
  }

  maskContext.drawImage(canvas, 0, 0);
  maskContext.globalCompositeOperation = "source-in";
  maskContext.fillStyle = "#000";
  maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

  const featherCanvas = document.createElement("canvas");
  featherCanvas.width = canvas.width;
  featherCanvas.height = canvas.height;
  const featherContext = featherCanvas.getContext("2d");
  if (!featherContext) {
    return canvas;
  }

  featherContext.filter = `blur(${featherPx}px)`;
  featherContext.drawImage(maskCanvas, 0, 0);
  featherContext.filter = "none";

  outputContext.drawImage(canvas, 0, 0);
  outputContext.globalCompositeOperation = "destination-in";
  outputContext.drawImage(featherCanvas, 0, 0);
  outputContext.globalCompositeOperation = "source-over";

  return outputCanvas;
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

function getPlacementGroundingProfile(
  placementType: PlacementType,
  modelType: ProductModelType,
  lowerImageFactor: number,
  contrast: number,
) {
  if (placementType === "wall-mounted") {
    return {
      contactShadowStrength: modelType === "window" ? 0.08 : 0.14,
      legShadowStrength: modelType === "window" ? 0.04 : 0.08,
      shadowSoftness: clamp(16 + (1 - contrast) * 5, 12, 22),
    };
  }

  if (placementType === "tabletop") {
    return {
      contactShadowStrength: clamp(0.22 + lowerImageFactor * 0.12, 0.22, 0.4),
      legShadowStrength: clamp(0.12 + lowerImageFactor * 0.1, 0.1, 0.32),
      shadowSoftness: clamp(10 + (1 - contrast) * 5, 8, 18),
    };
  }

  return {
    contactShadowStrength: clamp(0.35 + lowerImageFactor * 0.16 + (contrast - 1) * 0.05, 0.35, 0.55),
    legShadowStrength: clamp(0.45 + lowerImageFactor * 0.22 + (contrast - 1) * 0.08, 0.45, 0.7),
    shadowSoftness: clamp(9 + (1 - contrast) * 6 + lowerImageFactor * 5, 8, 18),
  };
}

function getRotatedOverlaySize(
  width: number,
  height: number,
  rotation: number,
) {
  const radians = Math.abs((rotation * Math.PI) / 180);
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

function getImageDataLightingStats(imageData: ImageData): SampledLightingStats {
  const stats = getImageDataLightingStatsWithFilter(imageData, true);

  if (stats.sampleCount > 0) {
    return stats;
  }

  return getImageDataLightingStatsWithFilter(imageData, false);
}

function getImageDataLightingStatsWithFilter(
  imageData: ImageData,
  ignoreOutliers: boolean,
): SampledLightingStats {
  const data = imageData.data;
  const totalPixels = imageData.width * imageData.height;
  const step = Math.max(1, Math.ceil(Math.sqrt(totalPixels / 9000)));
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let luminanceSum = 0;
  let saturationSum = 0;
  let sampleCount = 0;
  const luminanceValues: number[] = [];

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
      if (ignoreOutliers && (luminance < 5 || luminance > 250)) {
        continue;
      }

      const strongestChannel = Math.max(red, green, blue, 1);
      const weakestChannel = Math.min(red, green, blue);
      redSum += red;
      greenSum += green;
      blueSum += blue;
      luminanceSum += luminance;
      saturationSum += (strongestChannel - weakestChannel) / strongestChannel;
      luminanceValues.push(luminance);
      sampleCount += 1;
    }
  }

  if (sampleCount === 0) {
    return {
      meanRgb: [128, 128, 128],
      meanIntensity: 128,
      contrast: 1,
      saturation: 0,
      sampleCount: 0,
    };
  }

  const meanIntensity = luminanceSum / sampleCount;
  let varianceSum = 0;
  for (const luminance of luminanceValues) {
    varianceSum += (luminance - meanIntensity) ** 2;
  }

  return {
    meanRgb: [
      clampChannel(redSum / sampleCount),
      clampChannel(greenSum / sampleCount),
      clampChannel(blueSum / sampleCount),
    ],
    meanIntensity: clamp(meanIntensity, 0, 255),
    contrast: clamp(Math.sqrt(varianceSum / sampleCount) / 64, 0.55, 1.45),
    saturation: clamp(saturationSum / sampleCount, 0, 1.25),
    sampleCount,
  };
}

function getLightingGridCell(
  lightingMap: SpatialLightingMap,
  row: number,
  col: number,
): InterpolatedLightingSample {
  return (
    lightingMap.cells.find(
      (cell) => cell.row === row && cell.col === col,
    ) ?? {
      meanRgb: [128, 128, 128],
      meanIntensity: lightingMap.globalMeanIntensity || 128,
      contrast: 1,
      saturation: 0,
    }
  );
}

function interpolateLightingCells(
  first: InterpolatedLightingSample,
  second: InterpolatedLightingSample,
  amount: number,
): InterpolatedLightingSample {
  return {
    meanRgb: [
      lerp(first.meanRgb[0], second.meanRgb[0], amount),
      lerp(first.meanRgb[1], second.meanRgb[1], amount),
      lerp(first.meanRgb[2], second.meanRgb[2], amount),
    ],
    meanIntensity: lerp(first.meanIntensity, second.meanIntensity, amount),
    contrast: lerp(first.contrast, second.contrast, amount),
    saturation: lerp(first.saturation, second.saturation, amount),
  };
}

function normalizeLightDirection(direction?: { x: number; y: number }) {
  if (!direction) {
    return { x: -0.25, y: -0.45 };
  }

  const length = Math.hypot(direction.x, direction.y) || 1;

  return {
    x: direction.x / length,
    y: direction.y / length,
  };
}

function lerp(first: number, second: number, amount: number) {
  return first + (second - first) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function stringToSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return hash;
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

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
