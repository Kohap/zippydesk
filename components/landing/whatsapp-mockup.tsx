"use client";

import * as React from "react";
import { CheckCheck, Image as ImageIcon, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Animated WhatsApp conversation mockup. Shows the success path of an order:
 * customer selects an item, sends a transfer receipt, the bot confirms the
 * narration and routes to owner approval. Loops every 8 seconds with a
 * staggered fade-in so the hero never feels frozen.
 */
export function WhatsAppMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[360px]">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-ocean/30 via-aqua/20 to-transparent opacity-60 blur-2xl" aria-hidden />

      <div
        className="relative overflow-hidden rounded-[28px] border border-line bg-panel shadow-[0_30px_80px_-30px_rgba(0,107,140,0.5)]"
        role="img"
        aria-label="WhatsApp conversation: customer pays, vision confirms, owner approves"
      >
        {/* Phone status bar */}
        <div className="flex items-center justify-between bg-panel-2 px-5 py-2.5 text-[11px] font-medium text-ink-muted">
          <span>9:41</span>
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="h-1 w-1 rounded-full bg-ink-text" />
            <span className="h-1 w-1 rounded-full bg-ink-text" />
            <span className="h-1 w-1 rounded-full bg-ink-text" />
          </span>
        </div>

        {/* Chat header */}
        <div className="flex items-center gap-3 border-b border-line bg-panel-2 px-4 py-3">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-ocean to-aqua text-[13px] font-semibold text-white"
          >
            A
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink-text">Ada's Kitchen</p>
            <p className="text-[11px] text-ink-faint">
              <span aria-hidden className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-good align-middle" />
              online
            </p>
          </div>
        </div>

        {/* Conversation */}
        <div className="flex min-h-[300px] flex-col gap-3 bg-[#0c1216] p-4">
          <Bubble side="left" delay={0}>
            Hi! I want to order the <span className="font-medium text-ink-text">House special 2L</span> please.
          </Bubble>
          <Bubble side="left" delay={600}>
            Sure. Total is <span className="data font-semibold text-ink-text">N2,500</span>. Send to{" "}
            <span className="font-medium text-aqua-bright">1234567890</span> with narration{" "}
            <span className="data font-semibold text-aqua-bright">GFT-A3-1042</span>
          </Bubble>

          <ReceiptBubble delay={1600} />

          <Bubble side="right" tone="brand" delay={2600}>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-aqua-bright">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Receipt verified · 2.4s
              </span>
              <span>
                <span className="data font-semibold">N2,500</span> matched narration{" "}
                <span className="data font-semibold">GFT-A3-1042</span>.
              </span>
              <span className="text-[12px] text-ink-muted">Routing to owner for approval.</span>
            </div>
          </Bubble>

          <Bubble side="right" tone="brand" delay={3800}>
            <div className="flex items-center gap-2">
              <TypingDots />
              <span className="text-[12px] text-ink-muted">Owner typing</span>
            </div>
          </Bubble>

          <Bubble side="right" tone="good" delay={5000}>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-good-text">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Approved · stock locked
              </span>
              <span>Order GFT-A3-1042 confirmed. Ready for pickup at 5pm.</span>
            </div>
          </Bubble>
        </div>

        {/* Composer (static) */}
        <div className="flex items-center gap-2 border-t border-line bg-panel-2 px-4 py-3">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-panel-3 text-ink-faint">
            <ImageIcon className="h-3.5 w-3.5" />
          </span>
          <div className="h-9 flex-1 rounded-full bg-panel-3" aria-hidden />
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-aqua text-white">
            <Receipt className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  children,
  side,
  tone = "default",
  delay = 0,
}: {
  children: React.ReactNode;
  side: "left" | "right";
  tone?: "default" | "brand" | "good";
  delay?: number;
}) {
  return (
    <div
      className={cn("bubble-in flex", side === "right" ? "justify-end" : "justify-start")}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-[14px] px-3.5 py-2 text-[13px] leading-relaxed",
          side === "right" ? "rounded-br-sm" : "rounded-bl-sm",
          tone === "brand" && "bg-aqua/15 text-ink-text border border-aqua/30",
          tone === "good" && "bg-good/15 text-ink-text border border-good/30",
          tone === "default" && side === "right" && "bg-[#1a3940] text-ink-text",
          tone === "default" && side === "left" && "bg-panel-3 text-ink-text",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ReceiptBubble({ delay }: { delay: number }) {
  return (
    <div
      className="bubble-in flex justify-end"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex max-w-[85%] flex-col gap-2 rounded-[14px] rounded-br-sm border border-line bg-[#1a3940] px-3 py-2.5 text-ink-text">
        <div className="flex items-center gap-2 text-[11px] font-medium text-ink-muted">
          <Receipt className="h-3.5 w-3.5" aria-hidden />
          <span>IMG_2841.jpg</span>
        </div>
        <div className="relative overflow-hidden rounded-[10px] border border-line bg-panel-3">
          <div className="aspect-[4/3]">
            <svg viewBox="0 0 200 150" className="h-full w-full" aria-hidden>
              <defs>
                <linearGradient id="rcpt-bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#1a2229" />
                  <stop offset="1" stopColor="#0f1418" />
                </linearGradient>
                <linearGradient id="rcpt-accent" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#006b8c" />
                  <stop offset="1" stopColor="#00bca3" />
                </linearGradient>
              </defs>
              <rect width="200" height="150" fill="url(#rcpt-bg)" />
              <text x="14" y="26" fontFamily="ui-monospace, monospace" fontSize="9" fill="#a2aeb8">
                GTBank Transfer
              </text>
              <text x="14" y="46" fontFamily="ui-sans-serif" fontSize="6" fill="#6b7883">
                Successful
              </text>
              <text x="14" y="68" fontFamily="ui-sans-serif" fontSize="14" fontWeight="700" fill="#e9eef2">
                N2,500.00
              </text>
              <text x="14" y="86" fontFamily="ui-monospace, monospace" fontSize="7" fill="#63e3cb">
                GFT-A3-1042
              </text>
              <rect x="14" y="100" width="120" height="2" rx="1" fill="url(#rcpt-accent)" />
              <text x="14" y="118" fontFamily="ui-sans-serif" fontSize="6" fill="#a2aeb8">
                From: Amara O.
              </text>
              <text x="14" y="130" fontFamily="ui-sans-serif" fontSize="6" fill="#6b7883">
                15 Aug 2026 · 14:32
              </text>
              {/* Scan line */}
              <rect
                x="0"
                y="0"
                width="200"
                height="2"
                fill="rgba(0, 188, 163, 0.6)"
                style={{ transformOrigin: "center", animation: "scan 3s ease-in-out infinite" }}
              />
            </svg>
          </div>
        </div>
        <span className="text-[11px] text-ink-faint">
          <CheckCheck className="mr-1 inline h-3 w-3" aria-hidden />
          Delivered
        </span>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-text" style={{ animationDelay: "0ms" }} />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-text" style={{ animationDelay: "120ms" }} />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-text" style={{ animationDelay: "240ms" }} />
    </span>
  );
}
