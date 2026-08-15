# Gift Architecture Automation — Spec v2

WhatsApp order state machine for multi-vendor commerce. One shared WhatsApp Business number (Meta Cloud API); customers pay vendors directly by bank transfer; platform never holds money.

Guiding rules:
- **AI at the edges, code at the core** — the LLM only classifies intent and extracts JSON (Vision). Every decision (math, timers, transitions, stock) is deterministic code.
- **Custom per business = config, not code** — a vendor is a config block; the engine is shared.
- **No undefined states** — every status has a defined exit path for every event.

---

## 1. Actors

| Actor | Role |
|---|---|
| Customer (C) | Buyer on WhatsApp, identified by `wa_id` |
| Owner (V) | Vendor's approver. Approves orders, issues manual refunds |
| Assistant (A) | Fallback approver after approval timer expiry |
| System (S) | Deterministic state machine, timers, webhooks |

## 2. Identity & session model

- Primary key everywhere: `order_id`.
- Customer `wa_id` can hold multiple orders; **one active order per (customer, vendor)**.
- Multivendor routing: vendor is chosen at intake, all subsequent messages scoped to that vendor + order.

## 3. Data model (PostgreSQL)

```
vendors
  id (PK, narration code like 'A3')
  name, bank_account, active
  escalation        JSONB  -- [{role:'owner'},{role:'assistant'}]
  timers            JSONB  -- { approval_min: 5, payment_ttl_h: 24 }

vendor_items
  id (PK), vendor_id (FK), sku, name, price_kobo, stock, active

orders
  id (PK, serial -> '7451')
  customer_wa_id, vendor_id (FK)
  items               JSONB  -- [{sku, name, qty, unit_kobo}]
  total_kobo          int
  amount_paid_kobo    int    -- invariant: always <= total_kobo
  balance_due_kobo    int    -- total - paid
  status              order_status
  escalation_level    int    -- 0 owner | 1 assistant
  timestamps          created_at, updated_at

payments
  id (PK), order_id (FK)
  amount_kobo
  narration            text  -- extracted by Vision, e.g. 'GFT-A3-7451'
  vision_json          JSONB -- raw extraction payload (audit)
  receipt_msg_id       text UNIQUE  -- dedupe key
  status               enum  -- applied | partial | overpayment | unmatched | duplicate
  created_at

approval_events       -- audit log
  id (PK), order_id (FK)
  actor  -- owner | assistant | customer | system
  action -- approve | reject | escalate | timer_fire | cancel | created
  at

refunds
  id (PK), order_id (FK)
  amount_kobo
  status    -- pending | refunded   (owner-confirmed; audited daily)
  owner_confirmed_at, notes

ingested_messages     -- webhook idempotency
  msg_id (PK), wa_id, direction, status, received_at
```

Constraints (DB-level enforcement):
- `amount_paid_kobo <= total_kobo` (CHECK)
- `balance_due_kobo = total_kobo - amount_paid_kobo` (CHECK)
- `vendor_items.stock >= 0` (CHECK)

### Status enum

```
INTAKE                -- browsing, no open order
ORDER_PENDING_PAYMENT
PARTIALLY_PAID
PENDING_APPROVAL
APPROVED
FAILED_OUT_OF_STOCK   -- atomic commit failed
PENDING_REFUND
REFUNDED              -- owner confirmed payout back to customer
CANCELLED             -- pre-payment cancel or payment TTL expiry
```

## 4. State machine — full transition table

All transitions atomic with a guard (`UPDATE ... WHERE status = X`). Zero rows affected => event ignored (idempotency), logged.

```
FROM              EVENT                     GUARD                     TO
----------------  ------------------------  ------------------------  --------------------
INTAKE            vendor_selected           create order              ORDER_PENDING_PAYMENT
ORDER_PENDING_PAYMENT  payment              amount == total           PENDING_APPROVAL
ORDER_PENDING_PAYMENT  payment              amount < balance, > 0     PARTIALLY_PAID
PARTIALLY_PAID    payment                   accumulated == total      PENDING_APPROVAL
ORDER_PENDING_PAYMENT | PARTIALLY_PAID      payment TTL (24h)         CANCELLED
ORDER_PENDING_PAYMENT | PARTIALLY_PAID      customer_cancel           CANCELLED
PENDING_APPROVAL  owner_approve             atomic stock decrement    APPROVED
PENDING_APPROVAL  owner_approve             stock decrement fails     FAILED_OUT_OF_STOCK
PENDING_APPROVAL  owner_reject              --                        PENDING_REFUND
PENDING_APPROVAL  timer_fire (5m)           still pending             PENDING_APPROVAL (escalation_level=1)
PENDING_APPROVAL  assistant_act (approve/reject)                      APPROVED | PENDING_REFUND
FAILED_OUT_OF_STOCK  notify sent            --                        PENDING_REFUND
PENDING_REFUND    owner_refund_done         --                        REFUNDED
CANCELLED         customer_restarts         new order                 INTAKE (new order)
```

Notes:
- `PARTIALLY_PAID` accumulates: full balance swept only when `paid == total`.
- Overpayment (`amount > balance_due`) is **rejected** (never applied). Customer picks adjust-or-refund, decided by customer, executed by the payment rules.
- Late owner approval after escalation: **honored and logged** (owner approval still required to commit), assistant notified.
- Total silence (owner + assistant): status stays `PENDING_APPROVAL`; daily cron re-alerts owner; **no auto-cancel** — money already in.
- Escalation is a field bump (`escalation_level`), not a state — avoids state explosion.

## 5. Narration scheme & payment verification

- Customer pays vendor's account with narration: `GFT-<VENDOR>-<ORDER>` = `GFT-A3-7451` (11 chars, fits NA bank narration limits; trims fine).
- Vision extraction — constrained JSON only:
  ```json
  { "narration": "GFT-A3-7451", "amount_kobo": 1500000,
    "sender_name": "Amara", "date": "2026-08-15",
    "is_successful": true, "confidence": 0.97, "error_reason": null }
  ```
- Deterministic checks in code (never the LLM):
  1. Dedupe: `receipt_msg_id` unique. Duplicate => ignore + notify.
  2. Narration regex `^GFT-[A-Z0-9]{2}-\d+$` => vendor + order attribution.
  3. Amount: `<= balance_due` => apply; `== balance_due` => order advances; `<` => partial; `>` => reject (overpayment).
  4. `sender_name` vs customer profile name: soft signal, logged, never blocking.
  5. Parse/vision failure => auto-prompt "photo unclear" -> 3 attempts -> assistant with image attached.

Outcomes: `applied | partial | overpayment | unmatched | duplicate`.

## 6. Interactive payloads (button `id`, < 256 chars, minified JSON)

```
choose_vendor    {"a":"vs","v":"A3"}
add_item         {"a":"add","s":"SKU-X","q":1}
done_cart        {"a":"done"}
approve          {"a":"ap","o":7451}
reject           {"a":"rj","o":7451}
refund_done      {"a":"rd","o":7451}
```

Webhook reads `interactive.button_reply.id`, switches on `a`, executes the guarded transition. Meta side stays stateless.

## 7. Messaging & the 24-hour window

Free-form messages: only inside 24h of the customer's last message. Outside => pre-approved templates (one WABA for the shared number):

```
payment_instructions     {{vendor}} {{amount}} {{account}} {{narration}}
payment_received         {{vendor}} {{amount}}
order_requires_approval  {{vendor}} {{order}}
approval_escalated       {{order}}
order_confirmed          {{vendor}} {{items}}
stock_failed_refund      {{order}}
refund_required_urgent   {{order}} {{amount}} {{customer}}
order_cancelled          {{order}}
daily_refund_reminder    {{count}}
```

Every transition that must reach an actor outside the window uses the matching template.

## 8. Refund protocol (owner-led)

1. Trigger: `owner_reject` or commit failure -> status `PENDING_REFUND`, refunds row created.
2. System sends owner `refund_required_urgent` (urgent template) with amount + customer.
3. Owner refunds manually in their bank app, then taps `refund_done` button (menu-provided by system, sent proactively).
4. `PENDING_REFUND -> REFUNDED` (guarded). 
5. Trust model: no customer-side evidence required (owner is the fraud victim), but `daily_refund_reminder` cron lists every `PENDING_REFUND` and daily audit report lists every `REFUNDED` with amounts.

## 9. Failure matrix (every path defined)

| Layer | Failure | Behavior |
|---|---|---|
| Vision | parse fails | re-prompt x3 -> assistant |
| Intent | low confidence | assistant |
| Webhook | processing error | 200 immediately, process async from queue, retry |
| Meta send | 5xx/rate-limit | queue retry with backoff |
| Atomic commit | stock/capacity | FAILED_OUT_OF_STOCK -> refund protocol, customer notified |
| DB down | connect fail | 503, retry |
| Timers | job lost | redis persistence + reconcile on boot |

## 10. Stack mapping (target for the TypeScript port)

- Node 22 + TypeScript, Fastify webhook controller
- PostgreSQL + Prisma/Drizzle (guards = CHECK constraints + WHERE-guarded updates)
- Redis + BullMQ (approval timer 5m, payment TTL, daily crons)
- Gemini Vision (or OpenAI) vision + structured output, Zod validation everywhere
- Meta Cloud API SDK, per-vendor config cache with hot reload
- Vitest + in-memory mock message driver (no Meta needed for unit tests)
- Single deployable service, multi-vendor by config

## 11. Meta sandbox test plan

Test vendor `A3` with 2 items. Scripted walk:
1. Intake: vendor select -> catalog -> cart -> `ORDER_PENDING_PAYMENT`.
2. Happy path: payment == total -> approve -> commit -> `APPROVED`.
3. Partial: pay 60% -> `PARTIALLY_PAID` -> pay 40% -> `PENDING_APPROVAL`.
4. Overpayment: reject, balance untouched.
5. Out-of-stock: set stock 0, approve -> `FAILED_OUT_OF_STOCK` -> refund protocol.
6. Escalation: 5-min timer (mocked clock) -> assistant notified.
7. Duplicate webhook: re-send same `msg_id` -> ignored.
8. 24h TTL: mocked clock -> `CANCELLED`.
9. Refund: `PENDING_REFUND` -> `refund_done` -> `REFUNDED`.

---

Status: spec closed. All paths defined. Next: scaffold the TypeScript repo against this spec.