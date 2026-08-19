import type { AppContext } from "../context";
import type { Order } from "../domain/types";
import type { OrderStatus } from "../domain/status";
import type { MerchantBundle } from "./merchants";
import type { WalletState } from "./wallet";

import { maskWaId } from "../security/pii";

export type { WalletState } from "./wallet";

export interface OrderSummary extends Order {
  vendorName: string;
}

const ALL_STATUSES = [
  "ORDER_PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PENDING_APPROVAL",
  "APPROVED",
  "FAILED_OUT_OF_STOCK",
  "PENDING_REFUND",
  "REFUNDED",
  "CANCELLED",
] as const;

const ACTIVE_STATUSES: readonly OrderStatus[] = ["ORDER_PENDING_PAYMENT", "PARTIALLY_PAID", "PENDING_APPROVAL"];

export async function listAllOrders(ctx: AppContext, vendorIds: readonly string[]): Promise<OrderSummary[]> {
  const out: OrderSummary[] = [];
  for (const status of ALL_STATUSES) {
    for (const order of await ctx.repos.orders.listByStatus(status)) {
      if (!vendorIds.includes(order.vendorId)) continue;
      out.push({ ...order, vendorName: order.vendorId });
    }
  }
  return out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function orderDetail(
  ctx: AppContext,
  orderId: string,
): Promise<{ order: OrderSummary; payments: Awaited<ReturnType<typeof ctx.repos.payments.listByOrder>>; events: Awaited<ReturnType<typeof ctx.repos.events.listByOrder>>; refund: Awaited<ReturnType<typeof ctx.repos.refunds.listByStatus>>[number] | null } | null> {
  const order = await ctx.repos.orders.getById(orderId);
  if (!order) return null;
  const [payments, events, refunds] = await Promise.all([
    ctx.repos.payments.listByOrder(order.id),
    ctx.repos.events.listByOrder(order.id),
    ctx.repos.refunds.listByStatus("pending"),
  ]);
  return {
    order: { ...order, vendorName: order.vendorId },
    payments,
    events,
    refund: refunds.find((r) => r.orderId === order.id) ?? null,
  };
}

export type OrderAction = "approve" | "reject" | "refund-confirm";

export async function actOnOrder(ctx: AppContext, orderId: string, action: OrderAction): Promise<{ ok: boolean; status?: string; reason?: string }> {
  const order = await ctx.repos.orders.getById(orderId);
  if (!order) return { ok: false, reason: "order not found" };
  const vendor = ctx.config.vendors.find((v) => v.id === order.vendorId);
  const owner = vendor?.escalation.find((e) => e.role === "owner");
  if (!owner) return { ok: false, reason: "vendor has no owner configured" };
  if (action === "approve") await ctx.service.approve(orderId, owner.waId);
  if (action === "reject") await ctx.service.reject(orderId, owner.waId);
  if (action === "refund-confirm") await ctx.service.refundDone(orderId, owner.waId);
  const after = await ctx.repos.orders.getById(orderId);
  return { ok: after?.status !== order.status, ...(after?.status ? { status: after.status } : {}) };
}

export interface DashboardData {
  merchant: MerchantBundle["merchant"];
  vendors: MerchantBundle["vendors"];
  wallet: WalletState;
  orders: OrderSummary[];
  queue: Array<{ orderId: string; kind: "approval" | "refund"; dueAt: Date | null; escalationLevel: number }>;
  kpis: {
    fuelTank: number;
    revenueTodayKobo: number;
    ordersToday: number;
    avgValidationMs: number | null;
  };
  visionAudit: Array<{
    orderId: string;
    receiptMsgId: string;
    amountKobo: number;
    narration: string;
    confidence: number;
    validationMs: number | null;
    schemaValid: boolean;
    missing: string[];
    createdAt: Date;
  }>;
  meta: AppContext["meta"];
}

export function validateVisionJson(json: unknown): { valid: boolean; missing: string[] } {
  const j = json as Record<string, unknown>;
  if (!j || typeof j !== "object") return { valid: false, missing: ["visionJson"] };
  const missing: string[] = [];
  if (typeof j.narration !== "string") missing.push("narration");
  if (typeof j.amountKobo !== "number" || (j.amountKobo as number) <= 0) missing.push("amountKobo");
  if (typeof j.isSuccessful !== "boolean") missing.push("isSuccessful");
  if (typeof j.confidence !== "number" || j.confidence < 0 || j.confidence > 1) missing.push("confidence");
  return { valid: missing.length === 0, missing };
}

export async function dashboardData(ctx: AppContext, merchantId: string): Promise<DashboardData | null> {
  const bundle = await loadBundle(ctx, merchantId);
  if (!bundle) return null;
  const wallet = await loadWallet(ctx, merchantId);
  if (!wallet) throw new Error("merchant wallet not found");
  const vendorIds = bundle.vendors.map((v) => v.id);
  const orders = await listAllOrders(ctx, vendorIds);
  const ordersToday = orders.filter(
    (o) => o.createdAt >= startOfToday() && o.status !== "CANCELLED" && o.status !== "INTAKE",
  ).length;
  const revenueTodayKobo = orders
    .filter((o) => o.createdAt >= startOfToday() && (o.status === "APPROVED" || o.status === "REFUNDED"))
    .reduce((sum, o) => sum + o.totalKobo, 0);

  let validations: number[] = [];
  let visionAudit: DashboardData["visionAudit"] = [];
  for (const order of orders) {
    for (const payment of await ctx.repos.payments.listByOrder(order.id)) {
      if (payment.createdAt >= startOfToday() && payment.validationMs != null) validations.push(payment.validationMs);
      const check = validateVisionJson(payment.visionJson);
      visionAudit.push({
        orderId: order.id,
        receiptMsgId: payment.receiptMsgId,
        amountKobo: payment.amountKobo,
        narration: payment.narration,
        confidence: Number((payment.visionJson as Record<string, unknown>)?.confidence ?? 0),
        validationMs: payment.validationMs ?? null,
        schemaValid: check.valid,
        missing: check.missing,
        createdAt: payment.createdAt,
      });
    }
  }
  visionAudit.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const queue: DashboardData["queue"] = [];
  for (const order of orders) {
    if (order.status === "PENDING_APPROVAL") {
      const vendor = bundle.vendors.find((v) => v.id === order.vendorId);
      const events = await ctx.repos.events.listByOrder(order.id);
      const last = events.at(-1);
      const minutes = vendor?.timers.approvalMinutes ?? 5;
      queue.push({
        orderId: order.id,
        kind: "approval",
        dueAt: last ? new Date(last.at.getTime() + minutes * 60_000) : null,
        escalationLevel: order.escalationLevel,
      });
    }
    if (order.status === "PENDING_REFUND") {
      const refunds = await ctx.repos.refunds.listByStatus("pending");
      if (refunds.some((r) => r.orderId === order.id)) {
        queue.push({ orderId: order.id, kind: "refund", dueAt: null, escalationLevel: 0 });
      }
    }
  }

  return {
    merchant: bundle.merchant,
    vendors: bundle.vendors,
    wallet,
    orders: orders.map((o) => ({ ...o, customerWaId: maskWaId(o.customerWaId) })),
    queue,
    kpis: {
      fuelTank: wallet.balanceCredits,
      revenueTodayKobo,
      ordersToday,
      avgValidationMs: validations.length > 0 ? Math.round(validations.reduce((s, v) => s + v, 0) / validations.length) : null,
    },
    visionAudit,
    meta: ctx.meta,
  };
}

export async function loadBundle(ctx: AppContext, merchantId: string): Promise<MerchantBundle | null> {
  const { getMerchant } = await import("./merchants");
  return getMerchant(ctx, merchantId);
}

export async function loadWallet(ctx: AppContext, merchantId: string): Promise<WalletState | null> {
  const { getWallet } = await import("./wallet");
  return getWallet(ctx, merchantId);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function statusesNeedingAttention(): readonly OrderStatus[] {
  return ACTIVE_STATUSES;
}
