import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/context";
import { getSessionMerchantId } from "@/lib/auth/route";
import { getMerchant } from "@/lib/api/merchants";

export const dynamic = "force-dynamic";

const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
const NAME_MAX = 80;

export async function PATCH(request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const ctx = getAppContext();
  const merchantId = getSessionMerchantId(request);
  if (!merchantId) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { sku } = await params;
  const body = (await request.json().catch(() => null)) as { stock?: number; active?: boolean; priceKobo?: number } | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const bundle = await getMerchant(ctx, merchantId);
  if (!bundle) return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  const vendorIds = bundle.vendors.map((v) => v.id);
  const item = bundle.vendors.flatMap((v) => v.items).find((i) => i.sku === sku);
  const ownerId = item ? itemVendorId(item, bundle) : undefined;
  const owned = !item || !ownerId || !vendorIds.includes(ownerId);
  if (owned) {
    return NextResponse.json({ error: "item not found" }, { status: 404 });
  }

  const patch: { stock?: number; active?: boolean; priceKobo?: number } = {};
  if (body.stock !== undefined) {
    if (!Number.isInteger(body.stock) || body.stock < 0 || body.stock > 100_000) {
      return NextResponse.json({ error: "stock must be a whole number" }, { status: 400 });
    }
    patch.stock = body.stock;
  }
  if (body.active !== undefined) patch.active = Boolean(body.active);
  if (body.priceKobo !== undefined) {
    if (!Number.isInteger(body.priceKobo) || body.priceKobo < 0) {
      return NextResponse.json({ error: "price must be a whole number" }, { status: 400 });
    }
    patch.priceKobo = body.priceKobo;
  }

  if (!process.env.DATABASE_URL) {
    const inMemory = ctx.config.vendors.flatMap((v) => v.items.map((i) => ({ ...i, vendorId: v.id })));
    const mem = inMemory.find((i) => i.sku === sku);
    if (!mem) return NextResponse.json({ error: "item not found" }, { status: 404 });
    if (patch.stock !== undefined) mem.stock = patch.stock;
    if (patch.active !== undefined) mem.active = patch.active;
    if (patch.priceKobo !== undefined) mem.priceKobo = patch.priceKobo;
    return NextResponse.json({ ok: true, item: { sku, name: mem.name, priceKobo: mem.priceKobo, stock: mem.stock, active: mem.active } });
  }

  const { getPrisma } = await import("@/lib/infra/prisma");
  const updated = await getPrisma().vendorItem.updateMany({
    where: { sku, vendorId: { in: vendorIds } },
    data: patch,
  });
  if (updated.count === 0) return NextResponse.json({ error: "item not found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: { sku, ...patch } });
}

export async function POST(request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const ctx = getAppContext();
  const merchantId = getSessionMerchantId(request);
  if (!merchantId) return NextResponse.json({ error: "no session" }, { status: 401 });
  const { sku } = await params;
  const body = (await request.json().catch(() => null)) as {
    vendorId?: string;
    name?: string;
    priceKobo?: number;
    stock?: number;
  } | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  if (!SKU_RE.test(sku)) return NextResponse.json({ error: "SKU must be uppercase letters, digits, or hyphens" }, { status: 400 });
  const itemName = body.name?.trim() ?? "";
  if (itemName.length < 2 || itemName.length > NAME_MAX) {
    return NextResponse.json({ error: "Enter a name between 2 and 80 characters" }, { status: 400 });
  }
  if (!Number.isInteger(body.priceKobo) || (body.priceKobo ?? -1) < 0) {
    return NextResponse.json({ error: "Price must be a whole number of kobo" }, { status: 400 });
  }
  if (!Number.isInteger(body.stock) || (body.stock ?? -1) < 0 || (body.stock ?? 0) > 100_000) {
    return NextResponse.json({ error: "Stock must be a whole number" }, { status: 400 });
  }
  const priceKobo = body.priceKobo as number;
  const stockNum = body.stock as number;

  const bundle = await getMerchant(ctx, merchantId);
  if (!bundle) return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  const vendorIds = bundle.vendors.map((v) => v.id);
  if (!body.vendorId || !vendorIds.includes(body.vendorId)) {
    return NextResponse.json({ error: "Pick a vendor from this shop" }, { status: 400 });
  }
  const duplicate = bundle.vendors.flatMap((v) => v.items).some((i) => i.sku === sku);
  if (duplicate) return NextResponse.json({ error: "That SKU already exists" }, { status: 409 });

  if (!process.env.DATABASE_URL) {
    const vendor = ctx.config.vendors.find((v) => v.id === body.vendorId);
    if (!vendor) return NextResponse.json({ error: "vendor not found" }, { status: 404 });
    vendor.items.push({ sku, name: itemName, priceKobo, stock: stockNum, active: true });
    return NextResponse.json({ ok: true, item: { sku, name: itemName, priceKobo, stock: stockNum, active: true } });
  }

  const { getPrisma } = await import("@/lib/infra/prisma");
  const created = await getPrisma().vendorItem.create({
    data: {
      vendorId: body.vendorId,
      sku,
      name: itemName,
      priceKobo,
      stock: stockNum,
      active: true,
    },
  });
  return NextResponse.json({ ok: true, item: { sku: created.sku, name: created.name, priceKobo: created.priceKobo, stock: created.stock, active: created.active } });
}

function itemVendorId(
  item: { sku: string },
  bundle: { vendors: Array<{ id: string; items: Array<{ sku: string }> }> },
): string | undefined {
  return bundle.vendors.find((v) => v.items.some((i) => i.sku === item.sku))?.id;
}
