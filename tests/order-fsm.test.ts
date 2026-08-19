import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildContext } from "../lib/context";
import { StubVisionExtractor, type InMemoryWalletRepo } from "../lib/infra/inmemory";
import { encodeButtonId } from "../lib/infra/payloads";
import { handleHttp, type HttpRequest } from "../lib/light-server";
import type { AppContext } from "../lib/context";
import type { Repositories } from "../lib/ports/repositories";
import type { OrderStatus } from "../lib/domain/status";
import type { VisionReceipt } from "../lib/ports/vision";

const FIXTURE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../scripts/fixtures/receipt.png"));

const CUSTOMER = "2348011111111";
const OWNER = "2348012345678";
let activeOrderId = "2001";

type SentRecord = { type: string; waId: string; payload: Record<string, unknown> };

function sentOf(ctx: AppContext): SentRecord[] {
  return (ctx.messenger as unknown as { sent: SentRecord[] }).sent;
}

class SpyVision extends StubVisionExtractor {
  calls = 0;
  override async extractReceipt(_bytes: Buffer): Promise<VisionReceipt> {
    this.calls += 1;
    return super.extractReceipt(_bytes);
  }
}

function setup(walletBalance?: number) {
  const ctx = buildContext({} as NodeJS.ProcessEnv);
  const vision = new SpyVision(() => ({
    narration: `GFT-A3-${activeOrderId}`,
    amountKobo: 500_000,
    senderName: "AMARA OKONKWO",
    isSuccessful: true,
    confidence: 1.0,
  }));
  ctx.vision = vision;
  ctx.media = { fetchImage: async () => FIXTURE };
  if (walletBalance !== undefined) {
    (ctx.repos.wallet as unknown as InMemoryWalletRepo).setBalance("merchant-parfait", walletBalance);
  }
  return { ctx, vision };
}

async function post(ctx: AppContext, ...messages: Array<Record<string, unknown>>) {
  return handleHttp(ctx, { method: "POST", url: "/webhook", payload: { entry: [{ changes: [{ value: { messages } }] }] } });
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

async function statusOf(repos: Repositories, orderId: string): Promise<OrderStatus> {
  return (await repos.orders.getById(orderId))!.status;
}

describe("zippy wallet-gated vision engine", () => {
  it("verified receipt debits the vendor's vision fee exactly once (PAYMENT_VERIFIED)", async () => {
    const { ctx, vision } = setup();
    const orderId = await placeOrder(ctx);

    expect(await statusOf(ctx.repos, orderId)).toBe("ORDER_PENDING_PAYMENT");
    await post(ctx, snap("m5", CUSTOMER, "media-1"));
    expect(vision.calls).toBe(1);
    expect(await statusOf(ctx.repos, orderId)).toBe("PENDING_APPROVAL");
    expect(await ctx.repos.wallet.getBalance("merchant-parfait")).toBe(100_000 - 1);
  });

  it("partial receipts also debit the fee; overpayments never do", async () => {
    const { ctx } = setup();
    const orderId = await placeOrder(ctx);
    const before = await ctx.repos.wallet.getBalance("merchant-parfait");

    await ctx.service.applyPayment(CUSTOMER, "p1", {
      narration: `GFT-A3-${orderId}`,
      amountKobo: 300_000,
      senderName: "AMARA",
      isSuccessful: true,
      confidence: 1,
      errorReason: null,
    });
    expect(await statusOf(ctx.repos, orderId)).toBe("PARTIALLY_PAID");
    expect(await ctx.repos.wallet.getBalance("merchant-parfait")).toBe(before - 1);

    await ctx.service.applyPayment(CUSTOMER, "ov1", {
      narration: `GFT-A3-${orderId}`,
      amountKobo: 900_000,
      senderName: "AMARA",
      isSuccessful: true,
      confidence: 1,
      errorReason: null,
    });
    expect(await statusOf(ctx.repos, orderId)).toBe("PARTIALLY_PAID");
    expect(await ctx.repos.wallet.getBalance("merchant-parfait")).toBe(before - 1);
  });

  it("duplicate receipts never double-debit", async () => {
    const { ctx, vision } = setup();
    await placeOrder(ctx);
    await post(ctx, snap("m5", CUSTOMER, "media-1"), snap("m5", CUSTOMER, "media-1"));
    expect(vision.calls).toBe(1);
    expect(await ctx.repos.wallet.getBalance("merchant-parfait")).toBe(100_000 - 1);
  });

  it("ZERO wallet: no AI call; raw receipt forwarded to the owner with manual buttons", async () => {
    const { ctx, vision } = setup(0);
    const orderId = await placeOrder(ctx);
    await post(ctx, say("m-owner", OWNER, "ok")); // owner is an active WhatsApp participant

    await post(ctx, snap("m5", CUSTOMER, "media-1"));
    expect(vision.calls).toBe(0);
    expect(await statusOf(ctx.repos, orderId)).toBe("ORDER_PENDING_PAYMENT");
    expect(await ctx.repos.wallet.getBalance("merchant-parfait")).toBe(0);

    const sent = sentOf(ctx);
    const image = sent.find((m) => m.type === "image" && m.waId === OWNER);
    expect(image).toBeDefined();
    expect((image!.payload as { caption: string }).caption).toContain(orderId);
    const buttons = sent
      .filter((m) => m.type === "buttons" && m.waId === OWNER)
      .find((m) => String((m.payload as { body: string }).body).includes("Manual verification"));
    expect(buttons).toBeDefined();
    const rows = (buttons!.payload as { rows: Array<{ id: string }> }).rows.map((r) => r.id);
    expect(rows.some((id) => id.includes('"a":"pv"'))).toBe(true);
    expect(rows.some((id) => id.includes('"a":"dr"'))).toBe(true);
    expect(sent.some((m) => m.type === "text" && m.waId === CUSTOMER && String((m.payload as { text: string }).text).includes("staff member"))).toBe(true);
    expect(sent.some((m) => m.type === "buttons" && m.waId === OWNER && JSON.stringify(m.payload).includes('"a":"rj"'))).toBe(false);
    expect((await ctx.repos.manualReviews.listPending()).map((r) => r.orderId)).toContain(orderId);
  });

  it("owner accepts a manually reviewed receipt: payment applied, no wallet debit", async () => {
    const { ctx, vision } = setup(0);
    const orderId = await placeOrder(ctx);
    await post(ctx, say("m-owner", OWNER, "ok"));
    await post(ctx, snap("m5", CUSTOMER, "media-1"));
    expect(vision.calls).toBe(0);

    await post(ctx, press("m6", OWNER, { a: "pv", o: orderId }));
    expect(await statusOf(ctx.repos, orderId)).toBe("PENDING_APPROVAL");
    expect(await ctx.repos.wallet.getBalance("merchant-parfait")).toBe(0);
    expect((await ctx.repos.manualReviews.listPending())).toHaveLength(0);

    const pmts = await ctx.repos.payments.listByOrder(orderId);
    expect(pmts.map((p) => p.verdict)).toContain("manual");

    await post(ctx, press("m7", OWNER, { a: "ap", o: orderId }));
    expect(await statusOf(ctx.repos, orderId)).toBe("APPROVED");
    expect(await ctx.repos.wallet.getBalance("merchant-parfait")).toBe(0);
  });

  it("owner rejects a manually reviewed receipt: customer asked to resend, order untouched", async () => {
    const { ctx, vision } = setup(0);
    const orderId = await placeOrder(ctx);
    await post(ctx, say("m-owner", OWNER, "ok"));
    await post(ctx, snap("m5", CUSTOMER, "media-1"));
    expect(vision.calls).toBe(0);

    await post(ctx, press("m6", OWNER, { a: "dr", o: orderId }));
    expect(await statusOf(ctx.repos, orderId)).toBe("ORDER_PENDING_PAYMENT");
    expect((await ctx.repos.manualReviews.listPending())).toHaveLength(0);
    expect(
      sentOf(ctx).some((m) => m.type === "text" && m.waId === CUSTOMER && String((m.payload as { text: string }).text).includes("re-send")),
    ).toBe(true);
  });

  it("stale manual press after the order moved on: pending review still cleared, order untouched", async () => {
    const { ctx, vision } = setup(0);
    const orderId = await placeOrder(ctx);
    await post(ctx, say("m-owner", OWNER, "ok"));
    await post(ctx, snap("m5", CUSTOMER, "media-1"));
    expect(vision.calls).toBe(0);
    expect(await statusOf(ctx.repos, orderId)).toBe("ORDER_PENDING_PAYMENT");

    // Owner tops up; the customer resends and the AI now verifies normally.
    (ctx.repos.wallet as unknown as InMemoryWalletRepo).setBalance("merchant-parfait", 5);
    await post(ctx, snap("m6", CUSTOMER, "media-2"));
    expect(vision.calls).toBe(1);
    expect(await statusOf(ctx.repos, orderId)).toBe("PENDING_APPROVAL");
    expect((await ctx.repos.manualReviews.listPending())).toHaveLength(1);

    // Stale "Payment verified" press from the original manual prompt: must
    // consume the queue and leave the approval alone — never over-apply.
    await post(ctx, press("m7", OWNER, { a: "pv", o: orderId }));
    expect((await ctx.repos.manualReviews.listPending())).toHaveLength(0);
    expect(await statusOf(ctx.repos, orderId)).toBe("PENDING_APPROVAL");
    const order = (await ctx.repos.orders.getById(orderId))!;
    expect(order.amountPaidKobo).toBe(500_000);
    expect(order.balanceDueKobo).toBe(0);
  });

  it("happy path with budget: receipt verified, owner approves, stock committed", async () => {
    const { ctx, vision } = setup();
    const orderId = await placeOrder(ctx);
    await post(ctx, snap("m5", CUSTOMER, "media-1"));
    expect(vision.calls).toBe(1);

    await post(ctx, press("m6", OWNER, { a: "ap", o: orderId }));
    expect(await statusOf(ctx.repos, orderId)).toBe("APPROVED");
    const items = await ctx.repos.items.getByVendor("A3");
    expect(items.find((i) => i.sku === "PAR-1")!.stock).toBe(9);
  });

  it("stock exhaustion fails hard and closes the refund loop: FAILED -> PENDING_REFUND -> REFUNDED", async () => {
    const { ctx } = setup();
    const orderId = await placeOrder(ctx);
    await post(ctx, snap("m5", CUSTOMER, "media-1"));
    (await ctx.repos.items.getByVendor("A3")).forEach((i) => ((i as { stock: number }).stock = 0));

    await post(ctx, press("m6", OWNER, { a: "ap", o: orderId }));
    expect(await statusOf(ctx.repos, orderId)).toBe("PENDING_REFUND");

    await post(ctx, press("m7", OWNER, { a: "rd", o: orderId }));
    expect(await statusOf(ctx.repos, orderId)).toBe("REFUNDED");
    expect((await ctx.repos.refunds.listByStatus("refunded")).map((r) => r.orderId)).toContain(orderId);
  });
});

describe("wallet repo unit semantics", () => {
  it("consumeCredit(amount) respects partial funding and reports lockout", async () => {
    const { ctx } = setup(2);
    const wallet = ctx.repos.wallet as unknown as InMemoryWalletRepo;
    expect((await wallet.consumeCredit("merchant-parfait", "o1", "vision", 3)).ok).toBe(false);
    expect((await wallet.consumeCredit("merchant-parfait", "o1", "vision", 3)).locked).toBe(true);
    expect(await wallet.getBalance("merchant-parfait")).toBe(2);

    expect((await wallet.consumeCredit("merchant-parfait", "o2", "vision", 1)).ok).toBe(true);
    expect((await wallet.consumeCredit("merchant-parfait", "o3", "vision", 1)).ok).toBe(true);
    expect((await wallet.consumeCredit("merchant-parfait", "o4", "vision", 1)).locked).toBe(true);
    expect(await wallet.getBalance("merchant-parfait")).toBe(0);
  });
});