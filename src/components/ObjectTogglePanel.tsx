"use client";

import type { DetectedObject } from "@/lib/types";
import { formatConfidence } from "@/lib/canvasUtils";

interface ObjectTogglePanelProps {
  objects: DetectedObject[];
  enabledObjectIds: string[];
  onToggle: (objectId: string, enabled: boolean) => void;
}

export function ObjectTogglePanel({
  objects,
  enabledObjectIds,
  onToggle,
}: ObjectTogglePanelProps) {
  const enabledSet = new Set(enabledObjectIds);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-stone-950">
          Detected Objects
        </h2>
        <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600">
          {objects.length}
        </span>
      </div>

      {objects.length === 0 ? (
        <p className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
          No detected objects. Manual overlay editing is still available.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {objects.map((object) => {
            const enabled = enabledSet.has(object.id);

            return (
              <label
                className="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-stone-200 p-3 transition hover:border-teal-400"
                key={object.id}
              >
                <span>
                  <span className="block text-sm font-medium capitalize text-stone-950">
                    {object.label}
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    Confidence {formatConfidence(object.confidence)}
                  </span>
                  <span className="mt-2 block text-xs font-medium text-stone-700">
                    Put product behind this object
                  </span>
                </span>
                <input
                  checked={enabled}
                  className="mt-1 h-5 w-5 accent-teal-600"
                  onChange={(event) => onToggle(object.id, event.target.checked)}
                  type="checkbox"
                />
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

