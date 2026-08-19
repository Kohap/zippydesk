import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { sessionCookieValue } from "@/lib/auth/session";
import { listMerchants } from "@/lib/api/merchants";
import { AuthSelectSchema } from "@/lib/validation/schemas";
import { rateLimitMiddleware } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = rateLimitMiddleware(`auth:${ip}`, 10);
  if (rateLimit) return rateLimit;

  const ctx = getAppContext();
  const raw = await request.json().catch(() => null);
  const parsed = AuthSelectSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  const merchantId = body.merchantId;
  const merchants = await listMerchants(ctx);
  if (!merchants.some((m) => m.id === merchantId)) {
    return NextResponse.json({ error: "unknown merchant" }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true, merchantId });
  res.headers.append("Set-Cookie", sessionCookieValue(merchantId));
  return res;
}
