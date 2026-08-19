"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  React.useEffect(() => {
    console.error("dashboard route error", error);
  }, [error]);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="card flex flex-col items-start gap-4 p-6 md:p-8">
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-bad-line bg-bad-soft"
        >
          <AlertTriangle className="h-5 w-5 text-bad" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[20px] font-semibold tracking-tight text-ink-text">
            The dashboard stumbled
          </h1>
          <p className="max-w-md text-[14px] leading-relaxed text-ink-muted">
            The page failed to load. Your shop is still running, the order state is intact, and a
            retry usually clears it.
          </p>
        </div>
        <p className="data min-w-0 max-w-md overflow-hidden text-ellipsis whitespace-nowrap rounded-[8px] border border-line bg-panel px-3 py-2 text-[12px] text-ink-faint">
          {error.message || "Unknown error"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="md" onClick={reset} aria-label="Retry loading the dashboard">
            <RotateCcw className="h-4 w-4" aria-hidden /> Retry
          </Button>
          <Button size="md" variant="ghost" asChild>
            <a href="/dashboard">Open overview</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
