import { cn } from "@/lib/utils";

export function BoltMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("h-6 w-6", className)}
      style={{ filter: "none" }}
    >
      <defs>
        <linearGradient id="zd-bolt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0083a8" />
          <stop offset="1" stopColor="#00bca3" />
        </linearGradient>
      </defs>
      <path fill="url(#zd-bolt)" d="M17.9 2 6.2 18h6.9l-2.9 12L22.4 13h-7z" />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const word = size === "lg" ? "text-[24px]" : size === "sm" ? "text-[15px]" : "text-[17px]";
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <BoltMark className={size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4.5 w-4.5" : "h-5 w-5"} />
      <span className={cn("font-semibold tracking-tight text-ink-text", word)}>
        <span className="gradient-text">zippy</span>Desk
      </span>
    </span>
  );
}
