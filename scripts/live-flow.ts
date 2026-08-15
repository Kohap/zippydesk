import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildContext, type AppContext } from "../lib/context";
import { GeminiVisionAdapter } from "../lib/infra/gemini-vision";
import { StubVisionExtractor } from "../lib/infra/inmemory";
import { encodeButtonId } from "../lib/infra/payloads";
import { handleHttp } from "../lib/light-server";

const CUSTOMER = "2348011111111";
const OWNER = "2348012345678";

const ctx = buildContext(process.env);
const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/receipt.png"));
ctx.media = { fetchImage: async () => fixture };
ctx.vision =
  process.env.LIVE_VISION === "1" && process.env.GEMINI_API_KEY
    ? new GeminiVisionAdapter(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL)
    : StubVisionExtractor.receipt(
        JSON.stringify({
          narration: "GFT-A3-1001",
          amountKobo: 500_000,
          senderName: "AMARA OKONKWO",
          isSuccessful: true,
          confidence: 1.0,
        }),
      );


function message(id: string, from: string, payload: Record<string, unknown>) {
  return { id, from, ...payload };
}

async function post(...messages: Array<Record<string, unknown>>) {
  return handleHttp(ctx, {
    method: "POST",
    url: "/webhook",
    payload: { entry: [{ changes: [{ value: { messages } }] }] },
  });
}

function say(id: string, from: string, body: string) {
  return message(id, from, { type: "text", text: { body } });
}
function press(id: string, from: string, action: Parameters<typeof encodeButtonId>[0]) {
  return message(id, from, { type: "interactive", interactive: { type: "button_reply", button_reply: { id: encodeButtonId(action) } } });
}
function snap(id: string, from: string, imageId: string) {
  return message(id, from, { type: "image", image: { id: imageId } });
}

console.log(`vision: ${process.env.LIVE_VISION === "1" ? "REAL GEMINI" : "stub (set LIVE_VISION=1 for real extraction)"}\n`);

await post(say("m1", CUSTOMER, "start"));
await post(press("m2", CUSTOMER, { a: "vs", v: "A3" }));
await post(press("m3", CUSTOMER, { a: "add", v: "A3", s: "PAR-1", q: 1 }));
await post(press("m4", CUSTOMER, { a: "done", v: "A3" }));
const payment = await post(snap("m5", CUSTOMER, "media-receipt-01"));
await post(press("m6", OWNER, { a: "ap", o: "1001" }));

const order = (await ctx.repos.orders.getById("1001"))!;
const payments = await ctx.repos.payments.listByOrder("1001");
const events = await ctx.repos.events.listByOrder("1001");
const items = await ctx.repos.items.getByVendor("A3");
const messenger = ctx.messenger as unknown as { sent: Array<{ type: string; waId: string; payload: { text?: string; body?: string } }> };
const customerMsgs = messenger.sent.filter((s) => s.waId === CUSTOMER);

console.log(`webhook responses: 200=${payment.statusCode} (expected 200)`);
console.log(`order 1001 status: ${order.status} (expected APPROVED)`);
console.log(`payment verdict:   ${payments[0]?.verdict} · N${(payments[0]?.amountKobo ?? 0) / 100}`);
console.log(`narration matched: ${payments[0]?.narration === "GFT-A3-1001"}`);
console.log(`stock PAR-1:       ${items.find((i) => i.sku === "PAR-1")!.stock} (expected 9)`);
console.log(`events:            ${events.map((e) => e.action).join(" -> ")}`);
console.log(`customer msgs:     ${customerMsgs.length}`);
console.log("\n=== last customer messages ===");
for (const m of customerMsgs.slice(-4)) {
  console.log(`  [${m.type}] ${(m.payload.text ?? m.payload.body ?? "").slice(0, 110)}`);
}

const ok = order.status === "APPROVED" && payments[0]?.verdict === "applied" && items.find((i) => i.sku === "PAR-1")!.stock === 9;
console.log(`\n${ok ? "PASS" : "FAIL"} — end-to-end webhook flow`);
process.exit(ok ? 0 : 1);
