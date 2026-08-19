"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { COST_PER_CREDIT, PRICING_TIERS, findTier } from "@/lib/pricing";

function formatNgn(n: number): string {
  return `N${n.toLocaleString("en-NG")}`;
}

export function PricingCalculator() {
  const [tierId, setTierId] = React.useState("growth");
  const [ordersPerDay, setOrdersPerDay] = React.useState(45);

  const tier = findTier(tierId);
  const monthlyOrders = Math.max(1, Math.round(ordersPerDay * 30));
  const overflow = Math.max(0, monthlyOrders - tier.includedCredits);
  const overflowCost = overflow * COST_PER_CREDIT;
  const total = tier.baseMonthly + overflowCost;

  return (
    <div className="card overflow-hidden">
      <div className="grid md:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-5 border-b border-line p-5 sm:p-6 md:border-b-0 md:p-8">
          <div>
            <h3 className="text-[17px] font-semibold text-ink-text">Pick a base tier</h3>
            <p className="mt-1 text-[13px] text-ink-muted">
              Every order beyond the tier runs on prepaid credits at {formatNgn(COST_PER_CREDIT)} each.
            </p>
          </div>
          <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Base tier">
            {PRICING_TIERS.map((t) => {
              const selected = t.id === tierId;
              return (
                <label
                  key={t.id}
                  className={cn(
                    "flex cursor-pointer items-start justify-between gap-3 rounded-[10px] border px-4 py-3.5 transition-colors duration-100",
                    "min-h-[56px] sm:min-h-[60px]",
                    selected
                      ? "border-aqua/60 bg-[rgba(0,188,163,0.07)]"
                      : "border-line bg-panel hover:border-line-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="tier"
                    value={t.id}
                    checked={selected}
                    onChange={() => setTierId(t.id)}
                    aria-label={t.name}
                    className="sr-only"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink-text">{t.name}</span>
                    <span className="block text-[12px] leading-snug text-ink-muted">{t.blurb}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-semibold text-ink-text">
                      {formatNgn(t.baseMonthly)}
                      <span className="text-[12px] font-normal text-ink-faint">/mo</span>
                    </span>
                    <span className="block text-[12px] text-ink-faint">
                      {t.includedCredits.toLocaleString()} credits
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-6 bg-panel-2 p-5 sm:p-6 md:p-8">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="orders-slider" className="text-[13px] font-medium text-ink-muted">
                Orders on a busy day
              </label>
              <span className="data text-[15px] font-semibold text-aqua-bright">{ordersPerDay}/day</span>
            </div>
            <input
              id="orders-slider"
              type="range"
              min={10}
              max={300}
              step={5}
              value={ordersPerDay}
              onChange={(e) => setOrdersPerDay(Number(e.target.value))}
              className="mt-4"
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-ink-faint">
              <span>10/day</span>
              <span>150/day</span>
              <span>300/day</span>
            </div>

            <dl className="mt-6 flex flex-col gap-2.5 text-[14px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">{tier.name} base</dt>
                <dd className="data text-ink-text">{formatNgn(tier.baseMonthly)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">
                  {monthlyOrders.toLocaleString()} orders
                  <span className="block text-[12px] text-ink-faint sm:inline">
                    {" "}
                    ({(monthlyOrders - tier.includedCredits).toLocaleString()} over the tier)
                  </span>
                </dt>
                <dd className="data shrink-0 text-ink-text">{formatNgn(overflowCost)}</dd>
              </div>
              <div className="my-1 border-t border-line" />
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[15px] font-semibold text-ink-text">Estimate per month</dt>
                <dd className="data text-[22px] font-semibold text-aqua-bright">{formatNgn(total)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[10px] border border-line bg-ink p-4 text-[13px] leading-relaxed text-ink-muted">
            Pay-as-you-grow wallet: credits are prepaid through the dashboard (card, transfer or virtual
            account). The wallet auto-recharges when your balance crosses the low-water mark, so a rush
            hour never hits an empty tank.
          </div>
        </div>
      </div>
    </div>
  );
}