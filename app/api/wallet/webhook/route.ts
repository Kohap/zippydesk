import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";
import { consumeCredit } from "@/lib/api/wallet";

export const dynamic = "force-dynamic";

/**
 * Simulates a Paystack webhook receiver for `PAYMENT_VERIFIED` events. In a
 * real deployment, Paystack POSTs the event here, the engine verifies the
 * HMAC signature, then deducts the per-order credit. Here we expose a
 * trigger the dashboard can fire to exercise the lockout path and the
 * transaction log without leaving the browser.
 */
export async function POST(request: Request) {
  const ctx = getAppContext();
  const merchantId = getSessionMerchantId(request);
  if (!merchantId) return NextResponse.json({ error: "no session" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as
    | { event?: string; orderId?: string; amountKobo?: number; reference?: string }
    | null;
  if (!body || !body.event) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  if (body.event === "PAYMENT_VERIFIED") {
    const orderId = body.orderId?.trim() || `evt-${Date.now()}`;
    try {
      const result = await consumeCredit(ctx, merchantId, orderId, `paystack_event:${body.reference ?? orderId}`);
      return NextResponse.json({
        ok: true,
        event: body.event,
        orderId,
        amountKobo: body.amountKobo ?? null,
        balanceAfter: result.wallet.balanceCredits,
        lowBalance: result.lowBalance,
        locked: result.locked,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "consume failed";
      const code = message.includes("zero balance") ? "MANUAL_VERIFICATION_REQUIRED" : "consume_failed";
      return NextResponse.json(
        { ok: false, code, locked: code === "MANUAL_VERIFICATION_REQUIRED", event: body.event, orderId, error: message },
        { status: 402 },
      );
    }
  }

  return NextResponse.json({ ok: false, error: `unsupported event ${body.event}` }, { status: 400 });
}