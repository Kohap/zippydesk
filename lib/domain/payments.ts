export type PaymentVerdict = "applied" | "partial" | "overpayment";

/**
 * Deterministic payment math. The LLM never decides amounts —
 * this function does, purely arithmetically.
 */
export function decidePayment(balanceDueKobo: number, amountKobo: number): PaymentVerdict {
  if (amountKobo <= 0) throw new Error("amount must be positive");
  if (balanceDueKobo <= 0) throw new Error("no balance due");
  if (amountKobo === balanceDueKobo) return "applied";
  if (amountKobo < balanceDueKobo) return "partial";
  return "overpayment";
}

export function formatNaira(kobo: number): string {
  return `N${(kobo / 100).toLocaleString("en-NG")}`;
}