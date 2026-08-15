export interface VendorProvider {
  get(id: string): {
    id: string;
    name: string;
    bankAccount: string;
    merchantId: string;
    escalation: Array<{ role: "owner" | "assistant"; waId: string }>;
    timers: { approvalMinutes: number; paymentTtlHours: number };
    items: Array<{ sku: string; name: string; priceKobo: number; active: boolean }>;
  } | null;
  all(): Array<{
    id: string;
    name: string;
    bankAccount: string;
    merchantId: string;
    escalation: Array<{ role: "owner" | "assistant"; waId: string }>;
    timers: { approvalMinutes: number; paymentTtlHours: number };
    items: Array<{ sku: string; name: string; priceKobo: number; active: boolean }>;
  }>;
}