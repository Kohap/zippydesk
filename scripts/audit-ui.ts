import { chromium } from "playwright-core";
import { createSessionToken } from "../lib/auth/session";

const ROOT = "/Users/mac/Documents/Default Project/gift-architecture";
const BASE = "http://127.0.0.1:3999";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const WIDTHS = [320, 360, 390, 414, 480, 640, 768, 834, 1024, 1280, 1440, 1536];
const HEIGHT = 900;
const ROUTES = ["/", "/dashboard", "/inventory", "/billing", "/activity"];

let failures = 0;
function report(ok: boolean, label: string, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const token = createSessionToken("merchant-parfait");
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  async function measure(page: import("playwright-core").Page) {
    return page.evaluate(() => {
      const doc = document.documentElement;
      const cw = doc.clientWidth;
      const sw = doc.scrollWidth;
      const offenders = [...document.querySelectorAll("body *")]
        .filter((el): el is HTMLElement =>
          el instanceof HTMLElement && el.getClientRects().length > 0 && el.getBoundingClientRect().width > cw + 1 &&
          !el.closest("#zd-mobile-menu"),
        )
        .filter((el) => {
          let p = el.parentElement;
          while (p && p !== document.body) {
            const cs = getComputedStyle(p);
            if (/(auto|scroll|hidden)/.test(cs.overflowX)) return false;
            p = p.parentElement;
          }
          return true;
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            w: Math.round(r.width),
            tag: el.tagName,
            cls: String(el.className).replace(/\s+/g, " ").slice(0, 56),
            text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24),
          };
        })
        .sort((a, b) => b.w - a.w)
        .slice(0, 4);
      return { cw, sw, offenders, len: (document.body.textContent ?? "").length };
    });
  }

  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: HEIGHT } });
      if (route !== "/") {
        await ctx.addCookies([{ name: "zd_session", value: token, domain: "127.0.0.1", path: "/" }]);
      }
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 });
        await page.waitForTimeout(900);
        const m = await measure(page);
        const label = `[w${width}] ${route}`;
        report(m.len > 500, `${label} content`, String(m.len));
        report(m.sw <= m.cw, `${label} overflow`, `scrollW=${m.sw} clientW=${m.cw} offenders=${JSON.stringify(m.offenders)}`);
      } catch (e) {
        report(false, `[w${width}] ${route} load`, String(e).slice(0, 120));
      }
      await ctx.close();
    }
  }

  const interactive: Array<{ width: number; route: string; open: (page: import("playwright-core").Page) => Promise<void> }> = [
    {
      width: 390, route: "/",
      open: async (page) => { await page.getByRole("button", { name: "Open menu" }).click(); await page.waitForTimeout(400); },
    },
    {
      width: 640, route: "/",
      open: async (page) => { await page.getByRole("button", { name: "Open menu" }).click(); await page.waitForTimeout(400); },
    },
    {
      width: 390, route: "/billing",
      open: async (page) => {
        const btn = page.locator("button").filter({ hasText: "Top up" }).first();
        await btn.click();
        await page.waitForTimeout(400);
      },
    },
    {
      width: 768, route: "/billing",
      open: async (page) => {
        const btn = page.locator("button").filter({ hasText: "Top up" }).first();
        await btn.click();
        await page.waitForTimeout(400);
      },
    },
    {
      width: 320, route: "/billing",
      open: async (page) => {
        const btn = page.locator("button").filter({ hasText: "Top up" }).first();
        await btn.click();
        await page.waitForTimeout(400);
      },
    },
    {
      width: 390, route: "/dashboard",
      open: async (page) => {
        const tgl = page.locator("tr button[aria-expanded]").first();
        if (await tgl.count()) { await tgl.click(); await page.waitForTimeout(500); }
      },
    },
    {
      width: 768, route: "/dashboard",
      open: async (page) => {
        const tgl = page.locator("tr button[aria-expanded]").first();
        if (await tgl.count()) { await tgl.click(); await page.waitForTimeout(500); }
      },
    },
    {
      width: 320, route: "/dashboard",
      open: async (page) => {
        const tgl = page.locator("tr button[aria-expanded]").first();
        if (await tgl.count()) { await tgl.click(); await page.waitForTimeout(500); }
      },
    },
  ];

  for (const spec of interactive) {
    const ctx = await browser.newContext({ viewport: { width: spec.width, height: HEIGHT } });
    if (spec.route !== "/") {
      await ctx.addCookies([{ name: "zd_session", value: token, domain: "127.0.0.1", path: "/" }]);
    }
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${spec.route}`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(800);
      let openOk = true;
      try { await spec.open(page); } catch { openOk = false; }
      if (openOk) {
        const m = await measure(page);
        report(m.sw <= m.cw, `[w${spec.width}] ${spec.route} overflow@interaction`, `scrollW=${m.sw} clientW=${m.cw} offenders=${JSON.stringify(m.offenders)}`);
      } else {
        report(false, `[w${spec.width}] ${spec.route} interaction open`, "could not open");
      }
    } catch (e) {
      report(false, `[w${spec.width}] ${spec.route} interaction load`, String(e).slice(0, 120));
    }
    await ctx.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nAUDIT CLEAN" : `\n${failures} AUDIT FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();