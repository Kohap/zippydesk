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

## Verification
- Re-tests pass in-browser; `npm test` 86 passing; `tsc --noEmit` clean.
- Demo DB reset to canonical seed (18 credits, 2 items, 8 orders).