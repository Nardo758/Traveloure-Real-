---
name: Legacy confirmation persistence approval
description: Founder-approved atomic traveler notices, with historical repair and other post-confirmation effects excluded.
---

Future legacy confirmations must commit their traveler notice atomically,
using the existing outbox. Persistence failure may roll back local confirmation
but must never reverse or repeat Stripe's successful payment.

**Why:** The founder chose atomic persistence over a recovery scan on
2026-10-08 because retries skipped already-confirmed rows whose notice had
never been saved. Approval explicitly excluded schema changes, a new scheduler,
historical backfill, and changes to earnings policy.

**How to apply:** Keep traveler confirmation persistence with the authoritative
winning writer. Obtain separate approval before sending recovery notices for
older confirmations or expanding durability to provider alerts and fee-ledger
side effects. A missing recipient is an explicit blocked notice, not delivered.
