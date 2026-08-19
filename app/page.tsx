import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ScanText, Timer, ShieldCheck, Package, ChevronRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PricingCalculator } from "@/components/landing/pricing-calculator";
import { LeadForm } from "@/components/landing/lead-form";
import { FAQ } from "@/components/landing/faq";
import { MobileMenu } from "@/components/landing/mobile-menu";
import { WhatsAppMockup } from "@/components/landing/whatsapp-mockup";

export const metadata: Metadata = {
  title: "zippyDesk - Your customers can see you are online. Stop making them wait.",
  description:
    "zippyDesk runs your WhatsApp order line end to end: catalog intake, vision receipt validation, 5-minute escalations and inventory locking. Built for merchants who outgrew the blue tick.",
};

const STEPS = [
  {
    icon: Package,
    title: "Connect your catalog",
    copy: "Paste your items, prices and stock counts. zippyDesk mirrors them into a WhatsApp storefront your customers order from directly.",
  },
  {
    icon: ScanText,
    title: "AI runs the ledger",
    copy: "Every transfer receipt is read by vision AI, cross-checked against the narration, and applied to the right order. Numbers are decided by arithmetic, not guesswork.",
  },
  {
    icon: ShieldCheck,
    title: "Stock locks the moment you confirm",
    copy: "Approvals go to you first, escalate to your assistant at the 5-minute mark, and inventory locks the moment you say yes. You just pack.",
  },
];

const HANDLES = [
  "Receipt validation in seconds, not hours",
  "5-minute escalation ladder: owner, then assistant, then auto-tracking",
  "Real-time inventory locking with failed-capacity refunds when stock runs dry",
  "Prepaid credits that auto-recharge before a rush hour empties the tank",
];

const QUEUE_ROWS = [
  { order: "GFT-A3-1002", amount: "N10,000", status: "Receipt verified in 2.4s", actor: "Owner notified", when: "0m" },
  { order: "GFT-A3-1003", amount: "N6,500", status: "Waiting on owner", actor: "Owner", when: "3m" },
  { order: "GFT-A3-1004", amount: "N5,000", status: "Escalated to assistant", actor: "Assistant", when: "5m" },
];

const TRUST_LINES = [
  "Built for WhatsApp Cloud API",
  "Paystack-secured billing",
  "PostgreSQL ledger, audited daily",
  "Vision receipt extraction",
  "5-minute owner-then-assistant ladder",
];

const FAQS = [
  {
    q: "Will my customers need a new app?",
    a: "No. zippyDesk runs on your existing WhatsApp Business number. Your customers keep ordering the way they always have — by chat. The difference is that the chat replies, validates their receipt, and locks their order in seconds.",
  },
  {
    q: "Is my bank account safe?",
    a: "Your money still goes to your account, not ours. zippyDesk never holds funds. The platform processes the receipt and tells you that the narration matches the order, but the transfer is between your customer and your bank. Daily audits document every reconciliation.",
  },
  {
    q: "What happens if vision can't read a receipt?",
    a: "We re-prompt up to three times with clearer framing. If the screenshot is still unreadable, the order is routed to your assistant with the image attached so a human can resolve it. The system never silently drops a payment.",
  },
  {
    q: "How fast is onboarding?",
    a: "Most shops go live in an afternoon. We pair you with a real human for the first hour, walk your catalog into the WhatsApp storefront, and watch the first ten orders with you. Onboarding is capped each week so every shop gets that attention.",
  },
  {
    q: "What does the 5-minute ladder actually do?",
    a: "When a payment is verified, the order lands in your approval queue with a 5-minute timer. If you don't act, the assistant you configured is notified and the timer continues. If neither responds, the order stays in your queue — your money already cleared, and we re-alert you daily until you decide.",
  },
  {
    q: "Can I cap how many orders I take?",
    a: "Yes. The dashboard has a one-toggle Pause button that stops the catalog from accepting new orders. You keep receiving messages, you just stop the rush while you restock. Resume is one tap.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="assist-focus -m-2 rounded-[10px] p-2" aria-label="zippyDesk home">
            <Logo />
          </a>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            <a href="#how" className="flex items-center py-3 text-[14px] leading-6 text-ink-muted transition-colors hover:text-ink-text">
              How it works
            </a>
            <a href="#pricing" className="flex items-center py-3 text-[14px] leading-6 text-ink-muted transition-colors hover:text-ink-text">
              Pricing
            </a>
            <a href="#faq" className="flex items-center py-3 text-[14px] leading-6 text-ink-muted transition-colors hover:text-ink-text">
              FAQ
            </a>
            <a href="#access" className="flex items-center py-3 text-[14px] leading-6 text-ink-muted transition-colors hover:text-ink-text">
              Get access
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="/dashboard" className="assist-focus hidden rounded-[10px] md:block">
              <Button size="md" className="h-[46px]">
                Open the live demo
              </Button>
            </a>
            <MobileMenu />
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 md:pb-24 md:pt-24">
          {/* Ambient glow behind hero */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[420px] max-w-5xl overflow-hidden">
            <div className="glow-drift absolute -top-20 left-1/4 h-72 w-72 rounded-full bg-ocean/30 blur-3xl" />
            <div className="glow-drift absolute -top-10 right-1/4 h-64 w-64 rounded-full bg-aqua/25 blur-3xl" style={{ animationDelay: "4s" }} />
          </div>
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-[32px] font-semibold leading-[1.1] tracking-tight text-ink-text sm:text-[44px] md:text-[56px]">
              Your customers can see you are online.
              <br className="hidden sm:block" />
              <span className="text-ink-muted">Why are you making them wait?</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-ink-muted md:text-[17px]">
              Every minute a paid order sits in your inbox, the success penalty compounds — that
              customer is already telling someone how slow you are. zippyDesk answers, validates,
              confirms and refunds in real time, so one shop can serve an infinite queue of
              conversations at once.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-[52px] rounded-[12px] px-7 text-[16px]">
                <a href="#access">
                  Start free <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </Button>
              <Button asChild variant="ghost" size="lg" className="h-[52px] rounded-[12px] px-7 text-[16px]">
                <a href="#how">See how it works</a>
              </Button>
            </div>
            <dl className="mx-auto mt-12 flex max-w-lg flex-wrap items-center justify-center divide-x divide-line">
              <div className="px-4 text-center sm:px-5">
                <dt className="label-caps">Receipt validated</dt>
                <dd className="data mt-1.5 text-[22px] font-semibold text-ink-text">2.4s avg</dd>
              </div>
              <div className="px-5 text-center">
                <dt className="label-caps">Approval ladder</dt>
                <dd className="data mt-1.5 text-[22px] font-semibold text-ink-text">5 min</dd>
              </div>
              <div className="px-5 text-center">
                <dt className="label-caps">Concurrent chats</dt>
                <dd className="data mt-1.5 text-[22px] font-semibold text-ink-text">Unlimited</dd>
              </div>
              <div className="px-5 text-center">
                <dt className="label-caps">Schema validation</dt>
                <dd className="data mt-1.5 text-[22px] font-semibold text-ink-text">99.2%</dd>
              </div>
            </dl>
          </div>

          <div className="mx-auto mt-14 max-w-5xl md:mt-20">
            <div className="grid items-center gap-8 md:grid-cols-2 md:gap-10">
              <div className="float-slow">
                <WhatsAppMockup />
              </div>
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-line bg-panel-2 px-5 py-3">
                  <p className="text-[13px] font-medium text-ink-muted">Live order stream</p>
                  <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-aqua-line bg-aqua-soft px-2 py-[3px] text-[12px] font-medium text-aqua-text">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-aqua" aria-hidden />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aqua-bright" aria-hidden />
                    </span>
                    polling 5s
                  </span>
                </div>
                <div className="divide-y divide-line">
                  {QUEUE_ROWS.map((row, i) => (
                    <div
                      key={row.order}
                      className="order-slide-in flex items-center justify-between gap-4 px-5 py-4"
                      style={{ animationDelay: `${300 + i * 180}ms`, opacity: 0 }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="data hidden text-[13px] text-ink-faint sm:block">{row.when}</span>
                        <span className="data truncate text-[14px] font-medium text-ink-text">{row.order}</span>
                        <span className="data hidden text-[14px] text-ink-muted md:block">{row.amount}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={row.when === "0m" ? "good" : row.when === "3m" ? "brand" : "warn"}>{row.status}</Badge>
                        <span className="hidden text-[13px] text-ink-muted sm:block">{row.actor}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-5 text-center text-[12px] text-ink-faint">
              Receipts verified by vision AI, approvals routed owner-first, both running right now.
            </p>
          </div>
        </section>

        <section aria-label="Stack" className="border-y border-line bg-panel">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-3 px-4 py-5 sm:px-6 md:gap-x-10">
            {TRUST_LINES.map((line) => (
              <p key={line} className="flex items-center gap-2 text-[12px] text-ink-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-aqua-bright" aria-hidden />
                {line}
              </p>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[24px] font-semibold tracking-tight text-ink-text sm:text-[34px]">
              Three steps between you and your customers
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
              No new apps for them, no new dashboards for you beyond this one. The system handles the
              queue; you keep the shop.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.title} className="card flex flex-col p-6 md:p-7">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-aqua/30 bg-[rgba(0,188,163,0.08)]"
                >
                  <step.icon className="h-5 w-5 text-aqua-bright" />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold text-ink-text">{step.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{step.copy}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl gap-3 text-[14px] text-ink-muted sm:grid-cols-2">
            {HANDLES.map((h) => (
              <p key={h} className="flex items-start gap-2.5 rounded-[10px] border border-line bg-panel px-4 py-3 leading-relaxed">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-aqua-bright" aria-hidden />
                <span>{h}</span>
              </p>
            ))}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 border-t border-line bg-panel">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-[24px] font-semibold tracking-tight text-ink-text sm:text-[34px]">
                A base tier and a wallet that scales with you
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
                Pick the tier that matches today. The pay-as-you-grow calculator shows what a busy
                day actually costs — no surprise invoices at the end of the month.
              </p>
            </div>
            <div className="mt-10">
              <PricingCalculator />
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[24px] font-semibold tracking-tight text-ink-text sm:text-[34px]">
              The questions merchants ask before signing on
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
              If something here doesn't answer what you need, the form below reaches a real person
              inside one business day.
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-3xl">
            <FAQ items={FAQS} />
          </div>
        </section>

        <section id="access" className="scroll-mt-20 border-t border-line bg-panel">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
              <div className="md:sticky md:top-24">
                <h2 className="text-[24px] font-semibold tracking-tight text-ink-text sm:text-[34px]">
                  Get access while demand is still low
                </h2>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted">
                  Onboarding is capped each week so every shop gets a human walkthrough. Tell us how
                  your busy days look and we will size your first plan for you.
                </p>
                <ul className="mt-8 flex flex-col gap-2.5 text-[14px] text-ink-muted">
                  {[
                    "Free onboarding with a real setup call",
                    "Your catalog live on WhatsApp in one afternoon",
                    "Per-order pricing, not a per-seat surprise",
                  ].map((li) => (
                    <li key={li} className="flex items-center gap-2.5">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-aqua-bright" />
                      {li}
                    </li>
                  ))}
                </ul>
              </div>
              <LeadForm />
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-gradient-to-b from-ink to-panel">
          <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 md:py-28">
            <span
              aria-hidden
              className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-[12px] gradient-brand"
            >
              <Timer className="h-6 w-6 text-white" />
            </span>
            <h2 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-ink-text sm:text-[36px]">
              The next order is in your inbox right now.
              <br className="hidden sm:block" />
              <span className="text-ink-muted">What if it answered itself?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-muted">
              Try the live demo to see vision-validated receipts, the 5-minute ladder, and the wallet
              in action. No card needed.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-[52px] rounded-[12px] px-7 text-[16px]">
                <a href="/dashboard">
                  Open the live demo <ChevronRight className="h-4 w-4" aria-hidden />
                </a>
              </Button>
              <Button asChild variant="ghost" size="lg" className="h-[52px] rounded-[12px] px-7 text-[16px]">
                <a href="#access">Request onboarding</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink-muted">
              Autonomous WhatsApp commerce for merchants who outgrew the blue tick.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="label-caps">Product</p>
            <ul className="mt-4 flex flex-col gap-1 text-[14px]">
              <li><a href="#how" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">How it works</a></li>
              <li><a href="#pricing" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Pricing</a></li>
              <li><a href="#faq" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">FAQ</a></li>
              <li><a href="#access" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Get access</a></li>
              <li><a href="/dashboard" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Live demo</a></li>
            </ul>
          </nav>
          <div>
            <p className="label-caps">Resources</p>
            <ul className="mt-4 flex flex-col gap-1 text-[14px]">
              <li><a href="/dashboard" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Run the demo</a></li>
              <li><a href="#pricing" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Pricing calculator</a></li>
              <li><a href="#access" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Talk to onboarding</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-[12px] text-ink-faint sm:flex-row sm:px-6">
            <p>&copy; 2026 zippyDesk. Built in Lagos.</p>
            <p>Made for the merchants who reply at 2am.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
