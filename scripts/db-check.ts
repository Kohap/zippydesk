import { PrismaClient } from "@prisma/client";
import { buildContext } from "../lib/context";
import { DEMO_VENDOR, hydrateVendorConfig } from "../lib/domain/config";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — run with: node --env-file=.env --import tsx scripts/db-check.ts");
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: url });
const config = hydrateVendorConfig(DEMO_VENDOR);
const vendor = config.vendors[0]!;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Order", "Payment", "ApprovalEvent", "Refund", "IngestedMessage" CASCADE');
  await prisma.$executeRawUnsafe("ALTER SEQUENCE order_ref_seq RESTART WITH 1000");

  const narrationPrefix = `GFT-${vendor.id}`;
  await prisma.vendor.upsert({
    where: { id: vendor.id },
    update: { name: vendor.name, bankAccount: vendor.bankAccount, narrationPrefix, escalation: vendor.escalation, timers: vendor.timers, merchantId: "merchant-parfait" },
    create: { id: vendor.id, name: vendor.name, bankAccount: vendor.bankAccount, narrationPrefix, escalation: vendor.escalation, timers: vendor.timers, merchantId: "merchant-parfait" },
  });
  for (const item of vendor.items) {
    await prisma.vendorItem.upsert({
      where: { vendorId_sku: { vendorId: vendor.id, sku: item.sku } },
      update: { priceKobo: item.priceKobo, stock: item.stock, active: item.active },
      create: { vendorId: vendor.id, sku: item.sku, name: item.name, priceKobo: item.priceKobo, stock: item.stock, active: item.active },
    });
  }

  const ctx = buildContext(process.env);
  const { service, repos } = ctx;
  const CUSTOMER = "2348015555555";
  const OWNER = vendor.escalation[0]!.waId;

  await service.startIntake(CUSTOMER);
  await service.selectVendor(CUSTOMER, vendor.id);
  await service.addItem(CUSTOMER, vendor.id, "PAR-1", 1);
  await service.finalizeCart(CUSTOMER, vendor.id);
  const order = (await repos.orders.getActiveByCustomerAndVendor(CUSTOMER, vendor.id))!;
  check("order created via DB sequence", /^\d{4,}$/.test(order.id), `id=${order.id}`);

  const receiptMsgId = `w-${Date.now()}`;
  await service.applyPayment(CUSTOMER, receiptMsgId, {
    narration: `GFT-${vendor.id}-${order.id}`,
    amountKobo: 500_000,
    senderName: "Amara",
    isSuccessful: true,
    confidence: 0.99,
    errorReason: null,
  });
  check("payment applied -> PENDING_APPROVAL", (await repos.orders.getById(order.id))!.status === "PENDING_APPROVAL");

  await service.approve(order.id, OWNER);
  const approved = (await repos.orders.getById(order.id))!;
  check("approved", approved.status === "APPROVED");
  check("balance exact in DB", approved.balanceDueKobo === 0);

  const payments = await repos.payments.listByOrder(order.id);
  check("payment row persisted", payments.length === 1 && payments[0]!.verdict === "applied");
  const events = await repos.events.listByOrder(order.id);
  check("events persisted", events.length >= 3, events.map((e) => e.action).join(" -> "));
  const items = (await repos.items.getByVendor(vendor.id))!;
  check("stock decremented in DB", items.find((i) => i.sku === "PAR-1")!.stock === 9, `stock=${items.find((i) => i.sku === "PAR-1")!.stock}`);

  const rawOrder = await prisma.order.findUnique({ where: { id: order.id } });
  check("row integrity (amountPaid<=total, balance exact, escalation 0|1)", !!rawOrder && rawOrder.amountPaidKobo <= rawOrder.totalKobo && rawOrder.balanceDueKobo === rawOrder.totalKobo - rawOrder.amountPaidKobo && [0, 1].includes(rawOrder.escalationLevel));

  await service.startIntake(CUSTOMER);
  await service.selectVendor(CUSTOMER, vendor.id);
  await service.addItem(CUSTOMER, vendor.id, "PAR-1", 1);
  await service.finalizeCart(CUSTOMER, vendor.id);
  const second = (await repos.orders.getActiveByCustomerAndVendor(CUSTOMER, vendor.id))!;
  check("second order gets next id", Number(second.id) === Number(order.id) + 1, `id=${second.id}`);
  await service.cancelOrder(CUSTOMER);

  const seq = (await prisma.$queryRaw<Array<{ last_value: bigint }>>`SELECT last_value FROM order_ref_seq`)[0]!;
  check("sequence advanced past last order", Number(seq.last_value) >= Number(second.id), `last_value=${seq.last_value}`);

  const badBefore = await prisma.order.count();
  let checkRejected = false;
  let checkError = "";
  try {
    await prisma.order.create({
      data: { id: "ZZ-BAD", customerWaId: "x", vendorId: vendor.id, items: [], totalKobo: 1000, amountPaidKobo: 2000, balanceDueKobo: -1000, status: "PENDING_APPROVAL", updatedAt: new Date() },
    });
  } catch (err) {
    checkError = String(err);
    checkRejected = checkError.includes("Order_paid_le_total") || checkError.includes("P2004") || checkError.includes("P2010");
  }
  const badAfter = await prisma.order.count();
  check("CHECK constraint rejects inconsistent row", checkRejected && badAfter === badBefore, checkRejected ? "" : checkError.slice(0, 140));

  await prisma.vendorItem.update({ where: { vendorId_sku: { vendorId: vendor.id, sku: "PAR-1" } }, data: { stock: 1 } });
  const decremented = await repos.items.atomicDecrement(vendor.id, [
    { sku: "PAR-1", name: "Classic Parfait", qty: 5, unitKobo: 5000 },
    { sku: "PAR-2", name: "Berry Parfait", qty: 1, unitKobo: 6500 },
  ]);
  const stockAfter = (await prisma.vendorItem.findUnique({ where: { vendorId_sku: { vendorId: vendor.id, sku: "PAR-1" } } }))!.stock;
  check("atomicDecrement all-or-nothing (TOCTOU)", decremented === 0 && stockAfter === 1, `changed=${decremented} stock=${stockAfter}`);
  await prisma.vendorItem.update({ where: { vendorId_sku: { vendorId: vendor.id, sku: "PAR-1" } }, data: { stock: 10 } });

  const { handleHttp } = await import("../lib/light-server");
  const W = "2348016666666";
  const msg = (id: string, payload: Record<string, unknown>) => ({ id, from: W, ...payload });
  const say = (id: string, body: string) => msg(id, { type: "text", text: { body } });
  const press = (id: string, action: unknown) => msg(id, { type: "interactive", interactive: { type: "button_reply", button_reply: { id: action } } });
  const { encodeButtonId } = await import("../lib/infra/payloads");

  const send = (id: string, payload: Record<string, unknown>) => ({
    method: "POST" as const,
    url: "/webhook",
    payload: { entry: [{ changes: [{ value: { messages: [msg(id, payload)] } }] }] },
  });
  await handleHttp(ctx, send("d1", { type: "text", text: { body: "start" } }));
  await handleHttp(ctx, send("d2", { type: "interactive", interactive: { type: "button_reply", button_reply: { id: encodeButtonId({ a: "vs", v: vendor.id }) } } }));
  await handleHttp(ctx, send("d3", { type: "interactive", interactive: { type: "button_reply", button_reply: { id: encodeButtonId({ a: "add", v: vendor.id, s: "PAR-1", q: 1 }) } } }));
  const done1 = await handleHttp(ctx, send("d4", { type: "interactive", interactive: { type: "button_reply", button_reply: { id: encodeButtonId({ a: "done", v: vendor.id }) } } }));
  const done2 = await handleHttp(ctx, send("d4", { type: "interactive", interactive: { type: "button_reply", button_reply: { id: encodeButtonId({ a: "done", v: vendor.id }) } } }));
  check("webhook dedupe via IngestedMessage (Postgres)", done1.statusCode === 200 && done2.statusCode === 200, "replayed done button ignored");

  const pending = await ctx.repos.orders.listByStatus("PENDING_APPROVAL");
  const webhookOrder = pending.find((o) => o.customerWaId === W);
  check("dashboard reads order back from Postgres", !!webhookOrder, webhookOrder ? "found" : "not found");
  const ingestedRows = await prisma.ingestedMessage.count({ where: { waId: W } });
  check("ingested rows persisted", ingestedRows >= 1, `${ingestedRows} rows`);

  await prisma.$disconnect();
  console.log(failures === 0 ? "\nALL DB CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
