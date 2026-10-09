# FD-1 — free-draft cap and count-only teaser (Phase 0 + rulings, Oct 9, 2026)

Read-only Phase 0 at `2f9bcaba9` + SH-1; the five questions were **ruled Oct 9, 2026** (§6 below). Migration
**363** (`free_draft_runs`) is HELD for the founder and is not written; FD-1 builds on FD-2's branch and lands
after 361/362, then 363.

## 1. What counts today
| Free draft (ruling 5) | Route | Gate | Durable record | Funnel |
|---|---|---|---|---|
| Slip "Draft it with AI" | `POST /api/ai/generate-itinerary` (`content.routes.ts:4595`) | signed in; empty-plan 409 | `ai_generated_itineraries` row via `saveGeneratedItinerarySnapshot` | `slip_free_draft_run`, fire-and-forget |
| Trip draft / Regenerate | `POST /api/trips/:id/generate-itinerary` (`routes.ts:1773`) | owner, advisor, EA or admin; empty-plan gate at :1833 | upserts `generated_itineraries` (one per trip) | T3 only |
| Quick-start | `POST /api/quick-start-itinerary` (`routes.ts:12127`; the `trips.routes.ts:918` twin is shadowed, dead) | signed in; **no gate**, always mints a trip | `ai_generated_itineraries` | none |

Every free rail requires sign-in today. There is no guest draft rail.

## 2. Why no existing record can be the counter
- **`funnel_events`** is lossy: writes are fire-and-forget, errors are swallowed, and there is no dedupe. A cap must not depend on it.
- **`ai_generated_itineraries`** has the same problems on three counts:
  - It also holds rows from Plus occasion drafts and save-as-trip, which must not count.
  - The trip rail never writes to it.
  - `trip_id` is ON DELETE CASCADE, so deleting a plan would refund its draft.
- **A column on `users`** cannot express a rolling 30 days or one per plan.
- **Guests:** there is no server-side guest record to put a column on. The only guest id is a client-minted localStorage UUID (`X-Guest-Session`, which no server code reads). It is forgeable, so it is not an enforcement key.

## 3. The table: `free_draft_runs` (migration 363, HELD — ruling 1)
```sql
CREATE TABLE IF NOT EXISTS free_draft_runs (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     varchar,        -- one of user_id / guest_key is set (app-enforced, no CHECK)
  guest_key   varchar,        -- the server guest record's id once E2/E3 mint one
  trip_id     varchar,        -- NO FK: deleting a plan never refunds a draft
  rail        varchar(32),    -- slip | trip | quick_start (app-enforced)
  status      varchar(16),    -- claimed | drafted | released (app-enforced)
  created_at  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_free_draft_runs_user_created  ON free_draft_runs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_free_draft_runs_guest_created ON free_draft_runs (guest_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_free_draft_runs_trip ON free_draft_runs (trip_id) WHERE status <> 'released';
```
- **Table, indexes and UNIQUE are declared in `shared/schema.ts`.** The UNIQUE on `(trip_id)` is allowed because the
  table is NEW and EMPTY at creation — the no-index rule guards live tables (ruling 1; §20's born-object carve-out).
  No FK to `trips`, so deleting a plan never refunds a draft.
- **ONE service, `free-draft-cap.service.ts`, follows CLAIM → GENERATE → PROMOTE (§15b):**
  - **Claim.** Before the model call, one statement takes `pg_advisory_xact_lock(hash(user_id|guest_key))`, counts non-released rows in the last `FREE_DRAFT_WINDOW_DAYS` (config, 30), refuses at `FREE_DRAFTS_PER_WINDOW` (config, 3), and inserts `claimed`. The per-plan UNIQUE is the "1 per plan" guard; a second claim on the same plan is a 409.
  - **Promote.** On a committed draft, the row becomes `drafted`.
  - **Release.** A provider failure or an anchor-asked return sets the row to `released`, so the traveler is not charged a draft for our failure. A crash leaves `claimed`, which still counts. That errs toward the cap, not toward free runs; a TTL reclaim can follow if that proves wrong.
- **QA exemption:** export `isQaDomainAccount` from `qa-trip-pass.service.ts` and call it once at the claim. QA accounts skip the claim entirely and get no row.
- **Not counted:** the Plus occasion draft, save-as-trip, and Regenerate on a non-empty plan. Regenerate is already behind the empty-plan gate; Optimize is the paid path.
- **The guest arm (ruling 6)** is built now: `guest_key` with the same count of 1, refused at the second claim. It enforces only once E2/E3 mint a SERVER guest record. It must never key on the forgeable localStorage id.
- **Copy (ruling §6):** "2 of 3 free drafts left this month" / "Free drafts used up — Optimize or get a Trip Pass". The numbers come from the server's own read (`GET /api/me/free-drafts` → `{ used, limit, windowDays }`), never a client count.

## 4. Count-only teaser shape (server-side)
- **Source:** `itinerary_items.source_class` (FD-2, migration 361). A row with NULL is not counted (§13).
- **Shape:** one optional block per day on the plancard `full` payload's `days[]`, present only on a FREE plan (`!planGetsRoutedLegs`):
  ```ts
  localTeaser?: { localPicks: number; localNotes: number }
  ```
  - `localPicks` = local items the paid tier would place on that day.
  - `localNotes` = local notes the paid tier would attach to that day's items.
  - **Counts only:** never a title, place, id or text (ruling §4), so nothing local can be read off the payload.
- **Computed by ONE pure function.** `localTeaserForDay(day, counts)` in `shared/content-tiers.ts` (or a sibling) is called by the plancard builder. The counts come from the paid draft's local inputs for the plan's market and day (gems, nuggets and Ready Made, filtered by `isDraftEligible`), not from items on the free plan. A free plan holds no local items by construction (FD-1's tier filter).
- **§13:**
  - A day the server could not compute is ABSENT, not `{0,0}`.
  - A computed zero is omitted rather than drawn as "0 local picks".
  - An under-target day (FD-5) is absent.
- The existing `teaser` channel of `assembleTripPlan` is the store lane's and has no caller. It is not reused for this, because the slip reads `full`.

## 5. Tier filter (where local enters a free draft today)
- **Quick-start:** `getCityIntelligence → hiddenGems.slice(0,5)` and `aiLocalInsights` (`routes.ts` ~12152; prompt `ai-generation.service.ts:502-508`). This is the one place a free draft reads local content today. Filter it through `isFreeDraftEligible`.
- **`plan_options.expert_recommendation`** has no reader yet. The draft-basis block reads only title, neighbourhood, coordinates and rank, so there is nothing to strip.
- **Slip free draft:** passes no TravelPulse context. It is already public-only.

## 6. Rulings (decision-maker, Oct 9, 2026)
1. **New table `free_draft_runs`: YES, held migration 363.** The UNIQUE on `(trip_id)` is allowed because the table is
   new and empty at creation; no FK to `trips`. SQL in the PR body, held for Leon.
2. **`localNotes` = the local notes the paid draft would add.** Counts only.
3. **A draft that fails on our side** (provider error, our exception) **is not counted** (`released`). A crash after the
   AI call returns may count — the row stays `claimed`, which counts; recorded, not reclaimed.
4. **Every quick-start uses one of the 3.** It creates a plan, so one-per-plan holds trivially.
5. **Counted against the plan's owner.** A handoff plan is paid tier (`planGetsRoutedLegs`), so an advisor's draft there
   is not a free draft at all; only the assistant/admin-on-a-free-plan case counts, against the owner.
6. **Guests:** the counter is keyed on the SERVER guest record E2/E3 introduce; no enforcement on a browser-made id.

## 7. What lands now, and what waits
- **Now (no schema):** `shared/free-draft-cap.ts` — `freeDraftSubject` (paid tier ⇒ none; owner; QA ⇒ none; server
  guest record), `decideFreeDraft`, `runCounts`, the §6 copy and `localTeaserForDay`; `server/config/free-draft.config.ts`
  (3 / 30 days / 1 per guest, env-overridable). Tests FC1–FC6.
- **After 363:** the table and its declaration; `free-draft-cap.service.ts` (claim under the advisory lock → promote
  `drafted` → release `released`) called by the three rails; `GET /api/me/free-drafts`; the quick-start tier filter
  (`isFreeDraftEligible` over its gem and insight reads); the plancard `localTeaser` per day.
