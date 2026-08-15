import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = getAppContext();
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    meta: ctx.meta,
  });
}
