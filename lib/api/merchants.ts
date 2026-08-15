import { getPrisma } from "../infra/prisma";
import type { AppContext } from "../context";

export interface MerchantSummary {
  id: string;
  slug: string;
  name: string;
  businessType: string;
  phone: string;
}

export interface CatalogItem {
  sku: string;
  name: string;
  priceKobo: number;
  stock: number;
  active: boolean;
}

export interface VendorSummary {
  id: string;
  name: string;
  bankAccount: string;
  escalation: Array<{ role: "owner" | "assistant"; waId: string }>;
  timers: { approvalMinutes: number; paymentTtlHours: number };
  items: CatalogItem[];
}

export interface MerchantBundle {
  merchant: MerchantSummary;
  vendors: VendorSummary[];
}

const IN_MEMORY_MERCHANTS: MerchantBundle[] = [
  {
    merchant: { id: "merchant-parfait", slug: "parfait", name: "Parfait Palace", businessType: "Food & Beverage", phone: "2348012345678" },
    vendors: [],
  },
];

export async function listMerchants(_ctx: AppContext): Promise<MerchantSummary[]> {
  if (!process.env.DATABASE_URL) return IN_MEMORY_MERCHANTS.map((b) => b.merchant);
  const rows = await getPrisma().merchant.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    businessType: r.businessType,
    phone: r.phone,
  }));
}

export async function getMerchant(ctx: AppContext, merchantId: string): Promise<MerchantBundle | null> {
  if (!process.env.DATABASE_URL) {
    const fallback = IN_MEMORY_MERCHANTS.find((b) => b.merchant.id === merchantId) ?? null;
    if (!fallback) return null;
    return {
      merchant: fallback.merchant,
      vendors: ctx.config.vendors.map((v) => ({
        id: v.id,
        name: v.name,
        bankAccount: v.bankAccount,
        escalation: v.escalation,
        timers: v.timers,
        items: v.items,
      })),
    };
  }
  const row = await getPrisma().merchant.findUnique({ where: { id: merchantId } });
  if (!row) return null;
  const vendors = await getPrisma().vendor.findMany({
    where: { merchantId },
    include: { items: { orderBy: { sku: "asc" } } },
  });
  return {
    merchant: { id: row.id, slug: row.slug, name: row.name, businessType: row.businessType, phone: row.phone },
    vendors: vendors.map((v) => ({
      id: v.id,
      name: v.name,
      bankAccount: v.bankAccount,
      escalation: v.escalation as VendorSummary["escalation"],
      timers: v.timers as VendorSummary["timers"],
      items: v.items.map((i) => ({ sku: i.sku, name: i.name, priceKobo: i.priceKobo, stock: i.stock, active: i.active })),
    })),
  };
}
