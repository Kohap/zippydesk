import { buildContext } from "../lib/context";
import { encodeButtonId } from "../lib/infra/payloads";
import type { VisionReceipt } from "../lib/ports/vision";
import type { InMemoryOrdersRepo } from "../lib/infra/inmemory";

const CUSTOMER = "2348011111111";
const OWNER = "2348012345678";

function log(role: string, text: string): void {
  console.log(`\n  [${role}] ${text}`);
}

function receipt(orderId: string, amountKobo: number): VisionReceipt {
  return {
    narration: `GFT-A3-${orderId}`,
    amountKobo,
    senderName: "Amara",
    isSuccessful: true,
    confidence: 0.99,
    errorReason: null,
  };
}

async function openWindow(ctx: ReturnType<typeof buildContext>, waId: string): Promise<void> {
  await ctx.window.markInbound(waId, new Date());
}

async function main(): Promise<void> {
  const ctx = buildContext(process.env);
  const msgs = ctx.messenger as typeof ctx.messenger & { sent: Array<{ type: string; waId: string; payload: unknown }> };

  console.log("=== GIFT ARCHITECTURE — offline sandbox walkthrough ===");

  await openWindow(ctx, CUSTOMER);
  await ctx.service.onCustomerText(CUSTOMER, "start");
  await openWindow(ctx, CUSTOMER);
  await ctx.service.handleButton(CUSTOMER, encodeButtonId({ a: "vs", v: "A3" }));
  await openWindow(ctx, CUSTOMER);
  await ctx.service.handleButton(CUSTOMER, encodeButtonId({ a: "add", v: "A3", s: "PAR-1", q: 1 }));
  await openWindow(ctx, CUSTOMER);
  await ctx.service.handleButton(CUSTOMER, encodeButtonId({ a: "done", v: "A3" }));

  const ordersRepo = ctx.repos.orders as InMemoryOrdersRepo;
  const order = (await ordersRepo.getActiveByCustomerAndVendor(CUSTOMER, "A3"))!;
  log("customer", `(simulating transfer with narration GFT-A3-${order.id})`);

  await openWindow(ctx, CUSTOMER);
  await ctx.service.applyPayment(CUSTOMER, "webhook-msg-1", receipt(order.id, 500000));

  await openWindow(ctx, OWNER);
  await ctx.service.approve(order.id, OWNER);

  const second = await ordersRepo.create({ id: String(Number(order.id) + 1), customerWaId: CUSTOMER, vendorId: "A3" });
  await ctx.repos.orders.guardTransition(second.id, second.status, {
    items: [{ sku: "PAR-2", name: "Berry Parfait", qty: 1, unitKobo: 650000 }],
    totalKobo: 650000,
    balanceDueKobo: 650000,
    cartLocked: true,
  });
  log("customer", `(second order ${second.id} — simulating transfer, then owner rejects)`);
  await ctx.service.applyPayment(CUSTOMER, "webhook-msg-2", receipt(second.id, 650000));
  await openWindow(ctx, OWNER);
  await ctx.service.reject(second.id, OWNER);
  await openWindow(ctx, OWNER);
  await ctx.service.refundDone(second.id, OWNER);

  console.log("\n=== messages sent (in order) ===");
  for (const m of msgs.sent) {
    const who = m.waId === CUSTOMER ? "customer" : m.waId === OWNER ? "owner" : m.waId;
    if (m.type === "text") {
      log(who, (m.payload as { text: string }).text);
    } else if (m.type === "buttons") {
      const p = m.payload as { body: string; rows: Array<{ title: string }> };
      log(who, `${p.body} [${p.rows.map((r) => r.title).join(" | ")}]`);
    } else {
      const p = m.payload as { templateName: string };
      log(who, `(template) ${p.templateName}`);
    }
  }

  const final1 = (await ordersRepo.getById(order.id))!;
  const final2 = (await ordersRepo.getById(second.id))!;
  console.log(`\n=== final state ===`);
  console.log(`order ${final1.id}: ${final1.status} (paid ${final1.amountPaidKobo / 100} naira, stock PAR-1 left ${(await ctx.repos.items.getByVendor("A3")).find((i) => i.sku === "PAR-1")!.stock})`);
  console.log(`order ${second.id}: ${final2.status}`);
}

await main();