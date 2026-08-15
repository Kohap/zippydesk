import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link href="/" className="assist-focus -m-2 rounded-[10px] p-2" aria-label="zippyDesk home">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <span className="data text-[64px] font-semibold leading-none text-aqua-bright">404</span>
        <h1 className="mt-6 text-[24px] font-semibold tracking-tight text-ink-text sm:text-[32px]">
          That page took an unscheduled break
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted">
          The link you opened is not on the route. It happens. While you are here, your inbox is still
          running on the dashboard.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/">
            <Button size="lg" variant="ghost" className="h-[52px] rounded-[12px] px-7 text-[16px]">
              Back to the landing page
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" className="h-[52px] rounded-[12px] px-7 text-[16px]">
              Open the live demo
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
