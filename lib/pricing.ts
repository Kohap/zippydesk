export interface PricingTier {
  id: string;
  name: string;
  baseMonthly: number;
  includedCredits: number;
  blurb: string;
}

/**
 * The pricing tier ladder. The calculator surfaces every tier; the billing
 * view summarizes the same ladder so the two surfaces never drift.
 *
 * Ranges deliberately match the spec messaging (Bespoke → Enterprise).
 */
export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: "bespoke",
    name: "Bespoke",
    baseMonthly: 10_000,
    includedCredits: 150,
    blurb: "Solo shops testing the WhatsApp line",
  },
  {
    id: "starter",
    name: "Starter",
    baseMonthly: 25_000,
    includedCredits: 500,
    blurb: "New shops finding their rhythm",
  },
  {
    id: "growth",
    name: "Growth",
    baseMonthly: 60_000,
    includedCredits: 1_500,
    blurb: "Steady WhatsApp line, daily orders",
  },
  {
    id: "scale",
    name: "Scale",
    baseMonthly: 95_000,
    includedCredits: 3_500,
    blurb: "Teams that never want to ring no answer",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    baseMonthly: 150_000,
    includedCredits: 8_000,
    blurb: "Multi-vendor, custom SLAs, dedicated success",
  },
] as const;

/** Cost per credit beyond the included tier allowance. */
export const COST_PER_CREDIT = 50;

export function findTier(id: string): PricingTier {
  return PRICING_TIERS.find((t) => t.id === id) ?? PRICING_TIERS[2]!;
}

/**
 * Recommended starting tier the form uses to size a lead.
 * Buckets are the same dropdown the lead form offers.
 */
export const MISSED_ORDERS_BUCKETS: ReadonlyArray<{
  value: string;
  label: string;
  hint: string;
  tier: string;
}> = [
  { value: "lt5", label: "Fewer than 5", hint: "Just getting started", tier: "bespoke" },
  { value: "5to15", label: "5 to 15", hint: "A WhatsApp line you check hourly", tier: "starter" },
  { value: "15to40", label: "15 to 40", hint: "Busy day, real revenue loss", tier: "growth" },
  { value: "40plus", label: "40 or more", hint: "You need this system yesterday", tier: "scale" },
];
