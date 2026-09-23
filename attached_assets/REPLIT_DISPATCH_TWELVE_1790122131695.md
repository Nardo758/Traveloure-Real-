# Replit dispatch — all twelve rulings are decided

**Decision-maker agreed all twelve on 2026-09-23.** Record:
https://claude.ai/artifact/GMcmmrucxVDGniXvsUkKA8 (each with its condition).
**PR #1044** lands the two that were code and records the eight that were rulings.
Two are yours.

---

## YOURS — 1. Stage 2 webhooks: APPROVED, in your proposed order

Go ahead. Your three-step order is the ratified one:

1. `charge.dispute.created`, `charge.dispute.closed`, `transfer.created`, `transfer.paid` — **Connect**
2. `charge.refunded`, `payment_intent.canceled`, `payment_intent.requires_action` — **Platform**
3. `payment_intent.succeeded`, `payment_intent.payment_failed` — **last**

**Two conditions that are part of the approval, not advice:**

- **`payment_intent.succeeded` goes on the CONNECT endpoint ALONE.** Its arm calls the same
  `handlePaymentSucceeded` the platform arm does AND adds revenue tracking plus the earnings
  mint — a strict superset. Subscribing both merely runs the shared handler twice.
  `payment_intent.payment_failed` is the opposite and wants **BOTH**: there the arms are
  complementary (platform updates `payment_intents` + legacy `bookings`; Connect flips
  `service_bookings` to `failed` and emails the traveler).
- **Step 3 needs a person watching `webhook_events` fill for a day**, not just a green deploy.
  That step is the first time `promotePaidCheckout` and the revenue/earnings mint run against
  live cart rows. Verify each step before starting the next.

Same disciplines as Stage 1: create disabled where the API allows, never paste a signing secret
into chat, republish before enabling if a secret changed, and remember Stripe **does not replay**
events from before an endpoint was subscribed.

## YOURS — 2. #1686: verify provider fee bands against PRODUCTION

**Read-only, and it gates provider checkout.** Run `verify-fee-config-parity` against the
production database and report the result.

`beta_flat` was REPLACED, not lost: migration 178 deactivated it and repointed
`default_commission_band_key` → `expert_standard` and `active_provider_commission_policy` →
`tiered`, with per-category bands arriving in ruling 48 / migration 180. Whether production's rows
actually resolve is a database fact nobody can read from a checkout — and this is the exact check
that caught the original breakage, where a band went inactive while two settings still named it.

**Do not enable provider checkout until this reports clean.** Report the output; change nothing.

---

## ALSO YOURS, small — 3. Board #857's title

Rename it. "Credit" currently names three unrelated things: retired `wallets.credits` (410 Gone),
live `coordination_fee_credits` (accurately named — money genuinely paid, applied once against a
coordination fee), and Trip Pass `trip_entitlements`, which **the code never calls credits**. Only
the board title does. **No code change** — `coordination_fee_credits` keeps its name.

---

## THE PROGRAM — 4. #1679, split and now sized

Correcting an earlier note of mine: the coverage report is **FRESH** and its guard **IS** wired
into `suite-mutation-auth.yml`. Standing: **291/589** — admin 143/148, payments 14/31,
user-data 134/200, **other 0/210**.

**(a)** The **88** untested risk-bearing routes (5 admin + 17 payments + 66 user-data) are a
program to work down. Payments first — 17 untested on the money surface is the sharpest edge.

**(b)** The **210 `other` at zero is not closed by testing.** It is a category nobody has ruled
on: either those routes are legitimately unauthenticated by design — in which case say so with a
stated reason and exclude the category — or they are not, and they do not belong in `other`.
Bring the decision-maker a one-page proposal on which it is.

---

## DONE IN THE CHECKOUT — nothing for you here, listed so it is not re-worked

- **§7 `form_status`** — FIXED, and **not the way I first recommended.** I said delete the three
  filters; implementing showed that would have opened an approval-gate hole, because these are
  public surfaces and CLAUDE.md's F2 rule requires `approval_status = 'approved'` on all of them.
  The gate was right and the COLUMN was wrong: all three now read `approvalStatus`. Pinned by
  `server/__tests__/form-status-is-not-a-gate.test.ts` (F1/F2/F3), wired into CI.
- **#1412** — one 375px overflow assertion added to `cosmetic-public-surfaces.spec.ts` (Lane E).
  **If it stays green, close #1412 as speculative.** No `grid-cols-*` guard was built.
- **#1434 remainder** — option 2, the 36 routes recorded as REVIEWED with one carve-out named.
- **#298** — identity ruled; **still blocked on your census** (Batch D), which runs BEFORE any
  index. A violated UNIQUE fails the publish and offers the destructive copy-dev-over-prod option.
- **#215, #411, #495, #1666** — DEFERRED on the record, each with a revisit-when. Close them on
  the board with that reason; they are decided, not pending.

---

## Standing

#1038 still needs its human review — no push can clear it, and pushing risks dismissing
approvals already given. Batches A, B, C, E unchanged. Constraints unchanged: never commit on
`main`; no bare `npm install`; read `TSC_BASELINE` from `build.yml`; publish-time SQL is
decline-by-default (§20).
