"use client";

import type { ChangeEvent } from "react";
import type { ImageAnalysisResponse } from "@/lib/types";
import { getAmbientLabel } from "@/lib/canvasUtils";

interface UploadPanelProps {
  analysis: ImageAnalysisResponse | null;
  error: string | null;
  fileName: string | null;
  isAnalyzing: boolean;
  onFileSelect: (file: File) => void;
}

export function UploadPanel({
  analysis,
  error,
  fileName,
  isAnalyzing,
  onFileSelect,
}: UploadPanelProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }

    event.target.value = "";
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-950">
            Upload Space Photo
          </h2>
          {fileName ? (
            <p className="mt-1 text-sm text-stone-600">{fileName}</p>
          ) : null}
        </div>
        {isAnalyzing ? (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
            Analyzing
          </span>
        ) : null}
      </div>

      <label className="mt-4 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-center text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:bg-teal-50">
        <input
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          className="sr-only"
          disabled={isAnalyzing}
          onChange={handleChange}
          type="file"
        />
        {isAnalyzing ? "Detecting objects..." : "Choose JPG or PNG"}
      </label>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {analysis ? (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
            <p className="text-xs font-medium uppercase text-stone-500">
              Brightness
            </p>
            <p className="mt-1 text-lg font-semibold text-stone-950">
              {getAmbientLabel(analysis.brightness.category)}
            </p>
          </div>
          <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
            <p className="text-xs font-medium uppercase text-stone-500">
              Mean intensity
            </p>
            <p className="mt-1 text-lg font-semibold text-stone-950">
              {analysis.brightness.mean_pixel_intensity.toFixed(1)}
            </p>
          </div>
          <div className="col-span-2 rounded-md border border-stone-200 bg-stone-50 p-3">
            <p className="text-xs font-medium uppercase text-stone-500">
              Detector
            </p>
            <p className="mt-1 text-sm font-semibold text-stone-950">
              {analysis.segmentation?.mode === "yolo"
                ? `YOLO segmentation (${analysis.segmentation.model})`
              : "Mock segmentation fallback"}
            </p>
          </div>
          {analysis.lighting ? (
            <div className="col-span-2 rounded-md border border-stone-200 bg-stone-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-stone-500">
                    Ambient Match
                  </p>
                  <p className="mt-1 text-sm font-semibold capitalize text-stone-950">
                    {analysis.lighting.temperature} light · contrast{" "}
                    {analysis.lighting.contrast.toFixed(2)}
                  </p>
                </div>
                <span
                  aria-label="Detected ambient color"
                  className="h-9 w-9 rounded-md border border-stone-300"
                  style={{ backgroundColor: analysis.lighting.ambient_hex }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {analysis?.warning ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {analysis.warning}
        </p>
      ) : null}
    </section>
  );
}
