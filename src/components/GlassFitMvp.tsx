"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasEditor } from "@/components/CanvasEditor";
import { ObjectTogglePanel } from "@/components/ObjectTogglePanel";
import { OverlayControls } from "@/components/OverlayControls";
import { PlacedOverlayPanel } from "@/components/PlacedOverlayPanel";
import { ProductModelPanel } from "@/components/ProductModelPanel";
import { ResultPreview } from "@/components/ResultPreview";
import { UploadPanel } from "@/components/UploadPanel";
import {
  DEFAULT_OVERLAY_TRANSFORM,
  deriveShadowSettingsFromLighting,
  getInitialOverlayTransform,
} from "@/lib/canvasUtils";
import { analyzeImage, getImageApiBaseUrl, validateImageFile } from "@/lib/imageApi";
import {
  getDefaultWindowGlassSettings,
  getNextOverlayName,
  getProductModelOption,
  PRODUCT_MODEL_OPTIONS,
} from "@/lib/productModels";
import type {
  ActiveOverlayState,
  CanvasEditorHandle,
  ImageAnalysisResponse,
  OverlayTransform,
  PlacedOverlay,
  ProductModelType,
  ShadowSettings,
  WindowGlassSettings,
} from "@/lib/types";

interface CanvasSize {
  width: number;
  height: number;
}

export function GlassFitMvp() {
  const canvasRef = useRef<CanvasEditorHandle | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlayState | null>(
    null,
  );
  const [analysis, setAnalysis] = useState<ImageAnalysisResponse | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [finalImageUrl, setFinalImageUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [placedOverlays, setPlacedOverlays] = useState<PlacedOverlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const detectedObjects = analysis?.objects ?? [];
  const activeOcclusionObjectIds = activeOverlay?.occlusionObjectIds ?? [];

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleWarning = useCallback((message: string) => {
    setWarning(message);
  }, []);

  const handleCanvasSizeChange = useCallback((size: CanvasSize | null) => {
    setCanvasSize(size);
  }, []);

  const getDefaultTransform = useCallback((): OverlayTransform => {
    if (!canvasSize) {
      return { ...DEFAULT_OVERLAY_TRANSFORM };
    }

    return getInitialOverlayTransform(canvasSize.width, canvasSize.height);
  }, [canvasSize]);

  const getDefaultShadowSettings = useCallback(
    () => deriveShadowSettingsFromLighting(analysis?.lighting, analysis?.brightness),
    [analysis?.brightness, analysis?.lighting],
  );

  const confirmReplaceActiveOverlay = useCallback(() => {
    if (!activeOverlay) {
      return true;
    }

    const shouldDiscard = window.confirm(
      "You have an active overlay. Discard unsaved changes and continue?",
    );

    if (!shouldDiscard) {
      setWarning("Apply or cancel the active overlay before adding another.");
      return false;
    }

    setActiveOverlay(null);
    return true;
  }, [activeOverlay]);

  async function handleFileSelect(file: File) {
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const nextImageUrl = URL.createObjectURL(file);
    setImageUrl(nextImageUrl);
    setFileName(file.name);
    setAnalysis(null);
    setActiveOverlay(null);
    setCanvasSize(null);
    setError(null);
    setFinalImageUrl(null);
    setPlacedOverlays([]);
    setSelectedOverlayId(null);
    setWarning(null);
    setIsAnalyzing(true);

    try {
      const result = await analyzeImage(file);
      setAnalysis(result);
      setWarning(result.warning ?? null);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Image analysis failed.";
      setError(message);
      setWarning(
        `The FastAPI service at ${getImageApiBaseUrl()} is unavailable or returned an error. You can continue with manual overlay editing.`,
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleAddModel(modelType: ProductModelType) {
    if (!imageUrl) {
      setError("Upload a space photo before adding a product model.");
      return;
    }

    if (!confirmReplaceActiveOverlay()) {
      return;
    }

    const option = getProductModelOption(modelType);
    setActiveOverlay({
      mode: "adding",
      name: getNextOverlayName(modelType, placedOverlays),
      modelType,
      modelPath: option.modelPath,
      transform: getDefaultTransform(),
      shadowSettings: getDefaultShadowSettings(),
      ambientEnabled: true,
      occlusionObjectIds: [],
      windowGlass:
        modelType === "window" ? getDefaultWindowGlassSettings() : undefined,
    });
    setSelectedOverlayId(null);
    setFinalImageUrl(null);
    setError(null);
  }

  function handleObjectToggle(objectId: string, enabled: boolean) {
    if (!activeOverlay) {
      setWarning("Add or edit an overlay to configure object-aware occlusion.");
      return;
    }

    setActiveOverlay((current) => {
      if (!current) {
        return current;
      }

      const nextObjectIds = enabled
        ? Array.from(new Set([...current.occlusionObjectIds, objectId]))
        : current.occlusionObjectIds.filter((id) => id !== objectId);

      return {
        ...current,
        occlusionObjectIds: nextObjectIds,
      };
    });
  }

  function handleResetActiveOverlay() {
    setActiveOverlay((current) =>
      current
        ? {
            ...current,
            transform: getDefaultTransform(),
          }
        : current,
    );
  }

  function handleResetShadowSettings() {
    setActiveOverlay((current) =>
      current
        ? {
            ...current,
            shadowSettings: getDefaultShadowSettings(),
          }
        : current,
    );
  }

  async function handleApplyOverlay() {
    if (!activeOverlay) {
      setWarning("Add or edit an overlay before applying it.");
      return;
    }

    setError(null);

    try {
      const flattenedImageDataUrl = await canvasRef.current?.flattenActiveOverlay();
      if (!flattenedImageDataUrl) {
        throw new Error("Overlay render failed.");
      }

      const now = Date.now();
      if (activeOverlay.mode === "editing" && activeOverlay.overlayId) {
        const existingOverlay = placedOverlays.find(
          (overlay) => overlay.id === activeOverlay.overlayId,
        );
        const updatedOverlay = createPlacedOverlayFromActive(
          activeOverlay,
          activeOverlay.overlayId,
          flattenedImageDataUrl,
          now,
          existingOverlay,
        );

        setPlacedOverlays((current) =>
          current.map((overlay) =>
            overlay.id === activeOverlay.overlayId ? updatedOverlay : overlay,
          ),
        );
        setSelectedOverlayId(activeOverlay.overlayId);
      } else {
        const overlayId = createOverlayId();
        const placedOverlay = createPlacedOverlayFromActive(
          activeOverlay,
          overlayId,
          flattenedImageDataUrl,
          now,
        );

        setPlacedOverlays((current) => [...current, placedOverlay]);
        setSelectedOverlayId(overlayId);
      }

      setActiveOverlay(null);
      setFinalImageUrl(null);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to apply overlay.";
      setError(message);
    }
  }

  function handleCancelOverlay() {
    if (activeOverlay?.mode === "editing" && activeOverlay.overlayId) {
      setSelectedOverlayId(activeOverlay.overlayId);
    }

    setActiveOverlay(null);
  }

  async function handleDuplicateActiveOverlay() {
    if (!activeOverlay) {
      setWarning("Add or edit an overlay before duplicating it.");
      return;
    }

    setError(null);

    try {
      const flattenedImageDataUrl = await canvasRef.current?.flattenActiveOverlay();
      if (!flattenedImageDataUrl) {
        throw new Error("Overlay render failed.");
      }

      const now = Date.now();
      const sourceOverlayId = activeOverlay.overlayId ?? createOverlayId();
      const existingOverlay = placedOverlays.find(
        (overlay) => overlay.id === sourceOverlayId,
      );
      const sourceOverlay = createPlacedOverlayFromActive(
        activeOverlay,
        sourceOverlayId,
        flattenedImageDataUrl,
        now,
        existingOverlay,
      );
      const sourceExists = placedOverlays.some(
        (overlay) => overlay.id === sourceOverlayId,
      );
      const projectedOverlays = sourceExists
        ? placedOverlays.map((overlay) =>
            overlay.id === sourceOverlayId ? sourceOverlay : overlay,
          )
        : [...placedOverlays, sourceOverlay];

      setPlacedOverlays(projectedOverlays);
      setSelectedOverlayId(sourceOverlayId);
      setActiveOverlay({
        mode: "adding",
        name: getNextOverlayName(activeOverlay.modelType, projectedOverlays),
        modelType: activeOverlay.modelType,
        modelPath: activeOverlay.modelPath,
        transform: offsetTransform(activeOverlay.transform),
        shadowSettings: cloneShadowSettings(activeOverlay.shadowSettings),
        ambientEnabled: activeOverlay.ambientEnabled,
        occlusionObjectIds: [...activeOverlay.occlusionObjectIds],
        windowGlass: getWindowGlassForModel(
          activeOverlay.modelType,
          activeOverlay.windowGlass,
        ),
      });
      setFinalImageUrl(null);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to duplicate overlay.";
      setError(message);
    }
  }

  function handleEditPlacedOverlay(overlayId: string) {
    if (!confirmReplaceActiveOverlay()) {
      return;
    }

    const overlay = placedOverlays.find((entry) => entry.id === overlayId);
    if (!overlay) {
      setWarning("The selected overlay could not be found.");
      return;
    }

    setActiveOverlay({
      mode: "editing",
      overlayId: overlay.id,
      name: overlay.name,
      modelType: overlay.modelType,
      modelPath: overlay.modelPath,
      transform: cloneTransform(overlay.transform),
      shadowSettings: cloneShadowSettings(overlay.shadowSettings),
      ambientEnabled: overlay.ambientEnabled,
      occlusionObjectIds: [...overlay.occlusionObjectIds],
      windowGlass:
        getWindowGlassForModel(overlay.modelType, overlay.windowGlass),
    });
    setSelectedOverlayId(overlay.id);
    setFinalImageUrl(null);
  }

  function handleDuplicatePlacedOverlay(overlayId: string) {
    if (!confirmReplaceActiveOverlay()) {
      return;
    }

    const overlay = placedOverlays.find((entry) => entry.id === overlayId);
    if (!overlay) {
      setWarning("The selected overlay could not be found.");
      return;
    }

    setActiveOverlay({
      mode: "adding",
      name: getNextOverlayName(overlay.modelType, placedOverlays),
      modelType: overlay.modelType,
      modelPath: overlay.modelPath,
      transform: offsetTransform(overlay.transform),
      shadowSettings: cloneShadowSettings(overlay.shadowSettings),
      ambientEnabled: overlay.ambientEnabled,
      occlusionObjectIds: [...overlay.occlusionObjectIds],
      windowGlass:
        getWindowGlassForModel(overlay.modelType, overlay.windowGlass),
    });
    setSelectedOverlayId(overlay.id);
    setFinalImageUrl(null);
  }

  function handleDeletePlacedOverlay(overlayId: string) {
    setPlacedOverlays((current) =>
      current.filter((overlay) => overlay.id !== overlayId),
    );

    if (selectedOverlayId === overlayId) {
      setSelectedOverlayId(null);
    }

    if (activeOverlay?.overlayId === overlayId) {
      setActiveOverlay(null);
    }

    setFinalImageUrl(null);
  }

  function handleToggleOverlayVisible(overlayId: string, visible: boolean) {
    setPlacedOverlays((current) =>
      current.map((overlay) =>
        overlay.id === overlayId
          ? {
              ...overlay,
              visible,
              updatedAt: Date.now(),
            }
          : overlay,
      ),
    );
    setFinalImageUrl(null);
  }

  function handleMoveOverlay(overlayId: string, direction: "up" | "down") {
    setPlacedOverlays((current) => {
      const index = current.findIndex((overlay) => overlay.id === overlayId);
      const targetIndex = direction === "up" ? index + 1 : index - 1;

      if (
        index < 0 ||
        targetIndex < 0 ||
        targetIndex >= current.length
      ) {
        return current;
      }

      const nextOverlays = [...current];
      [nextOverlays[index], nextOverlays[targetIndex]] = [
        nextOverlays[targetIndex],
        nextOverlays[index],
      ];
      return nextOverlays;
    });
    setFinalImageUrl(null);
  }

  async function handleGenerateOutput() {
    if (!imageUrl) {
      setError("Upload a space photo before generating output.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const output = await canvasRef.current?.exportImage();
      if (!output) {
        throw new Error("Canvas export failed.");
      }

      setFinalImageUrl(output);
      if (activeOverlay) {
        setWarning("The active overlay is included in the generated output.");
      } else if (!placedOverlays.some((overlay) => overlay.visible)) {
        setWarning("Generated output contains the uploaded photo because no overlays are visible.");
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Canvas export failed.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f4] px-4 py-5 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col justify-between gap-3 border-b border-stone-200 pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-medium uppercase text-teal-700">
              Capstone Feasibility Prototype
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-stone-950">
              GlassFit MVP
            </h1>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-stone-600">
            This MVP supports multiple placed overlays using flattened canvas
            layers for reliability. Only one overlay is actively editable at a
            time. Lighting, shadow, scale, and occlusion are visual
            approximations based on a single uploaded photo.
          </p>
        </header>

        {warning ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warning}
          </p>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <UploadPanel
              analysis={analysis}
              error={error}
              fileName={fileName}
              isAnalyzing={isAnalyzing}
              onFileSelect={handleFileSelect}
            />

            <ProductModelPanel
              disabled={!imageUrl || !canvasSize}
              onAddModel={handleAddModel}
              options={PRODUCT_MODEL_OPTIONS}
            />

            <PlacedOverlayPanel
              activeOverlay={activeOverlay}
              overlays={placedOverlays}
              selectedOverlayId={selectedOverlayId}
              onDelete={handleDeletePlacedOverlay}
              onDuplicate={handleDuplicatePlacedOverlay}
              onEdit={handleEditPlacedOverlay}
              onMove={handleMoveOverlay}
              onSelect={setSelectedOverlayId}
              onToggleVisible={handleToggleOverlayVisible}
            />

            <ObjectTogglePanel
              activeOverlayName={activeOverlay?.name}
              enabledObjectIds={activeOcclusionObjectIds}
              hasActiveOverlay={Boolean(activeOverlay)}
              objects={detectedObjects}
              onToggle={handleObjectToggle}
            />

            <OverlayControls
              activeOverlay={activeOverlay}
              isGenerating={isGenerating}
              onApplyOverlay={handleApplyOverlay}
              onCancelOverlay={handleCancelOverlay}
              onDuplicateActiveOverlay={handleDuplicateActiveOverlay}
              onGenerate={handleGenerateOutput}
              onReset={handleResetActiveOverlay}
              onResetShadow={handleResetShadowSettings}
              setActiveOverlay={setActiveOverlay}
            />
          </aside>

          <div className="space-y-5">
            <CanvasEditor
              activeOverlay={activeOverlay}
              backgroundUrl={imageUrl}
              brightnessCategory={analysis?.brightness.category}
              lighting={analysis?.lighting}
              objects={detectedObjects}
              onCanvasSizeChange={handleCanvasSizeChange}
              onWarning={handleWarning}
              placedOverlays={placedOverlays}
              ref={canvasRef}
              setActiveOverlay={setActiveOverlay}
            />

            <ResultPreview
              beforeImageUrl={imageUrl}
              finalImageUrl={finalImageUrl}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function createPlacedOverlayFromActive(
  activeOverlay: ActiveOverlayState,
  overlayId: string,
  flattenedImageDataUrl: string,
  timestamp: number,
  existingOverlay?: PlacedOverlay,
): PlacedOverlay {
  return {
    id: overlayId,
    name: activeOverlay.name,
    modelType: activeOverlay.modelType,
    modelPath: activeOverlay.modelPath,
    transform: cloneTransform(activeOverlay.transform),
    shadowSettings: cloneShadowSettings(activeOverlay.shadowSettings),
    occlusionObjectIds: [...activeOverlay.occlusionObjectIds],
    ambientEnabled: activeOverlay.ambientEnabled,
    windowGlass: getWindowGlassForModel(
      activeOverlay.modelType,
      activeOverlay.windowGlass,
    ),
    visible: existingOverlay?.visible ?? true,
    locked: existingOverlay?.locked,
    flattenedImageDataUrl,
    createdAt: existingOverlay?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function createOverlayId() {
  return `overlay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloneTransform(transform: OverlayTransform): OverlayTransform {
  return { ...transform };
}

function cloneShadowSettings(shadowSettings: ShadowSettings): ShadowSettings {
  return { ...shadowSettings };
}

function cloneWindowGlassSettings(
  windowGlass: WindowGlassSettings,
): WindowGlassSettings {
  return { ...windowGlass };
}

function getWindowGlassForModel(
  modelType: ProductModelType,
  windowGlass: WindowGlassSettings | undefined,
) {
  if (modelType !== "window") {
    return undefined;
  }

  return cloneWindowGlassSettings(windowGlass ?? getDefaultWindowGlassSettings());
}

function offsetTransform(transform: OverlayTransform): OverlayTransform {
  return {
    ...transform,
    x: transform.x + 40,
    y: transform.y + 40,
  };
}
