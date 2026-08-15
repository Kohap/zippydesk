"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const SECTIONS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#access", label: "Get access" },
];

export function MobileMenu() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="zd-mobile-menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-line-strong text-ink-text transition-colors hover:bg-panel-2"
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>
      <div
        id="zd-mobile-menu"
        className={cn(
          "fixed inset-x-0 top-16 z-30 origin-top border-b border-line bg-ink/97 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur transition-all duration-150",
          open ? "scale-y-100 opacity-100" : "pointer-events-none scale-y-95 opacity-0",
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4" aria-label="Mobile">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              onClick={() => setOpen(false)}
              className="flex min-h-[48px] items-center rounded-[10px] px-3 text-[15px] font-medium text-ink-text transition-colors hover:bg-panel-2"
            >
              {s.label}
            </Link>
          ))}
          <Link href="/dashboard" onClick={() => setOpen(false)} className="mt-2">
            <Button size="md" className="w-full">
              Open the live demo
            </Button>
          </Link>
        </nav>
      </div>
      <div className="sr-only" aria-hidden={!open}>
        <Logo />
      </div>
    </div>
  );
}
