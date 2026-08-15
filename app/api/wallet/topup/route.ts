import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";
import { getMerchant } from "@/lib/api/merchants";
import { topUpWallet, type TopUpMethod } from "@/lib/api/wallet";

export const dynamic = "force-dynamic";

const METHODS: readonly TopUpMethod[] = ["card", "transfer", "virtual_account"];

export async function POST(request: Request) {
  const ctx = getAppContext();
  const merchantId = getSessionMerchantId(request);
  if (!merchantId) return NextResponse.json({ error: "no session" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { credits?: number; method?: string } | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const method = METHODS.includes(body.method as TopUpMethod) ? (body.method as TopUpMethod) : "card";
  const bundle = await getMerchant(ctx, merchantId);
  if (!bundle) return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  try {
    const wallet = await topUpWallet(ctx, merchantId, Number(body.credits), method, bundle);
    return NextResponse.json({ ok: true, wallet });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "top-up failed" }, { status: 400 });
  }
}
