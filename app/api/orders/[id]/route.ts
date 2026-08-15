import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";
import { orderDetail } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = getAppContext();
  if (!getSessionMerchantId(request)) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { id } = await params;
  const detail = await orderDetail(ctx, id);
  if (!detail) return NextResponse.json({ error: "order not found" }, { status: 404 });
  return NextResponse.json(detail);
}
