import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { loadVendorConfig } from "../lib/domain/config";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set - run: npm run db:seed");
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: url });
const config = loadVendorConfig(
  process.env.VENDOR_CONFIG_PATH ? readFileSync(process.env.VENDOR_CONFIG_PATH, "utf8") : undefined,
);

const MERCHANT_ID = "merchant-parfait";
const WALLET_ID = "wallet-parfait";
const DAY_MS = 24 * 3_600_000;
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
const daysAgo = (d: number) => new Date(now - d * DAY_MS);

await prisma.merchant.upsert({
  where: { id: MERCHANT_ID },
  update: { name: "Parfait Palace", businessType: "Food & Beverage", phone: "2348012345678" },
  create: {
    id: MERCHANT_ID,
    slug: "parfait",
    name: "Parfait Palace",
    businessType: "Food & Beverage",
    phone: "2348012345678",
  },
});

await prisma.wallet.upsert({
  where: { merchantId: MERCHANT_ID },
  update: { balanceCredits: 18, lowThreshold: 20, autoRecharge: false, autoRechargeAmount: 100, acceptingOrders: true },
  create: {
    id: WALLET_ID,
    merchantId: MERCHANT_ID,
    balanceCredits: 18,
    lowThreshold: 20,
    autoRecharge: false,
    autoRechargeAmount: 100,
    acceptingOrders: true,
  },
});

// Deterministic cleanup: wipe state left by earlier runs so the demo always
// starts from exactly the eight reference orders below.
await prisma.ingestedMessage.deleteMany();
await prisma.approvalEvent.deleteMany();
await prisma.refund.deleteMany();
await prisma.payment.deleteMany();
await prisma.order.deleteMany();

const txs: Array<{ id: string; type: "topup" | "consume" | "adjustment"; amount: number; balanceAfter: number; reference: string | null; meta: unknown; at: Date }> = [];
let running = 0;
const pushTx = (id: string, type: "topup" | "consume" | "adjustment", amount: number, reference: string | null, meta: unknown, at: Date) => {
  running += amount;
  txs.push({ id, type, amount, balanceAfter: running, reference, meta, at });
};
pushTx("tx-topup-1", "topup", 500, "pyk_ref_7f2a1c", { method: "card", status: "success" }, daysAgo(21));
pushTx("tx-topup-2", "topup", 250, "pyk_ref_9b41d8", { method: "transfer", status: "success" }, daysAgo(9));
pushTx("tx-topup-3", "topup", 100, "pyk_ref_c31e77", { method: "virtual_account", status: "success" }, daysAgo(4));
pushTx("tx-adjust-1", "adjustment", -787, null, { reason: "plan_purchase" }, daysAgo(3));
for (let i = 1; i <= 9; i++) {
  pushTx(`tx-consume-${i}`, "consume", -5, `order-1${10 + i}`, { reason: "order_processed" }, hoursAgo(i * 7));
}
for (const tx of txs) {
  await prisma.creditTransaction.upsert({
    where: { id: tx.id },
    update: {},
    create: {
      id: tx.id,
      walletId: WALLET_ID,
      type: tx.type,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      reference: tx.reference,
      meta: tx.meta as object,
      createdAt: tx.at,
    },
  });
}

for (const vendor of config.vendors) {
  await prisma.vendor.upsert({
    where: { id: vendor.id },
    update: {
      name: vendor.name,
      bankAccount: vendor.bankAccount,
      narrationPrefix: `GFT-${vendor.id}`,
      escalation: vendor.escalation,
      timers: vendor.timers,
      active: true,
    },
    create: {
      id: vendor.id,
      merchantId: MERCHANT_ID,
      name: vendor.name,
      bankAccount: vendor.bankAccount,
      narrationPrefix: `GFT-${vendor.id}`,
      escalation: vendor.escalation,
      timers: vendor.timers,
    },
  });
  for (const item of vendor.items) {
    const stock = item.sku === "PAR-2" ? 0 : item.stock;
    await prisma.vendorItem.upsert({
      where: { vendorId_sku: { vendorId: vendor.id, sku: item.sku } },
      update: { name: item.name, priceKobo: item.priceKobo, stock, active: item.active },
      create: { vendorId: vendor.id, sku: item.sku, name: item.name, priceKobo: item.priceKobo, stock, active: item.active },
    });
  }
}

const leads = [
  { id: "lead-1", name: "Adaeze Okafor", shopName: "Adaeze's Kitchen", businessType: "Restaurant / Kitchen", phone: "2348022334455", missedOrders: 12, source: "landing", at: daysAgo(3) },
  { id: "lead-2", name: "Tunde Bakare", shopName: "Tunde's Groceries", businessType: "Retail / Store", phone: "2348055667788", missedOrders: 7, source: "landing", at: daysAgo(1) },
  { id: "lead-3", name: "Funmi Adeyemi", shopName: null, businessType: "Beauty / Fashion", phone: "2348099887766", missedOrders: 3, source: "landing", at: hoursAgo(5) },
];
for (const lead of leads) {
  await prisma.lead.upsert({
    where: { id: lead.id },
    update: {},
    create: {
      id: lead.id,
      name: lead.name,
      shopName: lead.shopName,
      businessType: lead.businessType,
      phone: lead.phone,
      missedOrders: lead.missedOrders,
      source: lead.source,
      createdAt: lead.at,
    },
  });
}

const ITEMS = {
  PAR1: { sku: "PAR-1", name: "Classic Parfait", unitKobo: 500000 },
  PAR2: { sku: "PAR-2", name: "Berry Parfait", unitKobo: 650000 },
};

async function seedOrder(o: {
  id: string;
  customerWaId: string;
  items: Array<{ sku: string; name: string; qty: number; unitKobo: number }>;
  status: "PENDING_APPROVAL" | "APPROVED" | "PENDING_REFUND" | "ORDER_PENDING_PAYMENT" | "REFUNDED" | "CANCELLED";
  escalationLevel?: number;
  createdAt: Date;
  payment?: { validationMs: number; verdict: "applied" | "partial" };
  refund?: "pending" | "refunded";
  approvalActor?: "owner" | "assistant" | "system";
}) {
  const totalKobo = o.items.reduce((s, i) => s + i.qty * i.unitKobo, 0);
  const paid = o.status === "ORDER_PENDING_PAYMENT" ? 0 : totalKobo;
  const existing = await prisma.order.findUnique({ where: { id: o.id } });
  if (!existing) {
    await prisma.order.create({
      data: {
        id: o.id,
        customerWaId: o.customerWaId,
        vendorId: "A3",
        items: o.items,
        cartLocked: true,
        totalKobo,
        amountPaidKobo: paid,
        balanceDueKobo: totalKobo - paid,
        status: o.status,
        escalationLevel: o.escalationLevel ?? 0,
        createdAt: o.createdAt,
      },
    });
  } else {
    await prisma.order.update({
      where: { id: o.id },
      data: {
        items: o.items,
        totalKobo,
        amountPaidKobo: paid,
        balanceDueKobo: totalKobo - paid,
        status: o.status,
        escalationLevel: o.escalationLevel ?? existing.escalationLevel,
      },
    });
  }
  const evts: Array<{ id: string; actor: "customer" | "owner" | "assistant" | "system"; action: string; at: Date }> = [
    { id: `evt-${o.id}-1`, actor: "customer", action: "VENDOR_SELECTED", at: o.createdAt },
    { id: `evt-${o.id}-2`, actor: "customer", action: "cart_locked", at: o.createdAt },
  ];
  if (paid > 0) {
    evts.push({ id: `evt-${o.id}-3`, actor: "customer", action: "payment_applied", at: o.createdAt });
  }
  if (o.status === "APPROVED" || o.status === "REFUNDED") {
    evts.push({ id: `evt-${o.id}-4`, actor: o.approvalActor ?? "owner", action: "approved", at: o.createdAt });
  }
  if (o.status === "PENDING_REFUND") {
    evts.push({ id: `evt-${o.id}-5`, actor: "owner", action: "rejected", at: o.createdAt });
  }
  if (o.status === "CANCELLED") {
    evts.push({ id: `evt-${o.id}-6`, actor: "system", action: "payment_ttl", at: o.createdAt });
  }
  for (const evt of evts) {
    await prisma.approvalEvent.upsert({ where: { id: evt.id }, update: {}, create: { ...evt, orderId: o.id } });
  }
  if (paid > 0) {
    await prisma.payment.upsert({
      where: { id: `pmt-${o.id}` },
      update: {},
      create: {
        id: `pmt-${o.id}`,
        orderId: o.id,
        amountKobo: paid,
        narration: `GFT-A3-${o.id}`,
        visionJson: {
          narration: `GFT-A3-${o.id}`,
          amountKobo: paid,
          senderName: "CUSTOMER",
          isSuccessful: true,
          confidence: 0.92,
          errorReason: null,
        },
        receiptMsgId: `receipt-${o.id}`,
        verdict: o.payment?.verdict ?? "applied",
        validationMs: o.payment?.validationMs ?? 2400,
        createdAt: o.createdAt,
      },
    });
  }
  if (o.refund) {
    await prisma.refund.upsert({
      where: { id: `rf-${o.id}` },
      update: {},
      create: {
        id: `rf-${o.id}`,
        orderId: o.id,
        amountKobo: paid,
        status: o.refund,
        ownerConfirmedAt: o.refund === "refunded" ? o.createdAt : null,
      },
    });
  }
}

await seedOrder({
  id: "1001",
  customerWaId: "2348011111111",
  items: [{ ...ITEMS.PAR1, qty: 1 }],
  status: "APPROVED",
  createdAt: hoursAgo(3),
  payment: { validationMs: 2100, verdict: "applied" },
  approvalActor: "owner",
});
await seedOrder({
  id: "1002",
  customerWaId: "2348022222222",
  items: [{ ...ITEMS.PAR1, qty: 2 }],
  status: "PENDING_APPROVAL",
  createdAt: hoursAgo(1.2),
  payment: { validationMs: 2400, verdict: "applied" },
});
await seedOrder({
  id: "1003",
  customerWaId: "2348033333333",
  items: [{ ...ITEMS.PAR2, qty: 1 }],
  status: "PENDING_APPROVAL",
  createdAt: hoursAgo(0.6),
  payment: { validationMs: 1950, verdict: "applied" },
});
await seedOrder({
  id: "1004",
  customerWaId: "2348044444444",
  items: [{ ...ITEMS.PAR1, qty: 1 }],
  status: "PENDING_REFUND",
  refund: "pending",
  createdAt: daysAgo(1),
  payment: { validationMs: 2300, verdict: "applied" },
});
await seedOrder({
  id: "1005",
  customerWaId: "2348055555555",
  items: [{ ...ITEMS.PAR1, qty: 1 }],
  status: "ORDER_PENDING_PAYMENT",
  createdAt: hoursAgo(0.3),
});
await seedOrder({
  id: "1006",
  customerWaId: "2348066666666",
  items: [{ ...ITEMS.PAR2, qty: 1 }],
  status: "REFUNDED",
  refund: "refunded",
  createdAt: daysAgo(2),
  payment: { validationMs: 2600, verdict: "applied" },
  approvalActor: "owner",
});
await seedOrder({
  id: "1007",
  customerWaId: "2348077777777",
  items: [{ ...ITEMS.PAR1, qty: 1 }],
  status: "APPROVED",
  createdAt: hoursAgo(5),
  payment: { validationMs: 1880, verdict: "applied" },
  approvalActor: "owner",
});
await seedOrder({
  id: "1008",
  customerWaId: "2348088888888",
  items: [{ ...ITEMS.PAR1, qty: 1 }],
  status: "CANCELLED",
  createdAt: daysAgo(3),
});

const counts = {
  merchants: await prisma.merchant.count(),
  wallets: await prisma.wallet.count(),
  vendors: await prisma.vendor.count(),
  items: await prisma.vendorItem.count(),
  orders: await prisma.order.count(),
  payments: await prisma.payment.count(),
  transactions: await prisma.creditTransaction.count(),
  leads: await prisma.lead.count(),
};
console.log(`seeded: ${JSON.stringify(counts)}`);
await prisma.$disconnect();
