import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";
import { getMerchant } from "@/lib/api/merchants";
import { topUpWallet, type TopUpMethod } from "@/lib/api/wallet";
import { WalletTopupSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const METHODS: readonly TopUpMethod[] = ["card", "transfer", "virtual_account"];

export async function POST(request: Request) {
  const ctx = getAppContext();
  const merchantId = getSessionMerchantId(request);
  if (!merchantId) return NextResponse.json({ error: "no session" }, { status: 401 });
  const raw = await request.json().catch(() => null);
  const parsed = WalletTopupSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  const method = METHODS.includes(body.method as TopUpMethod) ? (body.method as TopUpMethod) : "card";
  const bundle = await getMerchant(ctx, merchantId);
  if (!bundle) return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  try {
    const wallet = await topUpWallet(ctx, merchantId, body.credits, method, bundle);
    return NextResponse.json({ ok: true, wallet });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "top-up failed" }, { status: 400 });
  }
}
