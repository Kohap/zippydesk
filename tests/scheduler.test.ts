import { describe, expect, it, vi } from "vitest";
import { InMemoryScheduler } from "../lib/infra/inmemory";

describe("InMemoryScheduler", () => {
  it("fires the approval handler after the delay", async () => {
    vi.useFakeTimers();
    try {
      const scheduler = new InMemoryScheduler();
      const fired: string[] = [];
      scheduler.setHandlers({ onApprovalTimer: async (id) => void fired.push(id), onPaymentTtl: async () => {} });
      await scheduler.scheduleApproval("7451", 5 * 60_000);
      vi.advanceTimersByTime(5 * 60_000 - 1);
      expect(fired).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(fired).toEqual(["7451"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancelOrder prevents the fire", async () => {
    vi.useFakeTimers();
    try {
      const scheduler = new InMemoryScheduler();
      const fired: string[] = [];
      scheduler.setHandlers({ onApprovalTimer: async (id) => void fired.push(id), onPaymentTtl: async () => {} });
      await scheduler.scheduleApproval("7451", 60_000);
      await scheduler.cancelOrder("7451");
      vi.advanceTimersByTime(120_000);
      expect(fired).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rescheduling replaces the previous timer", async () => {
    vi.useFakeTimers();
    try {
      const scheduler = new InMemoryScheduler();
      const ttlFired: string[] = [];
      scheduler.setHandlers({ onApprovalTimer: async () => {}, onPaymentTtl: async (id) => void ttlFired.push(id) });
      await scheduler.schedulePaymentTtl("7451", 24 * 3_600_000);
      await scheduler.schedulePaymentTtl("7451", 10_000);
      expect(scheduler.pendingCount()).toBe(1);
      vi.advanceTimersByTime(10_000);
      expect(ttlFired).toEqual(["7451"]);
    } finally {
      vi.useRealTimers();
    }
  });
});