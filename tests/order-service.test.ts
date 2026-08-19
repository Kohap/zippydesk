import { describe, expect, it, vi } from "vitest";
import { DEMO_VENDOR, hydrateVendorConfig } from "../lib/domain/config";
import { makeInMemoryRepositories, RecordingMessenger } from "../lib/infra/inmemory";
import { InMemoryScheduler } from "../lib/infra/inmemory";
import { WindowedMessenger } from "../lib/app/customer-channel";
import { InMemoryWindowStore } from "../lib/ports/window";
import { OrderService } from "../lib/app/order-service";
import { StubVisionExtractor } from "../lib/infra/inmemory";
import type { Repositories } from "../lib/ports/repositories";
import type { VisionReceipt } from "../lib/ports/vision";
import type { OrderStatus } from "../lib/domain/status";

const CUSTOMER = "2348011111111";
const OWNER = "2348012345678";
const ASSISTANT = "2348098765432";

function setup() {
  const config = hydrateVendorConfig(DEMO_VENDOR);
  const repos = makeInMemoryRepositories(config);
  const messenger = new RecordingMessenger();
  const vision = new StubVisionExtractor(() => ({ errorReason: "unused" }));
  const vendors = {
    get: (id: string) => config.vendors.find((v) => v.id === id) ?? null,
    all: () => config.vendors,
  };
  const scheduler = new InMemoryScheduler();
  const channel = new WindowedMessenger(messenger, new InMemoryWindowStore(true));
  const service = new OrderService(repos, channel, vision, vendors, scheduler);
  return { service, repos, messenger, scheduler, config };
}

function receipt(orderId: string, amountKobo: number, msgId: string): VisionReceipt {
  return {
    narration: `GFT-A3-${orderId}`,
    amountKobo,
    senderName: "Amara",
    isSuccessful: true,
    confidence: 0.98,
    errorReason: null,
  };
}

async function placeOrder(service: OrderService, repos: Repositories): Promise<string> {
  await service.startIntake(CUSTOMER);
  await service.selectVendor(CUSTOMER, "A3");
  await service.addItem(CUSTOMER, "A3", "PAR-1", 1);
  await service.finalizeCart(CUSTOMER, "A3");
  const order = (await repos.orders.getActiveByCustomerAndVendor(CUSTOMER, "A3"))!;
  return order.id;
}

async function statusOf(repos: Repositories, orderId: string): Promise<OrderStatus> {
  return (await repos.orders.getById(orderId))!.status;
}

describe("gift architecture end-to-end", () => {
  it("1. happy path: pay full -> owner approves -> APPROVED, stock decremented", async () => {
    const { service, repos } = setup();
    const orderId = await placeOrder(service, repos);

    await service.applyPayment(CUSTOMER, "w1", receipt(orderId, 500000, "w1"));
    expect(await statusOf(repos, orderId)).toBe("PENDING_APPROVAL");

    await service.approve(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("APPROVED");
    const items = await repos.items.getByVendor("A3");
    expect(items.find((i) => i.sku === "PAR-1")!.stock).toBe(9);
  });

  it("2. partial payments accumulate and converge", async () => {
    const { service, repos } = setup();
    const orderId = await placeOrder(service, repos);

    await service.applyPayment(CUSTOMER, "w1", receipt(orderId, 300000, "w1"));
    expect(await statusOf(repos, orderId)).toBe("PARTIALLY_PAID");
    let order = (await repos.orders.getById(orderId))!;
    expect(order.amountPaidKobo).toBe(300000);
    expect(order.balanceDueKobo).toBe(200000);

    await service.applyPayment(CUSTOMER, "w2", receipt(orderId, 200000, "w2"));
    expect(await statusOf(repos, orderId)).toBe("PENDING_APPROVAL");
    order = (await repos.orders.getById(orderId))!;
    expect(order.balanceDueKobo).toBe(0);
  });

  it("3. overpayment is rejected and balance untouched", async () => {
    const { service, repos } = setup();
    const orderId = await placeOrder(service, repos);

    await service.applyPayment(CUSTOMER, "w1", receipt(orderId, 600000, "w1"));
    expect(await statusOf(repos, orderId)).toBe("ORDER_PENDING_PAYMENT");
    const order = (await repos.orders.getById(orderId))!;
    expect(order.amountPaidKobo).toBe(0);
    expect(order.balanceDueKobo).toBe(500000);
  });

  it("4. out-of-stock approval lands in FAILED_OUT_OF_STOCK then closes the refund loop", async () => {
    const { service, repos, messenger } = setup();
    const orderId = await placeOrder(service, repos);
    await service.applyPayment(CUSTOMER, "w1", receipt(orderId, 500000, "w1"));
    (await repos.items.getByVendor("A3")).forEach((i) => ((i as { stock: number }).stock = 0));

    await service.approve(orderId, OWNER);
    // The atomic reservation fails fast and the refund protocol leg is closed
    // immediately (FAILED_OUT_OF_STOCK --REFUND_PROTOCOL_START--> PENDING_REFUND).
    expect(await statusOf(repos, orderId)).toBe("PENDING_REFUND");

    expect(messenger.sent.some((m) => m.type === "buttons" && JSON.stringify(m.payload).includes("URGENT REFUND REQUIRED"))).toBe(true);

    await service.refundDone(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("REFUNDED");
  });

  it("5. approval timer escalates to assistant; assistant can then approve", async () => {
    const { service, repos, messenger } = setup();
    const orderId = await placeOrder(service, repos);
    await service.applyPayment(CUSTOMER, "w1", receipt(orderId, 500000, "w1"));

    await service.approve(orderId, ASSISTANT);
    expect(await statusOf(repos, orderId)).toBe("PENDING_APPROVAL");

    await service.timerFire(orderId);
    let order = (await repos.orders.getById(orderId))!;
    expect(order.escalationLevel).toBe(1);
    expect(messenger.sent.some((m) => m.type === "text" && m.waId === ASSISTANT)).toBe(true);

    await service.approve(orderId, ASSISTANT);
    expect(await statusOf(repos, orderId)).toBe("APPROVED");
    order = (await repos.orders.getById(orderId))!;
    expect(order.escalationLevel).toBe(1);
  });

  it("6. duplicate receipts are idempotent", async () => {
    const { service, repos } = setup();
    const orderId = await placeOrder(service, repos);

    await service.applyPayment(CUSTOMER, "dup", receipt(orderId, 500000, "dup"));
    await service.applyPayment(CUSTOMER, "dup", receipt(orderId, 500000, "dup"));
    expect(await statusOf(repos, orderId)).toBe("PENDING_APPROVAL");

    await service.applyPayment(CUSTOMER, "dup2", receipt(orderId, 500000, "dup2"));
    expect(await statusOf(repos, orderId)).toBe("PENDING_APPROVAL");
  });

  it("7. payment TTL cancels unpaid orders", async () => {
    const { service, repos } = setup();
    const orderId = await placeOrder(service, repos);
    await service.paymentTtlExpiry(orderId);
    expect(await statusOf(repos, orderId)).toBe("CANCELLED");
  });

  it("8. refund protocol closes with owner confirmation", async () => {
    const { service, repos } = setup();
    const orderId = await placeOrder(service, repos);
    await service.applyPayment(CUSTOMER, "w1", receipt(orderId, 500000, "w1"));
    await service.reject(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("PENDING_REFUND");

    await service.refundDone(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("REFUNDED");
    const refunds = await repos.refunds.listByStatus("refunded");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.orderId).toBe(orderId);
  });

  it("9. owner reject short-circuits to PENDING_REFUND with customer notified", async () => {
    const { service, repos, messenger } = setup();
    const orderId = await placeOrder(service, repos);
    await service.applyPayment(CUSTOMER, "w1", receipt(orderId, 500000, "w1"));

    await service.reject(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("PENDING_REFUND");
    expect(messenger.sent.some((m) => m.type === "text" && m.waId === CUSTOMER && String((m.payload as { text: string }).text).includes("refunded"))).toBe(true);
  });

  it("unmatched narration and failed receipts are rejected", async () => {
    const { service, repos } = setup();
    const orderId = await placeOrder(service, repos);

    await service.applyPayment(CUSTOMER, "w0", { ...receipt(orderId, 500000, "w0"), isSuccessful: false });
    await service.applyPayment(CUSTOMER, "w1", { ...receipt(orderId, 500000, "w1"), narration: "someone else's transfer" });
    await service.applyPayment(CUSTOMER, "w2", { ...receipt(orderId, 500000, "w2"), narration: "GFT-A3-9999" });
    expect(await statusOf(repos, orderId)).toBe("ORDER_PENDING_PAYMENT");
  });

  it("10. timers auto-fire: approval escalates after 5 min, TTL cancels after 24h", async () => {
    vi.useFakeTimers();
    try {
      const { service, repos, messenger, scheduler } = setup();
      const orderId = await placeOrder(service, repos);
      expect(scheduler.pendingCount()).toBe(1);

      await vi.runAllTimersAsync();
      expect(await statusOf(repos, orderId)).toBe("CANCELLED");
      expect(scheduler.pendingCount()).toBe(0);

      const secondId = await placeOrder(service, repos);
      await service.applyPayment(CUSTOMER, "w9", receipt(secondId, 500000, "w9"));
      expect(scheduler.pendingCount()).toBe(1);

      await vi.runAllTimersAsync();
      const order = (await repos.orders.getById(secondId))!;
      expect(order.status).toBe("PENDING_APPROVAL");
      expect(order.escalationLevel).toBe(1);
      expect(messenger.sent.some((m) => m.type === "text" && m.waId === ASSISTANT)).toBe(true);
      expect(scheduler.pendingCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("11. approval clears all timers for the order", async () => {
    vi.useFakeTimers();
    try {
      const { service, repos, scheduler } = setup();
      const orderId = await placeOrder(service, repos);
      await service.applyPayment(CUSTOMER, "w1", receipt(orderId, 500000, "w1"));
      expect(scheduler.pendingCount()).toBe(1);

      await service.approve(orderId, OWNER);
      expect(scheduler.pendingCount()).toBe(0);
      expect(await statusOf(repos, orderId)).toBe("APPROVED");
    } finally {
      vi.useRealTimers();
    }
  });
});