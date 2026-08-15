import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = getAppContext();
  if (!getSessionMerchantId(request)) return NextResponse.json({ error: "no session" }, { status: 401 });
  await ctx.maintenance.runDaily();
  return NextResponse.json({ ok: true });
}
