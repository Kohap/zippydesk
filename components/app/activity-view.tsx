"use client";

import * as React from "react";
import { RefreshCw, Timer, ArrowRight, CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import { usePoll } from "@/lib/use-poll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatNaira, timeAgo, dueIn, cn } from "@/lib/utils";
import type { DashboardData } from "@/lib/api/dashboard";

const ACTOR_LABEL: Record<string, string> = {
  owner: "Owner",
  assistant: "Assistant",
  customer: "Customer",
  system: "System",
};

export function Activity({ initial }: { initial: DashboardData }) {
  const { data, error, refresh } = usePoll<DashboardData>(
    async () => {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error("dashboard failed to load");
      return (await res.json()) as DashboardData;
    },
    5000,
  );
  const current = data ?? initial;

  const approvals = current.queue.filter((q) => q.kind === "approval");
  const refunds = current.queue.filter((q) => q.kind === "refund");

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink-text">Escalation & audit</h1>
          <p className="text-[13px] text-ink-muted">
            The 5-minute ladder in real time, and what vision AI saw on every receipt.
            {error ? <span className="text-bad"> Refresh failed, showing last state.</span> : null}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} aria-label="Refresh now">
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b border-line px-5 py-4">
              <Timer className="h-4 w-4 text-aqua-bright" aria-hidden />
              <h2 className="text-[15px] font-semibold text-ink-text">Task queue</h2>
              <Badge variant="brand">{approvals.length + refunds.length} open</Badge>
            </div>
            <div className="flex flex-col divide-y divide-line">
              {approvals.length === 0 && refunds.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-ink-faint">
                  Queue is empty. Every paid order lands here for the 5-minute clock.
                </p>
              ) : null}
              {approvals.map((q) => (
                <QueueRow key={q.orderId} order={current.orders.find((o) => o.id === q.orderId)} dueAt={q.dueAt} escalationLevel={q.escalationLevel} />
              ))}
              {refunds.map((q) => (
                <div key={q.orderId} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="data text-[13px] font-medium text-ink-text">{q.orderId}</span>
                    <Badge variant="warn">refund pending</Badge>
                  </div>
                  <span className="text-[12px] text-ink-faint">owner</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <EscalationHistory orders={current.orders} />
      </div>

      <VisionAudit rows={current.visionAudit} />
    </div>
  );
}

function QueueRow({
  order,
  dueAt,
  escalationLevel,
}: {
  order: DashboardData["orders"][number] | undefined;
  dueAt: Date | null;
  escalationLevel: number;
}) {
  if (!order) return null;
  const due = dueIn(dueAt);
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="data text-[13px] font-medium text-ink-text">{order.id}</span>
        <span className="hidden text-[13px] text-ink-muted sm:block">
          {formatNaira(order.amountPaidKobo)} paid
        </span>
        {escalationLevel === 0 ? (
          <Badge variant="brand">owner first</Badge>
        ) : (
          <Badge variant="warn" dot>
            escalated
          </Badge>
        )}
      </div>
      <span className={cn("data text-[12px]", due === "overdue" ? "text-bad" : "text-ink-faint")}>
        {due === "overdue" ? "overdue" : due ?? "-"}
      </span>
    </div>
  );
}

function EscalationHistory({ orders }: { orders: DashboardData["orders"] }) {
  const events: Array<{ orderId: string; actor: string; action: string; at: string }> = [];
  for (const order of orders) {
    // Derive the routing trail from the order state itself so it is always current.
    if (order.status === "PENDING_APPROVAL") {
      events.push({
        orderId: order.id,
        actor: order.escalationLevel === 1 ? "assistant" : "owner",
        action: order.escalationLevel === 1 ? "escalated_at_5m" : "assigned_owner_first",
        at: new Date(order.updatedAt).toISOString(),
      });
    }
    if (order.status === "APPROVED" || order.status === "REFUNDED") {
      events.push({ orderId: order.id, actor: "owner", action: "approved", at: new Date(order.updatedAt).toISOString() });
    }
    if (order.status === "PENDING_REFUND") {
      events.push({ orderId: order.id, actor: "system", action: "refund_protocol_started", at: new Date(order.updatedAt).toISOString() });
    }
  }
  const sorted = events.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink-text">Escalation history</h2>
        </div>
        <div className="flex max-h-[420px] flex-col divide-y divide-line overflow-y-auto thin-scroll">
          {sorted.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-faint">No routing events yet.</p>
          ) : null}
          {sorted.slice(0, 30).map((e, i) => (
            <div key={`${e.orderId}-${e.action}-${i}`} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                {e.actor === "system" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-aqua-bright" aria-hidden />
                )}
                <span className="data text-[13px] text-ink-text">{e.orderId}</span>
                <span className="truncate text-[13px] text-ink-muted">{e.action}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="neutral">{ACTOR_LABEL[e.actor] ?? e.actor}</Badge>
                <span className="text-[12px] text-ink-faint">{timeAgo(e.at)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function VisionAudit({ rows }: { rows: DashboardData["visionAudit"] }) {
  const [open, setOpen] = React.useState<string | null>(null);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-text">Vision AI audit log</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              Extracted receipt metadata with JSON schema verification on every apply.
            </p>
          </div>
          <Badge variant="brand">{rows.length} receipts</Badge>
        </div>
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-faint">
                <th className="px-5 py-2.5 font-medium">Order</th>
                <th className="px-3 py-2.5 font-medium">Narration</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 font-medium">Confidence</th>
                <th className="px-3 py-2.5 text-right font-medium">Latency</th>
                <th className="px-3 py-2.5 font-medium">Schema</th>
                <th className="px-3 py-2.5 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-ink-faint">
                    No receipts validated yet. The first transfer screenshot will appear here.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const confPct = Math.round(row.confidence * 100);
                return (
                  <React.Fragment key={row.receiptMsgId}>
                    <tr className="transition-colors hover:bg-panel-2/50">
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setOpen(open === row.receiptMsgId ? null : row.receiptMsgId)}
                          aria-expanded={open === row.receiptMsgId}
                          aria-label={`Toggle receipt details for ${row.orderId}`}
                          className="flex min-h-[44px] items-center gap-2 rounded-[8px] text-left transition-colors hover:text-ink-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua"
                        >
                          <span className="data text-[13px] font-medium text-ink-text">{row.orderId}</span>
                          <ChevronDown
                            className={cn("h-3.5 w-3.5 text-ink-faint transition-transform duration-100", open === row.receiptMsgId && "rotate-180")}
                            aria-hidden
                          />
                        </button>
                      </td>
                      <td className="data px-3 py-3 text-[13px] text-ink-muted">{row.narration || "-"}</td>
                      <td className="data px-3 py-3 text-right text-[13px] text-ink-text">{formatNaira(row.amountKobo)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            role="progressbar"
                            aria-valuenow={confPct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Confidence ${confPct} percent`}
                            className="h-1.5 w-16 overflow-hidden rounded-full bg-panel-3"
                          >
                            <span
                              className={cn("block h-full rounded-full", confPct >= 90 ? "bg-good" : confPct >= 70 ? "bg-warn" : "bg-bad")}
                              style={{ width: `${confPct}%` }}
                            />
                          </span>
                          <span className="data text-[12px] text-ink-faint">{confPct}%</span>
                        </div>
                      </td>
                      <td className="data px-3 py-3 text-right text-[12px] text-ink-faint">
                        {row.validationMs != null ? `${(row.validationMs / 1000).toFixed(1)}s` : "-"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={row.schemaValid ? "good" : "bad"}>
                          {row.schemaValid ? "valid" : "missing fields"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right text-[12px] text-ink-faint">{timeAgo(row.createdAt)}</td>
                    </tr>
                    {open === row.receiptMsgId ? (
                      <tr>
                        <td colSpan={7} className="bg-panel-2/40 px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <ArrowRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
                            <span className="text-[12px] text-ink-faint">JSON schema check:</span>
                            {row.schemaValid ? (
                              <span className="text-[13px] text-good">all required fields present</span>
                            ) : (
                              <span className="text-[13px] text-bad">missing: {row.missing.join(", ")}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
