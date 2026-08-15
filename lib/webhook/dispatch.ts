import type { OrderService } from "../app/order-service";
import type { Repositories } from "../ports/repositories";
import type { VisionExtractor } from "../ports/vision";
import type { MediaFetcher } from "../ports/media";
import type { WindowStore } from "../ports/window";

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
  const payload = body as { entry?: Array<{ changes?: Array<{ value?: { messages?: MetaMessage[] } }> }> };
  const messages = payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  for (const msg of messages) {
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
    const receipt = await deps.vision.extractReceipt(bytes);
    await deps.service.applyPayment(msg.from, msg.id ?? "", receipt, Date.now() - started);
  } else if (msg.type === "interactive" && msg.interactive?.button_reply?.id) {
    await deps.service.handleButton(msg.from, msg.interactive.button_reply.id);
  }
}
