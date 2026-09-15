-- Migration 299: AN AI PROPOSAL HAS A HOME OF ITS OWN, AND IT IS NOT THE EXPERT RAIL.
-- Decision-maker ruling 2026-09-15, punchlist **D-19** = option (b); ledger
-- `2026-09-15-d19-plan-proposals`. CLAUDE.md Locked Decision 45 (3) (every Ask-AI answer is a
-- PROPOSAL staged beside the plan), Locked Decision 42 **D3** (paid human work is protected),
-- **D4**/**D23** (an author is never falsely attributed), **D18** (there is no undo — a record of
-- an apply is not an offer to reverse it), §13, §15, §18 rule 1, §19.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A NEW TABLE, AND WHY NOT THE ONE THAT ALREADY LOOKS RIGHT
-- ─────────────────────────────────────────────────────────────────────────────
-- The L16 brief's first version said an Ask-AI answer would land on the EXISTING expert
-- suggestions rail. It cannot, and the punchlist row verified each half against `main`:
--
--   * `trip_suggestions.expert_id` is **NOT NULL, FK -> users.id**. An AI author would have to be
--     a sentinel user row — a fabricated identity on an identity column (§14's own reasoning, one
--     table over), and afterwards indistinguishable from a real expert.
--   * `POST /api/trips/:id/suggestions` refuses anyone who is not `isExpertAssignedToTrip`. The
--     gate is expert-shaped, not merely expert-friendly.
--   * The approve path **hardcodes `origin: 'expert'`** on the itinerary item it creates. An
--     applied AI proposal would therefore render in the expert's treatment on the slip — the
--     false attribution Locked Decision 42 D4 and D23 forbid BY NAME, and the one thing the
--     origin chip exists to keep straight.
--
-- Widening that rail (nullable `expert_id` plus a derived author column) was the other option and
-- was NOT taken: an expert suggestion and a machine proposal have different authors, different
-- review consequences and different protection rules (D3), and widening a NOT NULL identity column
-- is how one rail starts answering two questions. **The expert rail is untouched by this
-- migration** — no column of it changes, and nothing here writes to it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SHAPE: A CHILD ROW OF `trips`, ON THE `dmo_extracted_places` / `service_route_points` PATTERN
-- ─────────────────────────────────────────────────────────────────────────────
-- FK -> trips(id) **ON DELETE CASCADE**: a proposal is about ONE plan and has no meaning without
-- it. This is the same posture migrations 185 / 192 / 281 take for a plan's or a listing's own
-- child rows, and it is the opposite of `conversation_id` below.
--
-- NO UNIQUE AND NO `position` COLUMN, deliberately: **proposals are a LOG, not an ordered list.**
-- The route-point and stop tables carry `UNIQUE (parent, "position")` because those are
-- replace-list surfaces whose order IS the content; a plan's proposals accumulate over a
-- conversation, several may be open at once, and a discarded one stays on the record. Ordering is
-- `created_at`, which is not a claim about anything.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `conversation_id` IS NULLABLE AND ON DELETE **SET NULL**
-- ─────────────────────────────────────────────────────────────────────────────
-- The AI conversation row is `conversations` (`shared/models/chat.ts`), bound to a plan by
-- migration 290's nullable `trip_id` (Locked Decision 45 (1)). Its `id` is an integer sequence, so
-- this column is `integer`, not varchar. SET NULL, never CASCADE: deleting a THREAD must not
-- delete the proposals that came out of it, exactly as deleting a PLAN must not delete the thread
-- that planned it (migration 290's own rule, read in the other direction).
-- **NULL = this proposal names no thread** — the honest reading for a proposal raised outside a
-- conversation and for any row written before a thread existed. A reader says so rather than
-- resolving it to the plan's nearest conversation (§13).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `status` HAS NO DEFAULT AND NO CHECK
-- ─────────────────────────────────────────────────────────────────────────────
-- Value set is `proposed` | `applied` | `discarded`, **APP-ENFORCED**, stated ONCE in
-- `shared/plan-proposals.ts` (§18 rule 1) and nowhere else. NO DB CHECK: the publish-trap posture
-- (migrations 181 / 195 / 273 / 275 / 276 / 277 / 279 / 280 / 281 / 282 / 284 / 287 / 295 / 297 /
-- 298) — a CHECK over an app-enforced value set is exactly the publish-time drizzle-push failure
-- CLAUDE.md's Coordination Prevention rules warn about, and it offers the DESTRUCTIVE "copy dev
-- database over production" option when it fires.
-- **NO DEFAULT either, and that is a separate decision from the CHECK:** a default would let a
-- writer that forgot to state a status still write a row, and "proposed" is a claim about what
-- happened to the row, not a filler. A writer always states it. It is NOT NULL for the same
-- reason — a status-less proposal is a row no reader could classify.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS NOT HERE, AND WHO OWNS IT
-- ─────────────────────────────────────────────────────────────────────────────
-- **NO payment, charge, claim or entitlement column of any kind.** Locked Decision 45 (3) charges
-- an AI task at APPLY and never at ask, and the shape of that charge is punchlist **D-20** (flat
-- vs tiered) and **D-21** (what one "task" is, and the §15b claim that makes a double-click one
-- charge). Those are OPEN rulings and they own the charge point; when it lands it adds its own
-- columns in its own migration. Adding a speculative `charged_at` or claim column here would be
-- this lane taking a decision that is not its to take, and a column no writer sets is the
-- mass-assignment surface §19 exists to refuse.
-- **NO `apply`**: `applied_at` and `applied_item_ids` are the RECORD an apply leaves; nothing in
-- this lane writes them.
--
-- `applied_item_ids` is `text[]` — the `itinerary_items` rows an apply created — and exists so the
-- traveler can be shown WHAT CHANGED. Locked Decision 42 **D18**: apply replaces every in-planning
-- row in one transaction and nothing holds the previous set, so this is **a record, never an
-- undo**, and no surface may offer one on the strength of it.
--
-- `model_tier` is a COST RECORD ONLY (Locked Decision 41 (c): a cheaper tier is a spend choice and
-- **never a product claim**), so no surface may describe a proposal by the engine that produced
-- it. Nullable — an unrecorded tier is unrecorded, never a guessed name.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE index, on `trip_id`. The only reader this lane ships is `listPlanProposals(tripId)`, which
-- reads a plan's WHOLE log (a discarded proposal stays visible on the record), so a partial index
-- on `(trip_id) WHERE status = 'proposed'` would serve no query that exists. It is deliberately
-- NOT added ahead of a reader that needs it.
--
-- The TABLE and the INDEX are ALSO declared in `shared/schema.ts` in this same commit — the
-- deploy-push durability rule: an object that file does not declare is dropped by Replit's
-- publish-time push and NEVER recreated, because this migration is stamped by then.
--
-- NO CHECK is added or changed, so `scripts/preflight-prod-constraints.cjs` needs NO manifest
-- entry. NO BACKFILL is owed: the table is new and empty, and no existing row anywhere acquires a
-- proposal by this migration.
--
-- Idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS plan_proposals (
  id varchar PRIMARY KEY,
  trip_id varchar NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  conversation_id integer REFERENCES conversations(id) ON DELETE SET NULL,
  question text,
  proposal jsonb,
  status varchar(20) NOT NULL,
  model_tier varchar(40),
  created_at timestamp DEFAULT now(),
  applied_at timestamp,
  discarded_at timestamp,
  applied_item_ids text[]
);

CREATE INDEX IF NOT EXISTS plan_proposals_trip_idx
  ON plan_proposals (trip_id);

COMMENT ON TABLE plan_proposals IS
  'Where an AI proposal lives before the traveler applies it (migration 299, ledger 2026-09-15-d19-plan-proposals; CLAUDE.md Locked Decision 45 (3)). Child rows of trips, CASCADE. A LOG, not an ordered list: no position, no UNIQUE. status is app-enforced (proposed|applied|discarded) with no DB CHECK and no default. The expert trip_suggestions rail is untouched and never carries an AI author. No charge column: the charge point is punchlist D-20/D-21 and adds its own.';
