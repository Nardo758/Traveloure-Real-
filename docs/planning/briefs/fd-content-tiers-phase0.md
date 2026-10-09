# FD — content tiers: Phase 0 (read-only, on `main` at `bf9354c`, R393)

Against `content-tiers-ruling.md` rev 1 (Leon, Oct 9, 2026), §2–§7, and the FD-1…FD-5 split. The nine questions
in §B were **ruled Oct 9, 2026** and are recorded there. The migration SQL in §C (**361** columns, **362** backfill —
360 is E3's) is held for the founder; no migration file has been written.

## A. What the code does today

### A1. The free draft reads very little `local` content already
- **Entry points.** The free draft is `POST /api/ai/generate-itinerary` (`server/routes/content.routes.ts:4595`). It
  generates through `generateAutonomousItinerary` (prompt at `server/services/ai-generation.service.ts:404-554`) and
  saves through `saveGeneratedItinerarySnapshot`. A second rail, `POST /api/trips/:id/generate-itinerary`
  (`server/routes.ts:1773`), has its own inline prompt behind the same empty-plan gate.
- **No gems, nuggets or Ready Made.** The free route passes no TravelPulse context, so the gems/nuggets prompt block
  (`ai-generation.service.ts:476-526`) never reaches a free draft. `travel_pulse_hidden_gems`,
  `local_knowledge_nuggets`, `ready_made_trips` and `dmo_extracted_places` are not read by it.
- **What the free draft does read:**

| Source | Reader | Ruling's class |
|---|---|---|
| `place_facts`: covering-event facts only (crawled, official, `public_ok`) | `covering-events.ts:33-59` | ruled **`public` + `link_only`** (B2); the free draft keeps them |
| `city_events` titles | `covering-events.ts:64-72` | public events → `public` |
| `destination_seasons` | `season-facts.ts:22-25` | ours; class not stated in §2 |
| `plan_options` (open sets, incl. `expert_recommendation`) | `shared/draft-basis.ts:155-173` | an expert-recommended option is `local` |
| `temporal_anchors`, `day_boundaries`, `trips`, events | prompt blocks | the traveler's own answers; neither class |

- **After the draft commits.** `enrichPlanItems` writes `places_api` facts (license `restricted`), and where-to-stay
  reads `city_neighborhoods.description` (ruled `public`, B4), hotels and listings.
- **Sibling generators that DO read gems:**
  - quick-start: `trips.routes.ts:917`, `routes.ts:12141`
  - Plus occasion drafts: `occasion-drafts.service.ts:290`
  - the optimizer: `trip-optimization.service.ts:62`

### A2. Nothing is tagged, and the vocabulary is spread over ~10 tables
- **Two existing value sets.** `place_facts` has `origin`, `license`, `verified_by`, `verified_at` and `expires_at`.
  `content_sources` has `license_class`. Both use one vocabulary: `official | editorial | partner | restricted`
  (`shared/content-facts.ts:156`).
- **Everything else has no envelope:** gems, nuggets, `city_events`, seasons, neighbourhoods, `plan_options`,
  `itinerary_items` and `ready_made_trips`.
- **Author columns exist only for expert rows:** nuggets `expert_user_id`; gems `curated_by_expert_id`; Ready Made
  `author_id`; plan options `expert_recommended_by`; `place_facts.verified_by` on `expert_nugget` facts.
- **Seeded rows record no author.** Their date is only the `detected_at` / `created_at` default.
- **Items.** `itinerary_items.expert_note` and `origin='expert'` carry no author.

### A3. Seeds
- **Gems.** Seeded by `seed-travelpulse.ts`, `phase-4-kyoto-fill`, `major-cities-backfill` and
  `popular-cities-content`. No author (only `landing-moment-demo` sets `curated_by_expert_id`). Gems are also written
  by an **AI** writer (`travelpulse.service.ts:864`, `ai_generated=true`) and by nugget promotion.
- **Night-scene content does not exist** anywhere in the repo.
- **R-p facts are not seeded.** `place_facts` and `content_sources` were born empty; R-p facts arrive by Tavily
  extract from admin-registered sources.
- **Neighbourhood descriptions** are seeded with no author or source.

### A4. Share rails: none withholds anything by class
1. **`GET /api/itinerary-share/:token`** (public) emits every activity's name, times, location, description and cost,
   plus `expertTravelerNote` for every viewer. (The note leak is a privacy bug, pulled forward as **SH-1**, PR #1366:
   the note is traveler-only on every share endpoint. It is not an FD item.)
2. **`GET /api/trips/shared/:token`** emits each item's title, description, type, day, time and location.
3. **`GET /api/shared-trips/:token`** emits the variant and comparison join raw.
4. **`GET /api/trips/:id?token=`** gives a share-token guest the whole trips row (its `expertTravelerNote` is SH-1's).

No share payload carries `place_facts`. `isPublishable` / `mustOmitOnPublicPage` are used only by the plan view and
the blog. The `teaser` / `preview` channels of `assembleTripPlan` exist but no share rail uses `teaser`.

### A5. There is no free-draft cap
What does exist:
- the empty-plan gate (one draft per empty plan, 409 otherwise);
- the `/api/ai` IP limiter (10 per minute);
- the Places lookup cap per draft;
- the `slip_free_draft_run` funnel event, which nothing reads.

**The "existing free-run grant" in §6 is not a draft mechanism.** It is the QA **Trip Pass** issuer
(`qa-trip-pass.service.ts`, `QA_ACCOUNT_EMAIL_DOMAIN`), which grants Optimize runs. Guests have no draft rail.

### A6. There is no expiry job for content
- `facts-recheck` re-runs lookups at T-3 and writes notices. It never expires or deletes anything.
- Expiry is read-time only: `expires_at > now()` on `place_facts`, and `isFactStale` for "checked <date>".
- Gems, nuggets, events, seasons, neighbourhoods and Ready Made have no expiry at all.

## B. The nine questions — RULED (decision-maker, Oct 9, 2026)
| # | Question | Ruling |
|---|---|---|
| 1 | `license_class` collides with the existing `official / editorial / partner / restricted` column | **New column `reuse_class`; `license_class` / `license` stay as they are.** Fixed mapping below. |
| 2 | R-p (official-source) facts tagged two ways | **`public` + `link_only`.** Reuse is per source: JNTO is `link_only`; an official site is `link_only` unless its terms say otherwise. **The free draft keeps its events list.** |
| 3 | AI-written gems | **Untagged and out of every draft until a person verifies.** Verification sets the author to the verifier and stamps `verified_at`. Machine output is never "Traveloure team". |
| 4 | Neighbourhood descriptions | **`public`.** Expert-written neighbourhood guidance, when it exists, is `local`. |
| 5 | Which generators are "the free draft" | **Quick-start counts as a free draft.** The occasion draft stays paid (Plus). |
| 6 | QA exemption; guests | **Exempt via `QA_ACCOUNT_EMAIL_DOMAIN`.** Guests: build the counter keyed on the guest record now; it enforces the moment guests can draft (E2/E3 land the guest plan). |
| 7 | Night-scene content | **Future content** (a project brief exists, nothing is in the repo). No tagging now; it enters coverage targets when seeded. |
| 8 | What expiry does | **Expired local items are hidden at build time; a nightly count job reports them.** No delete, no status column. |
| 9 | A tag on the plan item | **`itinerary_items.source_class`, server-stamped at creation, never client-settable**, with a test that a client-supplied value is ignored. |

### The `reuse_class` mapping (ruling 1, fixed — stated once in `shared/content-tiers.ts`)
`reuse_class` ∈ `display_in_plan | link_only | internal | reusable`. For a fact or source that carries the existing
license value, the default reuse class is:

| `license` / `license_class` | `reuse_class` | Why |
|---|---|---|
| `restricted` (Google Places) | `display_in_plan` | Shown inside the plan with attribution, never reused (LD 57). |
| `official` (JNTO-type, an official site) | `link_only` | Ruling 2: link-only unless the source's own terms say otherwise. |
| `editorial` | `link_only` | Attributed quote + link; never republished. |
| `partner` | `internal` | Partner content stays server-side (§16). |

Our own content (expert nuggets, curated and seeded gems, Ready Made, seasons, neighbourhood descriptions) is
`reusable`. "Unless its terms say otherwise" is a **per-source override**: when an admin records that an official
source's terms allow reuse, that source's facts take `reusable`. It is a later admin action on the A6 registry (one
writer, terms-check gated); 362 sets the default only, and nothing in this lane flips a source.

## C. Proposed migrations 361 and 362 (HELD for the founder — not written)
Split so the columns land separately from the data. **361** is DDL only. **362** is data only — no ALTER, no CHECK, no
index, no DEFAULT change, so `preflight-prod-constraints.cjs` needs no manifest entry.

Every column is additive and nullable, with no DEFAULT, CHECK, index or FK, no backfill inside 361, and is declared in
`shared/schema.ts` (deploy-push durability rule). Value sets are app-enforced in one module, `shared/content-tiers.ts`.
At publish, the expected prompt is these `ADD COLUMN IF NOT EXISTS` lines only (§20); anything else is declined.

```sql
-- 361_content_tier_tags.sql — columns only
ALTER TABLE place_facts              ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE place_facts              ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE place_facts              ADD COLUMN IF NOT EXISTS author_label varchar(120);
ALTER TABLE place_facts              ADD COLUMN IF NOT EXISTS official_source_fact_id varchar;
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS author_label varchar(120);
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS verified_by  varchar;      -- ruling 3: the verifier IS the author
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS verified_at  timestamp;
ALTER TABLE travel_pulse_hidden_gems ADD COLUMN IF NOT EXISTS expires_at   timestamp;
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS verified_at  timestamp;
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS expires_at   timestamp;
ALTER TABLE local_knowledge_nuggets  ADD COLUMN IF NOT EXISTS official_source_fact_id varchar;
ALTER TABLE city_events              ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE city_events              ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE destination_seasons      ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE destination_seasons      ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE city_neighborhoods       ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE city_neighborhoods       ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE city_neighborhoods       ADD COLUMN IF NOT EXISTS author_label varchar(120);
ALTER TABLE city_neighborhoods       ADD COLUMN IF NOT EXISTS authored_at  timestamp;
ALTER TABLE plan_options             ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE ready_made_trips         ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE ready_made_trips         ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE itinerary_items          ADD COLUMN IF NOT EXISTS source_class varchar(16);   -- ruling 9
```

**Author.** The existing expert-id columns are the author: `expert_user_id` (nuggets), `curated_by_expert_id` (gems),
`author_id` (Ready Made), `verified_by` (`place_facts`; and, new, gems — ruling 3). `author_label` holds
"Traveloure team" only on rows a person on the team seeded; never on machine output. `authored_at` reuses `created_at`
/ `detected_at`, except on `city_neighborhoods`, which has none.

```sql
-- 362_content_tier_backfill.sql — data only. Idempotent: every UPDATE is guarded by source_class IS NULL,
-- so a second run touches 0 rows and an admin-set value is never clobbered.

-- place_facts: Places = display in plan; crawled facts follow the license mapping (ruling 1/2);
-- expert-confirmed nuggets are local and ours.
UPDATE place_facts SET source_class = 'public', reuse_class = 'display_in_plan'
  WHERE source_class IS NULL AND origin = 'places_api';
UPDATE place_facts SET source_class = 'public',
       reuse_class = CASE license WHEN 'restricted' THEN 'display_in_plan'
                                  WHEN 'partner'    THEN 'internal'
                                  ELSE 'link_only' END                  -- official, editorial
  WHERE source_class IS NULL AND origin = 'crawled';
UPDATE place_facts SET source_class = 'local', reuse_class = 'reusable'
  WHERE source_class IS NULL AND origin = 'expert_nugget';

-- Gems: expert-curated ⇒ local, verified by the curator; team-seeded (not AI) ⇒ local, "Traveloure team".
-- AI-written gems (ai_generated = true, no curator) are LEFT UNTAGGED — ruling 3.
UPDATE travel_pulse_hidden_gems SET source_class = 'local', reuse_class = 'reusable',
       verified_by = COALESCE(verified_by, curated_by_expert_id),
       verified_at = COALESCE(verified_at, detected_at)
  WHERE source_class IS NULL AND curated_by_expert_id IS NOT NULL;
UPDATE travel_pulse_hidden_gems SET source_class = 'local', reuse_class = 'reusable',
       author_label = 'Traveloure team', verified_at = COALESCE(verified_at, detected_at)
  WHERE source_class IS NULL AND curated_by_expert_id IS NULL AND COALESCE(ai_generated, false) = false;

-- Expert nuggets: local, authored and verified by the expert who wrote them.
UPDATE local_knowledge_nuggets SET source_class = 'local', reuse_class = 'reusable',
       verified_at = COALESCE(verified_at, created_at)
  WHERE source_class IS NULL;

-- Public events: public, link only (the free draft keeps its events list — ruling 2).
UPDATE city_events SET source_class = 'public', reuse_class = 'link_only'
  WHERE source_class IS NULL;

-- Seasons: ours, public.
UPDATE destination_seasons SET source_class = 'public', reuse_class = 'reusable'
  WHERE source_class IS NULL;

-- Neighbourhood descriptions: public (ruling 4), team-seeded.
UPDATE city_neighborhoods SET source_class = 'public', reuse_class = 'reusable',
       author_label = 'Traveloure team', authored_at = COALESCE(authored_at, created_at)
  WHERE source_class IS NULL;

-- Ready Made: expert-authored, local.
UPDATE ready_made_trips SET source_class = 'local', reuse_class = 'reusable'
  WHERE source_class IS NULL;
```

**Left untagged on purpose, each recorded:**
- `place_facts` origins `platform_listing`, `hotel_cache`, `event` and `gem`: none exist today; their writers stamp
  at insert.
- AI-written gems (ruling 3): untagged until a person verifies; untagged rows never reach a draft.
- Night-scene content (ruling 7): none exists; nothing to tag.
- `plan_options` and `itinerary_items`: stamped at write time from FD-2 on. A legacy item with NULL is untagged; it is
  excluded from the teaser count and never guessed (§13).

## D. Build shape per sub-lane (after the rulings)

### FD-2: tags, backfill, precedence, expiry (this PR's lane; code after 361/362 are approved)
- 361/362 as above, every column declared in `shared/schema.ts`; `insertItineraryItemSchema` and the other insert
  schemas `.omit()` the new columns, and the storage writers strip them (§19, two layers).
- `shared/content-tiers.ts` — the value sets and pure functions, **no schema dependency, so it can land first**:
  - `admitTag` — refuses an unknown value by name;
  - `reuseClassForLicense` — the fixed ruling-1 mapping above;
  - `resolveFactPrecedence` — hard facts official > local > aggregator; judgment follows local;
  - `isLiveLocal` — applies `expires_at`; a quoting note expires with its official fact;
  - `isDraftEligible` — a row with no `source_class` never reaches a draft (ruling 3's mechanism).
- **Writers stamp tags at insert:** gem / nugget / fact / event / neighbourhood writers and the seeders. The AI gem
  writer stamps nothing. **Gem verification** (one writer) sets `verified_by` = the verifier, `verified_at` = now, then
  `source_class = 'local'` — never `author_label`.
- **`itinerary_items.source_class` (ruling 9).** Stamped by the server at create from the generator's inputs (`local`
  when any local input produced the item, else `public`; a traveler-added item is `public`). Never client-settable:
  omitted from `insertItineraryItemSchema`, stripped in storage. **Test: a create body carrying `sourceClass: 'local'`
  is ignored** — the stored value is the server's.
- **"Nothing untagged reaches a draft" test.** A DB test that reads every row a draft reader can return and fails on an
  untagged one; it never filters one out to pass.
- **Expiry (ruling 8).** Draft readers hide a `local` row whose `expires_at <= now()` at build time. A nightly job
  writes one count line per table of what expired (riding the existing job runner); it deletes nothing and adds no
  status column.

### FD-1: cap, tier filter, count-only teaser
- **Cap.** 3 per 30 days, 1 per plan, 1 per guest record. The free drafts are the two free rails **and quick-start**
  (ruling 5); the Plus occasion draft is paid and not counted. QA accounts (`QA_ACCOUNT_EMAIL_DOMAIN`) are exempt.
- **The counter is keyed on the account OR the guest record, built now** (ruling 6); the guest arm enforces from the
  moment E2/E3 give guests a draft rail. Whether `slip_free_draft_run` is durable enough or a count table is needed is
  FD-1's Phase 0; a new table is FD-1's own migration (a separate number, held the same way).
- **Tier filter.** Draft readers take `public` only — quick-start's gem read included.
- **Count-only teaser.** `{ localPicks, localNotes }` per day, computed server-side from `itinerary_items.source_class`.
- **Test.** No local content in a free draft, over the prompt input and the response.

### FD-3: feasibility
- Last admission, access route, transit and last trains, built on facts-recheck and the step-9 legs engine.
- Its own Phase 0 first: last admission and last train have no fact type today (`FACT_TYPES` has `hours`,
  `ticketing_rule` and `transit`).

### FD-5: coverage targets
- Config numbers per neighbourhood × day type, for the §7 Kyoto set.
- The census reports against them. Night-scene enters the targets only once it is seeded (ruling 7).
- An under-target day shows no teaser and no upsell.

### FD-4: shareable free draft
- One share read that honours `reuse_class`. The share rails in A4 emit unfiltered content today; the traveler-note
  leak is already SH-1's.
