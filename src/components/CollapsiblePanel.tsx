"use client";

import { useState, type ReactNode } from "react";

interface CollapsiblePanelProps {
  badge?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
}

export function CollapsiblePanel({
  badge,
  children,
  defaultOpen = true,
  title,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="text-base font-semibold text-stone-950">{title}</span>
        <span className="flex items-center gap-2">
          {badge}
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 text-sm font-semibold text-stone-600">
            {open ? "-" : "+"}
          </span>
        </span>
      </button>
      {open ? <div className="border-t border-stone-100 p-4">{children}</div> : null}
    </section>
  );
}
