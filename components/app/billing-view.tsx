"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  CreditCard,
  Fuel,
  Landmark,
  Lock,
  PlugZap,
  Receipt,
  RefreshCw,
  Send,
  Wallet,
  Webhook,
  Zap,
} from "lucide-react";
import { usePoll } from "@/lib/use-poll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatNaira, timeAgo, cn } from "@/lib/utils";
import { COST_PER_CREDIT, PRICING_TIERS, findTier } from "@/lib/pricing";
import type { DashboardData, WalletState } from "@/lib/api/dashboard";

interface TopUpBundle {
  id: string;
  credits: number;
  bonus?: number;
  blurb: string;
}

const TOPUP_BUNDLES: ReadonlyArray<TopUpBundle> = [
  { id: "starter", credits: 100, blurb: "Quick top-up" },
  { id: "growth", credits: 250, bonus: 25, blurb: "Most picked" },
  { id: "scale", credits: 600, bonus: 80, blurb: "Busy weekends" },
  { id: "wholesale", credits: 1500, bonus: 250, blurb: "Two-week buffer" },
];

const TIER_LABEL: Record<WalletState["tier"], string> = {
  emerging: "Emerging",
  scaling: "Scaling",
  enterprise: "Enterprise",
};

const TIER_TONE: Record<WalletState["tier"], "ocean" | "brand" | "good"> = {
  emerging: "ocean",
  scaling: "brand",
  enterprise: "good",
};

export function Billing({ initial }: { initial: DashboardData }) {
  const { data, error, refresh } = usePoll<DashboardData>(
    async () => {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error("dashboard failed to load");
      return (await res.json()) as DashboardData;
    },
    5000,
  );
  const current = data ?? initial;
  const wallet = current.wallet;
  const low = wallet.balanceCredits < wallet.lowThreshold;
  const zero = wallet.balanceCredits <= 0;
  const [topUpOpen, setTopUpOpen] = React.useState(false);
  const [lockoutOpen, setLockoutOpen] = React.useState(false);
  const [lastEventId, setLastEventId] = React.useState<string | null>(null);

  // Detect fresh zero-balance lockout and pop a blocking dialog.
  React.useEffect(() => {
    const latest = wallet.recentEvents[0];
    if (!latest) return;
    if (latest.event === "ZERO_BALANCE_LOCKOUT" && latest.id !== lastEventId) {
      setLockoutOpen(true);
      setLastEventId(latest.id);
    }
  }, [wallet.recentEvents, lastEventId]);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink-text">Wallet & billing</h1>
          <p className="text-[13px] text-ink-muted">
            Prepaid credits power every order. One verified payment, one credit.
            {error ? <span className="text-bad"> Refresh failed, showing last state.</span> : null}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-11" onClick={() => void refresh()} aria-label="Refresh wallet">
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>

      {low && !zero ? <LowBalanceBanner wallet={wallet} onTopUp={() => setTopUpOpen(true)} /> : null}

      {zero ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-[12px] border border-bad-line bg-bad-soft p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-bad" aria-hidden />
            <div>
              <p className="text-[14px] font-semibold text-ink-text">Tank is empty. Runtime paused.</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                Incoming orders are flagged <code className="data text-[12px]">MANUAL_VERIFICATION_REQUIRED</code>{" "}
                until you top up. Your shop stays live, but every order needs an owner check.
              </p>
            </div>
          </div>
          <Button size="md" variant="danger" className="shrink-0" onClick={() => setTopUpOpen(true)}>
            Resume runtime
          </Button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <FuelTankCard wallet={wallet} onTopUp={() => setTopUpOpen(true)} onResume={() => void refresh()} />

          <DeductionSimulator
            wallet={wallet}
            onEvent={async () => {
              await refresh();
            }}
          />

          <Card className="min-w-0">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink-text">Transactions</h2>
                  <p className="mt-0.5 text-[12px] text-ink-muted">Every credit movement, ordered newest first.</p>
                </div>
                <Badge variant="neutral">{wallet.transactions.length}</Badge>
              </div>
              <div className="thin-scroll overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-[0.06em] text-ink-faint">
                      <th className="px-5 py-2.5 font-medium">Type</th>
                      <th className="px-3 py-2.5 font-medium">Amount</th>
                      <th className="px-3 py-2.5 text-right font-medium">Balance after</th>
                      <th className="px-3 py-2.5 font-medium">Reference</th>
                      <th className="px-3 py-2.5 text-right font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {wallet.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-ink-faint">
                          No transactions yet. Trigger the webhook simulator or top up to populate the ledger.
                        </td>
                      </tr>
                    ) : null}
                    {wallet.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-5 py-3">
                          <Badge variant={tx.type === "topup" ? "good" : tx.type === "consume" ? "neutral" : "ocean"}>
                            {tx.type}
                          </Badge>
                        </td>
                        <td className={cn("data px-3 py-3 text-[13px]", tx.amount > 0 ? "text-good" : "text-ink-muted")}>
                          {tx.amount > 0 ? "+" : ""}
                          {tx.amount}
                        </td>
                        <td className="data px-3 py-3 text-right text-[13px] text-ink-text">{tx.balanceAfter}</td>
                        <td className="data px-3 py-3 text-[12px] text-ink-faint">{tx.reference ?? "-"}</td>
                        <td className="px-3 py-3 text-right text-[12px] text-ink-faint">{timeAgo(tx.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <WebhookEventLog events={wallet.recentEvents} />
          <PayAsYouGrowCard wallet={wallet} />
        </div>
      </div>

      <TopUpDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        onDone={() => void refresh()}
        tier={wallet.tier}
        unitKobo={wallet.unitKobo}
      />

      <ZeroBalanceDialog
        open={lockoutOpen}
        onOpenChange={setLockoutOpen}
        onTopUp={() => {
          setLockoutOpen(false);
          setTopUpOpen(true);
        }}
      />
    </div>
  );
}

function LowBalanceBanner({ wallet, onTopUp }: { wallet: WalletState; onTopUp: () => void }) {
  const pct = Math.round((wallet.balanceCredits / wallet.lowThreshold) * 100);
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-warn-line bg-warn-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
        <div>
          <p className="text-[14px] font-medium text-ink-text">
            Below your {wallet.lowThreshold}-credit floor · {pct}%
          </p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {wallet.balanceCredits} credits left. The bot keeps running, but auto-recharge or a top-up is the
            only thing standing between you and a zero-balance lockout.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="md" asChild>
          <Link href="/activity">View queue</Link>
        </Button>
        <Button size="md" onClick={onTopUp}>
          Top up credits
        </Button>
      </div>
    </div>
  );
}

function FuelTankCard({ wallet, onTopUp, onResume }: { wallet: WalletState; onTopUp: () => void; onResume: () => void | Promise<void> }) {
  const max = Math.max(wallet.lowThreshold * 4, 200);
  const pct = Math.min(100, Math.round((wallet.balanceCredits / max) * 100));
  const [accepting, setAccepting] = React.useState(wallet.acceptingOrders);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => setAccepting(wallet.acceptingOrders), [wallet.acceptingOrders]);

  async function toggleAccepting(next: boolean) {
    setBusy(true);
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
      await onResume();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Balance hero band */}
        <div className="brand-band relative px-5 py-6 md:px-6">
          <div aria-hidden className="surface-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/25 bg-white/10">
                  <Fuel className="h-4 w-4 text-white" aria-hidden />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-white/85">Wallet balance</p>
                  <p className="text-[12px] text-white/70">
                    Each verified payment deducts one credit at{" "}
                    <span className="money font-medium text-white">{formatNaira(wallet.unitKobo)}</span>
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span
                  key={wallet.balanceCredits}
                  className="count-in money text-[52px] font-semibold leading-none tracking-tight text-white"
                >
                  {wallet.balanceCredits}
                </span>
                <span className="text-[14px] text-white/75">credits available</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/70">
                <Badge variant="neutral" className="border-white/25 bg-white/10 text-[11px] text-white">
                  {TIER_LABEL[wallet.tier]}
                </Badge>
                <span>
                  Floor at <span className="data font-medium text-white">{wallet.lowThreshold}</span> credits
                  {" · "}
                  last burn{" "}
                  {wallet.transactions.find((t) => t.type === "consume")
                    ? timeAgo(wallet.transactions.find((t) => t.type === "consume")!.createdAt)
                    : "never"}
                </span>
                <span>Resets on every top-up · no expiry</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="md" className="h-11 bg-white text-ocean hover:bg-white/90" onClick={onTopUp}>
                Top up credits
              </Button>
              <p aria-hidden className="flex items-center gap-1.5 self-end text-[12px] text-white/70">
                {wallet.balanceCredits > 0 ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-white/85" /> live
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-bad" /> locked
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Meter + controls */}
        <div className="flex flex-col gap-5 p-5">
          <FuelTankMeter wallet={wallet} pct={pct} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-panel px-4 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink-text">Auto-recharge</p>
                <p className="text-[12px] text-ink-faint">
                  {wallet.autoRecharge
                    ? `Topping up ${wallet.autoRechargeAmount} credits when the tank runs dry`
                    : "Tank goes quiet at zero and orders pause"}
                </p>
              </div>
              <AutoRechargeSwitch wallet={wallet} onDone={onResume} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-panel px-4 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink-text">Accepting orders</p>
                <p className="text-[12px] text-ink-faint">
                  {accepting ? "Runtime is live" : "Runtime is parked, queue paused"}
                </p>
              </div>
              <Switch
                checked={accepting}
                disabled={busy || wallet.balanceCredits <= 0}
                onCheckedChange={(v) => void toggleAccepting(v)}
                aria-label="Toggle accepting orders"
              />
            </div>
          </div>
          {err ? <p role="alert" className="text-[12px] text-bad">{err}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function FuelTankMeter({ wallet, pct }: { wallet: WalletState; pct: number }) {
  const low = wallet.balanceCredits < wallet.lowThreshold;
  const zero = wallet.balanceCredits <= 0;
  const tone = zero ? "bad" : low ? "warn" : "good";
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Fuel tank at ${wallet.balanceCredits} credits`}
        className="relative h-3 overflow-hidden rounded-full bg-panel-3"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            tone === "good" && "gradient-brand",
            tone === "warn" && "bg-warn",
            tone === "bad" && "bg-bad",
          )}
          style={{ width: `${pct}%` }}
        />
        {/* Floor marker */}
        <div
          aria-hidden
          className="absolute top-0 h-full w-px bg-aqua-bright/70"
          style={{ left: `${Math.min(100, Math.round((wallet.lowThreshold / Math.max(wallet.lowThreshold * 4, 200)) * 100))}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] uppercase tracking-[0.08em] text-ink-faint">
        <span>0</span>
        <span>{wallet.lowThreshold}</span>
        <span>{Math.max(wallet.lowThreshold * 4, 200)}</span>
      </div>
    </div>
  );
}

function AutoRechargeSwitch({ wallet, onDone }: { wallet: WalletState; onDone: () => void | Promise<void> }) {
  const [enabled, setEnabled] = React.useState(wallet.autoRecharge);
  const [amount, setAmount] = React.useState(String(wallet.autoRechargeAmount));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEnabled(wallet.autoRecharge);
    setAmount(String(wallet.autoRechargeAmount));
  }, [wallet.autoRecharge, wallet.autoRechargeAmount]);

  async function save(next: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/wallet/auto-recharge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next, amount: next ? Number(amount) : undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "update failed");
      }
      setEnabled(next);
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {enabled ? (
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
          aria-label="Auto-recharge amount in credits"
          className="h-9 w-24 text-[13px]"
        />
      ) : null}
      <Switch
        checked={enabled}
        disabled={busy}
        onCheckedChange={(v) => void save(v)}
        aria-label="Auto-recharge"
      />
      {err ? <span className="text-[12px] text-bad">{err}</span> : null}
    </div>
  );
}

function DeductionSimulator({ wallet, onEvent }: { wallet: WalletState; onEvent: () => Promise<void> }) {
  const [orderId, setOrderId] = React.useState("GFT-A3-1042");
  const [amountKobo, setAmountKobo] = React.useState("10000");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  async function fire() {
    setBusy(true);
    setErr(null);
    setToast(null);
    try {
      const res = await fetch("/api/wallet/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "PAYMENT_VERIFIED",
          orderId: orderId.trim() || `sim-${Date.now()}`,
          amountKobo: Number(amountKobo) || wallet.unitKobo,
          reference: `pyk_${Math.random().toString(36).slice(2, 10)}`,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; code?: string; locked?: boolean; balanceAfter?: number; lowBalance?: boolean }
        | null;
      if (!res.ok || !body?.ok) {
        if (body?.code === "MANUAL_VERIFICATION_REQUIRED") {
          setErr(
            "Zero-balance lockout fired. The bot would now hand the order back for MANUAL_VERIFICATION_REQUIRED.",
          );
        } else {
          throw new Error(body?.error ?? "webhook rejected");
        }
      } else {
        setToast(`Deducted 1 credit — tank is now ${body.balanceAfter}`);
      }
      await onEvent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "webhook rejected");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-aqua/30 bg-aqua-soft">
              <Webhook className="h-4 w-4 text-aqua-bright" aria-hidden />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink-text">Webhook simulator</h2>
              <p className="text-[12px] text-ink-muted">
                Fire a <code className="data text-[12px]">PAYMENT_VERIFIED</code> event and watch the bot deduct the credit.
              </p>
            </div>
          </div>
          <Badge variant={wallet.acceptingOrders ? "good" : "bad"} dot>
            {wallet.acceptingOrders ? "runtime live" : "runtime paused"}
          </Badge>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="Order ID" htmlFor="sim-order">
              <Input
                id="sim-order"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="GFT-A3-1042"
                autoComplete="off"
              />
            </Field>
            <Field label="Amount (kobo)" htmlFor="sim-amount">
              <Input
                id="sim-amount"
                value={amountKobo}
                onChange={(e) => setAmountKobo(e.target.value)}
                inputMode="numeric"
                placeholder={String(wallet.unitKobo)}
              />
            </Field>
            <div className="flex items-end">
              <Button
                size="md"
                className="h-[46px] w-full sm:w-auto"
                disabled={busy || wallet.balanceCredits <= 0}
                onClick={() => void fire()}
              >
                <Send className="h-4 w-4" aria-hidden />
                {busy ? "Firing..." : "Fire webhook"}
              </Button>
            </div>
          </div>
          {err ? <p role="alert" className="text-[12px] text-bad">{err}</p> : null}
          {toast ? <p role="status" className="text-[12px] text-good">{toast}</p> : null}
          <p className="text-[12px] text-ink-faint">
            In production, Paystack POSTs the event here after your customer&apos;s transfer is verified.
            This simulator drills the credit-deduction and zero-balance lockout path only; it does not book payments onto orders.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function WebhookEventLog({ events }: { events: WalletState["recentEvents"] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink-text">Ledger activity</h2>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            Latest payments, lockouts, and top-ups — every credit accounted for.
          </p>
        </div>
        <div className="flex flex-col divide-y divide-line">
          {events.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-faint">
              No events yet. Fire the webhook simulator or top up to populate the log.
            </p>
          ) : null}
          {events.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
              <div className="flex min-w-0 items-start gap-3">
                {e.event === "PAYMENT_VERIFIED" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden />
                ) : e.event === "ZERO_BALANCE_LOCKOUT" ? (
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
                ) : (
                  <ArrowDownToLine className="mt-0.5 h-4 w-4 shrink-0 text-aqua-bright" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-text">
                    <span className="data">{e.event}</span>
                    {e.orderId ? (
                      <span className="data text-[12px] text-ink-muted">· {e.orderId}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    Balance after <span className="money text-ink-text">{e.balanceAfter}</span> credits
                    {e.amountKobo ? <> · <span className="money">{formatNaira(e.amountKobo)}</span></> : null}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-[12px] text-ink-faint">{timeAgo(e.at)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PayAsYouGrowCard({ wallet }: { wallet: WalletState }) {
  const tier = findTierByBase(wallet.baseMonthly);
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-text">
          <Zap className="h-4 w-4 text-aqua-bright" aria-hidden /> Pay-as-you-grow
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Your tier sets the unit cost of every credit. The higher the tier, the cheaper each verified
          payment gets — and credits never expire.
        </p>
        <dl className="mt-4 flex flex-col gap-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Your tier</dt>
            <dd className="text-right">
              <Badge variant={TIER_TONE[wallet.tier]}>{TIER_LABEL[wallet.tier]}</Badge>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Base monthly</dt>
            <dd className="data text-ink-text">{formatNaira(tier.baseMonthly)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Per credit</dt>
            <dd className="data text-ink-text">{formatNaira(wallet.unitKobo)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Other tiers</dt>
            <dd className="data text-right text-ink-muted">
              {PRICING_TIERS.filter((t) => t.id !== wallet.tier)
                .map((t) => `${t.name} · ${formatNaira(unitKoboForTierByName(t.id))}`)
                .join(" · ")}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex items-center gap-2.5 rounded-[10px] border border-line bg-panel px-4 py-3 text-[13px] text-ink-muted">
          <PlugZap className="h-4 w-4 shrink-0 text-aqua-bright" aria-hidden />
          Top-ups book instantly via Paystack card, transfer, or virtual account.
        </div>
      </CardContent>
    </Card>
  );
}

function TopUpDialog({
  open,
  onOpenChange,
  onDone,
  tier,
  unitKobo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  tier: WalletState["tier"];
  unitKobo: number;
}) {
  const [bundleId, setBundleId] = React.useState<string>("growth");
  const [credits, setCredits] = React.useState("250");
  const [method, setMethod] = React.useState<"card" | "transfer" | "virtual_account">("card");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setErr(null);
      setDone(null);
    }
  }, [open]);

  React.useEffect(() => {
    const found = TOPUP_BUNDLES.find((b) => b.id === bundleId);
    if (found) setCredits(String(found.credits));
  }, [bundleId]);

  const total = Math.round(Number(credits) * unitKobo);

  async function checkout() {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits: Number(credits), method }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "top-up failed");
      }
      const body = (await res.json()) as { wallet?: { balanceCredits: number } };
      setDone(`N${(total / 100).toLocaleString("en-NG")} booked. Balance is now ${body.wallet?.balanceCredits ?? "?"} credits.`);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "top-up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Top up credits</DialogTitle>
        <DialogDescription>
          Pick a preset bundle or set a custom amount. Paystack checkout (simulated) books instantly.
        </DialogDescription>

        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium text-ink-muted">Preset bundles</p>
            <div className="grid grid-cols-2 gap-2">
              {TOPUP_BUNDLES.map((b) => {
                const active = b.id === bundleId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBundleId(b.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-[10px] border px-3.5 py-3 text-left transition-colors",
                      active
                        ? "border-aqua/60 bg-[rgba(0,188,163,0.08)] text-ink-text"
                        : "border-line bg-panel text-ink-muted hover:border-line-strong",
                    )}
                  >
                    <span className="flex items-center gap-2 text-[14px] font-semibold">
                      <span className="money text-[18px] text-ink-text">{b.credits.toLocaleString()}</span>
                      <span className="text-[12px] font-normal text-ink-muted">credits</span>
                      {b.bonus ? (
                        <span className="rounded-[4px] border border-good-line bg-good-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-good-text">
                          +{b.bonus} bonus
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[12px] text-ink-muted">{b.blurb}</span>
                    <span className="money text-[13px] font-medium text-aqua-text">
                      N{((b.credits * unitKobo) / 100).toLocaleString("en-NG")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Custom amount (credits)" htmlFor="topup-credits" hint={`Each credit = ${formatNaira(unitKobo)} for the ${TIER_LABEL[tier]} tier.`}>
            <Input
              id="topup-credits"
              value={credits}
              onChange={(e) => {
                setCredits(e.target.value);
                setBundleId("custom");
              }}
              inputMode="numeric"
              min={10}
              max={100000}
            />
          </Field>

          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Payment method">
            <p className="text-[13px] font-medium text-ink-muted">Pay with</p>
            {(
              [
                { value: "card" as const, label: "Card", icon: CreditCard, hint: "Paystack inline checkout" },
                { value: "transfer" as const, label: "Bank transfer", icon: Landmark, hint: "Manual transfer with narration" },
                { value: "virtual_account" as const, label: "Virtual account", icon: Wallet, hint: "Auto-reconciled in seconds" },
              ]
            ).map(({ value, label, icon: Icon, hint }) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3 transition-colors",
                  method === value
                    ? "border-aqua/60 bg-[rgba(0,188,163,0.07)]"
                    : "border-line bg-panel hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="method"
                  value={value}
                  checked={method === value}
                  onChange={() => setMethod(value)}
                  className="sr-only"
                />
                <span aria-hidden className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-[8px] border border-line bg-panel-2 text-aqua-bright">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1">
                  <span className="block text-[14px] font-medium text-ink-text">{label}</span>
                  <span className="block text-[12px] text-ink-muted">{hint}</span>
                </span>
                <span aria-hidden className={cn("mt-2 h-3 w-3 rounded-full border-2", method === value ? "border-aqua bg-aqua" : "border-ink-faint")} />
              </label>
            ))}
          </div>

          {method === "virtual_account" ? (
            <div className="rounded-[10px] border border-line bg-panel px-4 py-3 text-[13px] text-ink-muted">
              <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-faint">Virtual account</p>
              <p className="mt-2 data text-[15px] font-semibold text-ink-text">901 234 567 8</p>
              <p className="text-[12px] text-ink-muted">Wema Bank · Ada&apos;s Kitchen Ltd</p>
              <p className="mt-1 text-[12px] text-ink-muted">Narration: <span className="data text-ink-text">PYK-{Math.random().toString(36).slice(2, 8).toUpperCase()}</span></p>
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel px-4 py-3">
            <span className="text-[13px] text-ink-muted">Total</span>
            <span className="data text-[18px] font-semibold text-ink-text">
              {Number.isFinite(total) && total > 0 ? formatNaira(total) : "-"}
            </span>
          </div>

          {err ? <p role="alert" className="text-[13px] text-bad">{err}</p> : null}
          {done ? <p role="status" className="text-[13px] text-good">{done}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !Number.isFinite(total) || total <= 0} onClick={() => void checkout()}>
            <Receipt className="h-4 w-4" aria-hidden />
            {busy ? "Checking out..." : "Checkout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZeroBalanceDialog({ open, onOpenChange, onTopUp }: { open: boolean; onOpenChange: (v: boolean) => void; onTopUp: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-[12px] border border-bad-line bg-bad-soft"
          >
            <Lock className="h-6 w-6 text-bad" />
          </span>
          <DialogTitle>Runtime paused: zero balance</DialogTitle>
          <DialogDescription>
            The bot tried to deduct a credit after a PAYMENT_VERIFIED event and the tank was empty.
            Incoming orders are now flagged for{" "}
            <code className="data text-[12px]">MANUAL_VERIFICATION_REQUIRED</code> until you top up.
            You can still answer in WhatsApp manually — the dashboard just won&apos;t auto-commit.
          </DialogDescription>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Dismiss
          </Button>
          <Button onClick={onTopUp}>
            Top up & resume runtime
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function findTierByBase(baseMonthly: number): { id: string; name: string; baseMonthly: number } {
  return findTier(
    PRICING_TIERS.reduce((acc, t) => {
      const accDiff = Math.abs(acc.baseMonthly - baseMonthly);
      const tDiff = Math.abs(t.baseMonthly - baseMonthly);
      return tDiff < accDiff ? t : acc;
    }, PRICING_TIERS[0]!).id,
  );
}

function unitKoboForTierByName(id: string): number {
  switch (id) {
    case "bespoke":
    case "starter":
      return 10_000;
    case "growth":
      return 7_500;
    case "scale":
    case "enterprise":
      return 5_000;
    default:
      return COST_PER_CREDIT * 100;
  }
}