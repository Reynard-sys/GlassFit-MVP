"use client";

import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import type { ProductModelOption, ProductModelType } from "@/lib/types";

interface ProductModelPanelProps {
  disabled: boolean;
  options: ProductModelOption[];
  onAddModel: (modelType: ProductModelType) => void;
}

export function ProductModelPanel({
  disabled,
  options,
  onAddModel,
}: ProductModelPanelProps) {
  return (
    <CollapsiblePanel
      badge={
        <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600">
          {options.length}
        </span>
      }
      title="Product Models"
    >
      <div className="grid gap-2">
        {options.map((option) => (
          <button
            className="rounded-md border border-stone-300 px-3 py-2 text-left text-sm font-semibold text-stone-800 transition hover:border-teal-500 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-50 disabled:text-stone-400"
            disabled={disabled}
            key={option.id}
            onClick={() => onAddModel(option.id)}
            type="button"
          >
            Add {option.name}
          </button>
        ))}
      </div>
    </CollapsiblePanel>
  );
}
