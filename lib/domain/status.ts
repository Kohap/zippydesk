export const ORDER_STATUSES = [
  "INTAKE",
  "ORDER_PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PENDING_APPROVAL",
  "APPROVED",
  "FAILED_OUT_OF_STOCK",
  "PENDING_REFUND",
  "REFUNDED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const EVENT_KINDS = [
  "VENDOR_SELECTED",
  "PAYMENT_APPLIED",
  "PAYMENT_TTL",
  "CUSTOMER_CANCEL",
  "OWNER_APPROVE",
  "OWNER_REJECT",
  "ASSISTANT_APPROVE",
  "ASSISTANT_REJECT",
  "TIMER_FIRE",
  "REFUND_PROTOCOL_START",
  "OWNER_REFUND_DONE",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export type ActorKind = "owner" | "assistant" | "customer" | "system";

export const isOrderStatus = (v: string): v is OrderStatus =>
  (ORDER_STATUSES as readonly string[]).includes(v);