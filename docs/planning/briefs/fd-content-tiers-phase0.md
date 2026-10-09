# FD — content tiers: Phase 0 (read-only, on `main` at `bf9354c`, R393)

Against `content-tiers-ruling.md` rev 1 (Leon, Oct 9, 2026), §2–§7, and the FD-1…FD-5 split. Nothing is
built. The migration SQL in §C is a proposal held for the founder; no migration file has been written.

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
| `place_facts`: covering-event facts only (crawled, official, `public_ok`) | `covering-events.ts:33-59` | §2 lists **R-p facts as `local`**, and the free draft reads them today (see B3) |
| `city_events` titles | `covering-events.ts:64-72` | public events → `public` |
| `destination_seasons` | `season-facts.ts:22-25` | ours; class not stated in §2 |
| `plan_options` (open sets, incl. `expert_recommendation`) | `shared/draft-basis.ts:155-173` | an expert-recommended option is `local` |
| `temporal_anchors`, `day_boundaries`, `trips`, events | prompt blocks | the traveler's own answers; neither class |

- **After the draft commits.** `enrichPlanItems` writes `places_api` facts (license `restricted`), and where-to-stay
  reads `city_neighborhoods.description` (neighbourhood guidance, which §2 calls `local`), hotels and listings.
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
   plus `expertTravelerNote` for every viewer.
2. **`GET /api/trips/shared/:token`** emits each item's title, description, type, day, time and location.
3. **`GET /api/shared-trips/:token`** emits the variant and comparison join raw.
4. **`GET /api/trips/:id?token=`** gives a share-token guest the whole trips row.

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

## B. Questions that block FD-2 (decision-maker)
1. **`license_class` collides with an existing column of the same name.** `content_sources.license_class` and
   `place_facts.license` already hold `official | editorial | partner | restricted`, read by `isPublishable`,
   `canActivateSource`, `isConfirmableFact` and the A6 registry. Two value sets under one name would make
   every reader guess.
   - **Recommendation:** keep the source's license as it is and add the ruling's field as a **new column,
     `reuse_class`** (`display_in_plan | link_only | internal | reusable`), with an explicit mapping for facts:
     `restricted`→`display_in_plan`, `official`→`link_only`, `partner`→`internal`, `editorial`→`link_only`.
   - The ruling would read "license_class (stored as `reuse_class`)".
2. **R-p facts are tagged two ways.**
   - §5 backfills them `local` + `reusable`.
   - §2 lists JNTO-type sources as `link_only`, and an R-p fact *is* a crawled fact from an official source
     (JNTO-type), shown with "from <source> · checked <date>" (LD 57).
   - **Recommendation:** R-p facts are `public` + `link_only`. They are official hard facts, the free draft already
     reads them, and their precedence rule is "official > local".
   - Ruled `local` instead, the free draft loses its covering-events list (FD-1 would strip it).
3. **AI-written gems.** `travelpulse.service.ts` writes gems with `ai_generated=true`. Tagging them `local` with author
   "Traveloure team" would present machine output as a local pick (the ruling's own §2 line).
   - **Recommendation:** `ai_generated=true` gems get NO tag in the backfill and are kept out of every draft until a
     person verifies them (`verified_at`). Nothing untagged reaches a draft (§2), so they drop out of the paid tier too.
4. **Neighbourhood descriptions** are seeded by us and are "neighbourhood guidance", which §2 calls `local`. But
   where-to-stay (free tier, S1) shows them today.
   - **Recommendation:** `local` / `reusable` / "Traveloure team". FD-1 then shows the free where-to-stay without the
     description line.
   - Alternative: rule seeded descriptions `public`.
5. **Which generators count as "the free draft".** The two free rails, certainly. What about quick-start and the
   Plus occasion draft? Both read gems today.
   - **Recommendation:** quick-start is a free draft (gems stripped). The occasion draft is Plus (paid), so it keeps
     local content.
6. **QA exemption from the cap.** There is no free-run grant for drafts.
   - **Recommendation:** exempt accounts whose email domain equals the existing `QA_ACCOUNT_EMAIL_DOMAIN` env (the same
     test the QA Trip Pass issuer uses).
   - **"1 per guest record":** guests have no draft rail today, so this cap has nothing to count until FD-4/G2.
7. **"Night-scene content"** (§5) does not exist. Is it future content, or another name for something that does
   (music-vertical `city_events`)? The backfill can only tag rows that exist.
8. **What the expiry job does** (FD-2) when a local item passes `expires_at`. Options: (a) readers filter it out, as
   `place_facts` does today, plus a census count; (b) a job stamps it expired.
   - **Recommendation:** (a), plus a nightly census line listing what expired. Nothing deleted, and no second status
     column.
9. **The derived-content rule (§3) needs a tag on the plan item.** The count-only teaser (§4) counts local items per
   day, and the only thing that can be counted is an `itinerary_items` row.
   - **Recommendation:** add `itinerary_items.source_class`, server-stamped at create by the generator (`local` when
     any local input produced it), omitted from `insertItineraryItemSchema` (§19), with NULL read as `public` only for
     traveler-added items. This is the one column FD-1 needs from FD-2.

## C. Proposed migration 360 (HELD — not written)
Every column is additive and nullable, with no DEFAULT, CHECK, index or FK, and is declared in `shared/schema.ts`.
Value sets are app-enforced in one module, `shared/content-tiers.ts`. Assumes Q1 = `reuse_class`.

```sql
-- 360a: columns
ALTER TABLE place_facts                ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE place_facts                ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE place_facts                ADD COLUMN IF NOT EXISTS author_label varchar(120);
ALTER TABLE place_facts                ADD COLUMN IF NOT EXISTS official_source_fact_id varchar;
ALTER TABLE travel_pulse_hidden_gems   ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE travel_pulse_hidden_gems   ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE travel_pulse_hidden_gems   ADD COLUMN IF NOT EXISTS author_label varchar(120);
ALTER TABLE travel_pulse_hidden_gems   ADD COLUMN IF NOT EXISTS verified_at  timestamp;
ALTER TABLE travel_pulse_hidden_gems   ADD COLUMN IF NOT EXISTS expires_at   timestamp;
ALTER TABLE local_knowledge_nuggets    ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE local_knowledge_nuggets    ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE local_knowledge_nuggets    ADD COLUMN IF NOT EXISTS verified_at  timestamp;
ALTER TABLE local_knowledge_nuggets    ADD COLUMN IF NOT EXISTS expires_at   timestamp;
ALTER TABLE local_knowledge_nuggets    ADD COLUMN IF NOT EXISTS official_source_fact_id varchar;
ALTER TABLE city_events                ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE city_events                ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE destination_seasons        ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE destination_seasons        ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE city_neighborhoods         ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE city_neighborhoods         ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE city_neighborhoods         ADD COLUMN IF NOT EXISTS author_label varchar(120);
ALTER TABLE city_neighborhoods         ADD COLUMN IF NOT EXISTS authored_at  timestamp;
ALTER TABLE plan_options               ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE ready_made_trips           ADD COLUMN IF NOT EXISTS source_class varchar(16);
ALTER TABLE ready_made_trips           ADD COLUMN IF NOT EXISTS reuse_class  varchar(24);
ALTER TABLE itinerary_items            ADD COLUMN IF NOT EXISTS source_class varchar(16);
```

`author` reuses the existing expert-id columns (`expert_user_id`, `curated_by_expert_id`, `author_id`,
`verified_by`). `author_label` holds "Traveloure team" only where no person authored the row. `authored_at` reuses
`created_at` / `detected_at`, except on `city_neighborhoods`, which has none.

```sql
-- 360b: backfill (idempotent; every UPDATE guarded by source_class IS NULL; a second run touches 0 rows)
UPDATE place_facts SET source_class='public', reuse_class='display_in_plan'
  WHERE source_class IS NULL AND origin='places_api';
UPDATE place_facts SET source_class='public', reuse_class='link_only'            -- Q2 recommendation
  WHERE source_class IS NULL AND origin='crawled';
UPDATE place_facts SET source_class='local', reuse_class='reusable'
  WHERE source_class IS NULL AND origin='expert_nugget';
UPDATE travel_pulse_hidden_gems SET source_class='local', reuse_class='reusable',
       verified_at=COALESCE(verified_at, detected_at)
  WHERE source_class IS NULL AND curated_by_expert_id IS NOT NULL;
UPDATE travel_pulse_hidden_gems SET source_class='local', reuse_class='reusable',
       author_label='Traveloure team', verified_at=COALESCE(verified_at, detected_at)
  WHERE source_class IS NULL AND curated_by_expert_id IS NULL AND COALESCE(ai_generated,false)=false;  -- Q3
UPDATE local_knowledge_nuggets SET source_class='local', reuse_class='reusable',
       verified_at=COALESCE(verified_at, created_at)
  WHERE source_class IS NULL;
UPDATE city_events SET source_class='public', reuse_class='link_only'
  WHERE source_class IS NULL;
UPDATE destination_seasons SET source_class='public', reuse_class='reusable'
  WHERE source_class IS NULL;
UPDATE city_neighborhoods SET source_class='local', reuse_class='reusable',
       author_label='Traveloure team', authored_at=COALESCE(authored_at, created_at)
  WHERE source_class IS NULL;                                                         -- Q4
UPDATE ready_made_trips SET source_class='local', reuse_class='reusable'
  WHERE source_class IS NULL;
```

Left untagged on purpose, each recorded:
- `place_facts` origins `platform_listing`, `hotel_cache`, `event` and `gem`: none exist today.
- AI-written gems (Q3).
- `plan_options` and `itinerary_items`: these are tagged at write time going forward. A legacy item with NULL reads
  as untagged and is excluded from the teaser count, never guessed.

## D. Build shape per sub-lane (after the rulings)

### FD-2: tags, backfill, precedence, expiry
- 360a/360b as above, all declared in `shared/schema.ts`.
- `shared/content-tiers.ts`: the value sets and three pure functions:
  - `admitTag`, which refuses an unknown value;
  - `resolveFactPrecedence`, so hard facts follow official > local > aggregator and judgment follows local;
  - `isLiveLocal`, which applies `expires_at`, and makes a quoting note expire with its official fact.
- Writers stamp tags at insert: the gem / nugget / fact / event / neighbourhood writers and the seeders.
- **The "nothing untagged reaches a draft" test.** A DB test that reads every row a draft reader can return and fails
  on an untagged one. It never filters it out.
- **The expiry census line**, per Q8.

### FD-1: cap, tier filter, count-only teaser
- **Cap.** Counted off `slip_free_draft_run`, or a new count table. The cap needs a durable count, and the funnel
  table may be enough; to be checked.
- **Tier filter.** Draft readers take `public` only.
- **Count-only teaser.** `{ localPicks, localNotes }` per day, computed server-side.
- **Test.** A "no local in a free draft" test over the prompt input and the response.

### FD-3: feasibility
- Last admission, access route, transit and last trains, built on facts-recheck and the step-9 legs engine.
- Its own Phase 0 first: last admission and last train have no fact type today (`FACT_TYPES` has `hours`,
  `ticketing_rule` and `transit`).

### FD-5: coverage targets
- Config numbers per neighbourhood × day type.
- The census reports against them.
- An under-target day shows no teaser and no upsell.

### FD-4: shareable free draft
- One share read that honours `reuse_class`. The four share rails in A4 emit unfiltered content today, which this lane
  must address.
