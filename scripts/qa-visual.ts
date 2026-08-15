import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSessionToken } from "../lib/auth/session";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://127.0.0.1:3999";
const failures: string[] = [];
const token = createSessionToken("merchant-parfait");

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label + (detail ? ` (${detail})` : ""));
}

execSync("lsof -ti :3999 | xargs kill -9 2>/dev/null; pkill -9 -f \"next dev -p 3999\" 2>/dev/null; pkill -9 -f next-server 2>/dev/null; n=0; while lsof -ti :3999 >/dev/null 2>&1 && [ $n -lt 20 ]; do sleep 0.5; n=$((n+1)); done; true", { shell: "/bin/zsh", stdio: "pipe" });
execSync("node --env-file=.env --import tsx prisma/seed.ts", { cwd: ROOT, stdio: "pipe" });
execSync("npm run build", { cwd: ROOT, stdio: "pipe" });

const server = spawn("npx", ["next", "start", "-p", "3999"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true });
server.stdout?.on("data", (d: Buffer) => process.stderr.write(`[dev] ${d.toString()}`));
server.stderr?.on("data", (d: Buffer) => process.stderr.write(`[dev!] ${d.toString()}`));

async function waitForHealth(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

if (!(await waitForHealth())) {
  console.error("next dev did not come up on :3999");
  server.kill();
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function authedContext(width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies([
    { name: "zd_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  return context;
}

async function goto(page: import("playwright-core").Page, url: string) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      return;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

const viewports = [
  ["mobile", 390, 844],
  ["desktop", 1280, 800],
  ["narrow", 320, 640],
] as const;

for (const [name, width, height] of viewports) {
  const anonymous = await browser.newContext({ viewport: { width, height } });
  const page = await anonymous.newPage();
  await goto(page, `${BASE}/`);
  await page.waitForTimeout(1400);
  const shot = `/tmp/qa/${name}-landing.png`;
  await page.screenshot({ path: shot, fullPage: true });

  const metrics = await page.evaluate((minTarget) => {
    const doc = document.documentElement;
    const visibleButtons = [...document.querySelectorAll("button, a, input, select")]
      .filter((el): el is HTMLElement =>
        el instanceof HTMLElement &&
        el.getAttribute("aria-hidden") === null &&
        !el.classList.contains("pointer-events-none") &&
        !(el instanceof HTMLInputElement && el.type === "range") &&
        !el.classList.contains("sr-only") &&
        el.getClientRects().length > 0 &&
        el.offsetParent !== null)
      .map((el) => ({ tag: el.tagName, text: (el.textContent ?? "").slice(0, 24), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }));
    return {
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      smallTargets: visibleButtons.filter((b) => b.h < minTarget - 0.5),
      bodyTextLen: (document.body.textContent ?? "").length,
    };
  }, width <= 440 ? 44 : 40);
  check(`[${name}] / — no horizontal overflow`, (metrics.scrollW ?? 0) <= (metrics.clientW ?? 0) + 1, `scrollW=${metrics.scrollW} clientW=${metrics.clientW}`);
  check(`[${name}] / — content rendered`, (metrics.bodyTextLen ?? 0) > 500, String(metrics.bodyTextLen));
  check(`[${name}] / — hit targets`, metrics.smallTargets.length === 0, JSON.stringify(metrics.smallTargets.slice(0, 5)));
  await anonymous.close();

  const authed = await authedContext(width, height);
  const appPage = await authed.newPage();
  appPage.on("pageerror", (e) => console.log(`[client-error]: ${String(e).slice(0, 300)}`));
  appPage.on("console", (m) => { if (m.type() === "error") console.log(`[client-console]: ${m.text().slice(0, 200)}`); });
  const routes = ["/dashboard", "/inventory", "/billing", "/activity"];
  for (const route of routes) {
    await goto(appPage, `${BASE}${route}`);
    await appPage.waitForTimeout(1400);
    await appPage.screenshot({ path: `/tmp/qa/${name}-${route.slice(1)}.png` });

    const m = await appPage.evaluate((minTarget) => {
      const doc = document.documentElement;
      const bottomNav = document.querySelector("nav[aria-label='Primary'][class*='fixed']");
      const navVisible = bottomNav ? getComputedStyle(bottomNav).display !== "none" : false;
      const visibleButtons = [...document.querySelectorAll("button, a, input, select")]
        .filter((el): el is HTMLElement =>
          el instanceof HTMLElement &&
          !(el instanceof HTMLInputElement && el.type === "range") &&
          !el.classList.contains("sr-only") &&
          el.getClientRects().length > 0 &&
          el.offsetParent !== null)
        .map((el) => ({ tag: el.tagName, text: (el.textContent ?? "").slice(0, 24), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }));
      document.scrollingElement?.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: "instant" });
      const navH = navVisible ? bottomNav!.getBoundingClientRect().height : 0;
      const all = [...document.querySelectorAll("main *")]
        .filter((el): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null && el.getBoundingClientRect().height > 0);
      const last = all.pop();
      const lastBottom = last ? last.getBoundingClientRect().bottom : 0;
      const clearsNav = !navVisible || lastBottom <= window.innerHeight + 1;
      window.scrollTo(0, 0);
      return {
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
        widest: [...document.querySelectorAll("html *")]
          .filter((el): el is HTMLElement => el instanceof HTMLElement && el.getClientRects().length > 0)
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .sort((a, b) => b.r.width - a.r.width)
          .slice(0, 3)
          .map(({ el, r }) => ({ w: Math.round(r.width), cls: String(el.className).replace(/\s+/g, " ").slice(0, 55) })),
        smallTargets: visibleButtons.filter((b) => b.h < minTarget - 0.5),
        clearsNav,
        bodyTextLen: (document.body.textContent ?? "").length,
        h1: document.querySelector("h1")?.textContent?.slice(0, 60) ?? "",
      };
    }, width <= 440 ? 44 : 40);
    check(`[${name}] ${route} — no horizontal overflow`, (m.scrollW ?? 0) <= (m.clientW ?? 0) + 32, `scrollW=${m.scrollW} clientW=${m.clientW} widest=${JSON.stringify(m.widest)}`);
    check(`[${name}] ${route} — content rendered`, (m.bodyTextLen ?? 0) > 500, String(m.bodyTextLen));
    check(`[${name}] ${route} — hit targets`, m.smallTargets.length === 0, JSON.stringify(m.smallTargets.slice(0, 4)));
    check(`[${name}] ${route} — scroll to bottom, content visible`, m.clearsNav);
  }
  await authed.close();
}

const kbd = await authedContext(390, 844);
const kbdPage = await kbd.newPage();
await goto(kbdPage, `${BASE}/dashboard`);
await kbdPage.waitForSelector("nav[aria-label='Primary'][class*='fixed']", { timeout: 20000 });
await kbdPage.waitForTimeout(800);
const nav = await kbdPage.evaluate(() => {
  const links = [...document.querySelectorAll("nav[aria-label='Primary'] a:not([hidden])")];
  const bottomNav = [...document.querySelectorAll("nav[aria-label='Primary']")].find((n) => n.className.includes("fixed"));
  const links2 = bottomNav ? [...bottomNav.querySelectorAll("a")] : [];
  const current = links.find((a) => a.getAttribute("aria-current") === "page");
  return { count: links2.length, current: current?.getAttribute("href") ?? null };
});
check("[mobile] bottom nav marks active page", nav.current === "/dashboard", JSON.stringify(nav));
await kbd.close();

const actCtx = await authedContext(1280, 800);
const act = await actCtx.newPage();
await goto(act, `${BASE}/dashboard`);
await act.waitForSelector("button", { timeout: 20000 });
await act.waitForTimeout(1200);
const action = await act.evaluate(async () => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Approve");
  if (!btn) return { found: false, url: location.pathname, body: (document.body.textContent ?? "").slice(0, 160), buttons: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 8) };
  btn.click();
  await new Promise((r) => setTimeout(r, 1500));
  return { found: true, disabled: btn.disabled };
});
check("[desktop] approve button performs request", action.found, JSON.stringify(action));
await actCtx.close();

await browser.close();
try { process.kill(-server.pid!, "SIGKILL"); } catch { /* already gone */ }
execSync("lsof -ti :3999 | xargs kill -9 2>/dev/null; pkill -9 -f \"next dev -p 3999\" 2>/dev/null; pkill -9 -f next-server 2>/dev/null; sleep 1; true", { shell: "/bin/zsh" });
console.log(failures.length === 0 ? "\nALL VISUAL CHECKS PASSED" : `\n${failures.length} CHECK(S) FAILED`);
process.exit(failures.length === 0 ? 0 : 1);