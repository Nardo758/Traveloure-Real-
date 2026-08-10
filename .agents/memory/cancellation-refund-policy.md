---
name: Cancellation refund policy enforcement
description: Rules learned from the policy-enforced cancellation/refund work (review-driven fixes)
---

Cancellation policies (flexible/moderate/strict/non_refundable) are enforced server-side in the cancellation-policy service; the traveler cancel flow shows a preview quote first.

Rules the completion review enforced (apply to any future refund-path work):
- **Refund before terminal status.** Never write `cancelled` before the Stripe refund: on Stripe failure the status must return to pending/confirmed so the traveler can retry — no cancelled-but-unrefunded dead ends. Stamp cancelled_at/reason after the refund succeeds, without touching the terminal status.
- **Stripe idempotency keys must be unambiguous per (operation, amount).** Reusing one key with a different amount 400s at Stripe; amount-scoped keys for partial refunds, atomic status claim still guarantees at most one refund per booking.
- **Partial refunds need proportional ledger reversal.** A 50% refund must reverse only half the recognised platform revenue (retained share stays recognised) and must NOT fully reverse earnings. `reversePlatformRevenueForBooking` takes a fraction arg.

**Why:** first completion attempt was rejected on exactly these three points.
Integration test: `scripts/test-cancellation-refund-integration.ts` (real Stripe test mode + dev DB, covers 50% refund, failure/retry, concurrency). Unit: `server/services/__tests__/cancellation-policy.test.ts`.

**Fee-inclusive refunds (platform-owner ruling 2026-08-10):** the refund basis is the FULL amount charged (total_amount + platform_fee + insurance_fee) — policy % of that for traveler cancels, always 100% for provider-initiated cancels of a Stripe-verified-paid booking. `refundServiceBooking` with no amountOverride now defaults to the charged amount, not total_amount. Owner cancel gates the refund branch on a live PI `succeeded` check (a stamped PI is not proof of payment). Both cancel paths write an in-app `booking_cancelled` notification; the losing racer of the atomic refund claim gets `alreadyRefunded` and must fire no ledger/notification side-effects.
