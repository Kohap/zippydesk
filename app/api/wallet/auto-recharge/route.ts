import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";
import { setAutoRecharge } from "@/lib/api/wallet";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = getAppContext();
  const merchantId = getSessionMerchantId(request);
  if (!merchantId) return NextResponse.json({ error: "no session" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { enabled?: boolean; amount?: number } | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  try {
    const wallet = await setAutoRecharge(ctx, merchantId, Boolean(body.enabled), body.amount);
    return NextResponse.json({ ok: true, wallet });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "update failed" }, { status: 400 });
  }
}
