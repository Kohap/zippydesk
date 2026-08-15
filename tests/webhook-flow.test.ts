import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildContext } from "../lib/context";
import { StubVisionExtractor } from "../lib/infra/inmemory";
import { encodeButtonId } from "../lib/infra/payloads";
import { handleHttp, type HttpRequest } from "../lib/light-server";
import type { AppContext } from "../lib/context";

const CUSTOMER = "2348011111111";
const OWNER = "2348012345678";
const FIXTURE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../scripts/fixtures/receipt.png"));

let activeOrderId = "1001";

function setup(stub: Partial<Record<string, unknown>> = {}) {
  const ctx = buildContext({} as NodeJS.ProcessEnv); // in-memory repos + stub messenger/vision; vitest would otherwise load .env
  ctx.media = { fetchImage: async () => FIXTURE };
  ctx.vision = new StubVisionExtractor(() => ({
    narration: `GFT-A3-${activeOrderId}`,
    amountKobo: 500_000,
    senderName: "AMARA OKONKWO",
    isSuccessful: true,
    confidence: 1.0,
    ...stub,
  }));
  return { ctx };
}

type PostResult = Awaited<ReturnType<typeof webhookPost>>;

function post(ctx: AppContext, ...messages: Array<Record<string, unknown>>): Promise<PostResult> {
  return webhookPost(ctx, {
    entry: [{ changes: [{ value: { messages } }] }],
  });
}

async function webhookPost(ctx: AppContext, payload: unknown) {
  return handleHttp(ctx, { method: "POST", url: "/webhook", payload });
}

const say = (id: string, from: string, body: string) => ({ id, from, type: "text", text: { body } });
const press = (id: string, from: string, action: Parameters<typeof encodeButtonId>[0]) => ({
  id,
  from,
  type: "interactive",
  interactive: { type: "button_reply", button_reply: { id: encodeButtonId(action) } },
});
const snap = (id: string, from: string, imageId: string) => ({ id, from, type: "image", image: { id: imageId } });

async function placeOrder(ctx: AppContext): Promise<string> {
  await post(ctx, say("m1", CUSTOMER, "start"));
  await post(ctx, press("m2", CUSTOMER, { a: "vs", v: "A3" }));
  await post(ctx, press("m3", CUSTOMER, { a: "add", v: "A3", s: "PAR-1", q: 1 }));
  await post(ctx, press("m4", CUSTOMER, { a: "done", v: "A3" }));
  const order = (await ctx.repos.orders.getActiveByCustomerAndVendor(CUSTOMER, "A3"))!;
  activeOrderId = order.id;
  return order.id;
}

describe("webhook pipeline end-to-end", () => {
  it("full flow: text + buttons + receipt image -> APPROVED, stock decremented", async () => {
    const { ctx } = setup();
    const orderId = await placeOrder(ctx);
    const payRes = await post(ctx, snap("m5", CUSTOMER, "media-1"));
    expect(payRes.statusCode).toBe(200);

    const order = (await ctx.repos.orders.getById(orderId))!;
    expect(order.status).toBe("PENDING_APPROVAL");
    expect(order.amountPaidKobo).toBe(500_000);

    await post(ctx, press("m6", OWNER, { a: "ap", o: orderId }));
    expect((await ctx.repos.orders.getById(orderId))!.status).toBe("APPROVED");
    const items = (await ctx.repos.items.getByVendor("A3"))!;
    expect(items.find((i) => i.sku === "PAR-1")!.stock).toBe(9);
    const payments = await ctx.repos.payments.listByOrder(orderId);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.verdict).toBe("applied");
    expect(payments[0]!.narration).toBe(`GFT-A3-${orderId}`);
  });

  it("dedupes replayed messages", async () => {
    const { ctx } = setup();
    const orderId = await placeOrder(ctx);
    await post(ctx, snap("m5", CUSTOMER, "media-1"));
    await post(ctx, snap("m5", CUSTOMER, "media-1"));
    await post(ctx, say("m5", CUSTOMER, "start"));
    const payments = await ctx.repos.payments.listByOrder(orderId);
    expect(payments).toHaveLength(1);
  });

  it("unmatched narration is rejected with guidance, order untouched", async () => {
    const { ctx } = setup({ narration: "GFT-BB-7777" });
    const orderId = await placeOrder(ctx);
    const res = await post(ctx, snap("m5", CUSTOMER, "media-2"));
    expect(res.statusCode).toBe(200);
    const order = (await ctx.repos.orders.getById(orderId))!;
    expect(order.status).toBe("ORDER_PENDING_PAYMENT");
    expect(await ctx.repos.payments.listByOrder(orderId)).toHaveLength(0);
    const messenger = ctx.messenger as unknown as { sent: Array<{ waId: string; payload: { text?: string } }> };
    const replies = messenger.sent.filter((m) => m.waId === CUSTOMER);
    expect(replies.at(-1)?.payload.text).toContain("couldn't match");
  });

  it("overpayment is recorded but not applied", async () => {
    const { ctx } = setup({ amountKobo: 600_000 });
    const orderId = await placeOrder(ctx);
    await post(ctx, snap("m5", CUSTOMER, "media-3"));
    const order = (await ctx.repos.orders.getById(orderId))!;
    expect(order.status).toBe("ORDER_PENDING_PAYMENT");
    expect(order.amountPaidKobo).toBe(0);
    const payments = (await ctx.repos.payments.listByOrder(orderId))!;
    expect(payments).toHaveLength(1);
    expect(payments[0]!.verdict).toBe("overpayment");
    const events = await ctx.repos.events.listByOrder(orderId);
    expect(events.map((e) => e.action)).toContain("overpayment_rejected");
  });

  it("garbage interactive button payload does not crash the webhook", async () => {
    const { ctx } = setup();
    const res = await post(ctx, {
      id: "x1",
      from: CUSTOMER,
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "not-json" } },
    });
    expect(res.statusCode).toBe(200);
  });

  it("GET challenge round-trips the token", async () => {
    const { ctx } = setup();
    const ok = await handleHttp(ctx, {
      method: "GET",
      url: "/webhook?hub.mode=subscribe&hub.verify_token=dev-verify-token&hub.challenge=challenge123",
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("challenge123");
    const bad = await handleHttp(ctx, { method: "GET", url: "/webhook?hub.mode=subscribe&hub.verify_token=nope" });
    expect(bad.statusCode).toBe(403);
  });
});