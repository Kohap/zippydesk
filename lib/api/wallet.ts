import { randomUUID } from "node:crypto";
import { getPrisma } from "../infra/prisma";
import type { AppContext } from "../context";
import type { MerchantBundle } from "./merchants";

const usesInMemory = (ctx: AppContext) => ctx.meta.db === "in-memory";

export interface WalletState {
  balanceCredits: number;
  lowThreshold: number;
  autoRecharge: boolean;
  autoRechargeAmount: number;
  acceptingOrders: boolean;
  tier: "emerging" | "scaling" | "enterprise";
  baseMonthly: number;
  unitKobo: number;
  recentEvents: Array<{
    id: string;
    event: "PAYMENT_VERIFIED" | "ZERO_BALANCE_LOCKOUT" | "TOPUP_BOOKED";
    orderId: string | null;
    balanceAfter: number;
    lowBalance: boolean;
    locked: boolean;
    amountKobo: number | null;
    at: Date;
  }>;
  transactions: Array<{
    id: string;
    type: "topup" | "consume" | "adjustment";
    amount: number;
    balanceAfter: number;
    reference: string | null;
    meta: unknown;
    createdAt: Date;
  }>;
}

export type TopUpMethod = "card" | "transfer" | "virtual_account";

interface MemWallet {
  balanceCredits: number;
  lowThreshold: number;
  autoRecharge: boolean;
  autoRechargeAmount: number;
  acceptingOrders: boolean;
  baseMonthly: number;
  transactions: WalletState["transactions"];
  recentEvents: WalletState["recentEvents"];
}

const MEM_KEY = "__zippydesk_mem_wallets__";
const EVENT_KEY = "__zippydesk_mem_events__";

function memWallets(): Map<string, MemWallet> {
  const g = globalThis as Record<string, unknown>;
  if (!g[MEM_KEY]) {
    const now = Date.now();
    const txs: WalletState["transactions"] = [
      { id: "tx-mem-1", type: "topup" as const, amount: 500, balanceAfter: 500, reference: "pyk_ref_mem1", meta: { method: "card", status: "success" }, createdAt: new Date(now - 21 * 86_400_000) },
      { id: "tx-mem-2", type: "topup" as const, amount: 250, balanceAfter: 750, reference: "pyk_ref_mem2", meta: { method: "transfer", status: "success" }, createdAt: new Date(now - 9 * 86_400_000) },
      { id: "tx-mem-3", type: "topup" as const, amount: 100, balanceAfter: 850, reference: "pyk_ref_mem3", meta: { method: "virtual_account", status: "success" }, createdAt: new Date(now - 4 * 86_400_000) },
      { id: "tx-mem-4", type: "adjustment" as const, amount: -787, balanceAfter: 63, reference: null, meta: { reason: "plan_purchase" }, createdAt: new Date(now - 3 * 86_400_000) },
    ];
    for (let i = 1; i <= 9; i++) {
      txs.push({
        id: `tx-mem-consume-${i}`,
        type: "consume" as const,
        amount: -5,
        balanceAfter: 63 - i * 5,
        reference: `order-1${10 + i}`,
        meta: { reason: "order_processed" },
        createdAt: new Date(now - i * 7 * 3_600_000),
      });
    }
    g[MEM_KEY] = new Map<string, MemWallet>([
      [
        "merchant-parfait",
        {
          balanceCredits: 18,
          lowThreshold: 20,
          autoRecharge: false,
          autoRechargeAmount: 100,
          acceptingOrders: true,
          baseMonthly: 60_000,
          transactions: txs,
          recentEvents: [],
        },
      ],
    ]);
  }
  return g[MEM_KEY] as Map<string, MemWallet>;
}

function memEventLog(): WalletState["recentEvents"] {
  const g = globalThis as Record<string, unknown>;
  if (!g[EVENT_KEY]) g[EVENT_KEY] = [] as WalletState["recentEvents"];
  return g[EVENT_KEY] as WalletState["recentEvents"];
}

function pushEvent(ev: WalletState["recentEvents"][number]): void {
  const log = memEventLog();
  log.unshift(ev);
  while (log.length > 50) log.pop();
}

export function getRecentEvents(): WalletState["recentEvents"] {
  return [...memEventLog()];
}

export async function getWallet(ctx: AppContext, merchantId: string): Promise<WalletState | null> {
  if (usesInMemory(ctx)) {
    const mem = memWallets().get(merchantId);
    if (!mem) return null;
    const tier = tierForBase(mem.baseMonthly);
    return {
      balanceCredits: mem.balanceCredits,
      lowThreshold: mem.lowThreshold,
      autoRecharge: mem.autoRecharge,
      autoRechargeAmount: mem.autoRechargeAmount,
      acceptingOrders: mem.acceptingOrders,
      tier,
      baseMonthly: mem.baseMonthly,
      unitKobo: unitKoboForTier(tier),
      recentEvents: getRecentEvents(),
      transactions: [...mem.transactions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 30),
    };
  }
  const prisma = getPrisma();
  const wallet = await prisma.wallet.findUnique({ where: { merchantId } });
  if (!wallet) return null;
  const transactions = await prisma.creditTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  // Without a stored tier on the merchant, default to scaling — the
  // dashboard lets the merchant pick from the pricing ladder.
  const baseMonthly = 60_000;
  const tier = tierForBase(baseMonthly);
  return {
    balanceCredits: wallet.balanceCredits,
    lowThreshold: wallet.lowThreshold,
    autoRecharge: wallet.autoRecharge,
    autoRechargeAmount: wallet.autoRechargeAmount,
    acceptingOrders: wallet.acceptingOrders,
    tier,
    baseMonthly,
    unitKobo: unitKoboForTier(tier),
    recentEvents: getRecentEvents(),
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type as WalletState["transactions"][number]["type"],
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      reference: t.reference,
      meta: t.meta,
      createdAt: t.createdAt,
    })),
  };
}

/**
 * Tier → per-credit unit cost. Reflects the discount the higher tiers
 * earn: emerging pays ₦100/credit, scaling ₦75, enterprise ₦50.
 */
export function unitKoboForTier(tier: "emerging" | "scaling" | "enterprise"): number {
  switch (tier) {
    case "emerging":
      return 10_000;
    case "scaling":
      return 7_500;
    case "enterprise":
      return 5_000;
  }
}

/**
 * Simulated Paystack checkout: builds a deterministic reference and books
 * the credit in a transaction so balance + history move together.
 */
export async function topUpWallet(
  ctx: AppContext,
  merchantId: string,
  credits: number,
  method: TopUpMethod,
  bundle: MerchantBundle | null,
): Promise<WalletState> {
  if (!Number.isInteger(credits) || credits <= 0 || credits > 100_000) {
    throw new Error("credits must be a positive integer");
  }
  const reference = `pyk_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  if (usesInMemory(ctx)) {
    const mem = memWallets().get(merchantId);
    if (!mem) throw new Error("merchant wallet not found");
    mem.balanceCredits += credits;
    mem.transactions.unshift({
      id: `tx-${Date.now()}`,
      type: "topup",
      amount: credits,
      balanceAfter: mem.balanceCredits,
      reference,
      meta: { method, status: "success" },
      createdAt: new Date(),
    });
    pushEvent({
      id: `evt-${Date.now()}`,
      event: "TOPUP_BOOKED",
      orderId: null,
      balanceAfter: mem.balanceCredits,
      lowBalance: mem.balanceCredits < mem.lowThreshold,
      locked: false,
      amountKobo: credits * unitKoboForTier(tierForBase(mem.baseMonthly)),
      at: new Date(),
    });
    // A top-up always resumes the runtime.
    mem.acceptingOrders = true;
    return (await getWallet(ctx, merchantId)) as WalletState;
  }
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { merchantId } });
    if (!wallet) throw new Error("merchant wallet not found");
    const next = wallet.balanceCredits + credits;
    await tx.wallet.update({ where: { id: wallet.id }, data: { balanceCredits: next, acceptingOrders: true } });
    await tx.creditTransaction.create({
      data: {
        walletId: wallet.id,
        type: "topup",
        amount: credits,
        balanceAfter: next,
        reference,
        meta: { method, status: "success" },
      },
    });
    pushEvent({
      id: `evt-${Date.now()}`,
      event: "TOPUP_BOOKED",
      orderId: null,
      balanceAfter: next,
      lowBalance: next < wallet.lowThreshold,
      locked: false,
      amountKobo: credits * unitKoboForTier(tierForBase(60_000)),
      at: new Date(),
    });
    return (await getWallet(ctx, merchantId)) as WalletState;
  });
}

export async function setAutoRecharge(
  ctx: AppContext,
  merchantId: string,
  enabled: boolean,
  amount?: number,
): Promise<WalletState> {
  const rechargeAmount = enabled ? Math.max(50, Math.min(10_000, Math.round(amount ?? 100))) : undefined;
  if (usesInMemory(ctx)) {
    const mem = memWallets().get(merchantId);
    if (!mem) throw new Error("merchant wallet not found");
    mem.autoRecharge = enabled;
    if (rechargeAmount !== undefined) mem.autoRechargeAmount = rechargeAmount;
    return (await getWallet(ctx, merchantId)) as WalletState;
  }
  const prisma = getPrisma();
  await prisma.wallet.update({
    where: { merchantId },
    data: { autoRecharge: enabled, ...(rechargeAmount !== undefined ? { autoRechargeAmount: rechargeAmount } : {}) },
  });
  return (await getWallet(ctx, merchantId)) as WalletState;
}

export async function setAcceptingOrders(ctx: AppContext, merchantId: string, accepting: boolean): Promise<WalletState> {
  if (usesInMemory(ctx)) {
    const mem = memWallets().get(merchantId);
    if (!mem) throw new Error("merchant wallet not found");
    mem.acceptingOrders = accepting;
    return (await getWallet(ctx, merchantId)) as WalletState;
  }
  const prisma = getPrisma();
  await prisma.wallet.update({ where: { merchantId }, data: { acceptingOrders: accepting } });
  return (await getWallet(ctx, merchantId)) as WalletState;
}

/**
 * Deducts a single credit from the wallet. Mirrors the side-effect of a
 * PAYMENT_VERIFIED webhook after the bot confirms the receipt against the
 * order narration. Returns the updated wallet plus a flag indicating
 * whether the merchant has crossed below the low-water mark.
 */
export async function consumeCredit(
  ctx: AppContext,
  merchantId: string,
  orderId: string,
  reason: string,
): Promise<{ wallet: WalletState; lowBalance: boolean; locked: boolean }> {
  if (usesInMemory(ctx)) {
    const mem = memWallets().get(merchantId);
    if (!mem) throw new Error("merchant wallet not found");
    if (mem.balanceCredits <= 0) {
      // Zero-balance lockout — bot runtime hands the order back to the
      // owner for MANUAL_VERIFICATION_REQUIRED and parks the wallet.
      mem.acceptingOrders = false;
      pushEvent({
        id: `evt-${Date.now()}`,
        event: "ZERO_BALANCE_LOCKOUT",
        orderId,
        balanceAfter: 0,
        lowBalance: true,
        locked: true,
        amountKobo: null,
        at: new Date(),
      });
      throw new Error("zero balance — MANUAL_VERIFICATION_REQUIRED");
    }
    mem.balanceCredits -= 1;
    mem.transactions.unshift({
      id: `tx-${Date.now()}`,
      type: "consume",
      amount: -1,
      balanceAfter: mem.balanceCredits,
      reference: orderId,
      meta: { reason, source: "PAYMENT_VERIFIED" },
      createdAt: new Date(),
    });
    const low = mem.balanceCredits < mem.lowThreshold;
    pushEvent({
      id: `evt-${Date.now()}`,
      event: "PAYMENT_VERIFIED",
      orderId,
      balanceAfter: mem.balanceCredits,
      lowBalance: low,
      locked: false,
      amountKobo: unitKoboForTier(tierForBase(mem.baseMonthly)),
      at: new Date(),
    });
    const wallet = (await getWallet(ctx, merchantId)) as WalletState;
    return { wallet, lowBalance: low, locked: false };
  }
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { merchantId } });
    if (!wallet) throw new Error("merchant wallet not found");
    if (wallet.balanceCredits <= 0) {
      await tx.wallet.update({ where: { id: wallet.id }, data: { acceptingOrders: false } });
      pushEvent({
        id: `evt-${Date.now()}`,
        event: "ZERO_BALANCE_LOCKOUT",
        orderId,
        balanceAfter: 0,
        lowBalance: true,
        locked: true,
        amountKobo: null,
        at: new Date(),
      });
      throw new Error("zero balance — MANUAL_VERIFICATION_REQUIRED");
    }
    const next = wallet.balanceCredits - 1;
    await tx.wallet.update({ where: { id: wallet.id }, data: { balanceCredits: next } });
    await tx.creditTransaction.create({
      data: {
        walletId: wallet.id,
        type: "consume",
        amount: -1,
        balanceAfter: next,
        reference: orderId,
        meta: { reason, source: "PAYMENT_VERIFIED" },
      },
    });
    pushEvent({
      id: `evt-${Date.now()}`,
      event: "PAYMENT_VERIFIED",
      orderId,
      balanceAfter: next,
      lowBalance: next < wallet.lowThreshold,
      locked: false,
      amountKobo: unitKoboForTier(tierForBase(60_000)),
      at: new Date(),
    });
    const fresh = (await getWallet(ctx, merchantId)) as WalletState;
    return { wallet: fresh, lowBalance: next < wallet.lowThreshold, locked: false };
  });
}

/**
 * Returns the merchant's tier label based on the active plan base price.
 * Tier thresholds live in `lib/pricing.ts` so the dashboard and landing
 * page share one ladder.
 */
export function tierForBase(baseMonthly: number): "emerging" | "scaling" | "enterprise" {
  if (baseMonthly >= 95_000) return "enterprise";
  if (baseMonthly >= 25_000) return "scaling";
  return "emerging";
}
