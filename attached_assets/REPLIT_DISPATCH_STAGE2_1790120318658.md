# Replit dispatch — after Stage 1

**Stage 1 is done and proven, and the damage query came back clean.** Both are real results and
neither should be softened. The brief is amended and merged (PR #1042): it now reads
"Stage 1 closed, Stage 2 open", every claim in it is dated, and it carries a correction of MINE —
I had written that the Plus/subscription lane "is not built", when ledger
`2026-09-21-membership-writer` had already landed the writer, migration 316 and all three
subscription arms.

Nothing below is urgent in the way the last dispatch was. Work it in order.

---

## ITEM 1 — WATCH, don't build: the first real hosted-checkout purchase

The Stage 1 proof used a synthetic session whose `metadata.type` matched neither branch — which is
exactly why it was safe, and also why **neither completion handler has yet run against a real
session of its own type.**

- `handleExpertServicePayment` — **INSERTs** the `expert_requests` row. Never executed in production.
- `handleStripePaymentSuccess` — promotes `service_bookings` and stamps the PI. Never executed in
  production.

So the first genuine `expert_service` or `transport_booking` purchase is the first production run
of that code. **Do not pre-emptively refactor either.** Just know that when one lands it deserves
a look rather than an assumption: confirm the row was created/promoted, the PI was stamped, and
revenue was recorded.

**A standing check that is now worth something.** The admin digest's Stripe gap check compares
Stripe's recent events against `webhook_events`. Before Stage 1 it was noise — everything was
missing. Now a MISS on one of the four subscribed types is a real signal. Worth glancing at for a
few days.

---

## ITEM 2 — Stage 2 is a decision, and it is still NOT yours or mine

The remaining dark events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
`payment_intent.canceled`, `payment_intent.requires_action`, `charge.refunded`,
`charge.dispute.created`, `charge.dispute.closed`, `transfer.created`, `transfer.paid`.

**§15c's recovery layer 2 still does not exist** — that is the headline consequence.

**Evidence from your own Stage 1 test, worth putting in front of the decision-maker:** that $1.00
charge and its refund emitted `payment_intent.succeeded` and `charge.refunded` at Stripe, and
**nothing received either** — in the same minute the Stage 1 success was being confirmed. The gap
was observable live.

**The ownership map, read off the `case` arms. An inventory, not a recommendation:**

| Event | Platform arm | Connect arm | Where it belongs |
|---|---|---|---|
| `payment_intent.succeeded` | `handlePaymentSucceeded` | the SAME call **plus** revenue tracking and the earnings mint | **Connect alone** — a strict superset; subscribing both just runs the shared handler twice |
| `payment_intent.payment_failed` | `payment_intents` + legacy `bookings` | `service_bookings` → `failed` + traveler email | **Both** — complementary, not overlapping |
| `payment_intent.canceled` | `handlePaymentCanceled` | — | Platform |
| `payment_intent.requires_action` | `handleRequiresAction` | — | Platform |
| `charge.refunded` | `handleRefund` | — | Platform |
| `charge.dispute.created` / `.closed` | — | admin dispute alerts | Connect |
| `transfer.created` / `.paid` | — | payout tracking | Connect |

**Why this one is genuinely riskier than Stage 1 was.** Stage 1's four types had ZERO historical
volume — no paid hosted sessions, no subscriptions — so there was nothing to disturb. Stage 2 is
the opposite: `payment_intent.succeeded` fires on **every cart checkout**, and turning it on starts
running `promotePaidCheckout` and the revenue/earnings mint against live rows for the first time.
The code is correct and idempotent, and it is §15c's intended design — but "never executed in
production" is a real category, and it deserves its own change window with someone watching
`webhook_events` fill rather than riding along with a zero-volume change.

**If it is approved, stage it again rather than all at once.** Suggested order, each verified
before the next: `charge.dispute.*` and `transfer.*` on Connect (low volume, purely additive
alerting/tracking) → `charge.refunded` and the two platform-only `payment_intent` types →
`payment_intent.succeeded` and `payment_intent.payment_failed` last, because those are the ones
that touch the cart money path.

**Do not change any subscription without the ruling. Report; do not decide.**

---

## ITEM 3 — #1038 is still open and needs its review

It has been mergeable with no CI failures for some time; what it is waiting on is the required
human approval, which no push can supply. Nothing to do but get it reviewed. Do **not** push to it
to try to clear the check — a push cannot add an approval and can dismiss ones already given.

---

## ITEM 4 — everything from the earlier dispatches, unchanged

**Batch A** (61 closures + #1435 / #1390 / #1469; **#1434 is `PARTIAL-FIXED`, not closed**),
**Batch B** (34 verify-then-close), **Batch C** (re-file 112 + flag 114), **Batch D** (now nine
remaining operator items — the webhook row is Stage-1-done/Stage-2-open, and `BRANCH_PROTECTION_PAT`
is the highest-value one left), **Batch E** (cap the board).

Constraints unchanged: never commit on `main`; no bare `npm install`; read `TSC_BASELINE` from
`build.yml` rather than restating it; publish-time SQL is decline-by-default (§20).

---

## Two process notes worth keeping

**The check-enumeration rule earned its keep again.** Ledger
`2026-09-21-k6-regression-and-price-ids` requires enumerating EVERY check run across
`ceil(total/100)` pages and asserting the non-success set is empty and nothing is queued or in
progress — never sampling, and never reading a permitted merge as a passing build. I applied it to
#1042 and page 1 alone showed three jobs still running. Keep doing this.

**`cancelled` is not `failed`.** Several gate comments in this session reported `cancelled` jobs
that turned out to be superseded runs on an older commit, killed by concurrency when a newer push
landed. Always check the run's `head_sha` against the PR's current head before treating a
`cancelled` report as a failure. One appeared on #1042 too (`spec-arming-gate`, superseded run) —
the same gate passed on the current run.
