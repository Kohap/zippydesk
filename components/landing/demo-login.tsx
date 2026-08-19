"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
    <Button size="md" className={className} onClick={() => void enter()}>
      {children}
    </Button>
  );
}