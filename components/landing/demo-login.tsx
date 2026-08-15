"use client";

import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function DemoLogin({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  async function enter() {
    await fetch("/api/auth/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: "merchant-parfait" }),
    });
    router.push("/dashboard");
    router.refresh();
  }
  return (
    <a className={cn(buttonVariants({ size: "md" }), className)} role="button" tabIndex={0} onClick={() => void enter()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void enter(); } }}>
      {children}
    </a>
  );
}
