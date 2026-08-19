import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAppContext } from "@/lib/context";
import { handleWebhookPost, verifyWebhook, type WebhookDeps } from "@/lib/webhook/dispatch";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const ctx = getAppContext();

function deps(): WebhookDeps {
  return {
    service: ctx.service,
    repos: ctx.repos,
    vision: ctx.vision,
    media: ctx.media,
    window: ctx.window,
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? "dev-verify-token",
  };
}

function verifySignature(body: string, signature: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signature) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(sigBuffer, expectedBuffer);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query: Record<string, string | undefined> = {};
  for (const [k, v] of url.searchParams.entries()) query[k] = v;
  const challenge = verifyWebhook(query, deps());
  if (challenge === null) return new Response("verification failed", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = rateLimitMiddleware(`webhook:${ip}`, 120);
  if (rateLimit) return rateLimit;

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (process.env.META_APP_SECRET && !verifySignature(body, signature)) {
    return new Response("signature verification failed", { status: 403 });
  }

  const parsed = body ? JSON.parse(body) : null;
  if (parsed === null) return NextResponse.json({ received: 0 }, { status: 400 });
  const received = await handleWebhookPost(parsed, deps());
  return NextResponse.json({ received });
}
