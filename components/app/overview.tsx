"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Fuel, Banknote, Clock3, Gauge } from "lucide-react";
import { usePoll } from "@/lib/use-poll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/switch";
import { formatNaira, timeAgo, dueIn, cn } from "@/lib/utils";
import { receiptStatus, assignedActor, itemLine, phoneLabel } from "@/lib/order-labels";
import type { DashboardData, OrderSummary } from "@/lib/api/dashboard";

interface OrderDetail {
  order: OrderSummary;
  payments: Array<{ id: string; amountKobo: number; narration: string; verdict: string; validationMs: number | null; createdAt: string }>;
  events: Array<{ id: string; actor: string; action: string; at: string }>;
  refund: { id: string; amountKobo: number; status: string } | null;
}

export function Overview({ initial }: { initial: DashboardData }) {
  const { data, error, loading, refresh } = usePoll<DashboardData>(
    async () => {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error("dashboard failed to load");
      return (await res.json()) as DashboardData;
    },
    5000,
  );
  const current = data ?? initial;

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-5 p-4 md:p-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const lowBalance = current.wallet.balanceCredits < current.wallet.lowThreshold;
  const needQueue = current.queue.filter((q) => q.kind === "approval");
  const refundQueue = current.queue.filter((q) => q.kind === "refund");
  const avg = current.kpis.avgValidationMs != null ? `${(current.kpis.avgValidationMs / 1000).toFixed(1)}s` : "n/a";

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink-text">Overview</h1>
          <p className="text-[13px] text-ink-muted">
            Everything your shop needs tonight, on one screen. {error ? <span className="text-bad">Refresh failed, showing last state.</span> : null}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} aria-label="Refresh now">
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>

      {lowBalance ? (
        <div className="flex flex-col gap-3 rounded-[12px] border border-warn-line bg-warn-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
            <div>
              <p className="text-[14px] font-medium text-ink-text">Wallet running low</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                {current.wallet.balanceCredits} credits left, below your {current.wallet.lowThreshold}-credit floor. Each order burns one credit.
              </p>
            </div>
          </div>
          <Link href="/billing" className="shrink-0">
            <Button size="sm">Top up</Button>
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <WalletStat
          index={0}
          balance={current.wallet.balanceCredits}
          floor={current.wallet.lowThreshold}
          unit="credits"
          icon={Fuel}
          sub={lowBalance ? "below floor" : "healthy"}
        />
        <Kpi index={1} label="Revenue verified today" value={formatNaira(current.kpis.revenueTodayKobo)} icon={Banknote} tone="text" sub="approved + refunded" />
        <Kpi index={2} label="Orders processed today" value={String(current.kpis.ordersToday)} icon={Clock3} tone="text" sub="across all vendors" />
        <Kpi index={3} label="Avg receipt validation" value={avg} icon={Gauge} tone="text" sub="vision AI latency" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 pt-4 md:px-5">
                <h2 className="text-[15px] font-semibold text-ink-text">Live order stream</h2>
                <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-aqua-line bg-aqua-soft px-2 py-[3px] text-[12px] font-medium text-aqua-text">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-aqua" aria-hidden />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aqua-bright" aria-hidden />
                  </span>
                  polling 5s
                </span>
              </div>
              <OrderStream orders={current.orders} onChanged={() => void refresh()} />
            </CardContent>
          </Card>

          {(needQueue.length > 0 || refundQueue.length > 0) && (
            <Card>
              <CardContent className="p-0">
                <div className="px-4 pt-4 md:px-5">
                  <h2 className="text-[15px] font-semibold text-ink-text">Needs you</h2>
                  <p className="mt-0.5 text-[13px] text-ink-muted">The 5-minute ladder is running. Act before it escalates.</p>
                </div>
                <div className="flex flex-col divide-y divide-line px-1 pt-2">
                  {needQueue.map((q) => (
                    <ApprovalRow key={q.orderId} queue={q} order={current.orders.find((o) => o.id === q.orderId)} onChanged={() => void refresh()} />
                  ))}
                  {refundQueue.map((q) => {
                    const order = current.orders.find((o) => o.id === q.orderId);
                    if (!order) return null;
                    return (
                      <div key={q.orderId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="data text-[14px] font-medium text-ink-text">{order.id}</p>
                          <p className="mt-0.5 text-[13px] text-ink-muted">
                            Refund {formatNaira(order.amountPaidKobo)} to {phoneLabel(order.customerWaId)}
                          </p>
                        </div>
                        <RefundButton orderId={order.id} onDone={() => void refresh()} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <QuickActions wallet={current.wallet} onWalletChange={refresh} onMaintenance={refresh} />
      </div>
    </div>
  );
}

function WalletStat({
  balance,
  floor,
  unit,
  icon: Icon,
  sub,
  index = 0,
}: {
  balance: number;
  floor: number;
  unit: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  sub?: string;
  index?: number;
}) {
  const ratio = Math.min(1, balance / (floor * 4));
  return (
    <div className="order-slide-in card-elevated flex flex-col gap-2 p-4" style={{ animationDelay: `${index * 90}ms`, opacity: 0 }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-aqua-bright" aria-hidden />
          <span className="label-caps">Wallet balance</span>
        </div>
        <Link href="/billing" className="assist-focus rounded-[6px] text-[12px] font-medium text-aqua-text transition-colors hover:text-aqua-bright">
          Top up
        </Link>
      </div>
      <p key={balance} className="count-in money mt-1 text-[26px] font-semibold leading-none text-aqua-bright">
        {balance}
        <span className="ml-1.5 text-[13px] font-normal text-ink-faint">{unit}</span>
      </p>
      <div aria-hidden className="mt-1 h-1 w-full overflow-hidden rounded-full bg-panel-3">
        <div className="h-full rounded-full bg-gradient-to-r from-ocean to-aqua" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="text-[12px] text-ink-faint">{sub} · floor {floor}</p>
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  icon: Icon,
  tone,
  sub,
  index = 0,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: "brand" | "text";
  sub?: string;
  index?: number;
}) {
  return (
    <div
      className="order-slide-in card flex flex-col gap-1 p-4"
      style={{ animationDelay: `${index * 90}ms`, opacity: 0 }}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", tone === "brand" ? "text-aqua-bright" : "text-ink-faint")} aria-hidden />
        <span className="label-caps">{label}</span>
      </div>
      <p
        key={value}
        className={cn(
          "count-in money mt-1 text-[24px] font-semibold leading-none",
          tone === "brand" ? "text-aqua-bright" : "text-ink-text",
        )}
      >
        {value}
        {unit ? <span className="ml-1.5 text-[13px] font-normal text-ink-faint">{unit}</span> : null}
      </p>
      {sub ? <p className="text-[12px] text-ink-faint">{sub}</p> : null}
    </div>
  );
}

function OrderStream({ orders, onChanged }: { orders: DashboardData["orders"]; onChanged: () => void }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Record<string, OrderDetail>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function toggle(id: string) {
    const next = openId === id ? null : id;
    setOpenId(next);
    if (next && !detail[next]) {
      try {
        const res = await fetch(`/api/orders/${next}`, { cache: "no-store" });
        if (res.ok) {
          const d = (await res.json()) as OrderDetail;
          setDetail((prev) => ({ ...prev, [next]: d }));
        }
      } catch {
        /* keep the row, detail stays closed */
      }
    }
  }

  async function act(orderId: string, action: "approve" | "reject" | "refund-confirm") {
    setBusy(orderId);
    setErr(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "action failed");
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "action failed");
    } finally {
      setBusy(null);
    }
  }

  const sorted = [...orders].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="mt-2">
      {err ? (
        <p role="alert" className="px-4 py-2 text-[13px] text-bad md:px-5">
          {err}
        </p>
      ) : null}
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-faint">
              <th className="px-4 py-2.5 font-medium md:px-5">Order</th>
              <th className="px-3 py-2.5 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">Item selected</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount due</th>
              <th className="px-3 py-2.5 font-medium">Receipt status</th>
              <th className="px-3 py-2.5 font-medium">Actor</th>
              <th className="px-3 py-2.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-ink-faint md:px-5">
                  No orders yet. Incoming WhatsApp orders will stream in here.
                </td>
              </tr>
            ) : null}
            {sorted.slice(0, 50).map((o) => {
              const st = receiptStatus(o.status, o.escalationLevel);
              return (
                <React.Fragment key={o.id}>
                  <tr className="transition-colors hover:bg-panel-2/50">
                    <td className="px-4 py-3 md:px-5">
                      <button
                        type="button"
                        onClick={() => void toggle(o.id)}
                        className="assist-focus flex min-h-[44px] md:min-h-10 items-center gap-2 rounded-[8px] text-left"
                        aria-expanded={openId === o.id}
                      >
                        <span className="data text-[13px] font-medium text-ink-text">{o.id}</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-ink-faint transition-transform duration-100", openId === o.id && "rotate-180")} aria-hidden />
                      </button>
                    </td>
                    <td className="data px-3 py-3 text-[13px] text-ink-muted">{phoneLabel(o.customerWaId)}</td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-[13px] text-ink-muted" title={itemLine(o.items)}>
                      {itemLine(o.items)}
                    </td>
                    <td className="data px-3 py-3 text-right text-[13px] text-ink-text">{formatNaira(o.balanceDueKobo)}</td>
                    <td className="px-3 py-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-ink-muted">{assignedActor(o.status, o.escalationLevel)}</td>
                    <td className="px-3 py-3 text-right">
                      {o.status === "PENDING_APPROVAL" ? (
                        <span className="inline-flex gap-1.5">
                          <Button size="sm" variant="ghost" disabled={busy === o.id} onClick={() => void act(o.id, "reject")}>
                            Reject
                          </Button>
                          <Button size="sm" disabled={busy === o.id} onClick={() => void act(o.id, "approve")}>
                            Approve
                          </Button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                  {openId === o.id ? (
                    <tr>
                      <td colSpan={7} className="bg-panel-2/40 px-4 py-4 md:px-5">
                        <OrderDetailPanel id={o.id} detail={detail[o.id]} />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderDetailPanel({ id, detail }: { id: string; detail: OrderDetail | undefined }) {
  if (!detail) return <p className="text-[13px] text-ink-faint">Loading detail...</p>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="label-caps mb-2">Payments</p>
        <div className="flex flex-col divide-y divide-line rounded-[10px] border border-line">
          {detail.payments.length === 0 ? <p className="px-3 py-3 text-[13px] text-ink-faint">No payments recorded.</p> : null}
          {detail.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-3 text-[13px]">
              <span className="data truncate text-ink-muted">{p.narration}</span>
              <span className="flex items-center gap-2">
                {p.validationMs != null ? (
                  <span className="text-[12px] text-ink-faint">{(p.validationMs / 1000).toFixed(1)}s</span>
                ) : null}
                <span className="data text-ink-text">{formatNaira(p.amountKobo)}</span>
                <Badge variant={p.verdict === "applied" ? "good" : p.verdict === "partial" ? "warn" : "neutral"}>{p.verdict}</Badge>
              </span>
            </div>
          ))}
        </div>
        {detail.refund ? (
          <p className="mt-3 text-[13px] text-ink-muted">
            Refund <span className="data text-ink-text">{formatNaira(detail.refund.amountKobo)}</span> {detail.refund.status}
          </p>
        ) : null}
      </div>
      <div>
        <p className="label-caps mb-2">Timeline</p>
        <ol className="flex flex-col gap-2.5">
          {detail.events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex items-center gap-2">
                <span className="data text-ink-muted">{e.actor}</span>
                <span className="text-ink-text">{e.action}</span>
              </span>
              <span className="text-[12px] text-ink-faint">{timeAgo(e.at)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ApprovalRow({
  queue,
  order,
  onChanged,
}: {
  queue: DashboardData["queue"][number];
  order: OrderSummary | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  if (!order) return null;

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/orders/${order!.id}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "action failed");
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "action failed");
    } finally {
      setBusy(false);
    }
  }

  const due = dueIn(queue.dueAt);
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="data text-[14px] font-medium text-ink-text">{order.id}</span>
          {queue.escalationLevel === 1 ? (
            <Badge variant="warn" dot>
              escalated
            </Badge>
          ) : due === "overdue" ? (
            <Badge variant="bad" dot>
              overdue
            </Badge>
          ) : (
            <Badge variant="ocean">{due ?? "approved on approval"}</Badge>
          )}
        </div>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          {itemLine(order.items)} - {formatNaira(order.totalKobo)} paid {formatNaira(order.amountPaidKobo)}
        </p>
        {err ? <p className="mt-1 text-[12px] text-bad">{err}</p> : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("reject")}>
          Reject
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void act("approve")}>
          Approve
        </Button>
      </div>
    </div>
  );
}

function RefundButton({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/refund-confirm`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "action failed");
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "action failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      {err ? <span className="text-[12px] text-bad">{err}</span> : null}
      <Button size="sm" variant="danger" disabled={busy} onClick={() => void confirm()}>
        Refund completed
      </Button>
    </div>
  );
}

function QuickActions({ wallet, onWalletChange, onMaintenance }: { wallet: DashboardData["wallet"]; onWalletChange: () => void; onMaintenance: () => void }) {
  const [accepting, setAccepting] = React.useState(wallet.acceptingOrders);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ran, setRan] = React.useState(false);

  async function toggleAccepting(next: boolean) {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/merchant/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepting: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "update failed");
      }
      setAccepting(next);
      onWalletChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "update failed");
    } finally {
      setSaving(false);
    }
  }

  async function runMaintenance() {
    setRan(false);
    setErr(null);
    const res = await fetch("/api/maintenance/run", { method: "POST" });
    if (res.ok) setRan(true);
    else setErr("maintenance failed");
    onMaintenance();
  }

  return (
    <Card className="h-fit">
      <CardContent className="p-5">
        <h2 className="text-[15px] font-semibold text-ink-text">Operational controls</h2>
        <p className="mt-1 text-[12px] text-ink-faint">The four switches that decide how tonight goes.</p>
        <div className="mt-4 flex flex-col divide-y divide-line">
          <div className="flex items-center justify-between gap-3 py-3.5">
            <div>
              <p className="text-[14px] font-medium text-ink-text">Accepting orders</p>
              <p className="text-[12px] text-ink-faint">Pause the catalog while you restock</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={accepting}
              aria-label="Accepting orders"
              disabled={saving}
              onClick={() => void toggleAccepting(!accepting)}
              className="flex min-h-[44px] items-center justify-center rounded-[10px] px-1.5 transition-colors hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
            >
              <span
                aria-hidden
                className={`relative inline-flex h-[26px] w-11 shrink-0 items-center rounded-full border transition-colors ${
                  accepting ? "border-aqua bg-aqua" : "border-line-strong bg-panel-3"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    accepting ? "translate-x-5" : "translate-x-[3px]"
                  }`}
                />
              </span>
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 py-3.5">
            <div>
              <p className="text-[14px] font-medium text-ink-text">Daily maintenance</p>
              <p className="text-[12px] text-ink-faint">Refund reminders and approval re-alerts</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void runMaintenance()} aria-label="Run daily maintenance now">
              {ran ? "Ran" : "Run now"}
            </Button>
          </div>
          <Link href="/inventory" className="flex items-center justify-between gap-3 py-3.5 transition-colors hover:bg-panel-2/40 -mx-5 px-5">
            <div>
              <p className="text-[14px] font-medium text-ink-text">Manage inventory</p>
              <p className="text-[12px] text-ink-faint">Toggle items, edit prices, restock</p>
            </div>
            <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
          </Link>
          <Link href="/billing" className="flex items-center justify-between gap-3 py-3.5 transition-colors hover:bg-panel-2/40 -mx-5 px-5">
            <div>
              <p className="text-[14px] font-medium text-ink-text">Top up credits</p>
              <p className="text-[12px] text-ink-faint">Paystack card, transfer, or virtual account</p>
            </div>
            <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
          </Link>
        </div>
        {err ? <p className="mt-3 text-[12px] text-bad">{err}</p> : null}
      </CardContent>
    </Card>
  );
}
