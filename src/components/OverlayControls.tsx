"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import {
  clamp,
  DEFAULT_GROUNDING_REALISM,
  getSpatialRelightSettingsForAmbient,
  getDefaultAutoRealismSettings,
  normalizeAmbientLightAdjustmentSettings,
} from "@/lib/canvasUtils";
import {
  getDefaultOpacityForGlassAppearance,
  normalizeWindowGlassSettings,
} from "@/lib/productModels";
import type {
  ActiveOverlayState,
  AmbientLightAdjustmentSettings,
  AutoRealismSettings,
  GlassAppearanceMode,
  GroundingRealismSettings,
  OverlayTransform,
  PlacementType,
  ShadowSettings,
  SpatialRelightSettings,
  WindowGlassSettings,
} from "@/lib/types";

interface OverlayControlsProps {
  activeOverlay: ActiveOverlayState | null;
  isGenerating: boolean;
  onApplyOverlay: () => void;
  onAutoFitToScene: () => void;
  onCancelOverlay: () => void;
  onDuplicateActiveOverlay: () => void;
  onGenerate: () => void;
  onReset: () => void;
  onResetShadow: () => void;
  setActiveOverlay: Dispatch<SetStateAction<ActiveOverlayState | null>>;
}

export function OverlayControls({
  activeOverlay,
  isGenerating,
  onApplyOverlay,
  onAutoFitToScene,
  onCancelOverlay,
  onDuplicateActiveOverlay,
  onGenerate,
  onReset,
  onResetShadow,
  setActiveOverlay,
}: OverlayControlsProps) {
  const transform = activeOverlay?.transform;
  const shadowSettings = activeOverlay?.shadowSettings;
  const groundingRealism = getGroundingRealismSettings(
    activeOverlay?.groundingRealism,
  );
  const autoRealism = getAutoRealismSettings(
    activeOverlay?.autoRealism,
    activeOverlay?.modelType,
  );
  const ambientAdjustment =
    normalizeAmbientLightAdjustmentSettings(activeOverlay);

  function setTransform(
    update: SetStateAction<OverlayTransform>,
  ) {
    setActiveOverlay((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        transform:
          typeof update === "function" ? update(current.transform) : update,
      };
    });
  }

  function updateShadowSettings(update: Partial<ShadowSettings>) {
    setActiveOverlay((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        shadowSettings: {
          ...current.shadowSettings,
          ...update,
          autoFromLighting: false,
        },
      };
    });
  }

  function updateAmbientAdjustmentSettings(
    update: Partial<AmbientLightAdjustmentSettings>,
  ) {
    setActiveOverlay((current) => {
      if (!current) {
        return current;
      }

      const nextAmbient = {
        ...normalizeAmbientLightAdjustmentSettings(current),
        ...update,
      };
      const nextSpatialRelight = getSpatialRelightSettingsForAmbient({
        ...current,
        ambientAdjustment: nextAmbient,
      });

      return {
        ...current,
        ambientEnabled: nextAmbient.enabled,
        ambientAdjustment: nextAmbient,
        positionBasedAmbientEnabled:
          nextAmbient.enabled && nextAmbient.usePositionMatch,
        spatialRelight: nextSpatialRelight,
      };
    });
  }

  function toggleAmbientLight(enabled: boolean) {
    updateAmbientAdjustmentSettings({ enabled });
  }

  function togglePositionBasedAmbient(enabled: boolean) {
    updateAmbientAdjustmentSettings({ usePositionMatch: enabled });
  }

  function updateSpatialRelightSettings(
    update: Partial<SpatialRelightSettings>,
  ) {
    setActiveOverlay((current) => {
      if (!current) {
        return current;
      }

      const currentAmbient = normalizeAmbientLightAdjustmentSettings(current);
      const nextSpatial = {
        ...getSpatialRelightSettings(current),
        ...update,
      };
      const nextAmbient = {
        ...currentAmbient,
        useSpatialRelight: update.enabled ?? currentAmbient.useSpatialRelight,
        spatialRelightStrength:
          update.intensity ?? currentAmbient.spatialRelightStrength,
      };

      return {
        ...current,
        ambientAdjustment: nextAmbient,
        spatialRelight: getSpatialRelightSettingsForAmbient({
          ...current,
          ambientAdjustment: nextAmbient,
          spatialRelight: nextSpatial,
        }),
      };
    });
  }

  function toggleSpatialRelight(enabled: boolean) {
    updateSpatialRelightSettings({ enabled });
  }

  function updateAutoRealismSettings(update: Partial<AutoRealismSettings>) {
    setActiveOverlay((current) =>
      current
        ? {
            ...current,
            autoRealism: {
              ...getAutoRealismSettings(current.autoRealism, current.modelType),
              ...update,
            },
          }
        : current,
    );
  }

  function updateGroundingRealismSettings(
    update: Partial<GroundingRealismSettings>,
  ) {
    setActiveOverlay((current) =>
      current
        ? {
            ...current,
            groundingRealism: {
              ...getGroundingRealismSettings(current.groundingRealism),
              ...update,
            },
          }
        : current,
    );
  }

  function updatePerspectiveSettings(
    update: Partial<GroundingRealismSettings["perspective"]>,
  ) {
    const settings = getGroundingRealismSettings(activeOverlay?.groundingRealism);
    updateGroundingRealismSettings({
      perspective: {
        ...settings.perspective,
        ...update,
      },
    });
  }

  function updateFloorAnchorSettings(
    update: Partial<GroundingRealismSettings["floorAnchor"]>,
  ) {
    const settings = getGroundingRealismSettings(activeOverlay?.groundingRealism);
    updateGroundingRealismSettings({
      floorAnchor: {
        ...settings.floorAnchor,
        ...update,
      },
    });
  }

  function updateGroundingShadowSettings(
    update: Partial<GroundingRealismSettings["groundingShadow"]>,
  ) {
    const settings = getGroundingRealismSettings(activeOverlay?.groundingRealism);
    updateGroundingRealismSettings({
      groundingShadow: {
        ...settings.groundingShadow,
        ...update,
      },
    });
  }

  function updateCameraMatchSettings(
    update: Partial<GroundingRealismSettings["cameraMatch"]>,
  ) {
    const settings = getGroundingRealismSettings(activeOverlay?.groundingRealism);
    updateGroundingRealismSettings({
      cameraMatch: {
        ...settings.cameraMatch,
        ...update,
      },
    });
  }

  function updateWindowGlassSettings(update: Partial<WindowGlassSettings>) {
    setActiveOverlay((current) => {
      if (!current || current.modelType !== "window") {
        return current;
      }

      return {
        ...current,
        windowGlass: {
          ...getWindowGlassSettings(current.windowGlass),
          ...update,
        },
      };
    });
  }

  function updateGlassMode(mode: GlassAppearanceMode) {
    updateWindowGlassSettings({
      mode,
      opacity: getDefaultOpacityForGlassAppearance(mode),
    });
  }

  return (
    <CollapsiblePanel
      badge={
        activeOverlay ? (
          <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-medium capitalize text-teal-800">
            {activeOverlay.modelType}
          </span>
        ) : null
      }
      title="Overlay Controls"
    >
      {!activeOverlay || !transform || !shadowSettings ? (
        <div className="space-y-3">
          <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
            Add or edit an overlay to adjust placement.
          </p>
          <GenerateButton isGenerating={isGenerating} onGenerate={onGenerate} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border border-teal-100 bg-teal-50 px-3 py-2">
            <p className="text-sm font-semibold text-teal-950">
              {activeOverlay.name}
            </p>
            <p className="mt-1 text-xs capitalize text-teal-700">
              {activeOverlay.mode} {activeOverlay.modelType}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ActionButton label="Apply Overlay" onClick={onApplyOverlay} />
            <ActionButton label="Cancel" onClick={onCancelOverlay} />
            <ActionButton
              label="Duplicate Active"
              onClick={onDuplicateActiveOverlay}
            />
          </div>

          <ControlGroup title="Placement">
            <div className="space-y-4">
              <ControlSlider
                label="Resize"
                max={1.5}
                min={0.05}
                onChange={(value) =>
                  setTransform((current) => ({
                    ...current,
                    scale: clamp(value, 0.05, 1.5),
                  }))
                }
                step={0.01}
                value={transform.scale}
                valueLabel={`${Math.round(transform.scale * 100)}%`}
              />
              <ControlSlider
                label="Rotate on photo"
                max={180}
                min={-180}
                onChange={(value) =>
                  setTransform((current) => ({ ...current, rotation: value }))
                }
                step={1}
                value={transform.rotation}
                valueLabel={`${Math.round(transform.rotation)} deg`}
              />
              <ControlSlider
                label="3D yaw"
                max={180}
                min={-180}
                onChange={(value) =>
                  setTransform((current) => ({ ...current, modelYaw: value }))
                }
                step={1}
                value={transform.modelYaw}
                valueLabel={`${Math.round(transform.modelYaw)} deg`}
              />
              <ControlSlider
                label="3D pitch"
                max={45}
                min={-35}
                onChange={(value) =>
                  setTransform((current) => ({ ...current, modelPitch: value }))
                }
                step={1}
                value={transform.modelPitch}
                valueLabel={`${Math.round(transform.modelPitch)} deg`}
              />
              <button
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-white"
                onClick={onReset}
                type="button"
              >
                Reset Placement
              </button>
            </div>
          </ControlGroup>

          {activeOverlay.modelType === "window" ? (
            <WindowGlassControls
              onModeChange={updateGlassMode}
              settings={getWindowGlassSettings(activeOverlay.windowGlass)}
            />
          ) : null}

          <ControlGroup title="Realism">
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-stone-800">
                <span>
                  <span className="block font-medium">
                    Ambient Light Adjustment
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">
                    Automatically matches the product lighting to the uploaded photo while you edit.
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">
                    Uses the overall photo lighting and the overlay&apos;s current position.
                  </span>
                </span>
                <input
                  checked={ambientAdjustment.enabled}
                  className="mt-1 h-5 w-5 shrink-0 accent-teal-600"
                  onChange={(event) =>
                    toggleAmbientLight(event.target.checked)
                  }
                  type="checkbox"
                />
              </label>

              <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-stone-800">
                <span>
                  <span className="block font-medium">Auto Realism</span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">
                    Adds final output polish such as grounding, edge blending, and camera matching.
                  </span>
                </span>
                <input
                  checked={autoRealism.enabled}
                  className="mt-1 h-5 w-5 shrink-0 accent-teal-600"
                  onChange={(event) =>
                    updateAutoRealismSettings({ enabled: event.target.checked })
                  }
                  type="checkbox"
                />
              </label>

              <button
                className="w-full rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                onClick={onAutoFitToScene}
                type="button"
              >
                Auto-fit to Scene
              </button>
              <p className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-600">
                Attempts to align the overlay with the photo&apos;s floor and perspective.
              </p>

              <label className="block">
                <span className="text-sm font-medium text-stone-800">
                  Placement Type
                </span>
                <select
                  className="mt-2 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) =>
                    updateAutoRealismSettings({
                      placementType: event.target.value as PlacementType,
                    })
                  }
                  value={autoRealism.placementType}
                >
                  <option value="floor-standing">Floor-standing</option>
                  <option value="wall-mounted">Wall-mounted</option>
                  <option value="tabletop">Tabletop / Surface-mounted</option>
                </select>
              </label>
            </div>
          </ControlGroup>

          <ControlGroup defaultOpen={false} title="Advanced tuning: Perspective & Grounding">
            <div className="space-y-4">
              <ShadowToggle
                checked={groundingRealism.perspective.enabled}
                label="Enable perspective adjustment"
                onChange={(enabled) => updatePerspectiveSettings({ enabled })}
              />
              {groundingRealism.perspective.enabled ? (
                <div className="space-y-4">
                  <ControlSlider
                    label="Skew X"
                    max={0.35}
                    min={-0.35}
                    onChange={(skewX) => updatePerspectiveSettings({ skewX })}
                    step={0.01}
                    value={groundingRealism.perspective.skewX}
                    valueLabel={groundingRealism.perspective.skewX.toFixed(2)}
                  />
                  <ControlSlider
                    label="Skew Y"
                    max={0.2}
                    min={-0.2}
                    onChange={(skewY) => updatePerspectiveSettings({ skewY })}
                    step={0.01}
                    value={groundingRealism.perspective.skewY}
                    valueLabel={groundingRealism.perspective.skewY.toFixed(2)}
                  />
                  <ControlSlider
                    label="Vertical tilt"
                    max={0.25}
                    min={-0.25}
                    onChange={(verticalTilt) =>
                      updatePerspectiveSettings({ verticalTilt })
                    }
                    step={0.01}
                    value={groundingRealism.perspective.verticalTilt}
                    valueLabel={groundingRealism.perspective.verticalTilt.toFixed(2)}
                  />
                  <ControlSlider
                    label="Floor angle"
                    max={45}
                    min={-45}
                    onChange={(floorAngle) =>
                      updatePerspectiveSettings({ floorAngle })
                    }
                    step={1}
                    value={groundingRealism.perspective.floorAngle}
                    valueLabel={`${Math.round(groundingRealism.perspective.floorAngle)} deg`}
                  />
                  <ControlSlider
                    label="Perspective X"
                    max={0.3}
                    min={-0.3}
                    onChange={(perspectiveX) =>
                      updatePerspectiveSettings({ perspectiveX })
                    }
                    step={0.01}
                    value={groundingRealism.perspective.perspectiveX}
                    valueLabel={groundingRealism.perspective.perspectiveX.toFixed(2)}
                  />
                  <ControlSlider
                    label="Perspective Y"
                    max={0.3}
                    min={-0.3}
                    onChange={(perspectiveY) =>
                      updatePerspectiveSettings({ perspectiveY })
                    }
                    step={0.01}
                    value={groundingRealism.perspective.perspectiveY}
                    valueLabel={groundingRealism.perspective.perspectiveY.toFixed(2)}
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <ShadowToggle
                  checked={groundingRealism.floorAnchor.showGuide}
                  label="Show floor guide"
                  onChange={(showGuide) =>
                    updateFloorAnchorSettings({ showGuide })
                  }
                />
                <ShadowToggle
                  checked={groundingRealism.floorAnchor.snapBottomToAnchor}
                  label="Snap bottom"
                  onChange={(snapBottomToAnchor) =>
                    updateFloorAnchorSettings({ snapBottomToAnchor })
                  }
                />
              </div>
              <ControlSlider
                label="Floor anchor X"
                max={1}
                min={0}
                onChange={(anchorX) =>
                  updateFloorAnchorSettings({ anchorX: clamp(anchorX, 0, 1) })
                }
                step={0.01}
                value={groundingRealism.floorAnchor.anchorX}
                valueLabel={`${Math.round(groundingRealism.floorAnchor.anchorX * 100)}%`}
              />
              <ControlSlider
                label="Floor anchor Y"
                max={1}
                min={0}
                onChange={(anchorY) =>
                  updateFloorAnchorSettings({ anchorY: clamp(anchorY, 0, 1) })
                }
                step={0.01}
                value={groundingRealism.floorAnchor.anchorY}
                valueLabel={`${Math.round(groundingRealism.floorAnchor.anchorY * 100)}%`}
              />

              <ShadowToggle
                checked={groundingRealism.groundingShadow.enabled}
                label="Enhanced contact shadows"
                onChange={(enabled) =>
                  updateGroundingShadowSettings({ enabled })
                }
              />
              {groundingRealism.groundingShadow.enabled ? (
                <div className="space-y-4">
                  <ControlSlider
                    label="Base contact"
                    max={1}
                    min={0}
                    onChange={(baseContactStrength) =>
                      updateGroundingShadowSettings({ baseContactStrength })
                    }
                    step={0.01}
                    value={groundingRealism.groundingShadow.baseContactStrength}
                    valueLabel={`${Math.round(
                      groundingRealism.groundingShadow.baseContactStrength * 100,
                    )}%`}
                  />
                  <ControlSlider
                    label="Leg contact"
                    max={1}
                    min={0}
                    onChange={(legContactStrength) =>
                      updateGroundingShadowSettings({ legContactStrength })
                    }
                    step={0.01}
                    value={groundingRealism.groundingShadow.legContactStrength}
                    valueLabel={`${Math.round(
                      groundingRealism.groundingShadow.legContactStrength * 100,
                    )}%`}
                  />
                  <ControlSlider
                    label="Contact blur"
                    max={28}
                    min={0}
                    onChange={(contactBlur) =>
                      updateGroundingShadowSettings({ contactBlur })
                    }
                    step={1}
                    value={groundingRealism.groundingShadow.contactBlur}
                    valueLabel={`${Math.round(groundingRealism.groundingShadow.contactBlur)}px`}
                  />
                  <ShadowToggle
                    checked={groundingRealism.groundingShadow.useFootPoints}
                    label="Foot point shadows"
                    onChange={(useFootPoints) =>
                      updateGroundingShadowSettings({ useFootPoints })
                    }
                  />
                </div>
              ) : null}

              <ShadowToggle
                checked={groundingRealism.cameraMatch.enabled}
                label="Camera match"
                onChange={(enabled) => updateCameraMatchSettings({ enabled })}
              />
              {groundingRealism.cameraMatch.enabled ? (
                <div className="space-y-4">
                  <ControlSlider
                    label="Edge softness"
                    max={3}
                    min={0}
                    onChange={(edgeFeatherPx) =>
                      updateCameraMatchSettings({ edgeFeatherPx })
                    }
                    step={0.1}
                    value={groundingRealism.cameraMatch.edgeFeatherPx}
                    valueLabel={`${groundingRealism.cameraMatch.edgeFeatherPx.toFixed(1)}px`}
                  />
                  <ControlSlider
                    label="Camera blur"
                    max={3}
                    min={0}
                    onChange={(blurPx) => updateCameraMatchSettings({ blurPx })}
                    step={0.1}
                    value={groundingRealism.cameraMatch.blurPx}
                    valueLabel={`${groundingRealism.cameraMatch.blurPx.toFixed(1)}px`}
                  />
                  <ControlSlider
                    label="Grain"
                    max={0.2}
                    min={0}
                    onChange={(grainAmount) =>
                      updateCameraMatchSettings({ grainAmount })
                    }
                    step={0.01}
                    value={groundingRealism.cameraMatch.grainAmount}
                    valueLabel={`${Math.round(groundingRealism.cameraMatch.grainAmount * 100)}%`}
                  />
                </div>
              ) : null}
            </div>
          </ControlGroup>

          <ControlGroup defaultOpen={false} title="Advanced / Developer Tuning">
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-stone-200 bg-white px-3 py-3 text-sm font-medium text-stone-800">
                <span>Global ambient match</span>
                <input
                  checked={ambientAdjustment.enabled && ambientAdjustment.useGlobalMatch}
                  className="h-5 w-5 accent-teal-600"
                  onChange={(event) =>
                    updateAmbientAdjustmentSettings({
                      useGlobalMatch: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-stone-800">
                <span>
                  <span className="block font-medium">
                    Position-based ambient matching
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">
                    Refines lighting from the exact area when the overlay is placed.
                  </span>
                </span>
                <input
                  checked={ambientAdjustment.enabled && ambientAdjustment.usePositionMatch}
                  className="h-5 w-5 shrink-0 accent-teal-600"
                  onChange={(event) =>
                    togglePositionBasedAmbient(event.target.checked)
                  }
                  type="checkbox"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-stone-800">
                <span>
                  <span className="block font-medium">
                    Spatial ambient relighting
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">
                    Varies the model&apos;s shading based on the lighting around its exact placement area.
                  </span>
                </span>
                <input
                  checked={ambientAdjustment.enabled && ambientAdjustment.useSpatialRelight}
                  className="h-5 w-5 shrink-0 accent-teal-600"
                  onChange={(event) => toggleSpatialRelight(event.target.checked)}
                  type="checkbox"
                />
              </label>
              {ambientAdjustment.useSpatialRelight ? (
                <ControlSlider
                  label="Relighting strength"
                  max={1}
                  min={0}
                  onChange={(intensity) =>
                    updateSpatialRelightSettings({
                      intensity: clamp(intensity, 0, 1),
                    })
                  }
                  step={0.01}
                  value={getSpatialRelightSettings(activeOverlay).intensity}
                  valueLabel={`${Math.round(
                    getSpatialRelightSettings(activeOverlay).intensity * 100,
                  )}%`}
                />
              ) : null}
              <button
                className="w-full rounded-md border border-stone-300 px-2 py-2 text-sm font-medium text-stone-700 transition hover:bg-white"
                onClick={onResetShadow}
                type="button"
              >
                Reset Shadow
              </button>
              <ShadowToggle
                checked={shadowSettings.enabled}
                label="Enable shadow"
                onChange={(enabled) => updateShadowSettings({ enabled })}
              />
              <ShadowToggle
                checked={shadowSettings.autoFromLighting}
                label="Auto shadow from photo lighting"
                onChange={(enabled) => {
                  if (enabled) {
                    onResetShadow();
                    return;
                  }

                  updateShadowSettings({ autoFromLighting: false });
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <ShadowToggle
                  checked={shadowSettings.contactEnabled}
                  label="Contact"
                  onChange={(contactEnabled) =>
                    updateShadowSettings({ contactEnabled })
                  }
                />
                <ShadowToggle
                  checked={shadowSettings.castEnabled}
                  label="Cast"
                  onChange={(castEnabled) =>
                    updateShadowSettings({ castEnabled })
                  }
                />
              </div>
              <ControlSlider
                label="Shadow opacity"
                max={0.65}
                min={0}
                onChange={(opacity) => updateShadowSettings({ opacity })}
                step={0.01}
                value={shadowSettings.opacity}
                valueLabel={`${Math.round(shadowSettings.opacity * 100)}%`}
              />
              <ControlSlider
                label="Shadow softness"
                max={42}
                min={0}
                onChange={(blur) => updateShadowSettings({ blur })}
                step={1}
                value={shadowSettings.blur}
                valueLabel={`${Math.round(shadowSettings.blur)}px`}
              />
              <ControlSlider
                label="Shadow length"
                max={1.8}
                min={0.1}
                onChange={(length) => updateShadowSettings({ length })}
                step={0.01}
                value={shadowSettings.length}
                valueLabel={`${Math.round(shadowSettings.length * 100)}%`}
              />
              <ControlSlider
                label="Direction X"
                max={1}
                min={-1}
                onChange={(directionX) => updateShadowSettings({ directionX })}
                step={0.01}
                value={shadowSettings.directionX}
                valueLabel={shadowSettings.directionX.toFixed(2)}
              />
              <ControlSlider
                label="Direction Y"
                max={1}
                min={-0.2}
                onChange={(directionY) => updateShadowSettings({ directionY })}
                step={0.01}
                value={shadowSettings.directionY}
                valueLabel={shadowSettings.directionY.toFixed(2)}
              />
            </div>
          </ControlGroup>

          <ControlGroup defaultOpen={false} title="Quick Nudges">
            <div className="grid grid-cols-3 gap-2">
              <NudgeButton
                label="Left"
                onClick={() => nudge(setTransform, -16, 0)}
              />
              <NudgeButton
                label="Up"
                onClick={() => nudge(setTransform, 0, -16)}
              />
              <NudgeButton
                label="Right"
                onClick={() => nudge(setTransform, 16, 0)}
              />
              <NudgeButton
                label="Down"
                onClick={() => nudge(setTransform, 0, 16)}
              />
              <NudgeButton
                label="-15 deg"
                onClick={() =>
                  setTransform((current) => ({
                    ...current,
                    modelYaw: current.modelYaw - 15,
                  }))
                }
              />
              <NudgeButton
                label="+15 deg"
                onClick={() =>
                  setTransform((current) => ({
                    ...current,
                    modelYaw: current.modelYaw + 15,
                  }))
                }
              />
            </div>
          </ControlGroup>

          <GenerateButton isGenerating={isGenerating} onGenerate={onGenerate} />
        </div>
      )}
    </CollapsiblePanel>
  );
}

interface GenerateButtonProps {
  isGenerating: boolean;
  onGenerate: () => void;
}

function GenerateButton({ isGenerating, onGenerate }: GenerateButtonProps) {
  return (
    <button
      className="w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
      disabled={isGenerating}
      onClick={onGenerate}
      type="button"
    >
      {isGenerating ? "Generating output..." : "Generate Output"}
    </button>
  );
}

interface WindowGlassControlsProps {
  onModeChange: (mode: GlassAppearanceMode) => void;
  settings: WindowGlassSettings;
}

function WindowGlassControls({
  onModeChange,
  settings,
}: WindowGlassControlsProps) {
  const description = getGlassModeDescription(settings.mode);

  return (
    <ControlGroup title="Glass Appearance">
      <div className="space-y-4">
        <p className="text-xs leading-5 text-stone-500">
          Controls how the glass area appears in the visualization.
        </p>
        <label className="block">
          <span className="text-sm font-medium text-stone-800">Appearance</span>
          <select
            className="mt-2 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            onChange={(event) => onModeChange(event.target.value as GlassAppearanceMode)}
            value={settings.mode}
          >
            <option value="clear">Clear Glass</option>
            <option value="frosted">Frosted Glass</option>
            <option value="opaque">Opaque Glass</option>
            <option value="reflective">Reflective Glass</option>
            <option value="outdoor">Outdoor View</option>
          </select>
        </label>

        <p className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-600">
          {description}
        </p>

        {settings.mode === "outdoor" ? (
          <p className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">
            Uses /textures/outdoor-view.jpg when present, with a generated sky
            fallback.
          </p>
        ) : null}
        <p className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-600">
          Glass appearance presets are visual approximations. Actual glass types depend on available product options.
        </p>
      </div>
    </ControlGroup>
  );
}

interface ControlGroupProps {
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
}

function ControlGroup({
  children,
  defaultOpen = true,
  title,
}: ControlGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-stone-200 bg-stone-50">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-stone-950"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{title}</span>
        <span className="text-stone-500">{open ? "-" : "+"}</span>
      </button>
      {open ? <div className="border-t border-stone-200 p-3">{children}</div> : null}
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  onClick: () => void;
}

function ActionButton({ label, onClick }: ActionButtonProps) {
  return (
    <button
      className="rounded-md border border-teal-200 bg-white px-2 py-2 text-xs font-semibold text-teal-800 transition hover:bg-teal-100"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

interface ShadowToggleProps {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

function ShadowToggle({ checked, label, onChange }: ShadowToggleProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700">
      <span>{label}</span>
      <input
        checked={checked}
        className="h-4 w-4 accent-teal-600"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

interface ControlSliderProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
  valueLabel: string;
}

function ControlSlider({
  label,
  max,
  min,
  onChange,
  step,
  value,
  valueLabel,
}: ControlSliderProps) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-stone-800">{label}</span>
        <span className="text-xs text-stone-500">{valueLabel}</span>
      </span>
      <input
        className="mt-2 w-full accent-teal-700"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

interface NudgeButtonProps {
  label: string;
  onClick: () => void;
}

function NudgeButton({ label, onClick }: NudgeButtonProps) {
  return (
    <button
      className="rounded-md border border-stone-300 px-2 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function nudge(
  setTransform: (update: SetStateAction<OverlayTransform>) => void,
  dx: number,
  dy: number,
) {
  setTransform((current) => ({
    ...current,
    x: current.x + dx,
    y: current.y + dy,
  }));
}

function getWindowGlassSettings(
  settings: WindowGlassSettings | undefined,
): WindowGlassSettings {
  return normalizeWindowGlassSettings(settings);
}

function getSpatialRelightSettings(
  settings: {
    ambientAdjustment?: AmbientLightAdjustmentSettings;
    ambientEnabled?: boolean;
    positionBasedAmbientEnabled?: boolean;
    spatialRelight?: SpatialRelightSettings;
  } | undefined,
): SpatialRelightSettings {
  return getSpatialRelightSettingsForAmbient(settings);
}

function getAutoRealismSettings(
  settings: AutoRealismSettings | undefined,
  modelType: ActiveOverlayState["modelType"] | undefined,
): AutoRealismSettings {
  return settings ?? getDefaultAutoRealismSettings(modelType ?? "cabinet");
}

function getGroundingRealismSettings(
  settings: GroundingRealismSettings | undefined,
): GroundingRealismSettings {
  return settings ?? DEFAULT_GROUNDING_REALISM;
}

function getGlassModeDescription(mode: GlassAppearanceMode) {
  switch (mode) {
    case "clear":
      return "Slightly transparent glass with subtle highlights.";
    case "outdoor":
      return "Replaces the glass pane with an outdoor scene.";
    case "opaque":
      return "Blocks the room photo behind the pane with a clean privacy-glass look.";
    case "reflective":
      return "Uses neutral reflective glass with a soft highlight.";
    case "frosted":
    default:
      return "Blocks most background detail with a soft frosted glass surface.";
  }
}
