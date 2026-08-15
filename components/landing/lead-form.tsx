"use client";

import * as React from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { MISSED_ORDERS_BUCKETS } from "@/lib/pricing";

const BUSINESS_TYPES = [
  "Food & Beverage",
  "Retail / Store",
  "Beauty / Fashion",
  "Restaurant / Kitchen",
  "Pharmacy",
  "Other",
];

export function LeadForm() {
  const [status, setStatus] = React.useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (data.get("website")) return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          shopName: data.get("shopName"),
          businessType: data.get("businessType"),
          phone: data.get("phone"),
          missedOrders: data.get("missedOrders"),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Something went wrong. Try again.");
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="card flex flex-col gap-5 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-good/30 bg-good/10"
          >
            <CheckCircle2 className="h-5 w-5 text-good" />
          </span>
          <h3 className="text-[17px] font-semibold text-ink-text">You are on the list</h3>
        </div>
        <p className="text-[14px] leading-relaxed text-ink-muted">
          Here is what happens next:
        </p>
        <ol className="flex flex-col gap-3 text-[14px] text-ink-muted">
          <li className="flex gap-3">
            <span className="data flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-[12px] font-semibold text-ink-text">
              1
            </span>
            <span>
              <span className="text-ink-text">Within 24 hours</span>, an onboarding partner reaches out on
              WhatsApp to schedule a 30-minute call.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="data flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-[12px] font-semibold text-ink-text">
              2
            </span>
            <span>
              We mirror your catalog into a WhatsApp storefront and walk your first ten orders with you.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="data flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-panel text-[12px] font-semibold text-ink-text">
              3
            </span>
            <span>
              You go live. We stay on call for the first week, no extra fee.
            </span>
          </li>
        </ol>
        <a
          href="/dashboard"
          className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-medium text-aqua-bright hover:text-aqua transition-colors"
        >
          While you wait, try the live demo
          <ChevronRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4 p-6 md:p-8" aria-label="Request early access">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="lead-name">
          <Input id="lead-name" name="name" required autoComplete="name" placeholder="Ada Obi" />
        </Field>
        <Field label="Shop or business name" htmlFor="lead-shop">
          <Input id="lead-shop" name="shopName" autoComplete="organization" placeholder="Ada's Kitchen" />
        </Field>
        <Field label="Business type" htmlFor="lead-type">
          <Select id="lead-type" name="businessType" required defaultValue="">
            <option value="" disabled>
              Select one
            </option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="WhatsApp number" htmlFor="lead-phone">
          <Input id="lead-phone" name="phone" required autoComplete="tel" inputMode="tel" placeholder="234 801 234 5678" />
        </Field>
      </div>
      <Field
        label="Orders you miss on a busy day"
        htmlFor="lead-missed"
        hint="This routes you to the right starting tier before the call."
      >
        <Select id="lead-missed" name="missedOrders" required defaultValue="">
          <option value="" disabled>
            Pick a range
          </option>
          {MISSED_ORDERS_BUCKETS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label} — {b.hint}
            </option>
          ))}
        </Select>
      </Field>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="sr-only" aria-hidden />
      {error ? (
        <p role="alert" className="text-[13px] text-bad">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={status === "submitting"} className="mt-1 w-full sm:w-auto">
        {status === "submitting" ? "Sending..." : "Request onboarding"}
      </Button>
      <p className="text-[12px] text-ink-faint">
        No card required. We will reply within one business day.
      </p>
    </form>
  );
}
