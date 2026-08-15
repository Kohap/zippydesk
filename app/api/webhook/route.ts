import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { handleWebhookPost, verifyWebhook, type WebhookDeps } from "@/lib/webhook/dispatch";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query: Record<string, string | undefined> = {};
  for (const [k, v] of url.searchParams.entries()) query[k] = v;
  const challenge = verifyWebhook(query, deps());
  if (challenge === null) return new Response("verification failed", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body === null) return NextResponse.json({ received: 0 }, { status: 400 });
  const received = await handleWebhookPost(body, deps());
  return NextResponse.json({ received });
}
