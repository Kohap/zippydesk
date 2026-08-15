import { describe, expect, it } from "vitest";
import { DEMO_VENDOR, hydrateVendorConfig } from "../lib/domain/config";
import { makeInMemoryRepositories, RecordingMessenger, InMemoryScheduler, StubVisionExtractor } from "../lib/infra/inmemory";
import { WindowedMessenger } from "../lib/app/customer-channel";
import { InMemoryWindowStore } from "../lib/ports/window";
import { OrderService } from "../lib/app/order-service";
import type { Repositories } from "../lib/ports/repositories";
import type { VisionReceipt } from "../lib/ports/vision";

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

async function paidOrderPendingApproval(service: OrderService, repos: Repositories): Promise<string> {
  await service.startIntake(CUSTOMER);
  await service.selectVendor(CUSTOMER, "A3");
  await service.addItem(CUSTOMER, "A3", "PAR-1", 1);
  await service.finalizeCart(CUSTOMER, "A3");
  const order = (await repos.orders.getActiveByCustomerAndVendor(CUSTOMER, "A3"))!;
  await service.applyPayment(CUSTOMER, "w1", receipt(order.id, 500000, "w1"));
  return order.id;
}

const assistantMsgs = (messenger: RecordingMessenger) =>
  messenger.sent.filter((m) => m.waId === ASSISTANT && m.type === "text").map((m) => ({
    payload: m.payload as { text?: string },
  }));

describe("owner timeout escalation", () => {
  it("1. timer fire escalates order to level 1 and notifies the assistant", async () => {
    const { service, repos, messenger } = setup();
    const orderId = await paidOrderPendingApproval(service, repos);

    await service.timerFire(orderId);

    const order = (await repos.orders.getById(orderId))!;
    expect(order.escalationLevel).toBe(1);
    expect(order.status).toBe("PENDING_APPROVAL");
    expect(assistantMsgs(messenger).length).toBe(1);
    expect(assistantMsgs(messenger)[0]!.payload.text).toContain("needs approval");
    const events = await repos.events.listByOrder(orderId);
    expect(events.map((e) => e.action)).toContain("timer_fire_escalate");
  });

  it("2. assistant cannot approve before escalation", async () => {
    const { service, repos, messenger } = setup();
    const orderId = await paidOrderPendingApproval(service, repos);

    await service.approve(orderId, ASSISTANT);

    expect((await repos.orders.getById(orderId))!.status).toBe("PENDING_APPROVAL");
    expect((await repos.orders.getById(orderId))!.escalationLevel).toBe(0);
    expect(assistantMsgs(messenger)).toHaveLength(0);
  });

  it("3. assistant approves after escalation -> APPROVED", async () => {
    const { service, repos } = setup();
    const orderId = await paidOrderPendingApproval(service, repos);

    await service.timerFire(orderId);
    await service.approve(orderId, ASSISTANT);

    expect((await repos.orders.getById(orderId))!.status).toBe("APPROVED");
    const items = (await repos.items.getByVendor("A3"))!;
    expect(items.find((i) => i.sku === "PAR-1")!.stock).toBe(9);
    const events = await repos.events.listByOrder(orderId);
    expect(events.map((e) => e.action)).toContain("approved");
  });

  it("4. owner can still approve after escalation", async () => {
    const { service, repos } = setup();
    const orderId = await paidOrderPendingApproval(service, repos);

    await service.timerFire(orderId);
    await service.approve(orderId, OWNER);

    expect((await repos.orders.getById(orderId))!.status).toBe("APPROVED");
  });

  it("5. timer fire is a no-op for non-approval orders", async () => {
    const { service, repos } = setup();
    const orderId = await paidOrderPendingApproval(service, repos);
    await service.approve(orderId, OWNER);

    await service.timerFire(orderId);

    const order = (await repos.orders.getById(orderId))!;
    expect(order.status).toBe("APPROVED");
    expect(order.escalationLevel).toBe(0);
  });

  it("6. timer fire does not double-escalate", async () => {
    const { service, repos, messenger } = setup();
    const orderId = await paidOrderPendingApproval(service, repos);

    await service.timerFire(orderId);
    await service.timerFire(orderId);

    const order = (await repos.orders.getById(orderId))!;
    expect(order.escalationLevel).toBe(1);
    expect(assistantMsgs(messenger)).toHaveLength(1);
    const events = await repos.events.listByOrder(orderId);
    expect(events.filter((e) => e.action === "timer_fire_escalate")).toHaveLength(1);
  });

  it("7. scheduled approval timer actually escalates via the scheduler", async () => {
    const { service, repos, messenger, scheduler } = setup();
    const orderId = await paidOrderPendingApproval(service, repos);
    expect(scheduler.pendingCount()).toBe(1);

    await scheduler.fireNow(orderId);

    const order = (await repos.orders.getById(orderId))!;
    expect(order.escalationLevel).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);
    expect(assistantMsgs(messenger)).toHaveLength(1);
  });
});
