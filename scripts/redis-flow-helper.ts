import { makeInMemoryRepositories, RecordingMessenger } from "../lib/infra/inmemory";
import { WindowedMessenger } from "../lib/app/customer-channel";
import { InMemoryWindowStore } from "../lib/ports/window";
import { OrderService } from "../lib/app/order-service";
import { BullMQScheduler } from "../lib/infra/redis-scheduler";
import { hydrateVendorConfig } from "../lib/domain/config";
import type { Repositories } from "../lib/ports/repositories";
import type { VendorConfigFile } from "../lib/domain/config";

const CUSTOMER = "2348017777777";

/**
 * Runs the real approval-timer path on the Redis scheduler: an order reaches
 * PENDING_APPROVAL with a ~1.2s timer, the BullMQ worker fires the timer,
 * timerFire escalates to level 1, and the assistant approves.
 */
export async function scheduleEscalationFlow(
  check: (label: string, ok: boolean, detail?: string) => void,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  const config: VendorConfigFile = {
    vendors: [
      {
        id: "R1",
        name: "Redis Vendor",
        bankAccount: "0123456789 · Redis Bank",
        escalation: [
          { role: "owner", waId: "2348010000001" },
          { role: "assistant", waId: "2348010000002" },
        ],
        timers: { approvalMinutes: 0.02, paymentTtlHours: 24 },
        items: [{ sku: "RV-1", name: "Redis Parfait", priceKobo: 400000, stock: 5 }],
      },
    ],
  };
  const hydrated = hydrateVendorConfig(config);
  const repos: Repositories = makeInMemoryRepositories(config);
  const messenger = new RecordingMessenger();
  const channel = new WindowedMessenger(messenger, new InMemoryWindowStore(true));
  const scheduler = new BullMQScheduler(process.env.REDIS_URL ?? "redis://localhost:6379");
  const vision = { extractReceipt: async () => ({ narration: null, amountKobo: null, senderName: null, isSuccessful: false, confidence: 0, errorReason: null }) } as import("../lib/ports/vision").VisionExtractor;
  const vendors = { get: (id: string) => hydrated.vendors.find((v) => v.id === id) ?? null, all: () => hydrated.vendors };
  const service = new OrderService(repos, channel, vision, vendors, scheduler);
  const OWNER = "2348010000001";
  const ASSISTANT = "2348010000002";

  await service.startIntake(CUSTOMER);
  await service.selectVendor(CUSTOMER, "R1");
  await service.addItem(CUSTOMER, "R1", "RV-1", 1);
  await service.finalizeCart(CUSTOMER, "R1");
  const order = (await repos.orders.getActiveByCustomerAndVendor(CUSTOMER, "R1"))!;
  await service.applyPayment(CUSTOMER, `r-${Date.now()}`, {
    narration: `GFT-R1-${order.id}`,
    amountKobo: 400000,
    senderName: "Test",
    isSuccessful: true,
    confidence: 0.99,
    errorReason: null,
  });
  check("order awaiting approval with redis timer", (await repos.orders.getById(order.id))!.status === "PENDING_APPROVAL");

  await sleep(3500);
  const escalated = (await repos.orders.getById(order.id))!;
  check("bullmq worker fired the approval timer -> escalated", escalated.escalationLevel === 1, `level=${escalated.escalationLevel}`);
  const assistantTold = messenger.sent.filter((m) => m.waId === ASSISTANT);
  check("assistant notified after escalation", assistantTold.length === 1);

  await service.approve(order.id, ASSISTANT);
  check("assistant approves after escalation", (await repos.orders.getById(order.id))!.status === "APPROVED");
  check("stock decremented", ((await repos.items.getByVendor("R1")).find((i) => i.sku === "RV-1"))!.stock === 4);

  await scheduler.close();
}
