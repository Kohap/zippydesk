"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, Package, Wallet, Activity, CircleUserRound, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { MerchantSummary } from "@/lib/api/merchants";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/billing", label: "Billing", icon: Wallet },
  { href: "/activity", label: "Activity", icon: Activity },
];

const META_DOTS: Array<{ key: string; label: string }> = [
  { key: "db", label: "db" },
  { key: "messenger", label: "wa" },
  { key: "vision", label: "vision" },
  { key: "scheduler", label: "queue" },
];

interface HealthMeta {
  meta?: { db: string; messenger: string; vision: string; scheduler: string };
  ok?: boolean;
}

export function AppShell({
  merchant,
  merchants,
  children,
}: {
  merchant: MerchantSummary;
  merchants: MerchantSummary[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [health, setHealth] = React.useState<HealthMeta | null>(null);

  React.useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/health");
        if (alive && res.ok) setHealth((await res.json()) as HealthMeta);
      } catch {
        if (alive) setHealth({ ok: false });
      }
    }
    void poll();
    const t = setInterval(() => void poll(), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function switchMerchant(id: string) {
    await fetch("/api/auth/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: id }),
    });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-ink md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/dashboard" className="assist-focus -m-2 rounded-[10px] p-2">
            <Logo size="sm" />
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 pt-2" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100",
                  active ? "bg-panel-2 text-ink-text" : "text-ink-muted hover:bg-panel-2/60 hover:text-ink-text",
                )}
              >
                {active ? (
                  <span aria-hidden className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-aqua-bright" />
                ) : null}
                <item.icon className={cn("h-[18px] w-[18px]", active ? "text-aqua-bright" : "text-ink-faint")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-3 border-t border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ocean to-aqua text-[13px] font-semibold text-white">
                {merchant.name.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink-text">{merchant.name}</p>
                <p className="truncate text-[11px] text-ink-faint">{merchant.businessType}</p>
              </div>
            </div>
            {merchants.length > 1 ? (
              <select
                aria-label="Switch merchant"
                value={merchant.id}
                onChange={(e) => void switchMerchant(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-[10px] border border-line bg-panel-2 text-ink-faint"
              >
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {META_DOTS.map((d) => (
              <span
                key={d.key}
                title={`${d.key}: ${health?.meta?.[d.key as keyof NonNullable<HealthMeta["meta"]>] ?? "..."}`}
                className={cn("h-1.5 w-1.5 rounded-full", health?.meta ? "bg-good" : "bg-ink-faint")}
              />
            ))}
            <span className="data ml-1 truncate text-[11px] text-ink-faint">
              {health?.meta
                ? `${health.meta.db} - ${health.meta.vision} - ${health.meta.scheduler}`
                : "connecting"}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-ink/95 px-4 md:h-16 md:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="md:hidden -m-2 flex min-h-[44px] items-center rounded-[10px] p-2" aria-label="zippyDesk home">
              <Logo size="sm" />
            </Link>
            <p className="hidden text-[14px] font-medium text-ink-muted md:block">
              {merchant.name}
              <span className="text-ink-faint"> / {merchant.businessType}</span>
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {health?.meta ? (
              <Badge variant="brand" dot>
                live
              </Badge>
            ) : (
              <Badge variant="neutral" dot>
                connecting
              </Badge>
            )}
            <button
              type="button"
              className="flex h-11 items-center gap-2 rounded-[10px] px-2 text-[13px] text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink-text"
              onClick={() => {
                document.cookie = "zd_session=; Path=/; Max-Age=0";
                router.push("/");
              }}
              aria-label="Sign out"
            >
              <CircleUserRound className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
              <LogOut className="h-3.5 w-3.5 text-ink-faint md:hidden" aria-hidden />
            </button>
          </div>
        </header>

        <main className="flex-1 pb-24 md:pb-10">{children}</main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/97 md:hidden"
          aria-label="Primary"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-[64px] w-16 flex-col items-center justify-center gap-1"
                >
                  <item.icon
                    className={cn("h-[20px] w-[20px]", active ? "text-aqua-bright" : "text-ink-faint")}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      active ? "text-ink-text" : "text-ink-faint",
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
