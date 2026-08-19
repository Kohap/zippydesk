import type { OrderService } from "../app/order-service";
import type { Repositories } from "../ports/repositories";
import type { VisionExtractor } from "../ports/vision";
import type { MediaFetcher } from "../ports/media";
import type { WindowStore } from "../ports/window";
import { WebhookPayloadSchema } from "../validation/schemas";

export interface WebhookDeps {
  service: OrderService;
  repos: Repositories;
  vision: VisionExtractor;
  media: MediaFetcher;
  window: WindowStore;
  verifyToken: string;
}

interface MetaMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string };
  interactive?: { type?: string; button_reply?: { id?: string } };
}

export function verifyWebhook(query: Record<string, string | undefined>, deps: WebhookDeps): string | null {
  if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === deps.verifyToken) {
    return query["hub.challenge"] ?? null;
  }
  return null;
}

export async function handleWebhookPost(body: unknown, deps: WebhookDeps): Promise<number> {
  const parsed = WebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    console.warn("webhook payload validation failed", parsed.error.issues);
    return 0;
  }
  const payload = parsed.data;
  const messages = payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  for (const msg of messages as MetaMessage[]) {
    const msgId = msg.id ?? "";
    if (!msgId || (await deps.repos.ingested.exists(msgId))) continue;
    const waId = msg.from ?? "";
    await deps.repos.ingested.save(msgId, waId, "processing");
    if (msg.from) await deps.window.markInbound(msg.from, new Date());
    try {
      await dispatch(msg, deps);
      await deps.repos.ingested.save(msgId, waId, "done");
    } catch (err) {
      await deps.repos.ingested.save(msgId, waId, "error");
      console.error({ err }, "webhook dispatch failed");
    }
  }
  return messages.length;
}

async function dispatch(msg: MetaMessage, deps: WebhookDeps): Promise<void> {
  if (!msg.from) return;
  if (msg.type === "text" && msg.text?.body) {
    await deps.service.onCustomerText(msg.from, msg.text.body);
  } else if (msg.type === "image" && msg.image?.id) {
    const started = Date.now();
    const bytes = await deps.media.fetchImage(msg.image.id);
    // Wallet gate: never spend AI credits with an empty wallet. The raw
    // receipt is forwarded to the owner for manual verification instead.
    // The order resolved here is authoritative — the fallback must not
    // re-locate a different order for the same customer.
    const pendingOrder = await deps.service.getActivePaymentOrder(msg.from);
    if (pendingOrder) {
      const merchant = deps.service.merchantOf(pendingOrder.vendorId);
      if ((await deps.repos.wallet.getBalance(merchant.merchantId)) <= 0) {
        await deps.service.receiptManualFallback(pendingOrder.id, msg.from, msg.from, msg.id ?? "", { bytes, caption: `GFT receipt — order ${pendingOrder.id}` });
        return;
      }
    }
    const receipt = await deps.vision.extractReceipt(bytes);
    await deps.service.applyPayment(msg.from, msg.id ?? "", receipt, Date.now() - started);
  } else if (msg.type === "interactive" && msg.interactive?.button_reply?.id) {
    await deps.service.handleButton(msg.from, msg.interactive.button_reply.id);
  }
}
