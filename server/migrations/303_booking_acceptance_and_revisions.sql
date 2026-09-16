-- Migration 303: AN ARTIFACT IS ACCEPTED, AND A REVISION IS A ROW.
-- Decision-maker ruling 2026-09-15 — punchlist D-24 / D-25 / D-26 / D-40, all option A; ledger
-- `2026-09-15-d24-d26-acceptance-columns`. Content of record:
-- `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` (Part I §3-§7, Part II §10).
--
-- Every object below is ADDITIVE and NULLABLE, with NO DEFAULT and NO DB CHECK (the
-- migration-181/195/273/275/276/277/279/280/281/282/284/287/295/297/301/302 posture — a CHECK or a
-- DEFAULT here is exactly the publish-time drizzle-push failure CLAUDE.md's Coordination
-- Prevention rules warn about), and NO BACKFILL. Every one is ALSO declared in `shared/schema.ts`
-- in this same commit — the table, its UNIQUE and its index included — per the deploy-push
-- durability rule: an object `schema.ts` does not declare is dropped by Replit's publish-time push
-- and NEVER recreated, because the migration is already stamped.
--
-- No CHECK is added or changed, so `scripts/preflight-prod-constraints.cjs` needs no new
-- `CONSTRAINT_MANIFEST` entry and the publish-time push has nothing to fail on.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- D-24 — `service_bookings.accepted_at`, AND THE DEADLINE IS DERIVED
-- ─────────────────────────────────────────────────────────────────────────────
-- D-6 rules that an artifact completes on the traveler's ACCEPTANCE, never on a silent timeout in
-- the seller's favour. `completed_at` records the MONEY event; nothing on the row recorded the
-- answer that caused it. This column is that answer.
--
-- The acceptance DEADLINE is deliberately NOT a column. A stored `acceptance_window_ends_at` is a
-- second authority that disagrees with the config the moment the config moves, and it would have to
-- be re-stamped on every re-delivery. It is DERIVED from `delivered_at` plus
-- `acceptanceWindowDays()` (`server/config/completion-windows.config.ts`), the way
-- `resolveCompletionEligibility` already derives `eligibleAt`.
--
-- §13: NULL = NEVER ACCEPTED. Every reader OMITS the field rather than rendering "not accepted",
-- which is a claim about a booking whose completion rule is not an artifact at all.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- D-26 — THE DELIVERY IS PER BOOKING, NOT PER LISTING
-- ─────────────────────────────────────────────────────────────────────────────
-- Today the artifact is `provider_services.service_file` — a LISTING-level file served to every
-- buyer — so a revision delivered to one traveler REWRITES the file every other buyer downloads.
-- Without a per-booking pointer the revision half of D-6 cannot be built truthfully.
--
--   * `deliverable_file` is that pointer. It carries the same value shape as the listing column
--     (an `objstore:`-prefixed managed key, or a legacy pasted URL), so the existing serve rail
--     branches on the stored value exactly as it already does — no second file store.
--   * `delivered_at` is the PER-BOOKING delivery instant D-24's derived deadline needs, and a
--     RE-DELIVERY MOVES IT. The listing's `deliverable_uploaded_at` is the LISTING's clock and is
--     the wrong anchor for one traveler's acceptance window — that mismatch is why D-26 exists.
--
-- §13: NULL `delivered_at` = NOT DELIVERED ON THIS BOOKING ⇒ no acceptance clock is started and
-- the reason is stated, the way the existing `no_delivery_timestamp` skip already is. It is never
-- back-filled from the listing's clock, and NULL `deliverable_file` = no per-booking artifact ⇒ the
-- listing's file is the honest FALLBACK and the reader says which one it served.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- D-25 — A REVISION IS A CHILD ROW, AND THE COUNT IS DERIVED
-- ─────────────────────────────────────────────────────────────────────────────
-- `booking_revision_requests` follows the `service_route_points` / `dmo_extracted_places` pattern:
-- FK -> `service_bookings(id)` ON DELETE CASCADE, UNIQUE (booking_id, "position"), an index on the
-- parent. A counter answers *how many* and nothing else: it cannot carry the traveler's words —
-- which are the evidence an admin review needs — and it cannot say when a revision was asked for or
-- when it was answered. The COUNT is derived from these rows and never stored beside them
-- (§18 rule 1).
--
-- There is deliberately NO `revision_status` mirror of the ready-made shape. Ready-made needs one
-- because its entitlement is exactly one and lives on the purchase row; here the allowance is the
-- listing's own `provider_services.revisions_included`, READ on every decision and never copied onto
-- the booking, and these rows say the same thing more precisely.
--
-- `resolved_at` NULL = STILL OPEN (the seller has not re-delivered). It is never zero-filled and a
-- resolved row is never deleted — the history is the evidence.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- D-40 — A HYBRID LISTING MAY DECLARE ONE ARTIFACT DELIVERABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- D-7 ruled `hybrid` to the session lane: a day that was actually worked is not withheld behind
-- acceptance of a document. The honest alternative to reclassifying the whole booking is to let the
-- LISTING say it also produces something. `provider_services.declared_artifact_deliverable` is that
-- declaration — free text naming the one artifact, because a boolean beside a NULL would be two
-- ways to say nothing.
--
-- §13: NULL = NOT DECLARED ⇒ the hybrid booking is pure D-7 and NO acceptance affordance exists at
-- all. It is never rendered as "no artifact", which is a claim only the seller can make.
--
-- AND THE HALF THAT MUST NOT BE LOST: on a hybrid booking, accepting or revising the declared
-- artifact records `accepted_at` and revision rows and GATES NOTHING about completion or the mint.
-- The booking keeps `service_date_timer`; no money timing moves.
--
-- Written ONLY through the owner's pick-based PATCH allowlist (§19 — the generic body schema
-- `.omit()`s it), and treated as an IDENTITY edit under CLAUDE.md §23's split on an APPROVED
-- listing: adding an acceptance obligation changes what a buyer is committing to. The split is
-- still decided ONLY in the PATCH handler.

ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS deliverable_file TEXT;

ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS declared_artifact_deliverable TEXT;

CREATE TABLE IF NOT EXISTS booking_revision_requests (
  id VARCHAR PRIMARY KEY,
  booking_id VARCHAR NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
  "position" INTEGER NOT NULL,
  note TEXT,
  requested_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_revision_requests_booking_position_unique
  ON booking_revision_requests (booking_id, "position");

CREATE INDEX IF NOT EXISTS booking_revision_requests_booking_idx
  ON booking_revision_requests (booking_id);

COMMENT ON COLUMN service_bookings.accepted_at IS
  'When the traveler ACCEPTED the delivered artifact (D-6 / punchlist D-24, ledger 2026-09-15-d24-d26-acceptance-columns). NULL = never accepted, and every reader OMITS the field rather than rendering "not accepted". The acceptance DEADLINE is DERIVED from delivered_at + acceptanceWindowDays(), never stored. Written only by the traveler-gated accept rail.';
COMMENT ON COLUMN service_bookings.delivered_at IS
  'The PER-BOOKING delivery instant (punchlist D-26). Moved by every re-delivery. NULL = nothing was delivered on this booking, so no acceptance clock starts and the reason is stated; never back-filled from the listing''s deliverable_uploaded_at, which is the LISTING''s clock.';
COMMENT ON COLUMN service_bookings.deliverable_file IS
  'The PER-BOOKING artifact pointer (punchlist D-26) — same value shape as provider_services.service_file. NULL = no per-booking artifact, and the listing file is the honest FALLBACK; the serve rail says which one it served. Never client-settable.';
COMMENT ON COLUMN provider_services.declared_artifact_deliverable IS
  'A hybrid listing''s ONE declared artifact deliverable (punchlist D-40, sub-question = yes). NULL = not declared, so the booking is pure D-7 and no acceptance affordance exists — never rendered as "no artifact". Accepting or revising it gates NOTHING about completion or the mint. Owner-written through the pick-based PATCH allowlist only (§19); an IDENTITY edit under §23 on an approved listing.';
COMMENT ON TABLE booking_revision_requests IS
  'One row per revision a traveler asked for on a booking (punchlist D-25). The COUNT is derived from these rows and never stored; the allowance is the listing''s own provider_services.revisions_included, read on every decision. resolved_at NULL = still open. Ledger 2026-09-15-d24-d26-acceptance-columns.';
