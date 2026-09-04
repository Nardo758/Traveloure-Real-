-- Migration 284: THE TWO STEP-4 QUESTIONS THE OCCASION'S OWN SWITCHES ASK, AND NOTHING ASKED THEM.
-- Ledger `2026-09-04-step4-variants-fields`, CLAUDE.md Locked Decision 38.
--
-- Additive, NULLABLE, NO DEFAULT, NO CHECK, no backfill — the migration
-- 181/195/273/275/276/277/279/281/282 posture. A CHECK over an app-enforced value set is exactly
-- the publish-time drizzle-push failure CLAUDE.md's Coordination Prevention notes warn about, and
-- none of these three columns has a value set worth a CHECK anyway: two are free text a human
-- typed and the third is an email address, all validated app-side by the ONE pick-based allowlist
-- that admits them.
--
-- All three are ALSO declared in `shared/schema.ts` in this same commit: per the deploy-push
-- durability rule, a DB object the code depends on that `schema.ts` does not declare is dropped by
-- Replit's publish-time push and NEVER recreated, because the migration is already stamped.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY: THE STEP-4 ARTBOARD DREW THREE VARIANTS AND ONLY ONE OF THEM COULD BE BUILT
-- ─────────────────────────────────────────────────────────────────────────────
-- `docs/design/wedding-flow/Step4Variants.dc.html` draws the SAME step-4 control under four
-- occasions. The vocabulary half shipped with ledger `2026-09-04-one-modal-many-doors` (migration
-- 276's `vocabulary` column, read through `partyNoun`). The other two halves shipped as a RULED
-- OMISSION, stated in `plan-modal.tsx`'s own header — "The Step4Variants artboard's corporate
-- budget-approver and family accessibility fields are NOT built: no column holds either, and
-- inventing one is a decision, not a side effect of this lane." This migration is that decision,
-- taken deliberately.
--
--   budget_approver_name  — "Who approves the budget?" on an occasion whose people are ATTENDEES
--   budget_approver_email    (corporate events, retreats: `experience_types.vocabulary =
--                            'attendees'`). A name OR a role ("Finance", "the CFO") — which is why
--                            it is free text and not a user reference. The email is optional
--                            beside it: an approver named without a way to reach them is still a
--                            real answer.
--
--   accessibility_note    — "Anyone need a slower pace or step-free access?" on an occasion that
--                            HAS a guest list (`experience_types.default_guests = true` —
--                            weddings, family occasions, parties). FREE TEXT, deliberately not a
--                            checklist of certified attributes: the platform claims no
--                            accessibility standard on anyone's behalf (the same posture Locked
--                            Decision 24 states for `what_to_bring` / `access_notes`).
--
-- IT IS NOT `trip_participants.accessibility_needs`, AND MERGING THE TWO WOULD BE A CATEGORY
-- ERROR. That column is one PARTICIPANT's stated needs about THEMSELF — a different person's
-- answer, given on a different surface, and owned by that person. This one is the PLANNER's note
-- about the party as a whole, given at plan time, often before a single participant row exists.
-- Locked Decision 24 drew this exact line for the provider-side `access_notes`; it is redrawn here
-- one table over.
--
-- NULL MEANS THE QUESTION WAS NEVER ASKED, AND THAT IS A FINISHED ANSWER (§13). Every row on disk
-- today is NULL and stays NULL. A reader that meets NULL OMITS the row entirely — it must never
-- render "no accessibility needs" or "no budget approver", which are claims only the traveler can
-- make, and which the step does not even ask of an occasion whose switches send it down the other
-- branch. The two questions are ASKED on different occasions by construction, so on any given plan
-- at most one pair of these columns is ever offered.
--
-- ADMISSION IS AN ALLOWLIST (§19). The columns are reachable ONLY through the pick-based
-- `tripOccasionBody` on `PATCH /api/trips/:tripId/occasion` (the same owner-gated route the
-- step-4 party pair already rides) and, before a trip row exists, through the hand-written
-- `tripContextSchema` allowlist on `PUT /api/trip-context`. `insertTripSchema` — an `.omit()`
-- denylist, where a freshly-added column is client-settable BY DEFAULT — names all three on its
-- omit list in the same commit, so the mint body cannot carry them and there is exactly one rail.
--
-- Widths: varchar(120) matches `users.home_city`/name-shaped columns; varchar(255) is this
-- schema's email width (`users.email`); the note is TEXT with an app-side 2000-char cap, the same
-- shape `what_to_bring` / `access_notes` took.
--
-- Idempotent; safe to re-run.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS budget_approver_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS budget_approver_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS accessibility_note TEXT;

COMMENT ON COLUMN trips.budget_approver_name IS
  'Step 4, attendee-vocabulary occasions only (migration 284, ledger 2026-09-04-step4-variants-fields): who approves the budget — a person OR a role, free text. NULL = never asked/never answered; readers OMIT the row and never render "no approver".';

COMMENT ON COLUMN trips.budget_approver_email IS
  'Optional email beside budget_approver_name (migration 284). Validated app-side by the one pick-based allowlist that admits it; no DB CHECK. NULL = not given — an approver named without a contact is still a real answer.';

COMMENT ON COLUMN trips.accessibility_note IS
  'Step 4, guest-list occasions only (migration 284, ledger 2026-09-04-step4-variants-fields): the planner''s free-text note about pace/step-free access for the party. NOT trip_participants.accessibility_needs (a participant''s own stated needs — a different person''s answer). No accessibility standard is claimed on anyone''s behalf. NULL = never asked; readers OMIT the row and never render "no needs".';
