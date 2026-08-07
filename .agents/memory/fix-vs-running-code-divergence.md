---
name: Fixes vs running-code divergence (admin QA)
description: Why "verified" in-session admin fixes can be absent from the running app, and how to re-verify.
---

# In-session fixes can be missing from the running code

During admin-panel QA, fixes reported as "applied + verified" in a prior session
(service cascade-delete soft-delete guard, fee-band non-numeric validation) were
**not present in the running codebase** on a later re-verification. A live re-test
proved the service-delete path still hard-deleted and CASCADE-destroyed booking
rows.

**Why:** `main` in this repo diverges heavily (many external `Nardo758/*` PR
merges + octopus merges). Edits made in an ephemeral working container that are
never pushed/merged, or that get overwritten by later merges, silently disappear
from what actually runs — even though the platform may mark separate *task* refs
(e.g. gems-backfill, integration-status, notifications) as MERGED.

**How to apply:**
- Never trust a prior "fixed & verified" claim for a critical guard. Re-run the
  real before/after against the *running* app before sign-off.
- For destructive-delete guards specifically: seed a row + a dependent child row,
  delete via the real endpoint, and assert the child survives. `service_bookings`
  requires `total_amount` + `insurance_fee` (NOT NULL) — a booking insert that
  omits them fails, leaving zero bookings, which makes a hard-delete look
  "correct" and hides the bug. Seed a *valid* booking.
- Root cause is a DB-level `ON DELETE CASCADE` on `service_bookings.service_id`
  (also provider_id, traveler_id). The app-layer guard only protects the admin
  route; any other delete path can still cascade. A DB FK change to RESTRICT/SET
  NULL is the durable fix.
