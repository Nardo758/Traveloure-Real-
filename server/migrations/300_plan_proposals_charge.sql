-- Migration 300: THE APPLY IS THE CHARGE POINT, AND THE PROPOSAL ROW IS WHERE THE CLAIM SITS.
-- Decision-maker rulings 2026-09-15, punchlist **D-20** = option A (flat, from `fee_bands`) and
-- **D-21** = option A (one charge per DISTINCT PROPOSAL APPLIED, idempotent on the proposal id);
-- ledger `2026-09-15-d20-d21-proposal-charge`. CLAUDE.md Locked Decision 45 (3) (every Ask-AI
-- answer is a PROPOSAL, charged only at apply), Locked Decision 41 (a) (the run-authorization
-- shape and the recorded-basis posture) and 41 (f) (the `ai_task` entitlement had no charge site),
-- Locked Decision 42 **D3** (expert work is protected) and **D18** (there is no undo),
-- Locked Decision 43 (c) (every platform PaymentIntent offers wallets), §8, §13, §14, §15, §15b,
-- §18 rule 1, §19, §19a.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THESE COLUMNS LIVE HERE AND NOWHERE ELSE
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 299 created `plan_proposals` and deliberately gave it NO payment, charge, claim or
-- entitlement column, saying in its own header that the charge point is D-20/D-21 and "adds its
-- own columns in its own migration". This is that migration, and the reason the columns belong on
-- THIS row rather than on a side table is D-21 itself: the unit of charge IS one proposal, so the
-- proposal row is the natural home of the §15b claim and of the payment identity that claim leads
-- to. A separate charge table would need its own uniqueness rule to say the same thing the primary
-- key here already says.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `charge_claimed_at` — THE §15b PRE-FLIGHT MARKER
-- ─────────────────────────────────────────────────────────────────────────────
-- §15 requires the state transition ITSELF to be the concurrency guard: claim the row atomically
-- FIRST, then make the external call. The claim is
--   UPDATE plan_proposals SET charge_claimed_at = now()
--    WHERE id = ? AND trip_id = ? AND status = 'proposed' AND charge_claimed_at IS NULL
-- so two concurrent pays produce exactly ONE claim and the loser is answered 409 with no Stripe
-- call of its own. It is ALSO the §15b pre-flight marker: a row carrying it may have a
-- PaymentIntent in flight and is therefore never treated as provably un-attempted.
-- NULL = no charge has ever been attempted for this proposal.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `stripe_payment_intent_id` — §19a: ONE WRITER, NEVER CLIENT-SETTABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- §19a states the class: a booking-create endpoint that accepted this field off `req.body` birthed
-- a row already carrying its own PaymentIntent, and every consumer keyed on the column then read
-- the row as authorized. The same rule binds here. The column has exactly ONE writer — the apply
-- charge path's own atomic conditional (`WHERE id = ? AND stripe_payment_intent_id IS NULL`) —
-- and it is absent from `planProposalCreateSchema`, which is PICK-based (§19), so no body schema
-- can admit it and `scripts/check-money-endpoints.cjs`'s payment-identity pass sees it omitted by
-- construction rather than by somebody remembering to strip it.
-- NULL = no PaymentIntent was ever created for this proposal — which is the CORRECT and permanent
-- state of a Trip-Pass-covered apply (LD 41 (a): a covered run takes no claim and spends no PI).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `charged_amount_cents` — SERVER-DERIVED (§14), FROM THE BAND (§8)
-- ─────────────────────────────────────────────────────────────────────────────
-- The amount is resolved at apply from the `concierge:ai_task` band (`flat_cents`) through the
-- EXISTING fail-loud `requireFlatCentsBand` resolver — D-20 = flat, from `fee_bands`, never a
-- literal and never a second fee home. Recorded here so the row says what was actually charged at
-- the moment it was charged; an admin edit to the band afterwards moves future charges and never
-- rewrites this one.
-- NULL = nothing was charged. That is the honest reading for a Trip-Pass-covered apply and for a
-- proposal nobody ever applied. It is deliberately NOT `0` — a zero here would read as "we charged
-- them nothing", a claim, where NULL reads as "no charge was made" (§13). `fee_ledger`'s own
-- `amount <> 0` CHECK is the same rule one table over.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `charge_basis` — WHY THE APPLY WAS ALLOWED, RECORDED
-- ─────────────────────────────────────────────────────────────────────────────
-- Value set `trip_pass` | `paid`, **APP-ENFORCED**, stated ONCE in `shared/plan-proposals.ts`
-- (§18 rule 1) and nowhere else. **NO DB CHECK** — the publish-trap posture (migrations 181 / 195 /
-- 273 / 275 / 276 / 277 / 279 / 280 / 281 / 282 / 284 / 287 / 295 / 297 / 298 / 299): a CHECK over
-- an app-enforced value set is exactly the publish-time drizzle-push failure CLAUDE.md's
-- Coordination Prevention rules warn about, and it offers the DESTRUCTIVE "copy dev database over
-- production" option when it fires. **NO DEFAULT** for migration 299's own reason: a basis is a
-- claim about what happened, never a filler.
--
-- LD 41 (a) records the optimizer's basis in a LOG LINE and a response field because
-- `itinerary_comparisons` has no basis column and writing a `"trip_pass"` sentinel into its
-- PAYMENT-IDENTITY column would have been a fabricated payment identity (§19a). That reasoning
-- does not forbid a basis column; it forbids putting a basis in a payment-identity column. Here a
-- basis column IS ratified by D-21 — the proposal row is the claim's home — so the two facts are
-- recorded SEPARATELY and neither is ever written into the other's column.
-- NULL = never applied, or applied before this column existed. There is NO BACKFILL: no row on any
-- database has ever been applied (migration 299 shipped no apply at all and `applied_at` is
-- unwritten everywhere), so a backfill would have nothing true to say.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NO INDEX, AND WHY
-- ─────────────────────────────────────────────────────────────────────────────
-- Every read of these columns is BY PRIMARY KEY — the apply and the pay both address one proposal
-- by its id — and `listPlanProposals(tripId)` already rides `plan_proposals_trip_idx`. An index is
-- deliberately NOT added ahead of a reader that needs it (migration 299's own posture).
--
-- All four columns are ALSO declared in `shared/schema.ts` in this same commit — the deploy-push
-- durability rule: an object that file does not declare is dropped by Replit's publish-time push
-- and NEVER recreated, because this migration is stamped by then.
--
-- NO CHECK is added or changed, so `scripts/preflight-prod-constraints.cjs` needs NO manifest
-- entry. Additive and nullable throughout; no existing row is rewritten. Idempotent; safe to
-- re-run.

ALTER TABLE plan_proposals ADD COLUMN IF NOT EXISTS charge_claimed_at timestamp;
ALTER TABLE plan_proposals ADD COLUMN IF NOT EXISTS stripe_payment_intent_id varchar(255);
ALTER TABLE plan_proposals ADD COLUMN IF NOT EXISTS charged_amount_cents integer;
ALTER TABLE plan_proposals ADD COLUMN IF NOT EXISTS charge_basis varchar(20);

COMMENT ON COLUMN plan_proposals.charge_claimed_at IS
  'The §15b pre-flight claim marker, written by an atomic conditional BEFORE the Stripe call (migration 300, ledger 2026-09-15-d20-d21-proposal-charge). NULL = no charge was ever attempted for this proposal.';
COMMENT ON COLUMN plan_proposals.stripe_payment_intent_id IS
  'The apply charge PaymentIntent. §19a: ONE writer (the apply charge path''s atomic conditional), never client-settable, absent from the pick-based admission schema. NULL = no PaymentIntent was created — the permanent, correct state of a Trip-Pass-covered apply.';
COMMENT ON COLUMN plan_proposals.charged_amount_cents IS
  'What was actually charged, server-derived at apply from the concierge:ai_task fee band (D-20 = flat, from fee_bands; §8/§14). NULL = nothing was charged — never 0, which would be a claim (§13).';
COMMENT ON COLUMN plan_proposals.charge_basis IS
  'trip_pass | paid — app-enforced (PLAN_PROPOSAL_CHARGE_BASES in shared/plan-proposals.ts), NO DB CHECK and NO DEFAULT (publish-trap posture). NULL = never applied. A basis is never written into stripe_payment_intent_id and a payment identity is never written here.';
