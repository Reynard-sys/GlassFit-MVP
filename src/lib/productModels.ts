import type {
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
    tintColor: "#dbeafe",
    outdoorTexturePath: "/textures/outdoor-view.jpg",
  };
}
