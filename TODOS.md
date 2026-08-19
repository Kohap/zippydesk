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

## Verification
- Re-tests pass in-browser; `npm test` 86 passing; `tsc --noEmit` clean.
- Demo DB reset to canonical seed (18 credits, 2 items, 8 orders).