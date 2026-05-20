"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from "react";
import {
  analyzeLocalImageRegion,
  applyBoxModelFaceShading,
  applyCabinetMaterialVitality,
  applyCameraMatchToOverlayCanvas,
  applySpatialRelightingToOverlayCanvas,
  buildSpatialLightingMap,
  computeOverlaySampleBounds,
  DEFAULT_GROUNDING_REALISM,
  deriveAutoRealismSettings,
  deriveLocalAmbientAdjustments,
  getSpatialRelightSettingsForAmbient,
  getAmbientCanvasFilter,
  loadCanvasImage,
  normalizeAmbientLightAdjustmentSettings,
} from "@/lib/canvasUtils";
import { ProductModelRenderer } from "@/lib/modelRenderer";
import {
  getProductModelOption,
  normalizeWindowGlassSettings,
} from "@/lib/productModels";
import type {
  ActiveOverlayState,
  AmbientLightAdjustmentSettings,
  AutoRealismResult,
  AutoRealismSettings,
  BrightnessCategory,
  CanvasBounds,
  CanvasEditorHandle,
  DetectedObject,
  LocalAmbientAdjustments,
  LocalAmbientState,
  LightingAnalysis,
  OverlayTransform,
  PlacedOverlay,
  GroundingRealismSettings,
  ShadowSettings,
  SpatialRelightResult,
  SpatialRelightSettings,
  WindowGlassSettings,
} from "@/lib/types";

interface CanvasEditorProps {
  activeOverlay: ActiveOverlayState | null;
  backgroundUrl: string | null;
  brightnessCategory?: BrightnessCategory;
  lighting?: LightingAnalysis;
  objects: DetectedObject[];
  placedOverlays: PlacedOverlay[];
  onCanvasSizeChange: (size: CanvasSize | null) => void;
  onWarning: (message: string) => void;
  setActiveOverlay: Dispatch<SetStateAction<ActiveOverlayState | null>>;
}

interface CanvasSize {
  width: number;
  height: number;
}

interface CanvasPoint {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface CachedOverlayImage {
  image: HTMLImageElement;
  src: string;
}

interface ActivePreviewAmbientState {
  localAmbient?: LocalAmbientState;
  spatialRelightResult?: SpatialRelightResult;
}

type OverlaySource = HTMLCanvasElement | HTMLImageElement;

interface SourceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OverlayMetrics {
  sourceBounds: SourceBounds;
  width: number;
  height: number;
}

export const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(
  function CanvasEditor(
    {
      activeOverlay,
      backgroundUrl,
      brightnessCategory,
      lighting,
      objects,
      placedOverlays,
      onCanvasSizeChange,
      onWarning,
      setActiveOverlay,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const backgroundRef = useRef<HTMLImageElement | null>(null);
    const maskImagesRef = useRef(new Map<string, HTMLImageElement>());
    const modelRendererRef = useRef<ProductModelRenderer | null>(null);
    const overlayImagesRef = useRef(new Map<string, CachedOverlayImage>());
    const [canvasSize, setCanvasSize] = useState<CanvasSize | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [activePreviewAmbient, setActivePreviewAmbient] =
      useState<ActivePreviewAmbientState | null>(null);
    const [maskVersion, setMaskVersion] = useState(0);
    const [modelVersion, setModelVersion] = useState(0);
    const [overlayImageVersion, setOverlayImageVersion] = useState(0);
    const [status, setStatus] = useState("Upload a space photo to begin.");
    const objectMaskSignature = objects
      .map((object) => `${object.id}:${object.mask_url}`)
      .join("|");
    const activeModelPath = activeOverlay?.modelPath;
    const activeModelType = activeOverlay?.modelType;
    const activeName = activeOverlay?.name;
    const editingOverlayId =
      activeOverlay?.mode === "editing" ? activeOverlay.overlayId : null;

    const requiredMaskIds = useMemo(() => {
      const ids = new Set<string>();

      for (const overlay of placedOverlays) {
        if (!overlay.visible || overlay.id === editingOverlayId) {
          continue;
        }

        overlay.occlusionObjectIds.forEach((objectId) => ids.add(objectId));
      }

      activeOverlay?.occlusionObjectIds.forEach((objectId) =>
        ids.add(objectId),
      );

      return ids;
    }, [activeOverlay?.occlusionObjectIds, editingOverlayId, placedOverlays]);

    const requiredMaskSignature = useMemo(
      () => Array.from(requiredMaskIds).sort().join("|"),
      [requiredMaskIds],
    );

    const drawCanvas = useCallback(
      (includeGuide: boolean, renderMode: "preview" | "output" = "preview") => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");

        if (!canvas || !context) {
          return false;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);

        const background = backgroundRef.current;

        if (!background) {
          context.fillStyle = "#f5f5f4";
          context.fillRect(0, 0, canvas.width, canvas.height);
          return false;
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(background, 0, 0, canvas.width, canvas.height);

        for (const overlay of placedOverlays) {
          if (!overlay.visible || overlay.id === editingOverlayId) {
            continue;
          }

          const cachedOverlay = overlayImagesRef.current.get(overlay.id);
          if (!cachedOverlay) {
            continue;
          }
          const ambientAdjustment =
            normalizeAmbientLightAdjustmentSettings(overlay);
          const spatialRelight = getSpatialRelightSettingsForAmbient(overlay);
          const shouldApplyStoredAutoRealism = !overlay.autoRealismBaked;

          drawOverlayLayer(
            context,
            cachedOverlay.image,
            overlay.transform,
            overlay.shadowSettings,
            ambientAdjustment,
            overlay.occlusionObjectIds,
            overlay.modelType,
            overlay.groundingRealism,
            shouldApplyStoredAutoRealism ? overlay.autoRealism : undefined,
            shouldApplyStoredAutoRealism ? overlay.autoRealismResult : undefined,
            overlay.windowGlass
              ? normalizeWindowGlassSettings(overlay.windowGlass)
              : undefined,
            background,
            objects,
            maskImagesRef.current,
            canvas.width,
            canvas.height,
            brightnessCategory,
            lighting,
            overlay.localAmbient,
            spatialRelight,
            overlay.spatialRelightResult,
            false,
          );
        }

        let activeReady = true;
        if (activeOverlay) {
          const ambientAdjustment =
            normalizeAmbientLightAdjustmentSettings(activeOverlay);
          const windowGlass = activeOverlay.windowGlass
            ? normalizeWindowGlassSettings(activeOverlay.windowGlass)
            : undefined;
          const rendererLighting =
            ambientAdjustment.enabled && ambientAdjustment.useGlobalMatch
              ? lighting
              : undefined;
          const modelCanvas = modelRendererRef.current?.render(
            activeOverlay.transform,
            rendererLighting,
            windowGlass,
          );

          if (!modelCanvas) {
            activeReady = false;
          } else {
            const activeLocalAmbient =
              renderMode === "output"
                ? getPositionBasedAmbientState(
                    background,
                    modelCanvas,
                    activeOverlay,
                    lighting,
                    onWarning,
                  )
                : activePreviewAmbient?.localAmbient;
            const activeSpatialRelightResult =
              renderMode === "output"
                ? getSpatialRelightResult(
                    background,
                    modelCanvas,
                    activeOverlay,
                    lighting,
                    onWarning,
                  )
                : activePreviewAmbient?.spatialRelightResult;
            drawOverlayLayer(
              context,
              modelCanvas,
              activeOverlay.transform,
              activeOverlay.shadowSettings,
              ambientAdjustment,
              activeOverlay.occlusionObjectIds,
              activeOverlay.modelType,
              activeOverlay.groundingRealism,
              renderMode === "output" ? activeOverlay.autoRealism : undefined,
              undefined,
              windowGlass,
              background,
              objects,
              maskImagesRef.current,
              canvas.width,
              canvas.height,
              brightnessCategory,
              lighting,
              activeLocalAmbient,
              getSpatialRelightSettingsForAmbient(activeOverlay),
              activeSpatialRelightResult,
              includeGuide,
            );
          }
        }

        return activeReady;
      },
      [
        activeOverlay,
        activePreviewAmbient,
        brightnessCategory,
        editingOverlayId,
        lighting,
        objects,
        onWarning,
        placedOverlays,
      ],
    );

    useImperativeHandle(
      ref,
      () => ({
        async exportImage() {
          const didDraw = drawCanvas(false, "output");
          const canvas = canvasRef.current;

          if (!didDraw || !canvas) {
            throw new Error("Canvas is not ready for export.");
          }

          const dataUrl = canvas.toDataURL("image/png");
          drawCanvas(true);
          return dataUrl;
        },
        async flattenActiveOverlay() {
          if (!activeOverlay) {
            throw new Error("No active overlay to apply.");
          }

          const background = backgroundRef.current;
          if (!background) {
            throw new Error("Background image is still loading.");
          }

          const ambientAdjustment =
            normalizeAmbientLightAdjustmentSettings(activeOverlay);
          const windowGlass = activeOverlay.windowGlass
            ? normalizeWindowGlassSettings(activeOverlay.windowGlass)
            : undefined;
          const rendererLighting =
            ambientAdjustment.enabled && ambientAdjustment.useGlobalMatch
              ? lighting
              : undefined;
          const modelCanvas = modelRendererRef.current?.render(
            activeOverlay.transform,
            rendererLighting,
            windowGlass,
          );

          if (!modelCanvas) {
            throw new Error("Active model is still loading.");
          }

          const localAmbient = getPositionBasedAmbientState(
            background,
            modelCanvas,
            activeOverlay,
            lighting,
            onWarning,
          );
          const spatialRelightResult = getSpatialRelightResult(
            background,
            modelCanvas,
            activeOverlay,
            lighting,
            onWarning,
          );
          const autoRealismResult = getAutoRealismResult(
            background,
            modelCanvas,
            activeOverlay,
            localAmbient,
            spatialRelightResult,
            lighting,
            onWarning,
          );

          return {
            dataUrl: modelCanvas.toDataURL("image/png"),
            localAmbient,
            spatialRelightResult,
            autoRealismResult,
            autoRealismBaked: false,
          };
        },
      }),
      [activeOverlay, drawCanvas, lighting, onWarning],
    );

    useEffect(() => {
      let cancelled = false;

      backgroundRef.current = null;
      setCanvasSize(null);
      onCanvasSizeChange(null);

      if (!backgroundUrl) {
        setStatus("Upload a space photo to begin.");
        return;
      }

      setStatus("Loading uploaded image...");
      loadCanvasImage(backgroundUrl)
        .then((image) => {
          if (cancelled) {
            return;
          }

          const nextSize = {
            width: image.naturalWidth,
            height: image.naturalHeight,
          };

          backgroundRef.current = image;
          setCanvasSize(nextSize);
          onCanvasSizeChange(nextSize);
          setStatus("Canvas ready. Add or edit an overlay.");
        })
        .catch(() => {
          if (!cancelled) {
            setStatus("Unable to load the uploaded image.");
            onWarning("The uploaded image could not be loaded into the canvas.");
          }
        });

      return () => {
        cancelled = true;
      };
    }, [backgroundUrl, onCanvasSizeChange, onWarning]);

    useEffect(() => {
      modelRendererRef.current?.dispose();
      modelRendererRef.current = null;
      setModelVersion((current) => current + 1);

      if (!activeModelPath || !activeModelType || !activeName) {
        setStatus(
          backgroundRef.current
            ? "Canvas ready. Add or edit an overlay."
            : "Upload a space photo to begin.",
        );
        return;
      }

      const option = getProductModelOption(activeModelType);
      const modelRenderer = new ProductModelRenderer();
      modelRendererRef.current = modelRenderer;
      let disposed = false;

      setStatus(`Loading ${activeName}...`);
      modelRenderer
        .loadModel(activeModelType, activeModelPath, option.fallback)
        .then((result) => {
          if (disposed) {
            return;
          }

          setStatus(result.message);
          setModelVersion((current) => current + 1);
          if (result.isFallback) {
            onWarning(result.message);
          }
        });

      return () => {
        disposed = true;
        modelRenderer.dispose();
        if (modelRendererRef.current === modelRenderer) {
          modelRendererRef.current = null;
        }
      };
    }, [
      activeModelPath,
      activeModelType,
      activeName,
      onWarning,
    ]);

    useEffect(() => {
      const cache = overlayImagesRef.current;
      const validOverlayIds = new Set(placedOverlays.map((overlay) => overlay.id));
      let cacheChanged = false;
      let cancelled = false;

      for (const overlayId of cache.keys()) {
        if (!validOverlayIds.has(overlayId)) {
          cache.delete(overlayId);
          cacheChanged = true;
        }
      }

      const overlaysToLoad = placedOverlays.filter((overlay) => {
        if (!overlay.flattenedImageDataUrl) {
          return false;
        }

        return cache.get(overlay.id)?.src !== overlay.flattenedImageDataUrl;
      });

      if (overlaysToLoad.length === 0) {
        if (cacheChanged) {
          setOverlayImageVersion((current) => current + 1);
        }
        return;
      }

      Promise.allSettled(
        overlaysToLoad.map(async (overlay) => {
          if (!overlay.flattenedImageDataUrl) {
            return;
          }

          const image = await loadCanvasImage(overlay.flattenedImageDataUrl);
          cache.set(overlay.id, {
            image,
            src: overlay.flattenedImageDataUrl,
          });
        }),
      ).then((results) => {
        if (cancelled) {
          return;
        }

        const failedCount = results.filter(
          (result) => result.status === "rejected",
        ).length;

        if (failedCount > 0) {
          onWarning("One or more placed overlays failed to load.");
        }

        setOverlayImageVersion((current) => current + 1);
      });

      return () => {
        cancelled = true;
      };
    }, [onWarning, placedOverlays]);

    useEffect(() => {
      maskImagesRef.current.clear();
      setMaskVersion((current) => current + 1);
    }, [objectMaskSignature]);

    useEffect(() => {
      let cancelled = false;
      const masksToLoad = objects.filter(
        (object) =>
          requiredMaskIds.has(object.id) && !maskImagesRef.current.has(object.id),
      );

      if (masksToLoad.length === 0) {
        return;
      }

      Promise.allSettled(
        masksToLoad.map(async (object) => {
          const mask = await loadCanvasImage(object.mask_url, "anonymous");
          maskImagesRef.current.set(object.id, mask);
        }),
      ).then((results) => {
        if (cancelled) {
          return;
        }

        const failedCount = results.filter(
          (result) => result.status === "rejected",
        ).length;

        if (failedCount > 0) {
          onWarning("One or more object masks failed to load.");
        }

        setMaskVersion((current) => current + 1);
      });

      return () => {
        cancelled = true;
      };
    }, [objects, onWarning, requiredMaskIds, requiredMaskSignature]);

    useEffect(() => {
      setActivePreviewAmbient(null);

      if (!activeOverlay || !backgroundRef.current || !modelRendererRef.current) {
        return;
      }

      const ambientAdjustment =
        normalizeAmbientLightAdjustmentSettings(activeOverlay);
      if (!ambientAdjustment.enabled) {
        return;
      }

      let cancelled = false;
      const timeout = window.setTimeout(() => {
        const background = backgroundRef.current;
        const modelRenderer = modelRendererRef.current;
        if (!background || !modelRenderer || cancelled) {
          return;
        }

        const modelCanvas = modelRenderer.render(
          activeOverlay.transform,
          ambientAdjustment.useGlobalMatch ? lighting : undefined,
          activeOverlay.windowGlass
            ? normalizeWindowGlassSettings(activeOverlay.windowGlass)
            : undefined,
        );

        if (!modelCanvas || cancelled) {
          return;
        }

        const localAmbient = getPositionBasedAmbientState(
          background,
          modelCanvas,
          activeOverlay,
          lighting,
          () => undefined,
        );
        const spatialRelightResult = getSpatialRelightResult(
          background,
          modelCanvas,
          activeOverlay,
          lighting,
          () => undefined,
        );

        if (!cancelled) {
          setActivePreviewAmbient({
            localAmbient,
            spatialRelightResult,
          });
        }
      }, dragState ? 480 : 360);

      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }, [activeOverlay, dragState, lighting, modelVersion]);

    useEffect(() => {
      drawCanvas(true);
    }, [
      canvasSize,
      drawCanvas,
      activePreviewAmbient,
      maskVersion,
      modelVersion,
      overlayImageVersion,
    ]);

    function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (!activeOverlay || !modelRendererRef.current || !backgroundRef.current) {
        return;
      }

      const point = getCanvasPoint(event);
      const ambientAdjustment =
        normalizeAmbientLightAdjustmentSettings(activeOverlay);
      const modelCanvas = modelRendererRef.current.render(
        activeOverlay.transform,
        ambientAdjustment.enabled && ambientAdjustment.useGlobalMatch
          ? lighting
          : undefined,
        activeOverlay.windowGlass
          ? normalizeWindowGlassSettings(activeOverlay.windowGlass)
          : undefined,
      );
      const metrics = modelCanvas
        ? getOverlayMetrics(
            modelCanvas,
            event.currentTarget.width,
            activeOverlay.transform,
          )
        : getFallbackOverlayMetrics(event.currentTarget.width, activeOverlay.transform);

      if (
        !point ||
        !isPointInsideOverlay(
          point,
          activeOverlay.transform,
          metrics,
          modelCanvas ?? undefined,
        )
      ) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState({
        pointerId: event.pointerId,
        offsetX: point.x - activeOverlay.transform.x,
        offsetY: point.y - activeOverlay.transform.y,
      });
    }

    function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
      if (!dragState) {
        return;
      }

      const point = getCanvasPoint(event);
      if (!point) {
        return;
      }

      setActiveOverlay((current) =>
        current
          ? {
              ...current,
              transform: {
                ...current.transform,
                x: point.x - dragState.offsetX,
                y: point.y - dragState.offsetY,
              },
            }
          : current,
      );
    }

    function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
      if (dragState?.pointerId === event.pointerId) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragState(null);
      }
    }

    return (
      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-950">
              Canvas Editor
            </h2>
            <p className="mt-1 text-sm text-stone-500">{status}</p>
          </div>
          <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600">
            {canvasSize ? `${canvasSize.width} x ${canvasSize.height}` : "Idle"}
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-stone-200 bg-stone-100">
          <canvas
            aria-label="GlassFit visualization canvas"
            className={`block h-auto max-h-[72vh] w-full object-contain ${
              dragState
                ? "cursor-grabbing"
                : activeOverlay
                  ? "cursor-grab"
                  : "cursor-default"
            }`}
            height={canvasSize?.height ?? 640}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            ref={canvasRef}
            width={canvasSize?.width ?? 960}
          />
        </div>
      </section>
    );
  },
);

function drawOverlayLayer(
  context: CanvasRenderingContext2D,
  modelSource: OverlaySource,
  transform: OverlayTransform,
  shadowSettings: ShadowSettings,
  ambientAdjustment: AmbientLightAdjustmentSettings,
  occlusionObjectIds: string[],
  modelType: PlacedOverlay["modelType"],
  groundingRealism: GroundingRealismSettings | undefined,
  autoRealism: AutoRealismSettings | undefined,
  autoRealismResult: AutoRealismResult | undefined,
  windowGlass: WindowGlassSettings | undefined,
  background: HTMLImageElement,
  objects: DetectedObject[],
  maskImages: Map<string, HTMLImageElement>,
  canvasWidth: number,
  canvasHeight: number,
  brightnessCategory: BrightnessCategory | undefined,
  lighting: LightingAnalysis | undefined,
  localAmbient: LocalAmbientState | undefined,
  spatialRelight: SpatialRelightSettings | undefined,
  spatialRelightResult: SpatialRelightResult | undefined,
  includeGuide: boolean,
) {
  const metrics = getOverlayMetrics(modelSource, canvasWidth, transform);
  const overlayBounds = getOverlayBoundsFromMetrics(
    transform,
    metrics,
    canvasWidth,
    canvasHeight,
  );
  const effectiveAutoRealismResult = getEffectiveAutoRealismResult(
    autoRealism,
    autoRealismResult,
    modelType,
    overlayBounds,
    canvasWidth,
    canvasHeight,
    lighting,
    localAmbient,
    spatialRelightResult,
  );
  const effectiveGroundingRealism = getEffectiveGroundingRealism(
    groundingRealism,
    autoRealism,
    effectiveAutoRealismResult,
  );
  const drawTransform = getGroundedOverlayTransform(
    transform,
    metrics,
    effectiveGroundingRealism,
    canvasWidth,
    canvasHeight,
  );
  const localAdjustments =
    ambientAdjustment.enabled &&
    ambientAdjustment.usePositionMatch &&
    localAmbient?.enabled
    ? localAmbient.adjustments
    : undefined;
  const autoRealismEnabled = Boolean(autoRealism?.enabled);
  const globalLighting =
    ambientAdjustment.enabled && ambientAdjustment.useGlobalMatch
      ? lighting
      : undefined;
  const effectiveSpatialRelight =
    ambientAdjustment.enabled && ambientAdjustment.useSpatialRelight
      ? spatialRelight
      : undefined;
  const effectiveSpatialRelightResult = effectiveSpatialRelight
    ? spatialRelightResult
    : undefined;

  drawSceneShadows(
    context,
    modelSource,
    drawTransform,
    metrics,
    canvasHeight,
    shadowSettings,
    localAdjustments?.shadowOpacityMultiplier,
    effectiveGroundingRealism,
    modelType,
    autoRealismEnabled,
  );

  drawModelOverlay(
    context,
    modelSource,
    drawTransform,
    metrics,
    autoRealismEnabled
      ? "none"
      : getAmbientCanvasFilter(
          brightnessCategory,
          lighting,
          ambientAdjustment.enabled && ambientAdjustment.useGlobalMatch,
        ),
    globalLighting,
    getAmbientMatchStrength(windowGlass),
    localAdjustments,
    effectiveSpatialRelight,
    effectiveSpatialRelightResult,
    modelType,
    windowGlass,
    effectiveGroundingRealism,
    autoRealism,
    effectiveAutoRealismResult,
  );

  const occludedSet = new Set(occlusionObjectIds);
  for (const object of objects) {
    if (!occludedSet.has(object.id)) {
      continue;
    }

    const mask = maskImages.get(object.id);
    if (mask) {
      drawObjectCutout(context, background, mask, canvasWidth, canvasHeight);
    }
  }

  if (includeGuide) {
    drawOverlayGuide(context, modelSource, drawTransform, metrics);
    drawFloorAnchorGuide(
      context,
      canvasWidth,
      canvasHeight,
      effectiveGroundingRealism,
    );
  }
}

function drawModelOverlay(
  context: CanvasRenderingContext2D,
  modelSource: OverlaySource,
  transform: OverlayTransform,
  metrics: OverlayMetrics,
  filter: string,
  lighting: LightingAnalysis | undefined,
  ambientMatchStrength: number,
  localAdjustments: LocalAmbientAdjustments | undefined,
  spatialRelight: SpatialRelightSettings | undefined,
  spatialRelightResult: SpatialRelightResult | undefined,
  modelType: PlacedOverlay["modelType"],
  windowGlass: WindowGlassSettings | undefined,
  groundingRealism: GroundingRealismSettings | undefined,
  autoRealism: AutoRealismSettings | undefined,
  autoRealismResult: AutoRealismResult | undefined,
) {
  const { sourceBounds, width, height } = metrics;
  const hasCameraMatch = Boolean(
    groundingRealism?.cameraMatch.enabled,
  );
  const hasAutoFaceShading = Boolean(
    autoRealism?.enabled &&
      autoRealism.autoFaceShading &&
      autoRealismResult,
  );
  const needsPreparedCanvas = Boolean(
    lighting ||
      localAdjustments ||
      spatialRelightResult?.applied ||
      hasCameraMatch ||
      hasAutoFaceShading,
  );
  const source = needsPreparedCanvas
    ? createAmbientMatchedModelCanvas(
        modelSource,
        sourceBounds,
        width,
        height,
        lighting,
        ambientMatchStrength,
        localAdjustments,
        spatialRelight,
        spatialRelightResult,
        modelType,
        windowGlass,
        groundingRealism,
        autoRealism,
        autoRealismResult,
      )
    : modelSource;
  const localBlurFilter =
    localAdjustments && localAdjustments.blurPx > 0.05
      ? `blur(${localAdjustments.blurPx}px)`
      : "";
  const combinedFilter = [filter === "none" ? "" : filter, localBlurFilter]
    .filter(Boolean)
    .join(" ") || "none";

  context.save();
  context.globalAlpha = 1;
  context.filter = combinedFilter;
  if (needsPreparedCanvas) {
    drawImageWithAffinePerspectiveApproximation(
      context,
      source,
      transform,
      width,
      height,
      groundingRealism,
    );
  } else {
    const sourceCanvas = createSourceCanvas(
      source,
      sourceBounds,
      width,
      height,
    );
    drawImageWithAffinePerspectiveApproximation(
      context,
      sourceCanvas,
      transform,
      width,
      height,
      groundingRealism,
    );
  }
  context.restore();
}

function createSourceCanvas(
  modelSource: OverlaySource,
  sourceBounds: SourceBounds,
  width: number,
  height: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const context = canvas.getContext("2d");
  if (!context) {
    return modelSource;
  }

  context.drawImage(
    modelSource,
    sourceBounds.x,
    sourceBounds.y,
    sourceBounds.width,
    sourceBounds.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas;
}

function drawImageWithAffinePerspectiveApproximation(
  context: CanvasRenderingContext2D,
  image: OverlaySource,
  transform: OverlayTransform,
  width: number,
  height: number,
  groundingRealism: GroundingRealismSettings | undefined,
) {
  const perspective = groundingRealism?.perspective;
  const skewX = perspective?.enabled
    ? perspective.skewX + perspective.perspectiveX * 0.2
    : 0;
  const skewY = perspective?.enabled
    ? perspective.skewY + perspective.perspectiveY * 0.12 + perspective.verticalTilt * 0.16
    : 0;
  const scaleX = perspective?.enabled
    ? clampNumber(1 + perspective.perspectiveX * 0.08, 0.92, 1.08)
    : 1;
  const scaleY = perspective?.enabled
    ? clampNumber(1 - perspective.verticalTilt * 0.45, 0.78, 1.22)
    : 1;

  context.translate(transform.x, transform.y);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.transform(scaleX, skewY, skewX, scaleY, 0, 0);
  context.drawImage(image, -width / 2, -height / 2, width, height);
}

function drawSceneShadows(
  context: CanvasRenderingContext2D,
  modelSource: OverlaySource,
  transform: OverlayTransform,
  metrics: OverlayMetrics,
  canvasHeight: number,
  shadowSettings: ShadowSettings,
  shadowOpacityMultiplier = 1,
  groundingRealism: GroundingRealismSettings | undefined,
  modelType: PlacedOverlay["modelType"],
  autoRealismEnabled: boolean,
) {
  if (!shadowSettings.enabled) {
    return;
  }

  // Window overlays are treated as wall-mounted surfaces in this MVP,
  // so we suppress floor/ground shadows entirely.
  if (modelType === "window") {
    return;
  }

  if (shadowSettings.castEnabled) {
    drawCastShadow(
      context,
      modelSource,
      transform,
      metrics,
      shadowSettings,
      shadowOpacityMultiplier,
    );
  }

  const enhancedGroundingEnabled = Boolean(
    groundingRealism?.groundingShadow.enabled,
  );

  if (enhancedGroundingEnabled) {
    drawGroundingContactShadows(
      context,
      transform,
      metrics,
      groundingRealism,
      modelType,
      shadowOpacityMultiplier,
    );
  }

  // Auto Realism should not add a ground shadow pass.
  if (shadowSettings.contactEnabled && !autoRealismEnabled) {
    drawContactShadow(
      context,
      transform,
      metrics,
      canvasHeight,
      shadowSettings,
      shadowOpacityMultiplier,
    );
  }
}

function drawContactShadow(
  context: CanvasRenderingContext2D,
  transform: OverlayTransform,
  metrics: OverlayMetrics,
  canvasHeight: number,
  shadowSettings: ShadowSettings,
  shadowOpacityMultiplier: number,
) {
  const { width, height } = metrics;
  const overlayBottom = transform.y + height / 2;
  const floorFactor = clampNumber((overlayBottom / canvasHeight - 0.42) / 0.42, 0.72, 1.22);
  const contactWidth = width * shadowSettings.contactScale;
  const contactHeight = height * 0.12;
  const contactY = height * 0.36;
  const blur = clampNumber(shadowSettings.blur * 0.72, 6, 30);
  const opacity = clampNumber(
    shadowSettings.contactOpacity * floorFactor * shadowOpacityMultiplier,
    0,
    0.58,
  );
  const gradient = context.createRadialGradient(
    0,
    0,
    contactHeight * 0.15,
    0,
    0,
    contactWidth * 0.56,
  );

  gradient.addColorStop(0, "rgba(18, 16, 14, 0.82)");
  gradient.addColorStop(0.58, "rgba(18, 16, 14, 0.34)");
  gradient.addColorStop(1, "rgba(18, 16, 14, 0)");

  context.save();
  context.translate(transform.x, transform.y + contactY);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.filter = `blur(${blur}px)`;
  context.globalAlpha = opacity;
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(0, 0, contactWidth / 2, contactHeight / 2, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawGroundingContactShadows(
  context: CanvasRenderingContext2D,
  transform: OverlayTransform,
  metrics: OverlayMetrics,
  groundingRealism: GroundingRealismSettings | undefined,
  modelType: PlacedOverlay["modelType"],
  shadowOpacityMultiplier: number,
) {
  const grounding = groundingRealism?.groundingShadow;
  if (!grounding?.enabled) {
    return;
  }

  const perspective = groundingRealism?.perspective;
  const { width, height } = metrics;
  const modelFactor = modelType === "window" ? 0.45 : 1;
  const baseOpacity = clampNumber(
    grounding.baseContactStrength * grounding.floorFade * modelFactor * shadowOpacityMultiplier,
    0,
    0.62,
  );
  const footOpacity = clampNumber(
    grounding.legContactStrength * modelFactor * shadowOpacityMultiplier,
    0,
    0.72,
  );
  const floorRotation =
    ((transform.rotation + (perspective?.enabled ? perspective.floorAngle : 0)) * Math.PI) / 180;

  context.save();
  context.translate(transform.x, transform.y);
  context.rotate(floorRotation);
  context.filter = `blur(${clampNumber(grounding.contactBlur, 0, 32)}px)`;
  context.globalAlpha = baseOpacity;
  context.fillStyle = "rgba(18, 16, 14, 0.9)";
  context.beginPath();
  context.ellipse(
    0,
    height * 0.43,
    width * 0.34,
    height * 0.055,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.restore();

  if (!grounding.useFootPoints || footOpacity <= 0.01) {
    return;
  }

  const footPoints =
    modelType === "window"
      ? [
          { x: 0.28, y: 0.94, rx: 0.08, ry: 0.02 },
          { x: 0.72, y: 0.94, rx: 0.08, ry: 0.02 },
        ]
      : [
          { x: 0.18, y: 0.94, rx: 0.07, ry: 0.022 },
          { x: 0.82, y: 0.94, rx: 0.07, ry: 0.022 },
          { x: 0.25, y: 0.88, rx: 0.055, ry: 0.018 },
          { x: 0.75, y: 0.88, rx: 0.055, ry: 0.018 },
        ];

  context.save();
  context.translate(transform.x, transform.y);
  context.rotate(floorRotation);
  context.filter = `blur(${clampNumber(grounding.contactBlur * 0.55, 2, 18)}px)`;
  context.globalAlpha = footOpacity;
  context.fillStyle = "rgba(12, 10, 9, 0.95)";

  for (const foot of footPoints) {
    const x = -width / 2 + width * foot.x;
    const y = -height / 2 + height * foot.y;

    context.beginPath();
    context.ellipse(
      x,
      y,
      width * foot.rx,
      height * foot.ry,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  context.restore();
}

function drawCastShadow(
  context: CanvasRenderingContext2D,
  modelSource: OverlaySource,
  transform: OverlayTransform,
  metrics: OverlayMetrics,
  shadowSettings: ShadowSettings,
  shadowOpacityMultiplier: number,
) {
  const { sourceBounds, width, height } = metrics;
  const silhouette = createModelSilhouetteCanvas(modelSource, sourceBounds);
  const offsetX = shadowSettings.directionX * shadowSettings.length * width * 0.25;
  const offsetY = shadowSettings.directionY * shadowSettings.length * height * 0.16;
  const skewX = clampNumber(shadowSettings.directionX * 0.18, -0.22, 0.22);
  const blur = clampNumber(shadowSettings.blur, 0, 46);

  context.save();
  context.translate(transform.x, transform.y);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.globalAlpha = clampNumber(
    shadowSettings.opacity * shadowOpacityMultiplier,
    0,
    0.7,
  );
  context.filter = blur > 0 ? `blur(${blur}px)` : "none";
  context.transform(1.08, 0, skewX, 0.56, offsetX, offsetY + height * 0.2);
  context.drawImage(silhouette, -width / 2, -height / 2, width, height);
  context.restore();
}

function drawObjectCutout(
  context: CanvasRenderingContext2D,
  background: HTMLImageElement,
  mask: HTMLImageElement,
  width: number,
  height: number,
) {
  const cutoutCanvas = document.createElement("canvas");
  cutoutCanvas.width = width;
  cutoutCanvas.height = height;

  const cutoutContext = cutoutCanvas.getContext("2d");
  if (!cutoutContext) {
    return;
  }

  cutoutContext.drawImage(background, 0, 0, width, height);
  cutoutContext.globalCompositeOperation = "destination-in";
  cutoutContext.drawImage(mask, 0, 0, width, height);
  context.drawImage(cutoutCanvas, 0, 0);
}

function getSpatialRelightResult(
  background: HTMLImageElement,
  modelSource: OverlaySource,
  activeOverlay: ActiveOverlayState,
  globalLighting: LightingAnalysis | undefined,
  onWarning: (message: string) => void,
): SpatialRelightResult | undefined {
  const settings = getSpatialRelightSettingsForAmbient(activeOverlay);
  if (
    !settings.enabled ||
    !normalizeAmbientLightAdjustmentSettings(activeOverlay).enabled
  ) {
    return undefined;
  }

  try {
    const canvasWidth = background.naturalWidth || background.width;
    const canvasHeight = background.naturalHeight || background.height;
    const metrics = getOverlayMetrics(modelSource, canvasWidth, activeOverlay.transform);
    const sampleBounds = computeOverlaySampleBounds(
      activeOverlay.transform,
      metrics.width,
      metrics.height,
      canvasWidth,
      canvasHeight,
    );

    if (!sampleBounds) {
      return undefined;
    }

    const backgroundContext = createBackgroundCanvasContext(background);
    const lightingMap = buildSpatialLightingMap(
      backgroundContext,
      sampleBounds,
      settings.gridSize,
      settings.gridSize,
      globalLighting,
    );

    return {
      lightingMap,
      applied: true,
    };
  } catch {
    onWarning(
      "Spatial ambient relighting could not sample this overlay, so regular ambient matching was used.",
    );

    return undefined;
  }
}

function getAutoRealismResult(
  background: HTMLImageElement,
  modelSource: OverlaySource,
  activeOverlay: ActiveOverlayState,
  localAmbient: LocalAmbientState,
  spatialRelightResult: SpatialRelightResult | undefined,
  globalLighting: LightingAnalysis | undefined,
  onWarning: (message: string) => void,
): AutoRealismResult | undefined {
  const settings = activeOverlay.autoRealism;
  if (!settings?.enabled) {
    return undefined;
  }

  try {
    const canvasWidth = background.naturalWidth || background.width;
    const canvasHeight = background.naturalHeight || background.height;
    const metrics = getOverlayMetrics(modelSource, canvasWidth, activeOverlay.transform);
    const overlayBounds = getOverlayBoundsFromMetrics(
      activeOverlay.transform,
      metrics,
      canvasWidth,
      canvasHeight,
    );
    let localLighting = localAmbient.lighting;

    if (!localLighting && overlayBounds) {
      const imageData = getBackgroundImageData(background, overlayBounds);
      localLighting = analyzeLocalImageRegion(imageData, overlayBounds);
    }

    return deriveAutoRealismSettings({
      modelType: activeOverlay.modelType,
      placementType: settings.placementType,
      overlayBounds,
      canvasWidth,
      canvasHeight,
      localLighting,
      spatialLightingMap: spatialRelightResult?.lightingMap,
      globalLighting,
      imageSharpness: globalLighting?.sharpness,
      imageNoise: localLighting?.noise ?? globalLighting?.noise,
    });
  } catch {
    onWarning(
      "Auto Realism could not sample this overlay, so the regular realism pipeline was used.",
    );

    return undefined;
  }
}

function getPositionBasedAmbientState(
  background: HTMLImageElement,
  modelSource: OverlaySource,
  activeOverlay: ActiveOverlayState,
  globalLighting: LightingAnalysis | undefined,
  onWarning: (message: string) => void,
): LocalAmbientState {
  const ambientAdjustment =
    normalizeAmbientLightAdjustmentSettings(activeOverlay);
  const enabled =
    ambientAdjustment.enabled && ambientAdjustment.usePositionMatch;

  if (!enabled) {
    return { enabled: false };
  }

  try {
    const canvasWidth = background.naturalWidth || background.width;
    const canvasHeight = background.naturalHeight || background.height;
    const metrics = getOverlayMetrics(modelSource, canvasWidth, activeOverlay.transform);
    const sampleBounds = computeOverlaySampleBounds(
      activeOverlay.transform,
      metrics.width,
      metrics.height,
      canvasWidth,
      canvasHeight,
    );

    if (!sampleBounds) {
      return { enabled: false };
    }

    const imageData = getBackgroundImageData(background, sampleBounds);
    const lighting = analyzeLocalImageRegion(imageData, sampleBounds);
    const adjustments = constrainLocalAdjustmentsForOverlay(
      deriveLocalAmbientAdjustments(lighting, globalLighting),
      activeOverlay,
    );

    return {
      enabled: true,
      lighting,
      adjustments,
    };
  } catch {
    onWarning(
      "Position-based ambient matching could not sample this overlay, so global matching was used.",
    );

    return { enabled: false };
  }
}

function getBackgroundImageData(
  background: HTMLImageElement,
  bounds: CanvasBounds,
) {
  const maxSamplePixels = 250000;
  const downscale = Math.min(
    1,
    Math.sqrt(maxSamplePixels / Math.max(1, bounds.width * bounds.height)),
  );
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = Math.max(1, Math.round(bounds.width * downscale));
  sampleCanvas.height = Math.max(1, Math.round(bounds.height * downscale));

  const sampleContext = sampleCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sampleContext) {
    throw new Error("Unable to create local lighting sample canvas.");
  }

  sampleContext.drawImage(
    background,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    sampleCanvas.width,
    sampleCanvas.height,
  );

  return sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
}

function createBackgroundCanvasContext(background: HTMLImageElement) {
  const width = background.naturalWidth || background.width;
  const height = background.naturalHeight || background.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) {
    throw new Error("Unable to create spatial lighting sample canvas.");
  }

  context.drawImage(background, 0, 0, width, height);

  return context;
}

function constrainLocalAdjustmentsForOverlay(
  adjustments: LocalAmbientAdjustments,
  activeOverlay: ActiveOverlayState,
): LocalAmbientAdjustments {
  if (
    activeOverlay.modelType !== "window" ||
    activeOverlay.windowGlass?.mode !== "outdoor"
  ) {
    return adjustments;
  }

  return {
    ...adjustments,
    brightness: clampNumber(adjustments.brightness, 0.85, 1.15),
    colorMix: Math.min(adjustments.colorMix, 0.12),
  };
}

function createAmbientMatchedModelCanvas(
  modelSource: OverlaySource,
  sourceBounds: SourceBounds,
  width: number,
  height: number,
  lighting: LightingAnalysis | undefined,
  ambientMatchStrength: number,
  localAdjustments: LocalAmbientAdjustments | undefined,
  spatialRelight: SpatialRelightSettings | undefined,
  spatialRelightResult: SpatialRelightResult | undefined,
  modelType: PlacedOverlay["modelType"],
  windowGlass: WindowGlassSettings | undefined,
  groundingRealism: GroundingRealismSettings | undefined,
  autoRealism: AutoRealismSettings | undefined,
  autoRealismResult: AutoRealismResult | undefined,
) {
  const workingCanvas = document.createElement("canvas");
  workingCanvas.width = Math.max(1, Math.round(width));
  workingCanvas.height = Math.max(1, Math.round(height));

  const workingContext = workingCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!workingContext) {
    return modelSource;
  }

  workingContext.drawImage(
    modelSource,
    sourceBounds.x,
    sourceBounds.y,
    sourceBounds.width,
    sourceBounds.height,
    0,
    0,
    workingCanvas.width,
    workingCanvas.height,
  );

  const imageData = workingContext.getImageData(
    0,
    0,
    workingCanvas.width,
    workingCanvas.height,
  );
  const data = imageData.data;
  const ambient = lighting?.ambient_rgb;
  const ambientAverage = ambient
    ? (ambient[0] + ambient[1] + ambient[2]) / 3 || 128
    : 128;
  const autoRealismEnabled = Boolean(autoRealism?.enabled);
  const colorMix =
    (lighting?.suggested.color_mix ?? 0) *
    ambientMatchStrength *
    (autoRealismEnabled ? 0.55 : 1);
  const grainStrength = (lighting?.suggested.grain ?? 0) * 28 * ambientMatchStrength;
  const contrast = getGlobalAmbientContrast(lighting, autoRealismEnabled);
  const saturation = getGlobalAmbientSaturation(lighting, autoRealismEnabled);
  const brightness = lighting
    ? getGlobalAmbientBrightness(lighting, ambientMatchStrength, autoRealismEnabled)
    : 1;
  const localAmbientAverage = localAdjustments
    ? averageRgb(localAdjustments.color) || 128
    : 128;
  const localGrainStrength = (localAdjustments?.grain ?? 0) * 22;
  const localBrightness = localAdjustments
    ? autoRealismEnabled
      ? clampNumber(localAdjustments.brightness, 0.9, 1.22)
      : localAdjustments.brightness
    : 1;
  const localContrast = localAdjustments
    ? autoRealismEnabled
      ? Math.max(localAdjustments.contrast, 0.94)
      : localAdjustments.contrast
    : 1;
  const localSaturation = localAdjustments
    ? autoRealismEnabled
      ? Math.max(localAdjustments.saturation, 0.98)
      : localAdjustments.saturation
    : 1;
  const localColorMix = localAdjustments
    ? localAdjustments.colorMix * (autoRealismEnabled ? 0.7 : 1)
    : 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha <= 0.01) {
      continue;
    }

    let red = data[index] * brightness;
    let green = data[index + 1] * brightness;
    let blue = data[index + 2] * brightness;
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    red = luma + (red - luma) * saturation;
    green = luma + (green - luma) * saturation;
    blue = luma + (blue - luma) * saturation;

    red = (red - 128) * contrast + 128;
    green = (green - 128) * contrast + 128;
    blue = (blue - 128) * contrast + 128;

    if (ambient) {
      red = red * (1 - colorMix) + red * (ambient[0] / ambientAverage) * colorMix;
      green = green * (1 - colorMix) + green * (ambient[1] / ambientAverage) * colorMix;
      blue = blue * (1 - colorMix) + blue * (ambient[2] / ambientAverage) * colorMix;
    }

    if (localAdjustments) {
      red *= localBrightness;
      green *= localBrightness;
      blue *= localBrightness;

      const localLuma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      red = localLuma + (red - localLuma) * localSaturation;
      green = localLuma + (green - localLuma) * localSaturation;
      blue = localLuma + (blue - localLuma) * localSaturation;

      red = (red - 128) * localContrast + 128;
      green = (green - 128) * localContrast + 128;
      blue = (blue - 128) * localContrast + 128;

      red =
        red * (1 - localColorMix) +
        red * (localAdjustments.color[0] / localAmbientAverage) * localColorMix;
      green =
        green * (1 - localColorMix) +
        green * (localAdjustments.color[1] / localAmbientAverage) * localColorMix;
      blue =
        blue * (1 - localColorMix) +
        blue * (localAdjustments.color[2] / localAmbientAverage) * localColorMix;
    }

    const grain = (pseudoRandom(index) - 0.5) * (grainStrength + localGrainStrength);
    data[index] = clampChannel(red + grain);
    data[index + 1] = clampChannel(green + grain);
    data[index + 2] = clampChannel(blue + grain);
  }

  workingContext.putImageData(imageData, 0, 0);

  let processedCanvas: HTMLCanvasElement = workingCanvas;

  if (
    spatialRelight?.enabled &&
    spatialRelightResult?.applied &&
    spatialRelightResult.lightingMap
  ) {
    processedCanvas = applySpatialRelightingToOverlayCanvas(
      workingCanvas,
      spatialRelightResult.lightingMap,
      spatialRelight,
      lighting,
      modelType,
      windowGlass,
    );
  }

  if (
    autoRealism?.enabled &&
    autoRealism.autoFaceShading &&
    autoRealismResult
  ) {
    processedCanvas = applyBoxModelFaceShading(
      processedCanvas,
      modelType,
      autoRealismResult.faceShadingStrength,
    );
  }

  if (autoRealism?.enabled) {
    processedCanvas = applyCabinetMaterialVitality(processedCanvas, modelType);
  }

  return applyCameraMatchForOverlay(
    processedCanvas,
    groundingRealism,
    modelType,
    windowGlass,
  );
}

function applyCameraMatchForOverlay(
  modelCanvas: HTMLCanvasElement,
  groundingRealism: GroundingRealismSettings | undefined,
  modelType: PlacedOverlay["modelType"],
  windowGlass: WindowGlassSettings | undefined,
) {
  const cameraMatch = groundingRealism?.cameraMatch;
  if (!cameraMatch?.enabled) {
    return modelCanvas;
  }

  const outdoorWindow = modelType === "window" && windowGlass?.mode === "outdoor";

  return applyCameraMatchToOverlayCanvas(
    modelCanvas,
    outdoorWindow
      ? {
          ...cameraMatch,
          blurPx: Math.min(cameraMatch.blurPx, 0.45),
          edgeFeatherPx: Math.min(cameraMatch.edgeFeatherPx, 0.6),
          grainAmount: cameraMatch.grainAmount * 0.65,
        }
      : cameraMatch,
    `${modelType}:${windowGlass?.mode ?? "none"}`,
  );
}

function getEffectiveAutoRealismResult(
  autoRealism: AutoRealismSettings | undefined,
  autoRealismResult: AutoRealismResult | undefined,
  modelType: PlacedOverlay["modelType"],
  overlayBounds: CanvasBounds | null,
  canvasWidth: number,
  canvasHeight: number,
  lighting: LightingAnalysis | undefined,
  localAmbient: LocalAmbientState | undefined,
  spatialRelightResult: SpatialRelightResult | undefined,
) {
  if (!autoRealism?.enabled) {
    return undefined;
  }

  return (
    autoRealismResult ??
    deriveAutoRealismSettings({
      modelType,
      placementType: autoRealism.placementType,
      overlayBounds,
      canvasWidth,
      canvasHeight,
      localLighting: localAmbient?.lighting,
      spatialLightingMap: spatialRelightResult?.lightingMap,
      globalLighting: lighting,
      imageSharpness: lighting?.sharpness,
      imageNoise: localAmbient?.lighting?.noise ?? lighting?.noise,
    })
  );
}

function getEffectiveGroundingRealism(
  groundingRealism: GroundingRealismSettings | undefined,
  autoRealism: AutoRealismSettings | undefined,
  autoRealismResult: AutoRealismResult | undefined,
): GroundingRealismSettings | undefined {
  const base = groundingRealism ?? DEFAULT_GROUNDING_REALISM;
  if (!autoRealism?.enabled || !autoRealismResult) {
    return groundingRealism;
  }

  return {
    perspective: {
      ...base.perspective,
      enabled: autoRealism.autoPerspective,
      skewX: autoRealismResult.perspectiveSkewX,
      skewY: autoRealismResult.perspectiveSkewY,
      verticalTilt: autoRealismResult.verticalTilt,
      perspectiveX: autoRealismResult.perspectiveSkewX,
      perspectiveY: autoRealismResult.verticalTilt,
    },
    floorAnchor: {
      ...base.floorAnchor,
      showGuide: base.floorAnchor.showGuide,
    },
    groundingShadow: {
      ...base.groundingShadow,
      enabled: false,
      baseContactStrength: autoRealismResult.contactShadowStrength,
      legContactStrength: autoRealismResult.legShadowStrength,
      contactBlur: autoRealismResult.shadowSoftness,
      floorFade: 0.82,
      useFootPoints: autoRealism.placementType === "floor-standing",
    },
    cameraMatch: {
      ...base.cameraMatch,
      enabled: autoRealism.autoCameraMatch || autoRealism.autoEdgeBlend,
      blurPx: autoRealism.autoCameraMatch
        ? Math.min(autoRealismResult.cameraBlurPx * 0.45, 0.35)
        : 0,
      grainAmount: autoRealism.autoCameraMatch ? autoRealismResult.grainAmount : 0,
      edgeFeatherPx: autoRealism.autoEdgeBlend ? autoRealismResult.edgeFeatherPx : 0,
      compressionSoftness: autoRealism.autoCameraMatch
        ? clampNumber(autoRealismResult.cameraBlurPx * 0.04, 0.02, 0.06)
        : 0,
    },
  };
}

function getOverlayBoundsFromMetrics(
  transform: OverlayTransform,
  metrics: OverlayMetrics,
  canvasWidth: number,
  canvasHeight: number,
): CanvasBounds | null {
  return computeOverlaySampleBounds(
    transform,
    metrics.width,
    metrics.height,
    canvasWidth,
    canvasHeight,
    0,
  );
}

function createModelSilhouetteCanvas(
  modelSource: OverlaySource,
  sourceBounds: SourceBounds,
) {
  const silhouetteCanvas = document.createElement("canvas");
  silhouetteCanvas.width = sourceBounds.width;
  silhouetteCanvas.height = sourceBounds.height;

  const silhouetteContext = silhouetteCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!silhouetteContext) {
    return modelSource;
  }

  silhouetteContext.drawImage(
    modelSource,
    sourceBounds.x,
    sourceBounds.y,
    sourceBounds.width,
    sourceBounds.height,
    0,
    0,
    sourceBounds.width,
    sourceBounds.height,
  );

  const imageData = silhouetteContext.getImageData(
    0,
    0,
    silhouetteCanvas.width,
    silhouetteCanvas.height,
  );
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    data[index] = 18;
    data[index + 1] = 16;
    data[index + 2] = 14;
    data[index + 3] = Math.round(alpha * 0.82);
  }

  silhouetteContext.putImageData(imageData, 0, 0);

  return silhouetteCanvas;
}

function drawOverlayGuide(
  context: CanvasRenderingContext2D,
  modelSource: OverlaySource,
  transform: OverlayTransform,
  metrics: OverlayMetrics,
) {
  const { width, height } = metrics;
  const outline = createModelOutlineCanvas(modelSource, metrics.sourceBounds);
  const outlineWidth = width * (outline.width / metrics.sourceBounds.width);
  const outlineHeight = height * (outline.height / metrics.sourceBounds.height);

  context.save();
  context.translate(transform.x, transform.y);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.drawImage(
    outline,
    -outlineWidth / 2,
    -outlineHeight / 2,
    outlineWidth,
    outlineHeight,
  );
  context.restore();
}

function drawFloorAnchorGuide(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  groundingRealism: GroundingRealismSettings | undefined,
) {
  const floorAnchor = groundingRealism?.floorAnchor;
  if (!floorAnchor?.enabled || !floorAnchor.showGuide) {
    return;
  }

  const floorAngle = groundingRealism?.perspective.floorAngle ?? 0;
  const anchorX = floorAnchor.anchorX * canvasWidth;
  const anchorY = floorAnchor.anchorY * canvasHeight;
  const guideLength = Math.min(canvasWidth, canvasHeight) * 0.18;

  context.save();
  context.translate(anchorX, anchorY);
  context.rotate((floorAngle * Math.PI) / 180);
  context.strokeStyle = "rgba(20, 184, 166, 0.82)";
  context.lineWidth = 2;
  context.setLineDash([8, 6]);
  context.beginPath();
  context.moveTo(-guideLength, 0);
  context.lineTo(guideLength, 0);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = "rgba(20, 184, 166, 0.9)";
  context.beginPath();
  context.arc(0, 0, 5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function getGroundedOverlayTransform(
  transform: OverlayTransform,
  metrics: OverlayMetrics,
  groundingRealism: GroundingRealismSettings | undefined,
  canvasWidth: number,
  canvasHeight: number,
): OverlayTransform {
  const floorAnchor = groundingRealism?.floorAnchor;
  if (
    !floorAnchor?.enabled ||
    !floorAnchor.snapBottomToAnchor
  ) {
    return transform;
  }

  return {
    ...transform,
    x: floorAnchor.anchorX * canvasWidth,
    y: floorAnchor.anchorY * canvasHeight - metrics.height / 2,
  };
}

function createModelOutlineCanvas(
  modelSource: OverlaySource,
  sourceBounds: SourceBounds,
) {
  const outlinePadding = Math.max(4, Math.round(
    Math.min(sourceBounds.width, sourceBounds.height) * 0.012,
  ));
  const outlineCanvas = document.createElement("canvas");
  outlineCanvas.width = sourceBounds.width + outlinePadding * 2;
  outlineCanvas.height = sourceBounds.height + outlinePadding * 2;

  const outlineContext = outlineCanvas.getContext("2d");
  if (!outlineContext) {
    return outlineCanvas;
  }

  const offsets = [
    [-outlinePadding, 0],
    [outlinePadding, 0],
    [0, -outlinePadding],
    [0, outlinePadding],
    [-outlinePadding, -outlinePadding],
    [outlinePadding, -outlinePadding],
    [-outlinePadding, outlinePadding],
    [outlinePadding, outlinePadding],
  ] as const;

  for (const [offsetX, offsetY] of offsets) {
    outlineContext.drawImage(
      modelSource,
      sourceBounds.x,
      sourceBounds.y,
      sourceBounds.width,
      sourceBounds.height,
      outlinePadding + offsetX,
      outlinePadding + offsetY,
      sourceBounds.width,
      sourceBounds.height,
    );
  }

  outlineContext.globalCompositeOperation = "source-in";
  outlineContext.fillStyle = "rgba(20, 184, 166, 0.92)";
  outlineContext.fillRect(0, 0, outlineCanvas.width, outlineCanvas.height);

  outlineContext.globalCompositeOperation = "destination-out";
  outlineContext.drawImage(
    modelSource,
    sourceBounds.x,
    sourceBounds.y,
    sourceBounds.width,
    sourceBounds.height,
    outlinePadding,
    outlinePadding,
    sourceBounds.width,
    sourceBounds.height,
  );

  return outlineCanvas;
}

function getAmbientMatchStrength(windowGlass: WindowGlassSettings | undefined) {
  return windowGlass?.mode === "outdoor" ? 0.35 : 1;
}

function getGlobalAmbientBrightness(
  lighting: LightingAnalysis,
  ambientMatchStrength: number,
  autoRealismEnabled: boolean,
) {
  const matchedBrightness =
    1 + (lighting.suggested.brightness - 1) * ambientMatchStrength;

  if (!autoRealismEnabled) {
    return matchedBrightness;
  }

  return clampNumber(
    1 + (lighting.suggested.brightness - 1) * ambientMatchStrength * 0.72 + 0.035,
    0.9,
    1.2,
  );
}

function getGlobalAmbientContrast(
  lighting: LightingAnalysis | undefined,
  autoRealismEnabled: boolean,
) {
  const suggestedContrast = lighting?.suggested.contrast ?? 1;

  if (!autoRealismEnabled) {
    return suggestedContrast;
  }

  return clampNumber(1 + (suggestedContrast - 1) * 0.55 + 0.08, 0.98, 1.18);
}

function getGlobalAmbientSaturation(
  lighting: LightingAnalysis | undefined,
  autoRealismEnabled: boolean,
) {
  const suggestedSaturation = lighting?.suggested.saturation ?? 1;

  if (!autoRealismEnabled) {
    return suggestedSaturation;
  }

  return clampNumber(1 + (suggestedSaturation - 1) * 0.55 + 0.1, 0.98, 1.22);
}

function getCanvasPoint(
  event: PointerEvent<HTMLCanvasElement>,
): CanvasPoint | null {
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) {
    return null;
  }

  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function isPointInsideOverlay(
  point: CanvasPoint,
  transform: OverlayTransform,
  metrics: OverlayMetrics,
  modelSource?: OverlaySource,
) {
  const radians = (-transform.rotation * Math.PI) / 180;
  const translatedX = point.x - transform.x;
  const translatedY = point.y - transform.y;
  const localX =
    translatedX * Math.cos(radians) - translatedY * Math.sin(radians);
  const localY =
    translatedX * Math.sin(radians) + translatedY * Math.cos(radians);
  const { width, height } = metrics;

  if (Math.abs(localX) > width / 2 || Math.abs(localY) > height / 2) {
    return false;
  }

  if (!modelSource) {
    return true;
  }

  return hasVisibleOverlayPixel(modelSource, metrics, localX, localY);
}

function hasVisibleOverlayPixel(
  modelSource: OverlaySource,
  metrics: OverlayMetrics,
  localX: number,
  localY: number,
) {
  const { sourceBounds, width, height } = metrics;
  const sourceX = sourceBounds.x + ((localX + width / 2) / width) * sourceBounds.width;
  const sourceY = sourceBounds.y + ((localY + height / 2) / height) * sourceBounds.height;
  const sampleRadius = 3;
  const sampleSize = sampleRadius * 2 + 1;
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;

  const sampleContext = sampleCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sampleContext) {
    return true;
  }

  sampleContext.drawImage(
    modelSource,
    Math.round(sourceX) - sampleRadius,
    Math.round(sourceY) - sampleRadius,
    sampleSize,
    sampleSize,
    0,
    0,
    sampleSize,
    sampleSize,
  );

  const imageData = sampleContext.getImageData(0, 0, sampleSize, sampleSize);
  const data = imageData.data;

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 8) {
      return true;
    }
  }

  return false;
}

function getOverlayMetrics(
  modelSource: OverlaySource,
  canvasWidth: number,
  transform: OverlayTransform,
): OverlayMetrics {
  const sourceBounds = getVisibleSourceBounds(modelSource);
  const width = Math.max(56, canvasWidth * transform.scale);
  const aspectRatio = sourceBounds.height / sourceBounds.width || 1;

  return {
    sourceBounds,
    width,
    height: width * aspectRatio,
  };
}

function getFallbackOverlayMetrics(
  canvasWidth: number,
  transform: OverlayTransform,
): OverlayMetrics {
  const sourceBounds = {
    x: 0,
    y: 0,
    width: 1024,
    height: 1024,
  };
  const width = Math.max(80, canvasWidth * transform.scale);

  return {
    sourceBounds,
    width,
    height: width,
  };
}

function getVisibleSourceBounds(modelSource: OverlaySource): SourceBounds {
  const sourceSize = getSourceSize(modelSource);
  const workingCanvas = document.createElement("canvas");
  workingCanvas.width = sourceSize.width;
  workingCanvas.height = sourceSize.height;

  const workingContext = workingCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!workingContext) {
    return {
      x: 0,
      y: 0,
      width: sourceSize.width,
      height: sourceSize.height,
    };
  }

  workingContext.drawImage(modelSource, 0, 0);

  const imageData = workingContext.getImageData(
    0,
    0,
    workingCanvas.width,
    workingCanvas.height,
  );
  const data = imageData.data;
  let minX = workingCanvas.width;
  let minY = workingCanvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < workingCanvas.height; y += 1) {
    for (let x = 0; x < workingCanvas.width; x += 1) {
      const alpha = data[(y * workingCanvas.width + x) * 4 + 3];
      if (alpha <= 8) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      x: 0,
      y: 0,
      width: sourceSize.width,
      height: sourceSize.height,
    };
  }

  const padding = Math.max(8, Math.round(Math.max(sourceSize.width, sourceSize.height) * 0.015));
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(sourceSize.width, maxX + padding + 1);
  const bottom = Math.min(sourceSize.height, maxY + padding + 1);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function getSourceSize(modelSource: OverlaySource) {
  if (modelSource instanceof HTMLImageElement) {
    return {
      width: modelSource.naturalWidth || modelSource.width,
      height: modelSource.naturalHeight || modelSource.height,
    };
  }

  return {
    width: modelSource.width,
    height: modelSource.height,
  };
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function averageRgb(rgb: [number, number, number]) {
  return (rgb[0] + rgb[1] + rgb[2]) / 3;
}

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
