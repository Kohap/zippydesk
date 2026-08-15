import type { AppContext } from "./context";
import { handleWebhookPost, verifyWebhook } from "./webhook/dispatch";

export interface HttpResponse {
  statusCode: number;
  body: string;
  json(): unknown;
}

export interface HttpRequest {
  method: "GET" | "POST" | "PATCH";
  url?: string;
  payload?: unknown;
  cookie?: string | null;
}

/**
 * Minimal injectable HTTP shim replacing the old Fastify dev server:
 * webhook GET challenge, webhook POST dispatch, health + dashboard reads.
 * Used by scripts and tests that need a framework-free full-flow harness.
 */
export async function handleHttp(ctx: AppContext, req: HttpRequest): Promise<HttpResponse> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const json = (body: unknown, statusCode = 200): HttpResponse => ({
    statusCode,
    body: JSON.stringify(body),
    json: () => body,
  });

  if (url.pathname === "/webhook") {
    if (req.method === "GET") {
      const query: Record<string, string | undefined> = {};
      for (const [k, v] of url.searchParams.entries()) query[k] = v;
      const challenge = verifyWebhook(query, {
        service: ctx.service,
        repos: ctx.repos,
        vision: ctx.vision,
        media: ctx.media,
        window: ctx.window,
        verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "dev-verify-token",
      });
      if (challenge === null) return { statusCode: 403, body: "verification failed", json: () => ({}) };
      return { statusCode: 200, body: challenge, json: () => ({}) };
    }
    if (req.method === "POST") {
      const received = await handleWebhookPost(req.payload, {
        service: ctx.service,
        repos: ctx.repos,
        vision: ctx.vision,
        media: ctx.media,
        window: ctx.window,
        verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? "dev-verify-token",
      });
      return json({ received });
    }
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    return json({ ok: true, time: new Date().toISOString(), meta: ctx.meta });
  }

  return { statusCode: 404, body: "not found", json: () => ({}) };
}