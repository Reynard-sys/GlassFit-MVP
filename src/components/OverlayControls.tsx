"use client";

import type { Dispatch, SetStateAction } from "react";
import type { OverlayTransform, ShadowSettings } from "@/lib/types";
import { clamp } from "@/lib/canvasUtils";

interface OverlayControlsProps {
  applyAmbientLight: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onReset: () => void;
  onResetShadow: () => void;
  setShadowSettings: Dispatch<SetStateAction<ShadowSettings>>;
  onToggleAmbientLight: (enabled: boolean) => void;
  setTransform: Dispatch<SetStateAction<OverlayTransform>>;
  shadowSettings: ShadowSettings;
  transform: OverlayTransform;
}

export function OverlayControls({
  applyAmbientLight,
  isGenerating,
  onGenerate,
  onReset,
  onResetShadow,
  setShadowSettings,
  onToggleAmbientLight,
  shadowSettings,
  setTransform,
  transform,
}: OverlayControlsProps) {
  function updateShadowSettings(update: Partial<ShadowSettings>) {
    setShadowSettings((current) => ({
      ...current,
      ...update,
      autoFromLighting: false,
    }));
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-stone-950">
          Overlay Controls
        </h2>
        <button
          className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          onClick={onReset}
          type="button"
        >
          Reset
        </button>
      </div>

      <div className="mt-4 space-y-4">
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
        <ControlSlider
          label="Opacity"
          max={1}
          min={0.2}
          onChange={(value) =>
            setTransform((current) => ({
              ...current,
              opacity: clamp(value, 0.2, 1),
            }))
          }
          step={0.01}
          value={transform.opacity}
          valueLabel={`${Math.round(transform.opacity * 100)}%`}
        />

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-stone-200 bg-stone-50 px-3 py-3 text-sm font-medium text-stone-800">
          <span>Apply Ambient Light Adjustment</span>
          <input
            checked={applyAmbientLight}
            className="h-5 w-5 accent-teal-600"
            onChange={(event) => onToggleAmbientLight(event.target.checked)}
            type="checkbox"
          />
        </label>

        <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-stone-950">
              Shadow & Grounding
            </h3>
            <button
              className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 transition hover:bg-white"
              onClick={onResetShadow}
              type="button"
            >
              Reset shadow
            </button>
          </div>

          <div className="mt-3 space-y-3">
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
                onChange={(castEnabled) => updateShadowSettings({ castEnabled })}
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
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NudgeButton
            label="Left"
            onClick={() => nudge(setTransform, -16, 0)}
          />
          <NudgeButton label="Up" onClick={() => nudge(setTransform, 0, -16)} />
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

        <button
          className="w-full rounded-md bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          disabled={isGenerating}
          onClick={onGenerate}
          type="button"
        >
          {isGenerating ? "Generating output..." : "Generate Output"}
        </button>
      </div>
    </section>
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
  setTransform: Dispatch<SetStateAction<OverlayTransform>>,
  dx: number,
  dy: number,
) {
  setTransform((current) => ({
    ...current,
    x: current.x + dx,
    y: current.y + dy,
  }));
}
