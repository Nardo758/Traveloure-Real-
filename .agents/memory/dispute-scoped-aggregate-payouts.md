---
name: Dispute-scoped aggregate payouts
description: Why booking-level dispute holds must be reconciled with aggregate transfer requests.
---

An aggregate payout request is not intrinsically associated with a booking. A booking dispute must hold that booking's unpaid earnings, while a transfer claim atomically reserves specific eligible earnings to fund its full amount. Do not freeze every payout by the same provider.

**Why:** Without a reservation, a disputed booking can fund an aggregate transfer or a completion handler can substitute unrelated earnings after reserved rows become held. A payout already processing may have reached Stripe even before its local transfer ID is recorded.

**How to apply:** Distinguish unclaimed requests from processing reservations. Exclude disputed earnings at claim time; never replace a reserved booking's earnings after claim. Keep ambiguous processing transfers reserved for manual reconciliation, and do not auto-fail, retry, or reverse them. A won dispute clears the booking hold; a lost dispute retains unpaid holds and flags possibly sent transfers.