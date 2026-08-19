import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";
import { consumeCredit } from "@/lib/api/wallet";
import { WalletConsumeSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * Simulates the post-deduction step that fires after a PAYMENT_VERIFIED
 * webhook event is accepted by the bot runtime. Deducts one credit (the
 * unit cost defined by the merchant's tier).
 */
export async function POST(request: Request) {
  const ctx = getAppContext();
  const merchantId = getSessionMerchantId(request);
  if (!merchantId) return NextResponse.json({ error: "no session" }, { status: 401 });
  const raw = await request.json().catch(() => null);
  const parsed = WalletConsumeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  const orderId = body.orderId?.trim() || `sim-${Date.now()}`;
  const reason = body.reason?.trim() || "order_processed";
  try {
    const result = await consumeCredit(ctx, merchantId, orderId, reason);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "consume failed";
    const code = message.includes("zero balance") ? "MANUAL_VERIFICATION_REQUIRED" : "consume_failed";
    return NextResponse.json({ error: message, code, locked: code === "MANUAL_VERIFICATION_REQUIRED" }, { status: 402 });
  }
}