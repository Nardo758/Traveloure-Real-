# Pricing Ledger — Lane 1 Findings (Task 1669)

Phase 0 investigation findings vs. the source map's assumptions, and the design decisions made
while landing the `fee_bands` rows + `plans` table. This is the reviewable record the task asked
for; it does not restate the migration's own inline comments in full, only the decisions and gaps.

## 1. The source map does not exist

`docs/design/PRICING_AND_FEATURE_MAP.md` is not present anywhere in the working tree, and does
not appear in `git log --all` history either. This migration was built directly from Task 1669's
explicit key/value list, not from that (missing) document. Nothing in this repo currently defines
"the seven affiliate partners" or a broader pricing map beyond what already exists in
`server/migrations/033_phase1_seed_fee_bands_and_settings.sql`.

## 2. Affiliate partner rows: nine exist, two are missing

Migration 033 already seeds **nine** `affiliate:<partner>` rows: `viator`, `getyourguide`,
`klook`, `fever`, `12go`, `amadeus`, `tiqets`, `headout`, `musement`.

Of the partners the task asks about, **`affiliate:civitatis` and `affiliate:xcaret` do not
exist** in `fee_bands` (confirmed by direct query against dev). This migration does **not**
invent a guessed rate for either — they're filed here as a real gap for a future lane/ruling to
close with a sourced rate, not fabricated.

## 3. No real "feed concierge panel" surface consumes `concierge:ai_task` today

Searched the client for a surface that would price a per-task AI Concierge action:

- `client/src/components/feed/earn-card.tsx` (`FeedEarnCard`) is a "ways to earn" CTA aimed at
  providers/experts — unrelated to concierge task pricing.
- `client/src/components/concierge/DeliveryOptions.tsx` is the real concierge-tier pricing UI a
  traveler sees, but its AI-tier price is already sourced from the `optimization_fees` table via
  `getFee()` (confirmed via `server/services/concierge-router.service.ts`'s `routeConcierge`),
  not from `fee_bands`.

**Conclusion: no live surface reads a per-task AI Concierge price from `fee_bands` today.**
`concierge:ai_task` (and its resolver accessor `getConciergeAiTaskFeeCents()`) is added and
tested per the task's requirement, but is deliberately left **unwired** — wiring it would mean
inventing a panel that doesn't exist, which the task explicitly says not to do. The same applies
to `concierge:booking_pct`, `concierge:booking_cap_cents`, `concierge:done_for_you_deposit_pct`,
`ready_made:platform_band`, `provider:pro_band_step`, and `plans:plus_task_allowance` — all eight
new keys have resolver accessors and tests; only `optimizer:run` has a live call site in this
lane, per the "Optimize dialog" step.

## 4. `fee_bands` schema changes: additive only

- **as-of / review dates**: `fee_bands` had no date columns before this lane. Rather than
  repurpose `description`/`display_name`, two new **nullable** columns were added:
  `as_of_date date` and `review_date date`. Existing rows get `NULL` in both — no existing row's
  meaning or value changes. New Lane 1 rows carry `as_of_date = 2026-08-27`,
  `review_date = 2026-11-27` as the task specifies.
- **`rate_type` CHECK widened**: the original constraint (`000_baseline_schema.sql` /
  `031_phase1_scaffold_fee_bands.sql`) only allowed `'percent'` and `'flat'`. This lane widens it
  (drop + re-add the same constraint name) to also admit three new rate_types introduced below.
  No existing row's `rate_type` changes.

## 5. Units convention for the new rows (why three new `rate_type`s)

The existing `'flat'` convention stores raw **USD dollars** (verified against migration 033:
`ai_concierge_standard = 9.99`, `optimize_expert_review = 49.99`). The task's given values for
`optimizer:run` (499), `concierge:ai_task` (299), and `concierge:booking_cap_cents` (4000) only
make sense as **cents** ($4.99 / $2.99 / $40.00) — inserting them under `'flat'` would silently
misread as $499 / $299 / $4000 against the existing dollar convention. To avoid that ambiguity
forever (not just today), this lane introduces:

- `rate_type = 'flat_cents'` — integer cents. Used for `optimizer:run`, `concierge:ai_task`,
  `concierge:booking_cap_cents`.
- `rate_type = 'count'` — a unitless integer (a step or an allowance, never a currency amount).
  Used for `provider:pro_band_step` (1) and `plans:plus_task_allowance` (4).
- `rate_type = 'rule'` — a non-numeric governance value. `default_rate` is a `NOT NULL` numeric
  column, so it gets a sentinel `0`; the real value (`inherit_expert`) lives in `description`,
  which was already free text with no resolver reading it as a number. Used for
  `ready_made:platform_band`.

`concierge:booking_pct` (0.05) and `concierge:done_for_you_deposit_pct` (0.20) use the existing
`'percent'` convention unchanged (fractions, not new units).

`requireBand()` (the existing fail-loud resolver in `fee-resolution.service.ts`) only ever
accepts `rate_type = 'percent'`, so none of the three new rate_types can be silently misread by
that path — they're read exclusively through the eight new Lane 1 accessors, each of which
asserts its expected `rate_type` via a new `requireBandOfType()` helper and throws
`BandResolutionError` on a mismatch (see `server/__tests__/pricing-ledger-lane1.db.test.ts`).

## 6. `plans` table: minimal, no duplicate source of truth

The three seeded rows (`trip_pass` $19.00/trip, `plus_annual` $25.00/year, `pro_monthly`
$29.00/month) all get `allowances = '{}'::jsonb`. `plus_annual`'s task allowance (4) is **not**
duplicated inside its `allowances` JSON — `fee_bands.plans:plus_task_allowance` is the single
source of truth for that number in this lane, to avoid two values that could drift apart. Stripe
product creation and entitlement/gating logic are explicitly out of scope here; this table only
creates and exposes the rows via `server/services/plans.service.ts` (`getPlan`,
`listActivePlans`).

## 7. Wiring the "Optimize dialog" fee line — a deliberate, safety-motivated deviation

The task's cited range (`client/src/pages/cart.tsx:2295-2388`) is the sidebar "Full AI
Optimization" card in the cart's Optimize step. Its price display
(`formatPrice(optimizationPreview.feeCents / 100)`) and its one-click "Pay $X with card" button
are **already** driven by the real tiered `optimization_fees` table via `getFee()`
(`server/services/optimization-fee.service.ts`) — not a hardcoded placeholder.

**This value is not swapped for `optimizer:run`.** Doing so would create a price-shown-vs-
price-charged mismatch: the one-click saved-card path (`payWithSavedCard`) charges immediately
on click, with no further confirmation screen, using `optimizationPreview.feeCents`. If the
displayed number and the charged number came from two different sources (a ledger row vs. the
tiered `optimization_fees` resolution), a future edit to either one independently would silently
desync what the user sees from what they're charged — exactly the kind of bug this pricing ledger
project exists to prevent, not introduce.

Instead, this lane wires `optimizer:run` **additively**: `POST /api/optimization-preview` now
also returns `ledgerTeaserFeeCents` (resolved via the new `getOptimizerRunFeeCents()` accessor,
failing soft to `null` — a resolver hiccup must never break the real preview response), and the
same sidebar card shows a small subtitle — *"Standard AI optimizer runs from $X"* — sourced live
from that field, directly below the real fee/button. The real `feeCents`, the button label, and
the one-click/Elements charge paths are byte-for-byte unchanged.

Proof this is ledger-governed and live: editing the `optimizer:run` row's `default_rate` changes
the teaser's displayed number on the next preview fetch, with no other code path touched
(exercised in `pricing-ledger-lane1.db.test.ts`'s `optimizer:run` test at the resolver layer; the
client reads the same field verbatim with no local override).

This is a deviation from a literal reading of "wire the fee line to the resolver" and is called
out here explicitly, along with `drift_reason` on the task completion, rather than silently
reinterpreting the requirement.

## 8. Fee-literal-guard scope: which new values were added, and which were deliberately not

`scripts/phase2-fee-gate.sh`'s `VALUE_RE` (dollar literals) and `CENTS_RE` (cents literals) were
extended, but only with values verified **collision-free** against the current tree:

- Added to `VALUE_RE`: `4.99`, `2.99`, `40.00`, `19.00`.
- Added to `CENTS_RE`: `299`, `1900`, `2900`.

**Deliberately not added**, because they collide with real, unrelated, pre-existing content and
would turn the gate red for reasons that have nothing to do with this lane:

- `25.00` / `2500` (plus_annual) — collides with `shared/schema.ts`'s pre-existing "$25.00 per
  booking" traveler-fee-cap comment and an unrelated UI toast `duration: 2500`.
- `29.00` (pro_monthly) — collides with `server/routes.ts`'s unrelated "Quick Consultation"
  service price (`"29.00"`).
- `499` (optimizer:run cents) — collides with the pre-existing, unrelated `$499` coordination-fee
  floor referenced across `optimization-fee.service.ts`, `expert/workspace.tsx`, `pricing.tsx`,
  `how-it-works.tsx`, and `concierge.routes.ts`.
- `4000` (concierge:booking_cap_cents) — collides with unrelated `max_tokens: 4000` LLM-call
  literals and phone-number digit runs.

These four amounts remain covered by the gate's existing **Pass B** context predicate (a number
adjacent to a fee-ish identifier on the same line, e.g. `bookingCapCents = 4000`), which is
already how the gate has always caught genuinely new hardcoded fee assignments without needing
every possible value enumerated in a flat list. Also deliberately not added: the two percent
fractions `0.05` / `0.20` (already generically covered by the same context predicate, and a bare
decimal like `0.05` would false-positive on nearly every unrelated fraction in the codebase) and
the two unitless integers `1` / `4` (`provider:pro_band_step`, `plans:plus_task_allowance` — not
fee literals at all; adding bare `1`/`4` to a literal-value list would be almost pure noise).

## 9. Verification performed

- `npx tsx scripts/check-noop-migrations.ts` — PASS (259 registered, 1 expected no-op unrelated
  to this lane).
- `server/migrations/__tests__/chain-integrity.test.ts` — PASS.
- `server/__tests__/fee-resolution-authority.db.test.ts` (pre-existing, unmodified) — PASS, 13/13,
  unregressed.
- `server/__tests__/optimization-fee-determinism.db.test.ts` (pre-existing, unmodified) — PASS,
  4/4 under `JOURNEY_DB_WRITES_OK=1`, unregressed — the real tiered optimizer charge flow this
  lane deliberately does not touch keeps working.
- `server/__tests__/pricing-ledger-lane1.db.test.ts` (new) — PASS, 11/11: every new accessor
  resolves correctly, reacts live to an admin edit of its row, and a `rate_type` mismatch throws
  `BandResolutionError` rather than silently coercing; both `plans` accessors resolve the three
  seeded rows correctly.
- `bash scripts/phase2-fee-gate.sh --self-test` and `bash scripts/phase2-fee-gate.sh` — both PASS
  after the additions above.
- Confirmed via direct query against the dev DB that every pre-existing `fee_bands` row's
  `rate_type`/`default_rate`/`min_rate`/`max_rate`/`max_amount`/`is_active` is unchanged after the
  migration ran (`ai_concierge_event = 49.99`, `ai_concierge_standard = 9.99`,
  `expert_concierge = 0.25`, etc. — all identical to before).
