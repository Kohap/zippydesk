import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { MobileMenu } from "@/components/landing/mobile-menu";
import { ChevronRight } from "lucide-react";

export interface LegalSection {
  id: string;
  title: string;
  body: string | string[];
}

export interface LegalPageProps {
  title: string;
  intro: string;
  effectiveDate: string;
  updatedDate: string;
  sections: LegalSection[];
  related?: { href: string; label: string; description: string }[];
}

/**
 * Shared layout for long-form policy pages. Renders a sticky table of
 * contents on desktop, a stacked reading column on mobile, and the same
 * branded header/footer/mobile menu as the landing page.
 */
export function LegalPage({ title, intro, effectiveDate, updatedDate, sections, related }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="assist-focus -m-2 rounded-[10px] p-2" aria-label="zippyDesk home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            <Link href="/#how" className="flex items-center py-3 text-[14px] leading-6 text-ink-muted transition-colors hover:text-ink-text">
              How it works
            </Link>
            <Link href="/#pricing" className="flex items-center py-3 text-[14px] leading-6 text-ink-muted transition-colors hover:text-ink-text">
              Pricing
            </Link>
            <Link href="/#faq" className="flex items-center py-3 text-[14px] leading-6 text-ink-muted transition-colors hover:text-ink-text">
              FAQ
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="assist-focus hidden rounded-[10px] md:block">
              <Button size="md" className="h-[46px]">
                Open the live demo
              </Button>
            </Link>
            <MobileMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-3xl">
          <p className="text-[13px] text-ink-muted">
            <Link href="/" className="transition-colors hover:text-ink-text">Home</Link>
            <span aria-hidden className="px-2 text-ink-faint">/</span>
            <span className="text-ink-text">{title}</span>
          </p>
          <h1 className="mt-4 text-[32px] font-semibold leading-[1.1] tracking-tight text-ink-text sm:text-[44px]">
            {title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-muted md:text-[16px]">
            {intro}
          </p>
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-[12px] uppercase tracking-[0.06em] text-ink-faint">
            <div>
              <dt className="inline">Effective</dt>
              <dd className="ml-2 inline data text-ink-muted">{effectiveDate}</dd>
            </div>
            <div>
              <dt className="inline">Last updated</dt>
              <dd className="ml-2 inline data text-ink-muted">{updatedDate}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-[220px_minmax(0,1fr)] md:gap-12">
          <aside className="md:sticky md:top-24 md:self-start">
            <p className="label-caps">Contents</p>
            <ol className="mt-4 flex flex-row flex-wrap gap-x-4 gap-y-2 text-[13px] md:flex-col md:gap-1">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex min-h-[36px] items-center gap-2 rounded-[8px] px-2 text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink-text md:min-h-[40px]"
                  >
                    <span className="data text-[11px] text-ink-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
            {related && related.length > 0 ? (
              <div className="mt-8 hidden md:block">
                <p className="label-caps">Related</p>
                <ul className="mt-4 flex flex-col gap-1 text-[13px]">
                  {related.map((r) => (
                    <li key={r.href}>
                      <Link
                        href={r.href}
                        className="group flex flex-col gap-0.5 rounded-[10px] border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong"
                      >
                        <span className="flex items-center justify-between text-ink-text">
                          {r.label}
                          <ChevronRight className="h-3.5 w-3.5 text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </span>
                        <span className="text-[12px] text-ink-muted">{r.description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>

          <article className="flex flex-col gap-12 md:gap-14">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-[20px] font-semibold tracking-tight text-ink-text sm:text-[24px]">
                    {s.title}
                  </h2>
                </div>
                <div className="mt-4 flex flex-col gap-3 text-[15px] leading-relaxed text-ink-muted">
                  {Array.isArray(s.body)
                    ? s.body.map((p, i) => (
                        <p key={i} className={i === 0 ? "" : "mt-2"}>
                          {p}
                        </p>
                      ))
                    : <p>{s.body}</p>}
                </div>
              </section>
            ))}

            <section className="card flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <p className="text-[14px] font-medium text-ink-text">Questions about this document?</p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  Email{" "}
                  <a href="mailto:hello@zippydesk.co" className="text-aqua-bright underline-offset-4 hover:underline">
                    hello@zippydesk.co
                  </a>{" "}
                  and a person will reply within one business day.
                </p>
              </div>
              <Link href="/#access" className="shrink-0">
                <Button size="md">Talk to onboarding</Button>
              </Link>
            </section>
          </article>
        </div>
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
              <li><Link href="/#how" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">How it works</Link></li>
              <li><Link href="/#pricing" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Pricing</Link></li>
              <li><Link href="/#faq" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">FAQ</Link></li>
              <li><Link href="/#access" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Get access</Link></li>
              <li><Link href="/dashboard" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Live demo</Link></li>
            </ul>
          </nav>
          <div>
            <p className="label-caps">Legal</p>
            <ul className="mt-4 flex flex-col gap-1 text-[14px]">
              <li><Link href="/terms" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Terms of service</Link></li>
              <li><Link href="/privacy" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Privacy policy</Link></li>
              <li><Link href="/dashboard" className="flex min-h-[44px] items-center text-ink-muted transition-colors hover:text-ink-text">Run the demo</Link></li>
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