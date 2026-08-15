"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  q: string;
  a: string;
}

export function FAQ({ items, id }: { items: ReadonlyArray<FaqItem>; id?: string }) {
  return (
    <div className="card divide-y divide-line overflow-hidden" id={id}>
      {items.map((item, i) => (
        <FaqRow key={item.q} item={item} index={i} />
      ))}
    </div>
  );
}

function FaqRow({ item, index }: { item: FaqItem; index: number }) {
  const [open, setOpen] = React.useState(false);
  const panelId = `faq-panel-${index}`;
  const buttonId = `faq-button-${index}`;
  return (
    <div>
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-panel-2/60"
      >
        <span className="text-[15px] font-medium text-ink-text">{item.q}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150",
            open && "rotate-180 text-aqua-bright",
          )}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="border-t border-line bg-panel-2/40 px-5 py-4"
      >
        <p className="max-w-3xl text-[14px] leading-relaxed text-ink-muted">{item.a}</p>
      </div>
    </div>
  );
}
