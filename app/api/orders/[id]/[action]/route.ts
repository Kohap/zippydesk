import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";
import { actOnOrder, type OrderAction } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

const ACTIONS: readonly OrderAction[] = ["approve", "reject", "refund-confirm"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const ctx = getAppContext();
  if (!getSessionMerchantId(request)) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { id, action } = await params;
  if (!ACTIONS.includes(action as OrderAction)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const result = await actOnOrder(ctx, id, action as OrderAction);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "action failed" }, { status: 409 });
  }
  return NextResponse.json(result);
}
