---
name: fee_bands rate_type units convention
description: Which units each fee_bands rate_type stores, and how the CHECK constraint gates new types — read before adding any new fee_bands row.
---

`fee_bands.rate_type` is a CHECK-constrained enum (`fee_bands_rate_type_check`), not app-only
convention — adding a new rate_type requires a migration that drops and re-adds that constraint,
or the insert fails at the DB layer with a constraint violation (not a friendly app error).

Existing units per rate_type (verified against migration 033's seed data):
- `'percent'` — a 0..1 fraction (0.25 = 25%).
- `'flat'` — raw **USD dollars** (49.99 = $49.99). NOT cents.
- `'flat_cents'` (added migration 259) — integer **cents**. Introduced because a lane needed to
  seed dollar-looking small integers (499, 299, 4000) that only make sense as cents; reusing
  `'flat'` for them would have silently misread as $499/$299/$4000.
- `'count'` (added migration 259) — a unitless integer (a step or an allowance), never currency.
- `'rule'` (added migration 259) — non-numeric governance value; `default_rate` gets a sentinel
  `0` (column is NOT NULL), the real value lives in `description` (already free text, no resolver
  parses it as a number).

**Why this matters:** `requireBand()` in `fee-resolution.service.ts` only ever accepts
`rate_type = 'percent'`. Any accessor for a non-percent band must assert its own expected
rate_type explicitly (fail loud on mismatch) rather than trusting the caller — the CHECK
constraint stops garbage at insert time, not at read time.

**How to apply:** before adding a new fee_bands row, check whether its value is dollars, cents,
a fraction, a count, or a rule string, and pick (or add) the matching rate_type rather than
overloading `'flat'`. `fee_bands` also has nullable `as_of_date`/`review_date` columns (added
migration 259, additive, NULL on all pre-259 rows) for tracking value provenance without
repurposing `description`/`display_name`.
