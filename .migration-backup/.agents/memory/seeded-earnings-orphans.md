---
name: Seeded demo earnings lack platform_revenue rows
description: Why dev-DB demo experts show empty statements — seed artifact, not a mint-path bug
---

The 18 dev-DB `expert_earnings` rows for example.com demo experts (created Mar–May 2026 by seed data) have NO matching `platform_revenue` rows. The statements API (`/api/me/statements`) inner-joins `platform_revenue` on `source_id`+`expert_id`, so those demo experts show empty statements even though earnings/details shows a balance.

**Why:** the production mint path (`updateServiceBookingStatus` → completed) writes `expert_earnings` and `platform_revenue` in one transaction — verified by payout-parity suite (P1–P3) and the cancellation-refund integration test (Aug 2026 QA sign-off, all pass). The seed script wrote ledger rows directly and skipped platform_revenue.

**How to apply:** if a "statements page is empty but earnings show money" report comes in on dev, check whether the rows are seed-era orphans before hunting a mint bug. Real cross-check query: join `expert_earnings` to `platform_revenue` on `(source_id, expert_id)` and compare `amount` to `expert_earnings` column.
