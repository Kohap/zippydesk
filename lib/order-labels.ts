import type { OrderStatus } from "@/lib/domain/status";

export interface ReceiptStatus {
  label: string;
  variant: "neutral" | "good" | "warn" | "bad" | "brand";
}

export function receiptStatus(status: OrderStatus, escalationLevel: 0 | 1): ReceiptStatus {
  switch (status) {
    case "PENDING_APPROVAL":
      return { label: escalationLevel === 1 ? "Escalated to assistant" : "Receipt verified", variant: "brand" };
    case "MANUAL_VERIFICATION_REQUIRED":
      return { label: "Manual verification", variant: "warn" };
    case "ORDER_PENDING_PAYMENT":
      return { label: "Awaiting payment", variant: "neutral" };
    case "PARTIALLY_PAID":
      return { label: "Partial payment", variant: "warn" };
    case "APPROVED":
      return { label: "Approved", variant: "good" };
    case "FAILED_OUT_OF_STOCK":
      return { label: "Failed capacity", variant: "bad" };
    case "PENDING_REFUND":
      return { label: "Refund pending", variant: "warn" };
    case "REFUNDED":
      return { label: "Refunded", variant: "neutral" };
    case "CANCELLED":
      return { label: "Cancelled", variant: "neutral" };
    default:
      return { label: status, variant: "neutral" };
  }
}

export function assignedActor(status: OrderStatus, escalationLevel: 0 | 1): string {
  if (status === "PENDING_APPROVAL") return escalationLevel === 1 ? "Assistant" : "Owner";
  if (status === "MANUAL_VERIFICATION_REQUIRED") return "Owner";
  if (status === "PENDING_REFUND") return "Owner";
  if (status === "APPROVED" || status === "REFUNDED" || status === "FAILED_OUT_OF_STOCK" || status === "CANCELLED") return "System";
  return "Customer";
}

export function itemLine(items: Array<{ name: string; qty: number }>): string {
  return items.map((i) => `${i.name} x${i.qty}`).join(", ");
}

export function phoneLabel(waId: string): string {
  return waId.replace(/^234/, "0").replace(/(\d{4})(\d{4})(\d{4})$/, "$1 $2 $3");
}

export const statusOrder = [
  "PENDING_APPROVAL",
  "MANUAL_VERIFICATION_REQUIRED",
  "FAILED_OUT_OF_STOCK",
  "PENDING_REFUND",
  "ORDER_PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "APPROVED",
  "REFUNDED",
  "CANCELLED",
] as const;
