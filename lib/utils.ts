import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNaira(kobo: number): string {
  return `N${(kobo / 100).toLocaleString("en-NG")}`;
}

export function timeAgo(at: Date | string, now: number = Date.now()): string {
  const t = typeof at === "string" ? new Date(at).getTime() : at.getTime();
  const s = Math.max(1, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function dueIn(dueAt: Date | string | null, now: number = Date.now()): string | null {
  if (!dueAt) return null;
  const t = typeof dueAt === "string" ? new Date(dueAt).getTime() : dueAt.getTime();
  const ms = t - now;
  if (ms <= 0) return "overdue";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `due in ${m}m`;
  const h = Math.floor(m / 60);
  return `due in ${h}h ${m % 60}m`;
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
