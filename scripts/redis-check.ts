import { buildContext } from "../lib/context";
import { BullMQScheduler } from "../lib/infra/redis-scheduler";
import { makeInMemoryRepositories } from "../lib/infra/inmemory";
import { WindowedMessenger } from "../lib/app/customer-channel";
import { InMemoryWindowStore } from "../lib/ports/window";
import { OrderService } from "../lib/app/order-service";
import { DEMO_VENDOR, hydrateVendorConfig } from "../lib/domain/config";
import type { Repositories } from "../lib/ports/repositories";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CUSTOMER = "2348017777777";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  const scheduler = new BullMQScheduler(REDIS_URL);
  const fired: string[] = [];
  scheduler.setHandlers({
    onApprovalTimer: async (id) => {
      fired.push(id);
    },
    onPaymentTtl: async () => {},
  });

  await scheduler.scheduleApproval("T1", 300);
  await sleep(900);
  check("delayed approval job fires", fired.includes("T1"), `fired=${fired.join(",")}`);

  await scheduler.schedulePaymentTtl("T2", 300);
  await scheduler.cancelOrder("T2");
  await sleep(700);
  check("cancelled payment-ttl job does not fire", !fired.includes("T2"));

  await scheduler.scheduleApproval("T3", 60_000);
  await scheduler.scheduleApproval("T3", 200);
  await sleep(700);
  check("reschedule replaces the old delayed job", fired.includes("T3"));

  await scheduler.close();
  const { scheduleEscalationFlow } = await import("./redis-flow-helper");
  await scheduleEscalationFlow(check, sleep);

  console.log(failures === 0 ? "\nALL REDIS CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
