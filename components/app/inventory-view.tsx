"use client";

import * as React from "react";
import { RefreshCw, Pencil, Ban, CircleCheck, Plus } from "lucide-react";
import { usePoll } from "@/lib/use-poll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { formatNaira } from "@/lib/utils";
import type { DashboardData } from "@/lib/api/dashboard";

export function Inventory({ initial }: { initial: DashboardData }) {
  const { data, error, refresh } = usePoll<DashboardData>(
    async () => {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error("dashboard failed to load");
      return (await res.json()) as DashboardData;
    },
    5000,
  );
  const current = data ?? initial;
  const [addOpen, setAddOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink-text">Inventory & catalog</h1>
          <p className="text-[13px] text-ink-muted">
            Live stock, mirrored from the WhatsApp catalog. When an item hits zero, the next approval fails capacity and refunds automatically.
            {error ? <span className="text-bad"> Refresh failed, showing last state.</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-11" onClick={() => void refresh()} aria-label="Refresh now">
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </Button>
          <Button size="sm" className="h-11" onClick={() => setAddOpen(true)} disabled={current.vendors.length === 0} aria-label="Add item to inventory">
            <Plus className="h-4 w-4" aria-hidden /> Add item
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {current.vendors.map((vendor) => (
          <Card key={vendor.id}>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5 md:px-5">
                <div>
                  <p className="text-[15px] font-semibold text-ink-text">{vendor.name}</p>
                  <p className="data mt-0.5 text-[12px] text-ink-faint">{vendor.bankAccount}</p>
                </div>
                <Badge variant="ocean">{vendor.id}</Badge>
              </div>
              <div className="flex flex-col divide-y divide-line">
                {vendor.items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[13px] text-ink-faint md:px-5">
                    No items in this vendor yet. Add the first one to start receiving orders.
                  </p>
                ) : null}
                {vendor.items.map((item) => (
                  <ItemRow key={item.sku} item={item} vendorId={vendor.id} onChanged={() => void refresh()} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AddItemDialog
        vendors={current.vendors}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => void refresh()}
      />
    </div>
  );
}

function AddItemDialog({
  vendors,
  open,
  onOpenChange,
  onAdded,
}: {
  vendors: DashboardData["vendors"];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const [vendorId, setVendorId] = React.useState(vendors[0]?.id ?? "");
  const [sku, setSku] = React.useState("");
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [stock, setStock] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setVendorId((current) => current || vendors[0]?.id || "");
      setSku("");
      setName("");
      setPrice("");
      setStock("");
      setErr(null);
    }
  }, [open, vendors]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const priceKobo = Math.round(Number(price) * 100);
      const stockNum = Number(stock);
      if (!Number.isFinite(priceKobo) || priceKobo < 0) throw new Error("Enter a valid price");
      if (!Number.isInteger(stockNum) || stockNum < 0) throw new Error("Enter a whole number of units in stock");
      const res = await fetch(`/api/inventory/${encodeURIComponent(sku)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, name, priceKobo, stock: stockNum }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "create failed");
      }
      onAdded();
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add a new item</DialogTitle>
        <DialogDescription>
          It appears in the catalogue immediately and the WhatsApp storefront picks it up on the next refresh.
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Vendor" htmlFor="add-vendor">
            <Select id="add-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.id})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SKU" htmlFor="add-sku" hint="Uppercase letters, digits, hyphens">
              <Input
                id="add-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="SKU-101"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Price (N)" htmlFor="add-price">
              <Input
                id="add-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="2500"
                required
              />
            </Field>
          </div>
          <Field label="Display name" htmlFor="add-name">
            <Input
              id="add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="House special 2L"
              required
            />
          </Field>
          <Field label="Initial stock" htmlFor="add-stock">
            <Input
              id="add-stock"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              inputMode="numeric"
              placeholder="20"
              required
            />
          </Field>
          {err ? <p role="alert" className="text-[13px] text-bad">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? "Adding..." : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({
  item,
  vendorId,
  onChanged,
}: {
  item: DashboardData["vendors"][number]["items"][number];
  vendorId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [price, setPrice] = React.useState(String(item.priceKobo / 100));
  const [restockQty, setRestockQty] = React.useState("5");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const out = item.stock <= 0;

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/inventory/${item.sku}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "update failed");
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  async function savePrice() {
    const naira = Number(price);
    if (!Number.isFinite(naira) || naira < 0) {
      setErr("enter a valid price");
      return;
    }
    await patch({ priceKobo: Math.round(naira * 100) });
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="data text-[14px] font-medium text-ink-text">{item.sku}</span>
          <span className="text-[14px] text-ink-muted">{item.name}</span>
          {out ? (
            <Badge variant="bad" dot>
              FAILED_CAPACITY
            </Badge>
          ) : item.stock <= 2 ? (
            <Badge variant="warn">low stock</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {editing ? (
            <span className="flex items-center gap-2">
              <span className="text-ink-muted">Price</span>
              <span className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">N</span>
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  size={8}
                  aria-label="Price in naira"
                  className="h-9 w-32 pl-7 text-[13px]"
                />
              </span>
              <Button size="sm" disabled={busy} onClick={() => void savePrice()}>
                Save
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="data text-[14px] font-medium text-ink-text">{formatNaira(item.priceKobo)}</span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="assist-focus flex min-h-[44px] items-center rounded-[8px] text-[12px] text-ink-faint transition-colors hover:text-aqua-bright"
                aria-label={`Edit price for ${item.name}`}
              >
                <Pencil className="h-3 w-3" aria-hidden /> edit
              </button>
            </span>
          )}
          <span className={out ? "text-bad" : "text-ink-muted"}>
            {out ? "sold out" : `${item.stock} in stock`}
          </span>
        </div>
        {err ? <p className="text-[12px] text-bad">{err}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {out ? (
          <span className="flex items-center gap-2">
            <Input
              value={restockQty}
              onChange={(e) => setRestockQty(e.target.value)}
              inputMode="numeric"
              size={4}
              aria-label="Restock quantity"
              className="h-11 w-20 text-[13px]"
            />
            <Button size="sm" className="h-11" disabled={busy} onClick={() => void patch({ stock: Number(restockQty) || 0, active: true })}>
              Restock
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            className="h-11"
            variant="danger"
            disabled={busy}
            onClick={() => void patch({ stock: 0, active: false })}
            aria-label={`Mark ${item.name} out of stock`}
          >
            <Ban className="h-3.5 w-3.5" aria-hidden /> Out of stock
          </Button>
        )}
        <Button
          size="sm"
          className="h-11"
          variant={item.active ? "quiet" : "ghost"}
          disabled={busy || item.active}
          onClick={() => void patch({ active: true })}
          aria-label={`Reactivate ${item.name}`}
        >
          <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Active
        </Button>
      </div>
    </div>
  );
}
