import { Prisma, PrismaClient } from "@prisma/client";
import type { OrderStatus } from "../domain/status";
import type { ApprovalEvent, Order, OrderItem, PaymentRecord, RefundRecord } from "../domain/types";
import type {
  ConsumeCreditResult,
  EventsRepo,
  IngestedRepo,
  ItemsRepo,
  ManualReviewRepo,
  ManualReviewRef,
  NewOrder,
  OrdersRepo,
  PaymentsRepo,
  RefundsRepo,
  Repositories,
  WalletRepo,
} from "../ports/repositories";

interface OrderRow {
  id: string;
  customerWaId: string;
  vendorId: string;
  items: Prisma.JsonValue;
  cartLocked: boolean;
  totalKobo: number;
  amountPaidKobo: number;
  balanceDueKobo: number;
  status: string;
  escalationLevel: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: OrderRow): Order {
  return {
    id: row.id,
    customerWaId: row.customerWaId,
    vendorId: row.vendorId,
    items: row.items as unknown as OrderItem[],
    cartLocked: row.cartLocked,
    totalKobo: row.totalKobo,
    amountPaidKobo: row.amountPaidKobo,
    balanceDueKobo: row.balanceDueKobo,
    status: row.status as OrderStatus,
    escalationLevel: row.escalationLevel === 1 ? 1 : 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMutation(patch: Partial<Order>): Prisma.OrderUpdateManyMutationInput {
  return {
    ...(patch.cartLocked !== undefined ? { cartLocked: patch.cartLocked } : {}),
    ...(patch.items ? { items: patch.items as unknown as Prisma.InputJsonValue } : {}),
    ...(patch.totalKobo !== undefined ? { totalKobo: patch.totalKobo } : {}),
    ...(patch.amountPaidKobo !== undefined ? { amountPaidKobo: patch.amountPaidKobo } : {}),
    ...(patch.balanceDueKobo !== undefined ? { balanceDueKobo: patch.balanceDueKobo } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.escalationLevel !== undefined ? { escalationLevel: patch.escalationLevel } : {}),
  };
}

export class PrismaOrdersRepo implements OrdersRepo {
  constructor(private prisma: PrismaClient) {}

  async create(input: NewOrder): Promise<Order> {
    const [row] = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('order_ref_seq') AS nextval
    `;
    const created = await this.prisma.order.create({
      data: {
        id: String(row!.nextval),
        customerWaId: input.customerWaId,
        vendorId: input.vendorId,
        items: [],
      },
    });
    return toDomain(created as unknown as OrderRow);
  }

  async getById(id: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row ? toDomain(row as unknown as OrderRow) : null;
  }

  async getActiveByCustomerAndVendor(customerWaId: string, vendorId: string): Promise<Order | null> {
    const row = await this.prisma.order.findFirst({
      where: { customerWaId, vendorId, status: { notIn: ["APPROVED", "REFUNDED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
    });
    return row ? toDomain(row as unknown as OrderRow) : null;
  }

  async listByStatus(status: OrderStatus): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({ where: { status } });
    return rows.map((r) => toDomain(r as unknown as OrderRow));
  }

  async guardTransition(id: string, expectedStatus: OrderStatus, patch: Partial<Order>): Promise<boolean> {
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: expectedStatus },
      data: { ...toMutation(patch), updatedAt: new Date() },
    });
    return count === 1;
  }
}

export class PrismaItemsRepo implements ItemsRepo {
  constructor(private prisma: PrismaClient) {}

  async getByVendor(vendorId: string) {
    return this.prisma.vendorItem.findMany({ where: { vendorId, active: true } });
  }

  async atomicDecrement(vendorId: string, items: OrderItem[]): Promise<number> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        let changed = 0;
        for (const it of items) {
          const { count } = await tx.vendorItem.updateMany({
            where: { vendorId, sku: it.sku, stock: { gte: it.qty }, active: true },
            data: { stock: { decrement: it.qty } },
          });
          changed += count;
        }
        if (changed !== items.length) throw new Error("insufficient stock");
        return changed;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "insufficient stock") return 0;
      throw err;
    }
  }

  async restoreStock(vendorId: string, items: OrderItem[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        await tx.vendorItem.updateMany({
          where: { vendorId, sku: it.sku },
          data: { stock: { increment: it.qty } },
        });
      }
    });
  }
}

export class PrismaWalletRepo implements WalletRepo {
  constructor(private prisma: PrismaClient) {}

  async getBalance(merchantId: string): Promise<number> {
    const row = await this.prisma.wallet.findUnique({ where: { merchantId } });
    return row?.balanceCredits ?? 0;
  }

  /**
   * Atomic single-credit draw. The UPDATE doubles as the lock: it only matches
   * a funded wallet, so concurrent approvals can never overdraw. When the
   * balance is empty the wallet also stops accepting orders until recharged.
   */
  async consumeCredit(merchantId: string, _orderId: string, _reason: string, amount = 1): Promise<ConsumeCreditResult> {
    const { count } = await this.prisma.wallet.updateMany({
      where: { merchantId, balanceCredits: { gte: amount } },
      data: { balanceCredits: { decrement: amount } },
    });
    const balanceAfter = await this.getBalance(merchantId);
    if (count !== 1) {
      await this.prisma.wallet.updateMany({
        where: { merchantId, acceptingOrders: true },
        data: { acceptingOrders: false, autoRecharge: false, autoRechargeAmount: 100 },
      });
      return { ok: false, locked: true, balanceAfter };
    }
    return { ok: true, locked: false, balanceAfter };
  }
}

export class PrismaPaymentsRepo implements PaymentsRepo {
  constructor(private prisma: PrismaClient) {}

  async save(payment: PaymentRecord): Promise<void> {
    await this.prisma.payment.create({
      data: {
        id: payment.id,
        orderId: payment.orderId,
        amountKobo: payment.amountKobo,
        narration: payment.narration,
        visionJson: payment.visionJson as Prisma.InputJsonValue,
        receiptMsgId: payment.receiptMsgId,
        verdict: payment.verdict,
        validationMs: payment.validationMs ?? null,
      },
    });
  }

  async findByReceiptMsgId(receiptMsgId: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findUnique({ where: { receiptMsgId } });
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.orderId,
      amountKobo: row.amountKobo,
      narration: row.narration,
      visionJson: row.visionJson,
      receiptMsgId: row.receiptMsgId,
      verdict: row.verdict as PaymentRecord["verdict"],
      validationMs: row.validationMs,
      createdAt: row.createdAt,
    };
  }

  async listByOrder(orderId: string): Promise<PaymentRecord[]> {
    const rows = await this.prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      amountKobo: row.amountKobo,
      narration: row.narration,
      visionJson: row.visionJson,
      receiptMsgId: row.receiptMsgId,
      verdict: row.verdict as PaymentRecord["verdict"],
      validationMs: row.validationMs,
      createdAt: row.createdAt,
    }));
  }
}

export class PrismaEventsRepo implements EventsRepo {
  constructor(private prisma: PrismaClient) {}

  async append(event: ApprovalEvent): Promise<void> {
    await this.prisma.approvalEvent.create({
      data: { id: event.id, orderId: event.orderId, actor: event.actor, action: event.action, at: event.at },
    });
  }

  async listByOrder(orderId: string): Promise<ApprovalEvent[]> {
    const rows = await this.prisma.approvalEvent.findMany({ where: { orderId }, orderBy: { at: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      actor: r.actor as ApprovalEvent["actor"],
      action: r.action,
      at: r.at,
    }));
  }
}

export class PrismaRefundsRepo implements RefundsRepo {
  constructor(private prisma: PrismaClient) {}

  async create(order: Order): Promise<void> {
    await this.prisma.refund.create({
      data: { id: `rf-${order.id}`, orderId: order.id, amountKobo: order.amountPaidKobo, status: "pending" },
    });
  }

  async confirmOwner(orderId: string): Promise<boolean> {
    const { count } = await this.prisma.refund.updateMany({
      where: { orderId, status: "pending" },
      data: { status: "refunded", ownerConfirmedAt: new Date() },
    });
    return count === 1;
  }

  async listByStatus(status: "pending" | "refunded"): Promise<RefundRecord[]> {
    const rows = await this.prisma.refund.findMany({ where: { status } });
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      amountKobo: r.amountKobo,
      status: r.status,
      ownerConfirmedAt: r.ownerConfirmedAt,
    }));
  }
}

export class PrismaIngestedRepo implements IngestedRepo {
  constructor(private prisma: PrismaClient) {}

  async exists(msgId: string): Promise<boolean> {
    return (await this.prisma.ingestedMessage.findUnique({ where: { msgId } })) !== null;
  }

  async save(msgId: string, waId: string, status: string): Promise<void> {
    await this.prisma.ingestedMessage.upsert({
      where: { msgId },
      create: { msgId, waId, direction: "in", status },
      update: { status },
    });
  }
}

export class PrismaManualReviewRepo implements ManualReviewRepo {
  constructor(private prisma: PrismaClient) {}

  async save(ref: ManualReviewRef): Promise<void> {
    await this.prisma.manualReview.create({
      data: {
        orderId: ref.orderId,
        vendorId: ref.vendorId,
        customerWaId: ref.customerWaId,
        senderWaId: ref.senderWaId,
        mediaMsgId: ref.mediaMsgId,
        notes: ref.notes,
      },
    });
  }

  async consume(orderId: string): Promise<ManualReviewRef | null> {
    const [row] = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.manualReview.findMany({
        where: { orderId },
        take: 1,
        orderBy: { createdAt: "asc" },
      });
      if (!rows[0]) return [] as never[];
      await tx.manualReview.deleteMany({ where: { orderId } });
      return rows;
    });
    if (!row) return null;
    return {
      orderId: row.orderId,
      vendorId: row.vendorId,
      customerWaId: row.customerWaId,
      senderWaId: row.senderWaId,
      mediaMsgId: row.mediaMsgId,
      notes: row.notes,
      createdAt: row.createdAt,
    };
  }

  async listPending(): Promise<ManualReviewRef[]> {
    const rows = await this.prisma.manualReview.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({
      orderId: r.orderId,
      vendorId: r.vendorId,
      customerWaId: r.customerWaId,
      senderWaId: r.senderWaId,
      mediaMsgId: r.mediaMsgId,
      notes: r.notes,
      createdAt: r.createdAt,
    }));
  }
}

export function makePrismaRepositories(databaseUrl: string): Repositories {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  return {
    orders: new PrismaOrdersRepo(prisma),
    items: new PrismaItemsRepo(prisma),
    payments: new PrismaPaymentsRepo(prisma),
    events: new PrismaEventsRepo(prisma),
    refunds: new PrismaRefundsRepo(prisma),
    ingested: new PrismaIngestedRepo(prisma),
    wallet: new PrismaWalletRepo(prisma),
    manualReviews: new PrismaManualReviewRepo(prisma),
  };
}

/**
 * Idempotent billing bootstrap: ensures a Merchant + Wallet row exists for
 * every vendor configured in the app, so a fresh database starts funded
 * (100k credits) instead of silently routing every receipt into the manual
 * wallet-empty fallback.
 */
export async function bootstrapPrismaBilling(databaseUrl: string, vendors: Array<{ merchantId: string; name: string }>): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    for (const v of vendors) {
      await prisma.merchant.upsert({
        where: { id: v.merchantId },
        create: {
          id: v.merchantId,
          slug: v.merchantId,
          name: v.name,
          businessType: "retail",
          phone: "",
        },
        update: {},
      });
      await prisma.wallet.upsert({
        where: { merchantId: v.merchantId },
        create: {
          merchantId: v.merchantId,
          balanceCredits: 100_000,
          lowThreshold: 20,
          autoRecharge: false,
          autoRechargeAmount: 100,
          acceptingOrders: true,
        },
        update: {},
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}