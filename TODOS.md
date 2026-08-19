# TODOS

Generated 2026-08-19 by QA of `localhost:3000` (zippyDesk demo). Baseline: health 6.0/10 → 9.0/10.

| # | Issue | Severity | Status | Action | Owner |
|---|-------|----------|--------|--------|-------|
| 001 | Top-up presets show kobo as naira (100x) | HIGH | ✅ Fixed | billing-view.tsx label math `/100` | QA |
| 002 | Checkout msg wrong amount + stale balance | HIGH | ✅ Fixed | wallet.ts return post-commit; regression test | QA |
| 003 | Add Item empty-SKU silent 404 → "create failed" | MEDIUM | ✅ Fixed | SKU validation + encodeURIComponent | QA |
| 004 | Simulator copy implies order is booked | LOW | ✅ Fixed | copy updated (drill-only) | QA |
| 005 | Calculator "(-150 over the tier)" under-tier label | LOW | ✅ Fixed | conditional label | QA |
| 006 | Empty/error submits show empty alerts | LOW | ⏳ Deferred | enrich alert text behind submit handlers | Product |
| 007 | /terms not linked in footer | LOW | ✅ Fixed | footer Terms link added in fintech redesign | QA |
| — | Dev server wedged (133% CPU, 21d uptime) | INFRA | ✅ Restarted | monitor; consider a health/restart guard | DevOps |

## Design review (2026-08-19, /plan-design-review — fintech redesign diff `2627fd0..HEAD`)

Gate: 5/5 fixes approved → committed `6053703`.

| # | Finding | Severity | Status | Fix |
|---|---------|----------|--------|-----|
| DR1 | MASTER.md palette drifted from code (gold/purple vs ocean/aqua) | MEDIUM | ✅ | MASTER.md regenerated to match shipped tokens/specs |
| DR2 | `--color-ink-faint` 3.8:1 on ink — AA fail for 11–12px labels | HIGH | ✅ | `#5e6f80` → `#7d8fa3` (~5.9:1) |
| DR3 | Brand-band `white/70` text ~4.3:1 over `#005f85` — AA fail | HIGH | ✅ | band text raised to white/85–95 |
| DR4 | Landing "polling 5s"/"posting" chips imply live telemetry on static rows | MEDIUM | ✅ | chips relabeled "sample stream"/"sample"; caption corrected |
| DR5 | Token drift + dead CSS + 375px divider artifact | LOW | ✅ | `--warn` tokens in overview.tsx; `.gradient-text` removed; stats `divide-x` sm-only |

Residual (no gate): Approve/Reject buttons ~36px (under 44px touch target — table is secondary); landing trust expressed 3× (kept intentionally).

## Design review (2026-08-19, /design-review — live audit + design-consistency pass)

Baseline: 20 findings (4 HIGH, 8 MED, 6 LOW, 2 verified-clean) → all closed across 13 atomic commits; visual re-verification pending a rerun of the live screenshot pass.

| # | Finding | Severity | Status | Fix |
|---|---------|----------|--------|-----|
| F-01 | No pointer cursor on any interactive control | HIGH | ✅ | `.btn-*`, Button base, Switch root |
| F-02 | `.gradient-text` wordmark class deleted as dead code (regression) | HIGH | ✅ | restored, token-derived |
| F-03 | VisionAudit rows `<tr onClick>` — keyboard-inaccessible | HIGH | ✅ | real button + aria-expanded in orderId cell |
| F-04 | live/locked chip unreadable on aqua band | HIGH | ✅ | solid dark chip, white/95 text |
| F-05 | Top-up dialogs couldn't scroll | HIGH | ✅ | max-h 90dvh + overflow-y-auto |
| F-06 | Control radius 10px vs 8px token | MEDIUM | ✅ | all controls 8px; dialog 12px; chip 5px |
| F-07 | Hero hover flashed cyan | MEDIUM | ✅ | hover brightens within brand range |
| F-08 | Raw rgba alphas scattered | MEDIUM | ✅ | aqua-soft/good-soft/bad-soft/bad-line incl. pricing selected state |
| F-09 | Bespoke shadows vs elevation scale | MEDIUM | ✅ | --shadow-sm..xl tokens; dialog/mobile-menu use shadow-lg |
| F-10 | Six near-identical brand gradients | MEDIUM | ✅ | one recipe 135deg ocean→aqua (btn, bolt, receipt accent, global-error) |
| F-11 | global-error inline styles drifted | MEDIUM | ✅ | radii + token hexes aligned |
| F-12 | whatsapp mockup second palette (#0c1216/#1a3940) | MEDIUM | ✅ | ink/panel-3/tokens |
| F-13 | Hand-rolled ARIA switch in overview | MEDIUM | ✅ | ui/Switch (Radix) in 44px label |
| F-14 | demo-login href-less `<a role="button">` | MEDIUM | ✅ | real Button |
| F-15 | Merchant switcher 32px touch target | LOW | ✅ | 44px select |
| F-16 | money/data typography sweep | LOW | ✅ | verified: tabular-nums + mono already in place — no churn |
| F-17 | skeleton flash on SSR dashboard | LOW | ✅ | verified: `loading && !data` gate already correct |
| F-18 | /favicon.ico 404 | LOW | ✅ | app/icon.svg (bolt on ink tile) |
| F-19 | label-caps `<h3>` for hero sub-label | LOW | ✅ | `<p>`, one h1 per page preserved |
| F-20 | sr-only duplicate Logo in mobile menu | LOW | ✅ | dropped; single aria-hidden chevron per row |

## Verification
- Re-tests pass in-browser; `npm test` 86 passing; `tsc --noEmit` clean.
- Demo DB reset to canonical seed (18 credits, 2 items, 8 orders).