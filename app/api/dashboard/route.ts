import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";
import { dashboardData } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = getAppContext();
  const merchantId = getSessionMerchantId(request);
  if (!merchantId) return NextResponse.json({ error: "no session" }, { status: 401 });
  const data = await dashboardData(ctx, merchantId);
  if (!data) return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  return NextResponse.json(data);
}
