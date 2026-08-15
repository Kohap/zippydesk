import { describe, expect, it, afterEach } from "vitest";
import { buildContext } from "../lib/context";
import { actOnOrder, dashboardData, orderDetail, listAllOrders, validateVisionJson } from "../lib/api/dashboard";
import { createSessionToken, verifySessionToken } from "../lib/auth/session";
import { getSessionMerchantId } from "../lib/auth/route";
import type { AppContext } from "../lib/context";

async function setup() {
  const ctx = buildContext({} as NodeJS.ProcessEnv);
  ctx.vision = { extractReceipt: async () => ({ narration: null, amountKobo: null, senderName: null, isSuccessful: false, confidence: 0, errorReason: null }) } as never;
  const vendor = ctx.config.vendors[0];
  if (!vendor) throw new Error("no vendors in config");
  const owner = vendor.escalation.find((e) => e.role === "owner");
  if (!owner) throw new Error("no owner in demo config");
  const orderId = await seedApprovedPendingOrder(ctx, vendor.id);
  return { ctx, vendor, owner, orderId };
}

async function seedApprovedPendingOrder(ctx: AppContext, vendorId: string): Promise<string> {
  const id = `T-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await ctx.repos.orders.create({ id, customerWaId: "2348012222222", vendorId });
  const ok = await ctx.repos.orders.guardTransition(id, "ORDER_PENDING_PAYMENT", {
    status: "PENDING_APPROVAL",
    cartLocked: true,
    totalKobo: 500_000,
    amountPaidKobo: 500_000,
    balanceDueKobo: 0,
  });
  expect(ok).toBe(true);
  return id;
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.__zippydesk_mem_wallets__;
});

describe("session auth", () => {
  it("round-trips a signed session token", () => {
    const token = createSessionToken("merchant-parfait");
    const session = verifySessionToken(token);
    expect(session?.merchantId).toBe("merchant-parfait");
  });

  it("rejects tampered tokens", () => {
    const token = createSessionToken("merchant-parfait");
    const [body, sig] = token.split(".");
    const tampered = `${body}.${sig === undefined ? "" : sig.slice(0, -1)}x`;
    expect(verifySessionToken(tampered)).toBeNull();
    expect(verifySessionToken("garbage")).toBeNull();
    expect(verifySessionToken(null)).toBeNull();
  });

  it("extracts the merchant id from a request cookie header", () => {
    const token = createSessionToken("merchant-parfait");
    const req = new Request("http://localhost/api/dashboard", { headers: { cookie: `zd_session=${token}` } });
    expect(getSessionMerchantId(req)).toBe("merchant-parfait");
    const noCookie = new Request("http://localhost/api/dashboard");
    expect(getSessionMerchantId(noCookie)).toBeNull();
  });
});

describe("dashboard data", () => {
  it("assembles KPIs, queue and vision audit for the seeded merchant", async () => {
    const { ctx, vendor, orderId } = await setup();
    await ctx.repos.payments.save({
      id: "p-vision",
      orderId,
      amountKobo: 500_000,
      narration: `GFT-A3-${orderId}`,
      visionJson: { narration: `GFT-A3-${orderId}`, amountKobo: 500_000, isSuccessful: true, confidence: 0.92 },
      receiptMsgId: "receipt-vision-1",
      verdict: "applied",
      validationMs: 2400,
      createdAt: new Date(),
    });
    const data = await dashboardData(ctx, "merchant-parfait");
    expect(data).not.toBeNull();
    expect(data!.merchant.name).toBe("Parfait Palace");
    expect(data!.vendors[0]!.id).toBe(vendor.id);
    expect(data!.wallet.balanceCredits).toBe(18);
    expect(data!.queue.some((q) => q.orderId === orderId && q.kind === "approval")).toBe(true);
    expect(data!.kpis.fuelTank).toBe(18);
    expect(data!.visionAudit[0]!.schemaValid).toBe(true);
    expect(data!.visionAudit[0]!.validationMs).toBe(2400);
  });

  it("flags schema-missing vision json as invalid", () => {
    expect(validateVisionJson({ narration: "x", amountKobo: 5, isSuccessful: true, confidence: 0.9 }).valid).toBe(true);
    const check = validateVisionJson({ narration: "x", confidence: -1 });
    expect(check.valid).toBe(false);
    expect(check.missing).toContain("amountKobo");
    expect(check.missing).toContain("isSuccessful");
  });

  it("returns null for an unknown merchant in-memory", async () => {
    const { ctx } = await setup();
    const data = await dashboardData(ctx, "merchant-nope");
    expect(data).toBeNull();
  });

  it("lists orders scoped to the merchant vendor ids, newest first", async () => {
    const { ctx, vendor } = await setup();
    const older = await seedApprovedPendingOrder(ctx, vendor.id);
    const orders = await listAllOrders(ctx, [vendor.id]);
    const ids = orders.map((o) => o.id);
    expect(ids).toContain(older);
    const unseen = await listAllOrders(ctx, ["ZZ"]);
    expect(unseen).toHaveLength(0);
  });
});

describe("order actions", () => {
  it("approves a pending order as owner", async () => {
    const { ctx, orderId } = await setup();
    const res = await actOnOrder(ctx, orderId, "approve");
    expect(res.status).toBe("APPROVED");
    expect((await ctx.repos.orders.listByStatus("APPROVED")).length).toBe(1);
  });

  it("rejects then confirms a refund", async () => {
    const { ctx, orderId } = await setup();
    const rej = await actOnOrder(ctx, orderId, "reject");
    expect(rej.status).toBe("PENDING_REFUND");
    const done = await actOnOrder(ctx, orderId, "refund-confirm");
    expect(done.status).toBe("REFUNDED");
  });

  it("repeated approve is an idempotent no-op", async () => {
    const { ctx, orderId } = await setup();
    await actOnOrder(ctx, orderId, "approve");
    const again = await actOnOrder(ctx, orderId, "approve");
    expect(again.ok).toBe(false);
    expect(again.status).toBe("APPROVED");
  });

  it("404s on unknown order", async () => {
    const { ctx } = await setup();
    const res = await actOnOrder(ctx, "zzz", "approve");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("order not found");
  });

  it("returns order detail with payments and events", async () => {
    const { ctx, orderId } = await setup();
    await ctx.repos.payments.save({
      id: "p2",
      orderId,
      amountKobo: 100_000,
      narration: "GFT-A3-0001",
      visionJson: {},
      receiptMsgId: "msg-1",
      verdict: "applied",
      createdAt: new Date(),
    });
    const detail = await orderDetail(ctx, orderId);
    expect(detail?.order.id).toBe(orderId);
    expect(detail?.payments).toHaveLength(1);
    expect(detail?.refund).toBeNull();
    const missing = await orderDetail(ctx, "nope");
    expect(missing).toBeNull();
  });
});

describe("wallet", () => {
  it("top-ups book a transaction and move the balance", async () => {
    const { ctx } = await setup();
    const { getWallet, topUpWallet } = await import("../lib/api/wallet");
    const before = (await getWallet(ctx, "merchant-parfait"))!;
    const after = await topUpWallet(ctx, "merchant-parfait", 50, "card", null);
    expect(after.balanceCredits).toBe(before.balanceCredits + 50);
    expect(after.transactions[0]!.type).toBe("topup");
    expect(after.transactions[0]!.reference).toMatch(/^pyk_/);
    expect(after.transactions[0]!.meta).toMatchObject({ method: "card" });
  });

  it("rejects non-positive top-ups", async () => {
    const { ctx } = await setup();
    const { topUpWallet } = await import("../lib/api/wallet");
    await expect(topUpWallet(ctx, "merchant-parfait", 0, "card", null)).rejects.toThrow("positive");
    await expect(topUpWallet(ctx, "merchant-parfait", -5, "card", null)).rejects.toThrow("positive");
  });

  it("auto-recharge persists the chosen amount", async () => {
    const { ctx } = await setup();
    const { setAutoRecharge } = await import("../lib/api/wallet");
    const after = await setAutoRecharge(ctx, "merchant-parfait", true, 250);
    expect(after.autoRecharge).toBe(true);
    expect(after.autoRechargeAmount).toBe(250);
    const off = await setAutoRecharge(ctx, "merchant-parfait", false);
    expect(off.autoRecharge).toBe(false);
  });
});