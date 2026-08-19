import type { OrderStatus } from "./status";

export interface VendorConfigFile {
  vendors: Array<{
    id: string;
    name: string;
    bankAccount: string;
    merchantId?: string;
    visionFeeCredits?: number;
    escalation: Array<{ role: "owner" | "assistant"; waId: string }>;
    timers?: { approvalMinutes?: number; paymentTtlHours?: number };
    items: Array<{ sku: string; name: string; priceKobo: number; stock: number; active?: boolean }>;
  }>;
}

export interface HydratedVendor {
  id: string;
  name: string;
  bankAccount: string;
  merchantId: string;
  visionFeeCredits: number;
  escalation: Array<{ role: "owner" | "assistant"; waId: string }>;
  timers: { approvalMinutes: number; paymentTtlHours: number };
  items: Array<{ sku: string; name: string; priceKobo: number; stock: number; active: boolean }>;
}

export interface HydratedVendorConfigFile {
  vendors: HydratedVendor[];
}

export const DEFAULT_TIMERS = { approvalMinutes: 5, paymentTtlHours: 24 };

export const DEMO_VENDOR: VendorConfigFile = {
  vendors: [
    {
      id: "A3",
      name: "Parfait Palace",
      bankAccount: "0123456789 · ABC Bank",
      merchantId: "merchant-parfait",
      visionFeeCredits: 1,
      escalation: [
        { role: "owner", waId: "2348012345678" },
        { role: "assistant", waId: "2348098765432" },
      ],
      items: [
        { sku: "PAR-1", name: "Classic Parfait", priceKobo: 500000, stock: 10 },
        { sku: "PAR-2", name: "Berry Parfait", priceKobo: 650000, stock: 8 },
      ],
    },
  ],
};

export function hydrateVendorConfig(file?: VendorConfigFile): HydratedVendorConfigFile {
  const src = file ?? DEMO_VENDOR;
  return {
    vendors: src.vendors.map((v) => ({
      ...v,
      merchantId: v.merchantId ?? "merchant-parfait",
      visionFeeCredits: v.visionFeeCredits ?? 1,
      timers: { ...DEFAULT_TIMERS, ...v.timers },
      items: v.items.map((i) => ({ ...i, active: i.active ?? true })),
    })),
  };
}

export function loadVendorConfig(raw?: string): HydratedVendorConfigFile {
  if (!raw) return hydrateVendorConfig();
  try {
    const parsed = JSON.parse(raw) as VendorConfigFile;
    return hydrateVendorConfig(parsed);
  } catch {
    throw new Error("VENDOR_CONFIG_PATH must point at a valid vendor config JSON");
  }
}

export function statusRequiresPayment(status: OrderStatus): boolean {
  return status === "ORDER_PENDING_PAYMENT" || status === "PARTIALLY_PAID";
}