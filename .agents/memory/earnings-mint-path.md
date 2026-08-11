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

**How to drive a full earnings fixture (verified end-to-end):**
1. add-to-cart `POST /api/cart` {serviceId} → `POST /api/checkout` {idempotencyKey} (mints
   service_bookings payment_pending + PI; PI amount = price + platform fee ON TOP).
2. Confirm PI via Stripe API with `pm_card_visa` + `return_url`, then
   `POST /api/bookings/confirm-payment` → confirmed.
3. Admin `POST /api/admin/disputes/:id/reject` → completed → mints held earnings via production code.
4. Traveler `POST /api/bookings/:id/confirm-completion` → releasable (early release).
5. `POST /api/payouts/request` needs users.can_receive_payments + stripe_account_id.

**Fee semantics observed:** traveler is charged price + platform fee (25% expert_standard) on top,
AND the earner keeps only 75% of price — platform takes both sides ($100 on a $200 booking).
Full refund correctly returns the whole charge (price+fee) and reverses held/releasable earnings
idempotently. Expert publish gate requires `local_expert_forms.identity_verification_status='verified'`.

Legacy `GET /api/expert/earnings` (routes.ts) has NO client callers; live UI uses
`/api/expert/earnings/details` only. The legacy one shows refunded bookings as transactions,
counts refunded bookings in grossBookingTotal, and reports a pending payout as "lastPayout".
