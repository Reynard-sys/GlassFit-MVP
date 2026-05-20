import type {
  GlassAppearanceMode,
  PlacedOverlay,
  ProductModelOption,
  ProductModelType,
  WindowGlassSettings,
} from "./types";

export const PRODUCT_MODEL_OPTIONS: ProductModelOption[] = [
  {
    id: "cabinet",
    name: "Cabinet",
    modelPath: "/models/ikea-3-drawer.glb",
    fallback: "drawer",
  },
  {
    id: "window",
    name: "Window",
    modelPath: "/models/glass_window.glb",
    fallback: "window",
  },
];

export function getProductModelOption(modelType: ProductModelType) {
  return PRODUCT_MODEL_OPTIONS.find((option) => option.id === modelType) ?? PRODUCT_MODEL_OPTIONS[0];
}

export function getNextOverlayName(
  modelType: ProductModelType,
  placedOverlays: Pick<PlacedOverlay, "modelType">[],
) {
  const option = getProductModelOption(modelType);
  const count = placedOverlays.filter((overlay) => overlay.modelType === modelType).length;

  return `${option.name} ${count + 1}`;
}

export function getDefaultWindowGlassSettings(): WindowGlassSettings {
  return {
    mode: "frosted",
    opacity: 0.9,
    outdoorTexturePath: "/textures/outdoor-view.jpg",
  };
}

export function normalizeGlassAppearanceMode(mode: unknown): GlassAppearanceMode {
  switch (mode) {
    case "transparent":
    case "clear":
      return "clear";
    case "solid":
    case "opaque":
      return "opaque";
    case "reflective":
      return "reflective";
    case "outdoor":
      return "outdoor";
    case "frosted":
    default:
      return "frosted";
  }
}

export function getDefaultOpacityForGlassAppearance(
  mode: GlassAppearanceMode,
) {
  switch (mode) {
    case "clear":
      return 0.34;
    case "outdoor":
    case "opaque":
      return 1;
    case "reflective":
      return 0.94;
    case "frosted":
    default:
      return 0.9;
  }
}

export function normalizeWindowGlassSettings(
  settings?: (Partial<WindowGlassSettings> & {
    mode?: unknown;
    tintColor?: string;
  }) | null,
): WindowGlassSettings {
  const mode = normalizeGlassAppearanceMode(settings?.mode);
  const defaultSettings = getDefaultWindowGlassSettings();
  const opacity =
    typeof settings?.opacity === "number"
      ? clamp(settings.opacity, 0, 1)
      : getDefaultOpacityForGlassAppearance(mode);

  return {
    ...defaultSettings,
    ...settings,
    mode,
    opacity,
    outdoorTexturePath:
      settings?.outdoorTexturePath ?? defaultSettings.outdoorTexturePath,
    internalTintColor:
      settings?.internalTintColor ?? settings?.tintColor,
    tintColor: settings?.tintColor,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
