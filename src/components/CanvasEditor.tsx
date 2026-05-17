"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from "react";
import {
  getAmbientCanvasFilter,
  getInitialOverlayTransform,
  loadCanvasImage,
} from "@/lib/canvasUtils";
import { ProductModelRenderer } from "@/lib/modelRenderer";
import type {
  BrightnessCategory,
  CanvasEditorHandle,
  DetectedObject,
  LightingAnalysis,
  OverlayTransform,
  ShadowSettings,
} from "@/lib/types";

interface CanvasEditorProps {
  applyAmbientLight: boolean;
  backgroundUrl: string | null;
  brightnessCategory?: BrightnessCategory;
  lighting?: LightingAnalysis;
  objects: DetectedObject[];
  occludedObjectIds: string[];
  onWarning: (message: string) => void;
  modelSrc: string;
  resetSignal: number;
  shadowSettings: ShadowSettings;
  setTransform: Dispatch<SetStateAction<OverlayTransform>>;
  transform: OverlayTransform;
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

export const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(
  function CanvasEditor(
    {
      applyAmbientLight,
      backgroundUrl,
      brightnessCategory,
      lighting,
      objects,
      occludedObjectIds,
      onWarning,
      modelSrc,
      resetSignal,
      shadowSettings,
      setTransform,
      transform,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const backgroundRef = useRef<HTMLImageElement | null>(null);
    const maskImagesRef = useRef(new Map<string, HTMLImageElement>());
    const modelRendererRef = useRef<ProductModelRenderer | null>(null);
    const [canvasSize, setCanvasSize] = useState<CanvasSize | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [modelVersion, setModelVersion] = useState(0);
    const [maskVersion, setMaskVersion] = useState(0);
    const [status, setStatus] = useState("Upload a space photo to begin.");
    const objectMaskSignature = objects
      .map((object) => `${object.id}:${object.mask_url}`)
      .join("|");

    const resetOverlay = useCallback(() => {
      const background = backgroundRef.current;

      if (!background) {
        return;
      }

      setTransform(
        getInitialOverlayTransform(
          background.naturalWidth,
          background.naturalHeight,
        ),
      );
    }, [setTransform]);

    const drawCanvas = useCallback(
      (includeGuide: boolean) => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");

        if (!canvas || !context) {
          return false;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);

        const background = backgroundRef.current;
        const modelRenderer = modelRendererRef.current;

        if (!background || !modelRenderer) {
          context.fillStyle = "#f5f5f4";
          context.fillRect(0, 0, canvas.width, canvas.height);
          return false;
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(background, 0, 0, canvas.width, canvas.height);

        const modelCanvas = modelRenderer.render(
          transform,
          applyAmbientLight ? lighting : undefined,
        );
        if (!modelCanvas) {
          drawSceneShadows(
            context,
            null,
            transform,
            canvas.width,
            canvas.height,
            shadowSettings,
          );
          return false;
        }

        drawSceneShadows(
          context,
          modelCanvas,
          transform,
          canvas.width,
          canvas.height,
          shadowSettings,
        );

        drawModelOverlay(
          context,
          modelCanvas,
          transform,
          canvas.width,
          getAmbientCanvasFilter(brightnessCategory, lighting, applyAmbientLight),
          applyAmbientLight ? lighting : undefined,
        );

        const occludedSet = new Set(occludedObjectIds);
        for (const object of objects) {
          if (!occludedSet.has(object.id)) {
            continue;
          }

          const mask = maskImagesRef.current.get(object.id);
          if (mask) {
            drawObjectCutout(context, background, mask, canvas.width, canvas.height);
          }
        }

        if (includeGuide) {
          drawOverlayGuide(context, transform, canvas.width);
        }

        return true;
      },
      [
        applyAmbientLight,
        brightnessCategory,
        lighting,
        objects,
        occludedObjectIds,
        shadowSettings,
        transform,
      ],
    );

    useImperativeHandle(
      ref,
      () => ({
        async exportImage() {
          const didDraw = drawCanvas(false);
          const canvas = canvasRef.current;

          if (!didDraw || !canvas) {
            throw new Error("Canvas is not ready for export.");
          }

          const dataUrl = canvas.toDataURL("image/png");
          drawCanvas(true);
          return dataUrl;
        },
      }),
      [drawCanvas],
    );

    useEffect(() => {
      let cancelled = false;

      backgroundRef.current = null;
      setCanvasSize(null);

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

          backgroundRef.current = image;
          setCanvasSize({
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
          setStatus("Canvas ready.");
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
    }, [backgroundUrl, onWarning]);

    useEffect(() => {
      const modelRenderer = new ProductModelRenderer();
      modelRendererRef.current = modelRenderer;
      let disposed = false;

      modelRenderer.loadModel(modelSrc).then((result) => {
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
    }, [modelSrc, onWarning]);

    useEffect(() => {
      resetOverlay();
    }, [canvasSize, modelVersion, resetOverlay, resetSignal]);

    useEffect(() => {
      maskImagesRef.current.clear();
      setMaskVersion((current) => current + 1);
    }, [objectMaskSignature]);

    useEffect(() => {
      let cancelled = false;
      const enabledSet = new Set(occludedObjectIds);
      const masksToLoad = objects.filter(
        (object) =>
          enabledSet.has(object.id) && !maskImagesRef.current.has(object.id),
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
    }, [objects, occludedObjectIds, onWarning]);

    useEffect(() => {
      drawCanvas(true);
    }, [canvasSize, drawCanvas, maskVersion, modelVersion]);

    function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (!modelRendererRef.current || !backgroundRef.current) {
        return;
      }

      const point = getCanvasPoint(event);
      if (!point || !isPointInsideOverlay(point, transform, event.currentTarget.width)) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      setDragState({
        pointerId: event.pointerId,
        offsetX: point.x - transform.x,
        offsetY: point.y - transform.y,
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

      setTransform((current) => ({
        ...current,
        x: point.x - dragState.offsetX,
        y: point.y - dragState.offsetY,
      }));
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
              dragState ? "cursor-grabbing" : "cursor-grab"
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

function drawModelOverlay(
  context: CanvasRenderingContext2D,
  modelCanvas: HTMLCanvasElement,
  transform: OverlayTransform,
  canvasWidth: number,
  filter: string,
  lighting: LightingAnalysis | undefined,
) {
  const { width, height } = getOverlaySize(canvasWidth, transform);
  const source = lighting
    ? createAmbientMatchedModelCanvas(modelCanvas, width, height, lighting)
    : modelCanvas;

  context.save();
  context.translate(transform.x, transform.y);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.globalAlpha = transform.opacity;
  context.filter = filter;
  context.drawImage(source, -width / 2, -height / 2, width, height);
  context.restore();
}

function drawSceneShadows(
  context: CanvasRenderingContext2D,
  modelCanvas: HTMLCanvasElement | null,
  transform: OverlayTransform,
  canvasWidth: number,
  canvasHeight: number,
  shadowSettings: ShadowSettings,
) {
  if (!shadowSettings.enabled) {
    return;
  }

  if (shadowSettings.castEnabled && modelCanvas) {
    drawCastShadow(context, modelCanvas, transform, canvasWidth, shadowSettings);
  }

  if (shadowSettings.contactEnabled) {
    drawContactShadow(context, transform, canvasWidth, canvasHeight, shadowSettings);
  }
}

function drawContactShadow(
  context: CanvasRenderingContext2D,
  transform: OverlayTransform,
  canvasWidth: number,
  canvasHeight: number,
  shadowSettings: ShadowSettings,
) {
  const { width, height } = getOverlaySize(canvasWidth, transform);
  const overlayBottom = transform.y + height / 2;
  const floorFactor = clampNumber((overlayBottom / canvasHeight - 0.42) / 0.42, 0.72, 1.22);
  const contactWidth = width * shadowSettings.contactScale;
  const contactHeight = height * 0.12;
  const contactY = height * 0.36;
  const blur = clampNumber(shadowSettings.blur * 0.72, 6, 30);
  const opacity = clampNumber(
    shadowSettings.contactOpacity * floorFactor,
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

function drawCastShadow(
  context: CanvasRenderingContext2D,
  modelCanvas: HTMLCanvasElement,
  transform: OverlayTransform,
  canvasWidth: number,
  shadowSettings: ShadowSettings,
) {
  const { width, height } = getOverlaySize(canvasWidth, transform);
  const silhouette = createModelSilhouetteCanvas(modelCanvas);
  const offsetX = shadowSettings.directionX * shadowSettings.length * width * 0.25;
  const offsetY = shadowSettings.directionY * shadowSettings.length * height * 0.16;
  const skewX = clampNumber(shadowSettings.directionX * 0.18, -0.22, 0.22);
  const blur = clampNumber(shadowSettings.blur, 0, 46);

  context.save();
  context.translate(transform.x, transform.y);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.globalAlpha = clampNumber(shadowSettings.opacity, 0, 0.7);
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

function createAmbientMatchedModelCanvas(
  modelCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  lighting: LightingAnalysis,
) {
  const workingCanvas = document.createElement("canvas");
  workingCanvas.width = Math.max(1, Math.round(width));
  workingCanvas.height = Math.max(1, Math.round(height));

  const workingContext = workingCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!workingContext) {
    return modelCanvas;
  }

  workingContext.drawImage(modelCanvas, 0, 0, workingCanvas.width, workingCanvas.height);

  const imageData = workingContext.getImageData(
    0,
    0,
    workingCanvas.width,
    workingCanvas.height,
  );
  const data = imageData.data;
  const ambient = lighting.ambient_rgb;
  const ambientAverage = (ambient[0] + ambient[1] + ambient[2]) / 3 || 128;
  const colorMix = lighting.suggested.color_mix;
  const grainStrength = lighting.suggested.grain * 28;
  const contrast = lighting.suggested.contrast;
  const saturation = lighting.suggested.saturation;
  const brightness = lighting.suggested.brightness;

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

    red = red * (1 - colorMix) + red * (ambient[0] / ambientAverage) * colorMix;
    green = green * (1 - colorMix) + green * (ambient[1] / ambientAverage) * colorMix;
    blue = blue * (1 - colorMix) + blue * (ambient[2] / ambientAverage) * colorMix;

    const grain = (pseudoRandom(index) - 0.5) * grainStrength;
    data[index] = clampChannel(red + grain);
    data[index + 1] = clampChannel(green + grain);
    data[index + 2] = clampChannel(blue + grain);
  }

  workingContext.putImageData(imageData, 0, 0);

  return workingCanvas;
}

function createModelSilhouetteCanvas(modelCanvas: HTMLCanvasElement) {
  const silhouetteCanvas = document.createElement("canvas");
  silhouetteCanvas.width = modelCanvas.width;
  silhouetteCanvas.height = modelCanvas.height;

  const silhouetteContext = silhouetteCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!silhouetteContext) {
    return modelCanvas;
  }

  silhouetteContext.drawImage(modelCanvas, 0, 0);

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
  transform: OverlayTransform,
  canvasWidth: number,
) {
  const { width, height } = getOverlaySize(canvasWidth, transform);

  context.save();
  context.translate(transform.x, transform.y);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.strokeStyle = "rgba(20, 184, 166, 0.9)";
  context.lineWidth = Math.max(2, Math.min(width, height) * 0.006);
  context.setLineDash([10, 8]);
  context.strokeRect(-width / 2, -height / 2, width, height);
  context.restore();
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
  canvasWidth: number,
) {
  const radians = (-transform.rotation * Math.PI) / 180;
  const translatedX = point.x - transform.x;
  const translatedY = point.y - transform.y;
  const localX =
    translatedX * Math.cos(radians) - translatedY * Math.sin(radians);
  const localY =
    translatedX * Math.sin(radians) + translatedY * Math.cos(radians);
  const { width, height } = getOverlaySize(canvasWidth, transform);

  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2;
}

function getOverlaySize(canvasWidth: number, transform: OverlayTransform) {
  const width = Math.max(80, canvasWidth * transform.scale);
  return {
    width,
    height: width,
  };
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
