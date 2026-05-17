"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasEditor } from "@/components/CanvasEditor";
import { ObjectTogglePanel } from "@/components/ObjectTogglePanel";
import { OverlayControls } from "@/components/OverlayControls";
import { ResultPreview } from "@/components/ResultPreview";
import { UploadPanel } from "@/components/UploadPanel";
import {
  DEFAULT_OVERLAY_TRANSFORM,
  DEFAULT_SHADOW_SETTINGS,
  deriveShadowSettingsFromLighting,
} from "@/lib/canvasUtils";
import { analyzeImage, getImageApiBaseUrl, validateImageFile } from "@/lib/imageApi";
import type {
  CanvasEditorHandle,
  ImageAnalysisResponse,
  OverlayTransform,
  ShadowSettings,
} from "@/lib/types";

const OVERLAY_OPTIONS = [
  {
    label: "Ikea 3-Drawer 3D Model",
    src: "/models/ikea-3-drawer.glb",
  },
];

export function GlassFitMvp() {
  const canvasRef = useRef<CanvasEditorHandle | null>(null);
  const [analysis, setAnalysis] = useState<ImageAnalysisResponse | null>(null);
  const [applyAmbientLight, setApplyAmbientLight] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [finalImageUrl, setFinalImageUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [objectToggles, setObjectToggles] = useState<Record<string, boolean>>({});
  const [modelSrc, setModelSrc] = useState(OVERLAY_OPTIONS[0].src);
  const [overlayTransform, setOverlayTransform] = useState<OverlayTransform>(
    DEFAULT_OVERLAY_TRANSFORM,
  );
  const [resetSignal, setResetSignal] = useState(0);
  const [shadowSettings, setShadowSettings] = useState<ShadowSettings>(
    DEFAULT_SHADOW_SETTINGS,
  );
  const [warning, setWarning] = useState<string | null>(null);

  const detectedObjects = analysis?.objects ?? [];
  const enabledObjectIds = useMemo(
    () =>
      Object.entries(objectToggles)
        .filter(([, enabled]) => enabled)
        .map(([objectId]) => objectId),
    [objectToggles],
  );

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

  const resetShadowSettings = useCallback(() => {
    setShadowSettings(
      deriveShadowSettingsFromLighting(analysis?.lighting, analysis?.brightness),
    );
  }, [analysis?.brightness, analysis?.lighting]);

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
    setError(null);
    setFinalImageUrl(null);
    setObjectToggles({});
    setWarning(null);
    setIsAnalyzing(true);

    try {
      const result = await analyzeImage(file);
      setAnalysis(result);
      setShadowSettings((current) =>
        current.autoFromLighting
          ? deriveShadowSettingsFromLighting(result.lighting, result.brightness)
          : current,
      );
      setObjectToggles(
        Object.fromEntries(result.objects.map((object) => [object.id, false])),
      );
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

  function handleObjectToggle(objectId: string, enabled: boolean) {
    setObjectToggles((current) => ({
      ...current,
      [objectId]: enabled,
    }));
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
            This MVP is a feasibility prototype. Object detection, masking, and
            lighting adjustment are intended for visual support only and may not
            produce perfect depth, scale, or photorealistic accuracy. Shadow and
            lighting are estimated from a single photo and are intended for
            realism support only.
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

            <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
              <label className="block text-base font-semibold text-stone-950">
                3D Product Model
                <select
                  className="mt-3 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setModelSrc(event.target.value)}
                  value={modelSrc}
                >
                  {OVERLAY_OPTIONS.map((overlay) => (
                    <option key={overlay.src} value={overlay.src}>
                      {overlay.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <ObjectTogglePanel
              enabledObjectIds={enabledObjectIds}
              objects={detectedObjects}
              onToggle={handleObjectToggle}
            />

            <OverlayControls
              applyAmbientLight={applyAmbientLight}
              isGenerating={isGenerating}
              onGenerate={handleGenerateOutput}
              onReset={() => setResetSignal((current) => current + 1)}
              onResetShadow={resetShadowSettings}
              setShadowSettings={setShadowSettings}
              onToggleAmbientLight={setApplyAmbientLight}
              shadowSettings={shadowSettings}
              setTransform={setOverlayTransform}
              transform={overlayTransform}
            />
          </aside>

          <div className="space-y-5">
            <CanvasEditor
              applyAmbientLight={applyAmbientLight}
              backgroundUrl={imageUrl}
              brightnessCategory={analysis?.brightness.category}
              lighting={analysis?.lighting}
              objects={detectedObjects}
              occludedObjectIds={enabledObjectIds}
              onWarning={handleWarning}
              modelSrc={modelSrc}
              ref={canvasRef}
              resetSignal={resetSignal}
              shadowSettings={shadowSettings}
              setTransform={setOverlayTransform}
              transform={overlayTransform}
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
