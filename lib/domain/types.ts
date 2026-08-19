import type { ActorKind, OrderStatus } from "./status";

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  unitKobo: number;
}

export interface Order {
  id: string;
  customerWaId: string;
  vendorId: string;
  items: OrderItem[];
  cartLocked: boolean;
  totalKobo: number;
  amountPaidKobo: number;
  balanceDueKobo: number;
  status: OrderStatus;
  escalationLevel: 0 | 1;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorItem {
  sku: string;
  name: string;
  priceKobo: number;
  stock: number;
  active: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  bankAccount: string;
  narrationPrefix: string;
  escalation: Array<{ role: "owner" | "assistant"; waId: string }>;
  timers: { approvalMinutes: number; paymentTtlHours: number };
  items: VendorItem[];
}

export type PaymentVerdict =
  | "applied"
  | "partial"
  | "overpayment"
  | "unmatched"
  | "duplicate"
  | "manual";

export interface PaymentRecord {
  id: string;
  orderId: string;
  amountKobo: number;
  narration: string;
  visionJson: unknown;
  receiptMsgId: string;
  verdict: PaymentVerdict;
  validationMs?: number | null;
  createdAt: Date;
}

export interface ApprovalEvent {
  id: string;
  orderId: string;
  actor: ActorKind;
  action: string;
  at: Date;
}

export interface RefundRecord {
  id: string;
  orderId: string;
  amountKobo: number;
  status: "pending" | "refunded";
  ownerConfirmedAt: Date | null;
}