export interface ParsedNarration {
  vendorCode: string;
  orderRef: string;
}

const NARRATION_RE = /^GFT-([A-Z0-9]{2})-(\d{4})$/i;

export function parseNarration(narration: string): ParsedNarration | null {
  const m = NARRATION_RE.exec(narration.trim().toUpperCase());
  if (!m) return null;
  return { vendorCode: m[1] as string, orderRef: m[2] as string };
}

export function buildNarration(vendorId: string, orderId: string): string {
  const narration = `GFT-${vendorId}-${orderId}`;
  if (narration.length > 35) {
    throw new Error(`narration too long for bank limits: ${narration}`);
  }
  return narration;
}