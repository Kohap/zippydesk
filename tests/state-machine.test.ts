import { describe, expect, it } from "vitest";
import { assertStateConsistency, canTransition, TRANSITIONS } from "../lib/domain/state";
import { EVENT_KINDS, ORDER_STATUSES, type OrderStatus } from "../lib/domain/status";

const TERMINALS: OrderStatus[] = ["APPROVED", "REFUNDED", "CANCELLED"];

describe("state machine table", () => {
  it("passes consistency invariants", () => {
    expect(() => assertStateConsistency()).not.toThrow();
  });

  it("every status is reachable in the table", () => {
    for (const s of ORDER_STATUSES) {
      expect(
        TRANSITIONS.some((t) => t.from === s) || TRANSITIONS.some((t) => t.toOk === s || t.toFail === s),
        s,
      ).toBe(true);
    }
  });

  it("only the terminal statuses lack outgoing transitions", () => {
    for (const s of ORDER_STATUSES) {
      const hasOutgoing = TRANSITIONS.some((t) => t.from === s);
      if (TERMINALS.includes(s)) {
        expect(hasOutgoing, `${s} should be terminal`).toBe(false);
      } else {
        expect(hasOutgoing, `${s} should have an exit path`).toBe(true);
      }
    }
  });

  it("every registered event participates in a transition", () => {
    for (const e of EVENT_KINDS) {
      expect(TRANSITIONS.some((t) => t.event === e), e).toBe(true);
    }
  });

  it("payment convergence paths exist", () => {
    expect(canTransition("ORDER_PENDING_PAYMENT", "PAYMENT_APPLIED")).toBe(true);
    expect(canTransition("PARTIALLY_PAID", "PAYMENT_APPLIED")).toBe(true);
  });

  it("terminals are truly terminal", () => {
    expect(canTransition("APPROVED", "OWNER_APPROVE")).toBe(false);
    expect(canTransition("REFUNDED", "OWNER_REFUND_DONE")).toBe(false);
    expect(canTransition("CANCELLED", "PAYMENT_TTL")).toBe(false);
  });
});