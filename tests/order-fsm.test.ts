import { describe, expect, it } from "vitest";
import { DEMO_VENDOR, hydrateVendorConfig } from "../lib/domain/config";
import { makeInMemoryRepositories, RecordingMessenger, type InMemoryWalletRepo } from "../lib/infra/inmemory";
import { InMemoryScheduler } from "../lib/infra/inmemory";
import { WindowedMessenger } from "../lib/app/customer-channel";
import { InMemoryWindowStore } from "../lib/ports/window";
import { OrderService } from "../lib/app/order-service";
import { StubVisionExtractor } from "../lib/infra/inmemory";
import { decideApproval, commitApproval } from "../lib/app/order-fsm";
import { TRANSITIONS, assertStateConsistency } from "../lib/domain/state";
import type { Repositories } from "../lib/ports/repositories";
import type { VisionReceipt } from "../lib/ports/vision";
import type { OrderStatus } from "../lib/domain/status";

const CUSTOMER = "2348011111111";
const OWNER = "2348012345678";

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

async function placeAndPay(service: OrderService, repos: Repositories): Promise<string> {
  await service.startIntake(CUSTOMER);
  await service.selectVendor(CUSTOMER, "A3");
  await service.addItem(CUSTOMER, "A3", "PAR-1", 1);
  await service.finalizeCart(CUSTOMER, "A3");
  const order = (await repos.orders.getActiveByCustomerAndVendor(CUSTOMER, "A3"))!;
  await service.applyPayment(CUSTOMER, `w-${order.id}`, receipt(order.id, 500000, `w-${order.id}`));
  return order.id;
}

async function statusOf(repos: Repositories, orderId: string): Promise<OrderStatus> {
  return (await repos.orders.getById(orderId))!.status;
}

function walletOf(repos: Repositories): InMemoryWalletRepo {
  return repos.wallet as unknown as InMemoryWalletRepo;
}

describe("wallet-guarded approval FSM", () => {
  it("cells are defined: every approve_resources transition declares ok/fail/manual targets", () => {
    expect.assertions(TRANSITIONS.filter((t) => t.guard === "approve_resources").length * 3 + 1);
    const cells = TRANSITIONS.filter((t) => t.guard === "approve_resources");
    expect(cells.length).toBeGreaterThan(0);
    for (const t of cells) {
      expect(t.toOk).toBe("APPROVED");
      expect(t.toFail).toBe("FAILED_OUT_OF_STOCK");
      expect(t.toManual).toBe("MANUAL_VERIFICATION_REQUIRED");
    }
    expect(() => assertStateConsistency()).not.toThrow();
  });

  it("decision is pure and deterministic", () => {
    expect(decideApproval(true, true)).toBe("approved");
    expect(decideApproval(true, false)).toBe("manual_verification_required");
    expect(decideApproval(false, true)).toBe("failed_out_of_stock");
    expect(decideApproval(false, false)).toBe("failed_out_of_stock");
  });

  it("happy path draws exactly one credit for the merchant", async () => {
    const { service, repos } = setup();
    const orderId = await placeAndPay(service, repos);

    const before = await repos.wallet.getBalance("merchant-parfait");
    await service.approve(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("APPROVED");
    expect(await repos.wallet.getBalance("merchant-parfait")).toBe(before - 1);
  });

  it("partial payments converge then burn a single credit on approval", async () => {
    const { service, repos } = setup();
    await service.startIntake(CUSTOMER);
    await service.selectVendor(CUSTOMER, "A3");
    await service.addItem(CUSTOMER, "A3", "PAR-1", 1);
    await service.finalizeCart(CUSTOMER, "A3");
    const order = (await repos.orders.getActiveByCustomerAndVendor(CUSTOMER, "A3"))!;

    await service.applyPayment(CUSTOMER, "p1", receipt(order.id, 300000, "p1"));
    expect(await statusOf(repos, order.id)).toBe("PARTIALLY_PAID");
    await service.applyPayment(CUSTOMER, "p2", receipt(order.id, 200000, "p2"));
    expect(await statusOf(repos, order.id)).toBe("PENDING_APPROVAL");

    const before = await repos.wallet.getBalance("merchant-parfait");
    await service.approve(order.id, OWNER);
    expect(await statusOf(repos, order.id)).toBe("APPROVED");
    expect(await repos.wallet.getBalance("merchant-parfait")).toBe(before - 1);
  });

  it("empty wallet parks the order in MANUAL_VERIFICATION_REQUIRED and compensates stock", async () => {
    const { service, repos, messenger } = setup();
    walletOf(repos).setBalance("merchant-parfait", 0);
    const orderId = await placeAndPay(service, repos);

    await service.approve(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("MANUAL_VERIFICATION_REQUIRED");

    const items = await repos.items.getByVendor("A3");
    expect(items.find((i) => i.sku === "PAR-1")!.stock).toBe(10);
    expect(await repos.wallet.getBalance("merchant-parfait")).toBe(0);

    const ownerPress = messenger.sent.find((m) => m.type === "buttons" && m.waId === OWNER);
    expect(ownerPress).toBeDefined();
    const rows = (ownerPress!.payload as { rows: Array<{ id: string }> }).rows.map((r) => r.id);
    expect(rows.some((id) => id.includes('"a":"mv"'))).toBe(true);
    expect(rows.some((id) => id.includes('"a":"rj"'))).toBe(true);
    expect(messenger.sent.some((m) => m.type === "text" && m.waId === CUSTOMER && JSON.stringify(m.payload).includes("manual hold"))).toBe(true);
  });

  it("owner resolves a parked order after topping up: APPROVED and stock committed", async () => {
    const { service, repos, scheduler } = setup();
    walletOf(repos).setBalance("merchant-parfait", 0);
    const orderId = await placeAndPay(service, repos);
    await service.approve(orderId, OWNER);
    expect(scheduler.pendingCount()).toBe(0);

    walletOf(repos).setBalance("merchant-parfait", 1);
    await service.approve(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("APPROVED");
    const items = await repos.items.getByVendor("A3");
    expect(items.find((i) => i.sku === "PAR-1")!.stock).toBe(9);
    expect(await repos.wallet.getBalance("merchant-parfait")).toBe(0);
  });

  it("retrying resolution while the wallet is still empty self-loops without burning stock", async () => {
    const { service, repos, messenger } = setup();
    walletOf(repos).setBalance("merchant-parfait", 0);
    const orderId = await placeAndPay(service, repos);
    await service.approve(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("MANUAL_VERIFICATION_REQUIRED");

    await service.approve(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("MANUAL_VERIFICATION_REQUIRED");
    const items = await repos.items.getByVendor("A3");
    expect(items.find((i) => i.sku === "PAR-1")!.stock).toBe(10);
    const manualPings = messenger.sent.filter((m) => m.type === "buttons" && m.waId === OWNER).length;
    expect(manualPings).toBe(2);
  });

  it("owner can reject from manual verification into the refund loop", async () => {
    const { service, repos } = setup();
    walletOf(repos).setBalance("merchant-parfait", 0);
    const orderId = await placeAndPay(service, repos);
    await service.approve(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("MANUAL_VERIFICATION_REQUIRED");

    await service.reject(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("PENDING_REFUND");

    await service.refundDone(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("REFUNDED");
  });

  it("customer can back out of a parked order", async () => {
    const { service, repos } = setup();
    walletOf(repos).setBalance("merchant-parfait", 0);
    const orderId = await placeAndPay(service, repos);
    await service.approve(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("MANUAL_VERIFICATION_REQUIRED");

    await service.cancelOrder(CUSTOMER);
    expect(await statusOf(repos, orderId)).toBe("CANCELLED");
  });

  it("new order intake is blocked while a manual-hold order exists", async () => {
    const { service, repos, messenger } = setup();
    walletOf(repos).setBalance("merchant-parfait", 0);
    const orderId = await placeAndPay(service, repos);
    await service.approve(orderId, OWNER);
    const sentBefore = messenger.sent.length;

    await service.startIntake(CUSTOMER);
    expect(messenger.sent.length).toBeGreaterThan(sentBefore);
    expect(messenger.sent[messenger.sent.length - 1]!.waId).toBe(CUSTOMER);
    const last = String((messenger.sent[messenger.sent.length - 1]!.payload as { text: string }).text ?? "");
    expect(last).toContain("manual hold");
  });

  it("assistant cannot overrule a parked order", async () => {
    const { service, repos } = setup();
    walletOf(repos).setBalance("merchant-parfait", 0);
    const orderId = await placeAndPay(service, repos);
    await service.approve(orderId, OWNER);

    await service.approve(orderId, "2348098765432");
    expect(await statusOf(repos, orderId)).toBe("MANUAL_VERIFICATION_REQUIRED");
    // stock stays compensated even after the assistant's blocked attempt
    const items = await repos.items.getByVendor("A3");
    expect(items.find((i) => i.sku === "PAR-1")!.stock).toBe(10);
  });

  it("stock exhaustion still fails hard: FAILED_OUT_OF_STOCK -> refund loop, wallet untouched", async () => {
    const { service, repos } = setup();
    const before = await repos.wallet.getBalance("merchant-parfait");
    const orderId = await placeAndPay(service, repos);
    (await repos.items.getByVendor("A3")).forEach((i) => ((i as { stock: number }).stock = 0));

    await service.approve(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("FAILED_OUT_OF_STOCK");
    expect(await repos.wallet.getBalance("merchant-parfait")).toBe(before);

    await service.refundDone(orderId, OWNER);
    expect(await statusOf(repos, orderId)).toBe("REFUNDED");
  });
});

describe("commitApproval resource executor", () => {
  it("restores stock when the credit draw fails (no orphaned reservation)", async () => {
    const { repos } = setup();
    walletOf(repos).setBalance("merchant-parfait", 0);
    const items = [{ sku: "PAR-1", name: "Classic Parfait", unitKobo: 500000, qty: 2 }];

    const verdict = await commitApproval(repos, {
      vendorId: "A3",
      merchantId: "merchant-parfait",
      orderId: "order-x",
      items,
    });
    expect(verdict).toBe("manual_verification_required");
    const rows = await repos.items.getByVendor("A3");
    expect(rows.find((i) => i.sku === "PAR-1")!.stock).toBe(10);
  });

  it("fails fast without touching the wallet on insufficient stock", async () => {
    const { repos } = setup();
    const before = await repos.wallet.getBalance("merchant-parfait");
    (await repos.items.getByVendor("A3")).forEach((i) => ((i as { stock: number }).stock = 0));

    const verdict = await commitApproval(repos, {
      vendorId: "A3",
      merchantId: "merchant-parfait",
      orderId: "order-x",
      items: [{ sku: "PAR-1", name: "Classic Parfait", unitKobo: 500000, qty: 1 }],
    });
    expect(verdict).toBe("failed_out_of_stock");
    expect(await repos.wallet.getBalance("merchant-parfait")).toBe(before);
  });
});