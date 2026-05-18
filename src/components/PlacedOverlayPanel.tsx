"use client";

import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import type { ActiveOverlayState, PlacedOverlay } from "@/lib/types";

interface PlacedOverlayPanelProps {
  activeOverlay: ActiveOverlayState | null;
  overlays: PlacedOverlay[];
  selectedOverlayId: string | null;
  onDelete: (overlayId: string) => void;
  onDuplicate: (overlayId: string) => void;
  onEdit: (overlayId: string) => void;
  onMove: (overlayId: string, direction: "up" | "down") => void;
  onSelect: (overlayId: string) => void;
  onToggleVisible: (overlayId: string, visible: boolean) => void;
}

export function PlacedOverlayPanel({
  activeOverlay,
  overlays,
  selectedOverlayId,
  onDelete,
  onDuplicate,
  onEdit,
  onMove,
  onSelect,
  onToggleVisible,
}: PlacedOverlayPanelProps) {
  const editingOverlayId =
    activeOverlay?.mode === "editing" ? activeOverlay.overlayId : null;

  return (
    <CollapsiblePanel
      badge={
        <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600">
          {overlays.length}
        </span>
      }
      title="Placed Overlays"
    >
      {overlays.length === 0 ? (
        <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
          No placed overlays yet.
        </p>
      ) : (
        <div className="space-y-3">
          {overlays.map((overlay, index) => {
            const selected = overlay.id === selectedOverlayId;
            const isEditing = overlay.id === editingOverlayId;

            return (
              <div
                className={`rounded-md border p-3 transition ${
                  selected
                    ? "border-teal-500 bg-teal-50"
                    : "border-stone-200 bg-white"
                }`}
                key={overlay.id}
              >
                <button
                  className="block w-full text-left"
                  onClick={() => onSelect(overlay.id)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-stone-950">
                      {overlay.name}
                    </span>
                    {isEditing ? (
                      <span className="rounded-md bg-teal-100 px-2 py-1 text-xs font-medium text-teal-800">
                        Editing
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs capitalize text-stone-500">
                    {overlay.modelType}
                  </span>
                </button>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium text-stone-700">
                    <input
                      checked={overlay.visible}
                      className="h-4 w-4 accent-teal-600"
                      onChange={(event) =>
                        onToggleVisible(overlay.id, event.target.checked)
                      }
                      type="checkbox"
                    />
                    Visible
                  </label>
                  <LayerButton
                    disabled={isEditing}
                    label="Edit"
                    onClick={() => onEdit(overlay.id)}
                  />
                  <LayerButton
                    label="Duplicate"
                    onClick={() => onDuplicate(overlay.id)}
                  />
                  <LayerButton
                    label="Delete"
                    onClick={() => onDelete(overlay.id)}
                  />
                  <LayerButton
                    disabled={index === 0}
                    label="Down"
                    onClick={() => onMove(overlay.id, "down")}
                  />
                  <LayerButton
                    disabled={index === overlays.length - 1}
                    label="Up"
                    onClick={() => onMove(overlay.id, "up")}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsiblePanel>
  );
}

interface LayerButtonProps {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}

function LayerButton({ disabled = false, label, onClick }: LayerButtonProps) {
  return (
    <button
      className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
