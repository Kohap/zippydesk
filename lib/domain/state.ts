import { EVENT_KINDS, ORDER_STATUSES } from "./status";
import type { EventKind, OrderStatus } from "./status";

export type GuardKind = "none" | "commit_stock" | "approve_resources";

export interface TransitionDef {
  from: OrderStatus;
  event: EventKind;
  guard: GuardKind;
  toOk: OrderStatus;
  toFail?: OrderStatus;
  /** Alternative guarded target: e.g. wallet exhausted -> manual verification. */
  toManual?: OrderStatus;
}

export const TRANSITIONS: readonly TransitionDef[] = [
  { from: "INTAKE", event: "VENDOR_SELECTED", guard: "none", toOk: "ORDER_PENDING_PAYMENT" },
  { from: "ORDER_PENDING_PAYMENT", event: "PAYMENT_APPLIED", guard: "none", toOk: "PENDING_APPROVAL" },
  { from: "ORDER_PENDING_PAYMENT", event: "PAYMENT_APPLIED", guard: "none", toOk: "PARTIALLY_PAID" },
  { from: "PARTIALLY_PAID", event: "PAYMENT_APPLIED", guard: "none", toOk: "PENDING_APPROVAL" },
  { from: "ORDER_PENDING_PAYMENT", event: "PAYMENT_TTL", guard: "none", toOk: "CANCELLED" },
  { from: "PARTIALLY_PAID", event: "PAYMENT_TTL", guard: "none", toOk: "CANCELLED" },
  { from: "ORDER_PENDING_PAYMENT", event: "CUSTOMER_CANCEL", guard: "none", toOk: "CANCELLED" },
  { from: "PARTIALLY_PAID", event: "CUSTOMER_CANCEL", guard: "none", toOk: "CANCELLED" },
  // Guarded approval attempt: atomic live stock commit; on FULL stock success
  // the wallet credit must also commit, else the order parks in
  // MANUAL_VERIFICATION_REQUIRED (compensating restock happens in the executor).
  { from: "PENDING_APPROVAL", event: "OWNER_APPROVE", guard: "approve_resources", toOk: "APPROVED", toFail: "FAILED_OUT_OF_STOCK", toManual: "MANUAL_VERIFICATION_REQUIRED" },
  { from: "PENDING_APPROVAL", event: "ASSISTANT_APPROVE", guard: "approve_resources", toOk: "APPROVED", toFail: "FAILED_OUT_OF_STOCK", toManual: "MANUAL_VERIFICATION_REQUIRED" },
  { from: "PENDING_APPROVAL", event: "OWNER_REJECT", guard: "none", toOk: "PENDING_REFUND" },
  { from: "PENDING_APPROVAL", event: "ASSISTANT_REJECT", guard: "none", toOk: "PENDING_REFUND" },
  // Self-loop: timer bumps escalation_level, status stays PENDING_APPROVAL
  { from: "PENDING_APPROVAL", event: "TIMER_FIRE", guard: "none", toOk: "PENDING_APPROVAL" },
  // Manual verification: owner re-runs the guarded approval attempt after
  // topping the wallet up, or rejects to enter the refund loop.
  { from: "MANUAL_VERIFICATION_REQUIRED", event: "OWNER_MANUAL_RESOLVED", guard: "approve_resources", toOk: "APPROVED", toFail: "FAILED_OUT_OF_STOCK", toManual: "MANUAL_VERIFICATION_REQUIRED" },
  { from: "MANUAL_VERIFICATION_REQUIRED", event: "OWNER_REJECT", guard: "none", toOk: "PENDING_REFUND" },
  { from: "MANUAL_VERIFICATION_REQUIRED", event: "ASSISTANT_REJECT", guard: "none", toOk: "PENDING_REFUND" },
  { from: "MANUAL_VERIFICATION_REQUIRED", event: "CUSTOMER_CANCEL", guard: "none", toOk: "CANCELLED" },
  { from: "FAILED_OUT_OF_STOCK", event: "REFUND_PROTOCOL_START", guard: "none", toOk: "PENDING_REFUND" },
  { from: "PENDING_REFUND", event: "OWNER_REFUND_DONE", guard: "none", toOk: "REFUNDED" },
];

const INDEX: Record<string, readonly TransitionDef[]> = {};
for (const t of TRANSITIONS) {
  const key = `${t.from}|${t.event}`;
  (INDEX[key] as TransitionDef[] | undefined) ??= [];
  (INDEX[key] as TransitionDef[]).push(t);
}

export function findTransitions(from: OrderStatus, event: EventKind): readonly TransitionDef[] {
  return INDEX[`${from}|${event}`] ?? [];
}

export function canTransition(from: OrderStatus, event: EventKind): boolean {
  return findTransitions(from, event).length > 0;
}

export function isValidTarget(from: OrderStatus, event: EventKind, to: OrderStatus): boolean {
  return findTransitions(from, event).some((t) => t.toOk === to || t.toFail === to || t.toManual === to);
}

export function assertStateConsistency(): void {
  const reachable = new Set<OrderStatus>();
  for (const t of TRANSITIONS) {
    reachable.add(t.from);
    reachable.add(t.toOk);
    if (t.toFail) reachable.add(t.toFail);
    if (t.toManual) reachable.add(t.toManual);
  }
  for (const s of ORDER_STATUSES) {
    if (!reachable.has(s)) {
      throw new Error(`Order status ${s} is unreachable: absent from the transition table`);
    }
  }
  for (const e of EVENT_KINDS) {
    if (!TRANSITIONS.some((t) => t.event === e)) {
      throw new Error(`Event ${e} is registered but absent from the transition table`);
    }
  }
  for (const t of TRANSITIONS) {
    if (t.toManual && t.guard === "none") {
      throw new Error(
        `Transition ${t.from} -> ${t.event} declares a manual target but has no guard to condition it`,
      );
    }
  }
}