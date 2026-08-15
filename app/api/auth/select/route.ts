import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { sessionCookieValue } from "@/lib/auth/session";
import { listMerchants } from "@/lib/api/merchants";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = getAppContext();
  const body = (await request.json().catch(() => null)) as { merchantId?: string } | null;
  const merchantId = body?.merchantId;
  if (!merchantId) return NextResponse.json({ error: "merchantId is required" }, { status: 400 });
  const merchants = await listMerchants(ctx);
  if (!merchants.some((m) => m.id === merchantId)) {
    return NextResponse.json({ error: "unknown merchant" }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true, merchantId });
  res.headers.append("Set-Cookie", sessionCookieValue(merchantId));
  return res;
}
