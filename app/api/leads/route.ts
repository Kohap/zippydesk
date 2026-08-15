import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getMerchant } from "@/lib/api/merchants";

export const dynamic = "force-dynamic";

const PHONE_RE = /^\+?[0-9][0-9\s-]{6,17}$/;

// Map the qualifying dropdown value to a representative integer for the
// `Lead.missedOrders` column. The schema needs a number; the bucket keeps the
// lead capture honest without forcing the merchant to estimate.
const BUCKET_MIDPOINT: Record<string, number> = {
  lt5: 2,
  "5to15": 10,
  "15to40": 27,
  "40plus": 60,
};

export async function POST(request: Request) {
  const ctx = getAppContext();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const shopName = typeof body.shopName === "string" && body.shopName.trim() ? body.shopName.trim() : null;
  const businessType = typeof body.businessType === "string" ? body.businessType.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const rawBucket = typeof body.missedOrders === "string" ? body.missedOrders.trim() : "";
  const missedOrders = BUCKET_MIDPOINT[rawBucket] ?? (typeof body.missedOrders === "number" ? body.missedOrders : Number(body.missedOrders));

  if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "Enter your name" }, { status: 400 });
  if (!businessType || businessType.length > 60) return NextResponse.json({ error: "Select a business type" }, { status: 400 });
  if (!PHONE_RE.test(phone)) return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
  if (!Number.isFinite(missedOrders) || missedOrders < 0 || missedOrders > 100_000) {
    return NextResponse.json({ error: "Pick a missed-orders range" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, id: "mem-lead" });
  }

  const { getPrisma } = await import("@/lib/infra/prisma");
  const lead = await getPrisma().lead.create({
    data: { name, shopName, businessType, phone, missedOrders, source: "landing" },
  });
  return NextResponse.json({ ok: true, id: lead.id });
}
