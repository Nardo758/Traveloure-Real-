---
name: Earnings minting path
description: Where expert/provider earnings ledger rows are minted, and the dead confirmed→completed transition that blocks it for normal bookings.
---

# Earnings ledger minting

Earnings (`expert_earnings` + `provider_earnings`) are minted ONLY on the FIRST transition of a
`service_bookings` row to `completed` (`storage.updateServiceBookingStatus`). Payment confirmation
(`promotePaidCheckout` — webhook or `/api/bookings/confirm-payment`) only flips to `confirmed`
and mints NOTHING.

**Completion design (ratified Aug 2026):** completion is traveler- or scheduler-driven, never
owner-driven (self-credit risk). Both rails must gate on a Stripe-verified succeeded PI — a
`confirmed` request-rail booking can be unpaid or carry a never-charged PI. The mint is
idempotent per ledger effect (existence guards), which is what makes dispute-reject
re-completion and crash reconciliation safe; any new completion caller must preserve that.
Unpaid candidates get a recheck stamp so a stale backlog can't head-of-line block paid rows.

**Durable invariants:**
- Completion is a MONEY event: the status flip and every mint effect must commit as ONE
  transaction, with positive-row-scoped partial unique indexes as the concurrency guard —
  negative reversal/compensation rows share the same source identity and must stay insertable.
- Refund flows are ledger-first, so a completion can mint between a caller's reversal and the
  refund's terminal status claim; whoever wins the terminal claim must re-sweep the reversals.

**Fee semantics observed:** traveler is charged price + platform fee (25% expert_standard) on top,
AND the earner keeps only 75% of price — platform takes both sides ($100 on a $200 booking).
