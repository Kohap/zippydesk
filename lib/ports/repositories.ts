import type { ApprovalEvent, Order, OrderItem, PaymentRecord, RefundRecord } from "../domain/types";
import type { OrderStatus } from "../domain/status";

export interface NewOrder {
  id: string;
  customerWaId: string;
  vendorId: string;
}

export interface OrdersRepo {
  create(input: NewOrder): Promise<Order>;
  getById(id: string): Promise<Order | null>;
  getActiveByCustomerAndVendor(customerWaId: string, vendorId: string): Promise<Order | null>;
  listByStatus(status: OrderStatus): Promise<Order[]>;
  /**
   * Atomic guarded transition: UPDATE ... WHERE id = ? AND status = expected.
   * Resolves false when the guard fails (stale/duplicate event) and nothing changes.
   */
  guardTransition(id: string, expectedStatus: OrderStatus, patch: Partial<Order>): Promise<boolean>;
}

export interface ItemsRepo {
  getByVendor(vendorId: string): Promise<Array<{ sku: string; name: string; priceKobo: number; stock: number; active: boolean }>>;
  /**
   * Atomic: decrement stock for every item or none (TOCTOU guard).
   * Returns the number of items successfully decremented; the caller
   * compares against items.length to detect the out-of-stock case.
   */
  atomicDecrement(vendorId: string, items: OrderItem[]): Promise<number>;
  /**
   * Compensation: restore stock for items that a failed approval already
   * decremented (partial rollback of atomically reserved stock).
   */
  restoreStock(vendorId: string, items: OrderItem[]): Promise<void>;
}

export interface ConsumeCreditResult {
  ok: boolean;
  /** True when the wallet hit a zero/stale balance and consumption was rejected. */
  locked: boolean;
  balanceAfter: number;
}

export interface WalletRepo {
  /**
   * Atomic credit draw. Never overdraws live balances; rejects (locked=true)
   * underfunded wallets. Used for billable units: one vision call on a
   * verified receipt (default 1 credit).
   */
  consumeCredit(merchantId: string, orderId: string, reason: string, amount?: number): Promise<ConsumeCreditResult>;
  getBalance(merchantId: string): Promise<number>;
}

export interface ManualReviewRef {
  orderId: string;
  vendorId: string;
  customerWaId: string;
  senderWaId: string;
  mediaMsgId: string;
  notes: string;
  createdAt: Date;
}

export interface ManualReviewRepo {
  save(ref: ManualReviewRef): Promise<void>;
  consume(orderId: string): Promise<ManualReviewRef | null>;
  listPending(): Promise<ManualReviewRef[]>;
}

export interface PaymentsRepo {
  save(payment: PaymentRecord): Promise<void>;
  findByReceiptMsgId(receiptMsgId: string): Promise<PaymentRecord | null>;
  listByOrder(orderId: string): Promise<PaymentRecord[]>;
}

export interface EventsRepo {
  append(event: ApprovalEvent): Promise<void>;
  listByOrder(orderId: string): Promise<ApprovalEvent[]>;
}

export interface RefundsRepo {
  create(order: Order): Promise<void>;
  confirmOwner(orderId: string): Promise<boolean>;
  listByStatus(status: "pending" | "refunded"): Promise<RefundRecord[]>;
}

export interface IngestedRepo {
  exists(msgId: string): Promise<boolean>;
  save(msgId: string, waId: string, status: string): Promise<void>;
}

export interface Repositories {
  orders: OrdersRepo;
  items: ItemsRepo;
  payments: PaymentsRepo;
  events: EventsRepo;
  refunds: RefundsRepo;
  ingested: IngestedRepo;
  wallet: WalletRepo;
  manualReviews: ManualReviewRepo;
}