import type { ApprovalEvent, Order, OrderItem, PaymentRecord, RefundRecord, VendorItem } from "../domain/types";
import type { OrderStatus } from "../domain/status";
import type {
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
import type { Messenger, OutboundImage } from "../ports/messenger";
import type { VisionExtractor, VisionReceipt } from "../ports/vision";
import type { Scheduler, SchedulerHandlers } from "../ports/scheduler";
import { hydrateVendorConfig, type VendorConfigFile } from "../domain/config";

let seq = 0;
const nextId = () => String(++seq);

export class InMemoryOrdersRepo implements OrdersRepo {
  private orders = new Map<string, Order>();

  async create(input: NewOrder): Promise<Order> {
    const now = new Date();
    const order: Order = {
      id: input.id,
      customerWaId: input.customerWaId,
      vendorId: input.vendorId,
      items: [],
      cartLocked: false,
      totalKobo: 0,
      amountPaidKobo: 0,
      balanceDueKobo: 0,
      status: "ORDER_PENDING_PAYMENT",
      escalationLevel: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);
    return order;
  }

  async getById(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async getActiveByCustomerAndVendor(customerWaId: string, vendorId: string): Promise<Order | null> {
    for (const o of this.orders.values()) {
      if (o.customerWaId === customerWaId && o.vendorId === vendorId && !["APPROVED", "REFUNDED", "CANCELLED"].includes(o.status)) {
        return o;
      }
    }
    return null;
  }

  async listByStatus(status: OrderStatus): Promise<Order[]> {
    return [...this.orders.values()].filter((o) => o.status === status);
  }

  async guardTransition(id: string, expectedStatus: OrderStatus, patch: Partial<Order>): Promise<boolean> {
    const order = this.orders.get(id);
    if (!order || order.status !== expectedStatus) return false;
    Object.assign(order, patch, { updatedAt: new Date() });
    return true;
  }
}

export class InMemoryItemsRepo implements ItemsRepo {
  private items: Array<VendorItem & { vendorId: string }>;

  constructor(config: VendorConfigFile) {
    this.items = hydrateVendorConfig(config).vendors.flatMap((v) =>
      v.items.map((i) => ({ ...i, vendorId: v.id })),
    );
  }

  async getByVendor(vendorId: string) {
    return this.items.filter((i) => i.vendorId === vendorId && i.active);
  }

  async atomicDecrement(vendorId: string, items: OrderItem[]): Promise<number> {
    for (const it of items) {
      const row = this.items.find((v) => v.vendorId === vendorId && v.sku === it.sku);
      if (!row || row.stock < it.qty) return 0;
    }
    for (const it of items) {
      const row = this.items.find((v) => v.vendorId === vendorId && v.sku === it.sku);
      if (row) row.stock -= it.qty;
    }
    return items.length;
  }

  async restoreStock(vendorId: string, items: OrderItem[]): Promise<void> {
    for (const it of items) {
      const row = this.items.find((v) => v.vendorId === vendorId && v.sku === it.sku);
      if (row) row.stock += it.qty;
    }
  }
}

export class InMemoryWalletRepo implements WalletRepo {
  private balances = new Map<string, number>();

  constructor(seed: Record<string, number>) {
    for (const [merchantId, balance] of Object.entries(seed)) this.balances.set(merchantId, balance);
  }

  async getBalance(merchantId: string): Promise<number> {
    return this.balances.get(merchantId) ?? 0;
  }

  setBalance(merchantId: string, balance: number): void {
    this.balances.set(merchantId, balance);
  }

  async consumeCredit(merchantId: string, _orderId: string, _reason: string, amount = 1) {
    const balance = this.balances.get(merchantId) ?? 0;
    if (balance < amount) return { ok: false, locked: true, balanceAfter: balance };
    this.balances.set(merchantId, balance - amount);
    return { ok: true, locked: false, balanceAfter: balance - amount };
  }
}

export class InMemoryManualReviewRepo implements ManualReviewRepo {
  private pending = new Map<string, ManualReviewRef>();

  async save(ref: ManualReviewRef): Promise<void> {
    this.pending.set(ref.orderId, ref);
  }

  async consume(orderId: string): Promise<ManualReviewRef | null> {
    const ref = this.pending.get(orderId);
    if (!ref) return null;
    this.pending.delete(orderId);
    return ref;
  }

  async listPending(): Promise<ManualReviewRef[]> {
    return [...this.pending.values()];
  }
}

export class InMemoryPaymentsRepo implements PaymentsRepo {
  private payments = new Map<string, PaymentRecord>();

  async save(payment: PaymentRecord): Promise<void> {
    this.payments.set(payment.receiptMsgId, payment);
  }

  async findByReceiptMsgId(receiptMsgId: string): Promise<PaymentRecord | null> {
    return this.payments.get(receiptMsgId) ?? null;
  }

  async listByOrder(orderId: string): Promise<PaymentRecord[]> {
    return [...this.payments.values()].filter((p) => p.orderId === orderId);
  }
}

export class InMemoryEventsRepo implements EventsRepo {
  private events: ApprovalEvent[] = [];

  async append(event: ApprovalEvent): Promise<void> {
    this.events.push(event);
  }

  async listByOrder(orderId: string): Promise<ApprovalEvent[]> {
    return this.events.filter((e) => e.orderId === orderId);
  }
}

export class InMemoryRefundsRepo implements RefundsRepo {
  private refunds = new Map<string, RefundRecord>();

  async create(order: Order): Promise<void> {
    this.refunds.set(order.id, {
      id: nextId(),
      orderId: order.id,
      amountKobo: order.amountPaidKobo,
      status: "pending",
      ownerConfirmedAt: null,
    });
  }

  async confirmOwner(orderId: string): Promise<boolean> {
    const r = this.refunds.get(orderId);
    if (!r || r.status !== "pending") return false;
    r.status = "refunded";
    r.ownerConfirmedAt = new Date();
    return true;
  }

  async listByStatus(status: "pending" | "refunded"): Promise<RefundRecord[]> {
    return [...this.refunds.values()].filter((r) => r.status === status);
  }
}

export class InMemoryIngestedRepo implements IngestedRepo {
  private ingested = new Map<string, { waId: string; status: string }>();

  async exists(msgId: string): Promise<boolean> {
    return this.ingested.has(msgId);
  }

  async save(msgId: string, waId: string, status: string): Promise<void> {
    this.ingested.set(msgId, { waId, status });
  }
}

export function makeInMemoryRepositories(config: VendorConfigFile): Repositories {
  return {
    orders: new InMemoryOrdersRepo(),
    items: new InMemoryItemsRepo(config),
    payments: new InMemoryPaymentsRepo(),
    events: new InMemoryEventsRepo(),
    refunds: new InMemoryRefundsRepo(),
    ingested: new InMemoryIngestedRepo(),
    wallet: new InMemoryWalletRepo(defaultWalletSeed(config)),
    manualReviews: new InMemoryManualReviewRepo(),
  };
}

/** Demo/test seed: every merchant referenced by the config starts well funded. */
export function defaultWalletSeed(config: VendorConfigFile): Record<string, number> {
  const seed: Record<string, number> = {};
  for (const v of hydrateVendorConfig(config).vendors) seed[v.merchantId] = 100_000;
  return seed;
}

export class RecordingMessenger implements Messenger {
  sent: Array<{ type: string; waId: string; payload: unknown }> = [];

  async sendText(waId: string, text: string): Promise<void> {
    this.sent.push({ type: "text", waId, payload: { text } });
  }

  async sendButtons(waId: string, body: string, rows: Array<{ id: string; title: string }>): Promise<void> {
    this.sent.push({ type: "buttons", waId, payload: { body, rows } });
  }

  async sendTemplate(waId: string, templateName: string, components: unknown): Promise<void> {
    this.sent.push({ type: "template", waId, payload: { templateName, components } });
  }

  async sendImage(waId: string, image: OutboundImage): Promise<void> {
    this.sent.push({ type: "image", waId, payload: { mimeType: image.mimeType, caption: image.caption, bytes: image.bytes } });
  }
}

export class StubVisionExtractor implements VisionExtractor {
  constructor(private next: () => Partial<VisionReceipt>) {}

  static receipt(json: string): StubVisionExtractor {
    const parsed = JSON.parse(json) as Partial<VisionReceipt>;
    return new StubVisionExtractor(() => parsed);
  }

  async extractReceipt(_imageBytes: Buffer): Promise<VisionReceipt> {
    const result = this.next();
    return {
      narration: null,
      amountKobo: null,
      senderName: null,
      isSuccessful: false,
      confidence: 0,
      errorReason: null,
      ...result,
    };
  }
}

export class InMemoryScheduler implements Scheduler {
  private handlers: SchedulerHandlers | null = null;
  private timers = new Map<string, { kind: "approval" | "payment_ttl"; timer: NodeJS.Timeout }>();

  setHandlers(handlers: SchedulerHandlers): void {
    this.handlers = handlers;
  }

  async scheduleApproval(orderId: string, afterMs: number): Promise<void> {
    this.set(orderId, "approval", afterMs);
  }

  async schedulePaymentTtl(orderId: string, afterMs: number): Promise<void> {
    this.set(orderId, "payment_ttl", afterMs);
  }

  async cancelOrder(orderId: string): Promise<void> {
    this.clear(orderId);
  }

  async close(): Promise<void> {
    for (const entry of this.timers.values()) clearTimeout(entry.timer);
    this.timers.clear();
  }

  pendingCount(): number {
    return this.timers.size;
  }

  /** Test/demo helper: fire a pending timer immediately, as if it elapsed. */
  async fireNow(orderId: string): Promise<void> {
    const entry = this.timers.get(orderId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.timers.delete(orderId);
    await this.fire(entry.kind, orderId);
  }

  private set(orderId: string, kind: "approval" | "payment_ttl", afterMs: number): void {
    this.clear(orderId);
    const timer = setTimeout(() => {
      this.timers.delete(orderId);
      void this.fire(kind, orderId);
    }, afterMs);
    timer.unref();
    this.timers.set(orderId, { kind, timer });
  }

  private clear(orderId: string): void {
    const entry = this.timers.get(orderId);
    if (entry) {
      clearTimeout(entry.timer);
      this.timers.delete(orderId);
    }
  }

  private async fire(kind: "approval" | "payment_ttl", orderId: string): Promise<void> {
    if (kind === "approval") await this.handlers?.onApprovalTimer(orderId);
    else await this.handlers?.onPaymentTtl(orderId);
  }
}