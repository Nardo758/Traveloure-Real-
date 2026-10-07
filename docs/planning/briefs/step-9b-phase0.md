# Step 9b — Phase 0 (Logistics session, read-only)

> Written 2026-10-07 by the Logistics session for `docs/planning/briefs/step-9-brief.md` rev 1, section
> "9b — optimizer consumption + re-checks", plus the two 9a follow-ups the architect put in scope:
> **FU-9A-2** (airport coordinates from an IATA table) and **FU-9A-4** (refetch once after the debounce).
> Base: `main` @ `2c36513` (R360, step 9a merged as #1325). **Nothing was built:** no product code, no migration.
> `file:line` is at that base. Where the code and the brief disagree, the code is right; each case is marked
> **Brief ≠ code**. Production was not read.

**Migration:** none is needed for anything below if decisions D3 and D5 go as recommended. The next free number
is 358.

---

## 1. Where the optimizer estimates travel today (R-av, L9)

### 1.1 The findings and their inputs
- All of them are produced by one pure module, `shared/optimizer-lead.ts`. The server loader is
  `loadOptimizerFindings` (`server/services/optimizer-lead.service.ts:48–142`).
- **The day path the findings read.**
  - Items are ordered by `dayNumber, startTime, sortOrder` (`optimizer-lead.service.ts:71`), and accommodation is
    dropped (`:72`).
  - Each point is the trusted row coordinate, otherwise the Places fact point (`:105–116`). An unlocated stop is
    silently left out of the path, so the path bridges over it (`:110–111`).
- **`city_crossing`**: `cityCrossings` (`shared/optimizer-lead.ts:277–281`) always emits `est: true` (`:280`).
  - `directionReversals` (`:255–275`) projects each move onto the day's widest axis using haversine (`:260–268`).
  - It ignores moves under `CITY_CROSSING_MIN_LEG_M` = 1,500 m (`:44`, `:269`) and flags a day with more than one
    reversal (`:42`, `:279`).
  - **It reads geometry only.** It uses no minutes, no speeds table and no `transport_legs`.
- **`walking_saved_km`**: `walkingSavedKm` (`:315–327`) is the straight-line length of the draft order
  (`pathMeters`, `:283–287`) minus the length of a nearest-neighbour re-order (`:290–308`). It is floored to km and
  shown from 1 km (`:46`, `:325–326`), always with `est: true` (`:326`).
  - **It is a distance, not a duration.** It compares against an order the plan does not have.
- **`leg_unreachable`** is the only finding that already reads legs.
  - The loader calls `tripLegsShown(tripId)` (`optimizer-lead.service.ts:124`), which is 9a's read rule, so a free
    plan sees only confirmed expert legs.
  - It maps each leg's minutes into `unreachableStops` (`:125–128`; `shared/leg-reachability.ts:81–113`).
  - The `source` column is never inspected there.
- **Buffer findings.** The only one is `timed_entry_conflict` (`shared/optimizer-lead.ts:194–240`). It is built from
  the anchor's **stored** `bufferBefore`/`bufferAfter` (`:199–200`) and involves no travel time.
  - The same rule backs `POST /api/trips/:tripId/validate-schedule` (`server/routes/trips.routes.ts:1836–1838`).

### 1.2 The finding shape and the "est." label
- `interface Finding` (`shared/optimizer-lead.ts:20–31`) has `kind, count, days, est?: true, caveat?, stops?`.
  - **There is no `routed` field.**
  - `est` can only be `true` or absent.
- **The words ignore the flag.** "(est.)" is hard-coded per kind in `findingLine` (`:361–364`), so dropping "est."
  needs a `findingLine` change, not just a flag.
  - `freeFindingsPromptLine` (`:419–424`) and `recheckBannerLine` (`shared/facts-recheck.ts:21–25`) both reuse it.
- **Payload path.**
  - Server: `GET /api/optimization-preview?tripId=` (`server/routes/optimization.routes.ts:172–259`, gated by
    `authorizeTripLogistics` at `:184`, findings at `:226`, `:230`, `:247–248`).
  - Client query: key `["/api/optimization-preview",{tripId}]` (`client/src/components/plan/use-optimizer-lead-data.ts:21–24`).
  - Rendered by `OptimizerLead.tsx:85–94`, which is mounted in `SlipRail.tsx:432, :520` (Track A's file) and
    `pages/plan-versions.tsx:61, :117`.
  - Also read by the Finalize prompt (`SlipRail.tsx:1133–1140`) and the card prompt (`TripCardDays.tsx:164–169`).

### 1.3 Other "est." travel figures (not findings, outside L9)
- Plan-fit: the `"est. "` prefix in `planFitLine` (`shared/plan-fit.ts:142–143`).
- Where-to-stay's tie-break note (`shared/where-to-stay.ts:194`).
- Leg resolution's `label: "est."` (`shared/leg-resolution.ts:20–42`).
- None of these is named by L9. They stay as they are unless ruled otherwise.

### 1.4 Brief ≠ code
1. **L9 says "drop 'est.' when every leg in the finding has a routed duration", but neither finding reads
   durations.**
   - `city_crossing` is a count of direction reversals.
   - `walking_saved_km` is a difference in straight-line distance between two orders. The second order is
     hypothetical, and the engine only routes the draft's consecutive pairs (`server/services/routing/plan-legs.ts:132`),
     so "every leg routed" can never be true for it as written. See D1 and D2.
2. **The optimizer's day path and the engine's pairs differ in three ways.**
   - Order: the optimizer sorts by start time (`optimizer-lead.service.ts:71`); the engine uses storage order
     (`plan-legs-engine.service.ts:97`; FU-9A-3).
   - Unlocated stops: the optimizer bridges over them (`:110–111`); the engine refuses to (`plan-legs.ts:106–108`).
   - Stay legs: the engine adds stay legs; the optimizer drops accommodation (`:72`).
   - So "the finding's legs" must be defined as the pairs the finding's own path walks, matched to engine rows by
     `(fromActivityId, toActivityId)`. A pair with no row is not routed. See D1.
3. **"Routed" ≠ `source IS NOT NULL` for every leg.**
   - A confirmed expert leg has `source = null` but wins its pair (`plan-legs.ts:216–229`). Its minutes may
     themselves be "est." (`trip-transport-legs.service.ts:97–99`).
   - Checked and **not** a leak: `getTripTransportLegs` has no `variant_id IS NULL` filter
     (`trip-transport-legs.service.ts:554–556`), but the app-level exactly-one-of rule keeps variant rows off
     `trip_id` (`trip-transport-legs.service.ts:444`, `isTripScopedLeg` at `:799–800`). The engine's extra
     filter (`plan-legs-engine.service.ts:103`) is a second layer, not a fix.

### 1.5 Tests that pin "est." or the finding shape
- `shared/__tests__/optimizer-lead.test.ts`:
  - O5 (`:104–108`) deep-equals `{kind:"city_crossing",count:1,days:[2],est:true}`.
  - **O6 (`:114`) deep-equals the key set `["count","days","est","kind"]`**.
  - O8 (`:135`) matches `/\(est\.\)$/`.
- **`playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts:1321`** filters only `caveat`/`est` before
  asserting the keys are exactly `["count","days","kind"]`. **A new `routed` key fails this e2e.** O6 must be
  amended in the same PR.
- `shared/__tests__/step6-trip-card.test.ts:149` (the "· Add travel times" prompt) and `:172–177`.
- `client/src/components/plancard/__tests__/optimizer-lead.test.tsx:28–43` has fixtures with `est:true`; it checks
  order only, not the "(est.)" text.
- `client/src/lib/__tests__/leg-reachability.test.ts:71`.

---

## 2. The `facts-recheck` job and the T-3 banner (R-aw, L8)

### 2.1 The job
- **Code:** `server/jobs/factsRecheck.ts` (1–108; pure half in `shared/facts-recheck.ts` 1–39).
- **Route:** `POST /internal/jobs/facts-recheck` through `runJob` (`server/routes/internal.routes.ts:414–417`;
  overlap → `skipped`, `:127–128`).
- **Cadence:** `JOB_CADENCE` daily (`internal.routes.ts:207`). The cron posts it in the daily bucket, which is due
  only at 09:00 UTC (`scripts/ci/post-internal-jobs.sh:307, :319`).
- **Selects:** trips with an owner and `start_date::date = UTC today + 3` (`factsRecheck.ts:37–46`;
  `FACTS_RECHECK_DAYS_BEFORE = 3`, `shared/facts-recheck.ts:9`).
  - **Brief ≠ code:** T-3 is a UTC day. It reads neither `trips.timezone` nor `dates_confirmed_at`. A placeholder
    window (LD 30) is re-checked like a chosen one.
- **Re-runs:** `enrichPlanItems` over every item (`:47–56`), cache-first per place ID and billed only on a miss
  (`server/services/content-facts/place-facts.service.ts:366–389`). Then it calls `loadOptimizerFindings` and
  `recheckConflicts`, which keeps only `closed_on_arrival`/`timed_entry_conflict` (`shared/facts-recheck.ts:13–15`).
  - **Legs are not in it yet.** The header says "Legs join under R-aw in step 9" (`factsRecheck.ts:12`).
- **Writes:** one `notifications` row per conflicting plan (`factsRecheck.ts:61–72`) with
  `type='trip_recheck_conflict'`, `data={tripId, workspacePath, findings, checkedAt}` and
  `dedupeKey='facts-recheck:<tripId>'`.
  - The write goes through `storage.createNotificationOnce` (INSERT … ON CONFLICT DO NOTHING on the partial unique
    `notifications_dedupe_key_uniq`; `server/storage.ts:4646–4663`, `shared/schema.ts:1992–1994`).
  - **The key is one per trip, forever.** A later, different conflict inserts nothing, and the banner keeps showing
    the first one (see D5).
- **Push is dispatched twice.** Once inside `createNotificationOnce` (`storage.ts:4657–4661`) and once by the job
  (`factsRecheck.ts:73–81`). `push_claimed_at` keeps the device buzz single (LD 53).
- **Surfaced by** `GET /api/trips/:tripId/recheck` (`server/routes/plancard.routes.ts:585–611`).
  - It is behind the read gate and reads only the key `facts-recheck:${tripId}` (`:598`).
  - It is read **only** by the Trip Card: `TripCardDays.tsx:151–154`, banner `card-recheck-banner` at `:203–232`.
  - The slip has no re-check banner.

### 2.2 What re-checking a leg needs (none of it exists)
- **The engine cannot be the re-checker as is.**
  - `computePlanLegs` seeds its memo from the plan's own stored engine legs by leg key
    (`plan-legs-engine.service.ts:181`), and the diff keeps unchanged pairs (`:165`). So it would never re-ask Google
    for a stored pair.
  - When it does write, it **replaces rows silently** (delete + insert, `:257–279`), which is exactly the "silent
    rewrite" L8 forbids.
  - A re-check therefore needs its own pass: call the adapter directly per shown leg, compare, and **write no leg**.
- **Where a "was N min" comes from:** the stored row's `estimated_duration_minutes` (`shared/schema.ts:8060`).
  There is no history column.
- **Two homes already exist for the result.**
  - (a) `transport_legs.leg_check_status` ('ok'|'changed'|'broken') and `leg_checked_at` (`shared/schema.ts:8097–8098`,
    migration 347). These have **no writer anywhere**: only tests asserting null
    (`server/__tests__/transport-leg-authoring.db.test.ts:212–217`). They are reserved for exactly this by spec R-bb
    (`slip-and-card-surface-spec.md:74`, marked "L1-5 pending").
    - Caveat: an engine recompute deletes the row, so the status dies with it.
  - (b) A `notifications` row with its own dedupe key, which is the shape the banner already reads.
- **The card reads live legs** even on `?surface=card` (`server/services/trip-plan.service.ts:740–749`). So a 9a
  recompute already changes the card's minutes. That is a recompute after an edit, not a re-check, and L8 does not
  forbid it.

### 2.3 Day-of and "leave by"
- **"Leave by" exists nowhere in code.** It appears only in docs and in a migration comment
  (`server/migrations/154_transport_legs_trip_scope.sql:6, 42`: "no derived 'leave by' value").
  `transport_legs.pickup_time` is a display string (`shared/schema.ts:8074–8079`).
- **Today on the card:**
  - `todayIso = calendarDayOf(now, timeZone)` (`TripCardDays.tsx:122`), with today-first ordering (`:123–127`), the
    now-line (`:140–146`) and `getUpNextInfo` (`:146`).
  - `getUpNextInfo` (`client/src/components/plancard/plancard-temporal.ts:244–287`) already returns `upNextLeg`
    (`:278`), which is the natural place for "leave by" = next start − leg minutes.
  - `formatCountdown` refuses without a zone and confirmed dates (`:326–345`). The same honesty applies here.
- **Day-of cadence.**
  - **Brief ≠ code:** no per-trip-day selection exists. The spec names a separate `routing-recheck` job "on each
    trip day" (`slip-and-card-surface-spec.md:238`); L8 says to use the same job's cadence.
  - That cadence is once a day at 09:00 UTC, which is 18:00 in Kyoto, after the day is over. See D6.

### 2.4 Tests
- `server/routes/__tests__/facts-recheck-registration.vitest.ts` (cadence, stamp, overlap).
- `server/routes/__tests__/internal-jobs-auth.http.test.ts:38`.
- `shared/__tests__/step6-trip-card.test.ts:169–180` (T8: "Hours re-checked 8 Nov · …").
- `scripts/ci/post-internal-jobs.test.sh:211, 263`.
- **Gaps:**
  - No test runs `runFactsRecheck` with injected deps (the deps seam exists at `factsRecheck.ts:30–34`), so "two
    runs → one finding" is unproven today.
  - No test renders `card-recheck-banner`.

---

## 3. FU-9A-2 — airport coordinates on the flight anchor

- **Brief ≠ FOLLOWUPS: the IATA → coordinates table already exists.**
  - `server/data/iata-airports.json` has 3,287 OurAirports-derived rows (public-domain source) of
    `{iata,name,city,country,cc,region,lat,lon,score}`, for example KIX at 34.4273, 135.244.
  - It is seeded into `location_cache` at startup (`server/seeds/location-cache.seed.ts:4–8, :85–98`;
    `server/index.ts:535`) as `AIRPORT` rows with latitude/longitude, expiring 2099.
  - It is read by `storage.getLocationByIataCode(iata, "AIRPORT")` (`server/storage.ts:877, :5892`).
  - **No new table and no migration are needed.**
- **The anchor already has the columns.** `temporal_anchors.latitude/longitude` (`shared/schema.ts:5996–5997`) are
  never written. Anchor create is a plain schema parse (`server/routes/trips.routes.ts:1645–1676`).
- **The anchor's airport is `temporal_anchors.location`:**
  - On the lookup path it is the plan-end IATA code (`shared/getting-there.ts:108, :114`).
  - On the manual path it is free text from "Airport (optional)" (`:138`; `client/src/components/plan/GettingThereSheet.tsx:186–193`),
    which may not be a code.
  - The far-end airport is never stored. It does not matter here, because the leg is plan-end only.
- **Airport legs are not `transport_legs` rows.**
  - They are drawn on the client from anchor + stay (`SlipView.tsx:1783–1797` with `shared/airport-leg.ts:21–34`;
    `AirportLegRow` at `LegRow.tsx:294–306`).
  - `shared/airport-leg.ts:9–10` says no minutes or distance are ever derived.
  - The engine's `desiredPlanLegs` never includes an airport (`server/services/routing/plan-legs.ts:94–139`).
- **The buffer check is client-only and fixed.**
  - `flightTimeConflictLine`/`flightCutoffTime` (`shared/getting-there.ts`; fallback `:204–206`) use
    `FLIGHT_BUFFER_MIN` (`:50–53`), stamped on the anchor at write time (`:113`, `:137`).
  - It is called from `SlipView.tsx:2410–2418` (Track A's file).
  - The server's `timed_entry_conflict` reads the same stored buffers.
- **What FU-9A-2 therefore takes:**
  1. Stamp lat/lng on a flight anchor at create and update, from `getLocationByIataCode` when `location` is a known
     three-letter code. Otherwise leave it NULL and say so (§13): free text is never geocoded.
  2. `desiredPlanLegs` gains anchor ↔ stay legs: an arrival → the day's stay, and the stay → a departure. These go
     only on a qualifying plan, keyed by a pseudo activity id `anchor:<id>`.
  3. The client's airport leg reads the routed minutes when the server sends them.
  4. The buffer check: see D7.

---

## 4. FU-9A-4 — refetch once after the debounce window

- **Slip query:** `client/src/pages/slip-view.tsx:24–33`, key `` [`/api/trips/${tripId}/plancard`] ``,
  `refetchInterval: (query) => plancardRefetchInterval(query.state.data)`.
  - **Not Track A's file.** But `client/src/lib/__tests__/smoke5-fixes.test.ts:78` regex-pins that exact
    `refetchInterval` text.
- **The Trip Card key** `` [`…/plancard`, {surface:"card"}] `` prefix-matches the bare key
  (`client/src/pages/trip-details.tsx:102–107`).
- **Global defaults:** `staleTime: Infinity`, no interval (`client/src/lib/queryClient.ts:92–100`).
- **Slip item writes** (add, edit, delete, reorder, and the ⋯ actions) all go through `invalidatePlan`
  (`client/src/components/plancard/SlipItemTools.tsx:44–50`).
  - The lock toggle (`SlipView.tsx:635`) and the rail's own writes (`SlipRail.tsx:325, :1063`) invalidate
    separately, in Track A's files.
- **Existing polling precedent:** `client/src/lib/plancard-refetch.ts:11–19` polls every 2 s while
  `coordinatesPending` or `factsPendingItemIds` is set.
  - The pending state lives in the database (`ai_generated_itineraries.facts_lookup`,
    `place-facts.service.ts:706–715`), deliberately so that any instance can answer (`plancard-refetch.ts:21–27`).
- **Server pending state is in-process only.**
  - `hasPendingPlanLegRecompute` checks the local timers map (`server/services/routing/plan-legs-queue.ts:53–55`).
  - It is false on any other instance and false while a recompute is running.
  - **A payload "legs pending" flag built on it would be wrong on Autoscale.**
- `PLAN_LEG_DEBOUNCE_MS = 2000` (`plan-legs-queue.ts:15`).
- Leg ids change on every recompute (delete + insert), so the client must match legs by stop pair
  (`client/src/lib/slip-legs.ts:36–63` already does).
- **Smallest honest fix (no server state):**
  - In `invalidatePlan`, schedule ONE more invalidation of the plancard key at `PLAN_LEG_DEBOUNCE_MS + margin`,
    only when the loaded plan gets routed legs. The client already knows that, because it is the only case where
    routed legs or `travelTimesPaused` come back.
  - The constant moves to `shared/` so the client and the server read one number (§18 rule 1).
  - This touches neither `SlipView.tsx` nor `SlipRail.tsx`. The lock toggle does not change a pair, and the rail's
    own writes are covered on the next read. See D8.

---

## 5. Expected Maps calls for 9b (L10)

- **Re-check, per plan per run:** one call per shown routed leg (≈ 20 on a settled 5-day plan, plus 2 stay legs a
  day once D3 lands). The run cannot reuse stored rows by construction, because its point is to re-ask.
  - T-3 happens once per plan, so ≈ 20–30 calls per qualifying plan in total.
  - Day-of under D6 is one day's legs per trip day: ≈ 4–6 calls a day.
- **FU-9A-2 adds** at most 2 legs per arrival or departure day to the cold Optimize run and to recomputes. The cold
  run grows from 50 to ≈ 52 calls for a two-flight plan.
- **L9 itself adds no calls.** It only reads stored legs.

---

---

## 6. A 9a interaction found while reading: the `leg-google-coords` job clears engine legs

- `POST /internal/jobs/leg-google-coords` (R313; `server/routes/internal.routes.ts:209, :422`; daily bucket,
  `scripts/ci/post-internal-jobs.sh:307`) selects **every** plan holding a leg with `coord_source = 'google'`
  (`server/jobs/legGoogleCoordsRefresh.ts`, the candidate scan), re-routes it through `rerouteCopyForStay`, which
  returns `not_a_copy` for anything but a Ready Made copy (`server/services/stay-reroute.service.ts:143–145`), then
  **DELETEs** the plan's Google-sourced legs older than `legGoogleCoordMaxAgeDays()` (30-day ceiling,
  `server/config/leg-google-coords.config.ts:6–10`). The DELETE has no `source` filter.
- 9a stamps `coord_source='google'` on an engine leg whose end came from a Places fact (R311,
  `googleCoordStamp` in `plan-legs-engine.service.ts`). So a routed leg on an Optimized or Trip Pass plan is
  **deleted** at 30 days and nothing recomputes it until the next item edit. The deletion itself is right
  (Google's terms); the gap is that the leg is not rebuilt from a fresh fact.
- Fix in 9b's scope, no migration: after its DELETE, the job enqueues `enqueuePlanLegRecompute(tripId)` for a
  qualifying plan. The engine then re-reads the plan's facts (refreshing the stay is already step 1 of that
  job) and rebuilds only the cleared pairs. **See D10.**

## 7. Decisions needed (each with a recommendation)

| # | Question | Recommendation |
|---|---|---|
| D1 | What does "every leg in the finding has a routed duration" mean for `city_crossing`, a count of reversals? | A finding's legs are the consecutive pairs of the **days it names**, walked in the finding's own path order and matched to shown legs by `(from, to)` activity id. `routed: true` only when every such pair has a shown leg with positive minutes and a non-null `source` **or** `status = confirmed` with a non-"est." tier. The count stays geometric (no behaviour change); only the label moves. A day whose path bridges an unlocated stop is not routed. |
| D2 | `walking_saved_km` compares against a hypothetical re-order whose pairs are never routed. | Keep it `est.` always, and say so in the code comment: no routed basis exists without routing the alternative order, which would be extra calls on every read. Re-basing it on routed walk distance is a later lane if wanted. **This is the one place L9 can't be met literally.** |
| D3 | The shape: `routed: true\|false` on every finding, or only on the two kinds? | Only on `city_crossing` and `walking_saved_km`, alongside `est`. `est` becomes `!routed` for those two. `findingLine` drops "(est.)" when `routed`. Amend O6 and the e2e key filter (`j-kyoto…spec.ts:1321`) in the same PR. |
| D4 | Which legs count as "routed" for a finding? | A shown leg with positive minutes and a non-null `source`, **or** a confirmed expert leg whose own tier (`alternative_modes[].reason`) is `routes` or `matrix`. A confirmed leg resolved by straight line (`est.`) is not routed. One pure helper beside `selectPlanLegs`, never a second copy. |
| D5 | Where does a changed-leg finding live, and how do "two runs produce one finding"? | A `notifications` row per changed leg, key `facts-recheck-leg:<tripId>:<fromId>:<toId>:<checkDate>`, with `data = {from, to, wasMin, nowMin, mode, checkedAt}`. `/recheck` reads both key shapes and returns `legs: [...]` beside `conflict`. Also write `leg_check_status`/`leg_checked_at` on the row (R-bb's columns, no migration); they are lost on recompute, which is honest because a recompute re-routes the leg. No new table, no migration. Never write minutes. |
| D6 | Day-of cadence: the job runs once at 09:00 UTC. | Keep the one job and the one daily post (L8, and the one-schedule rule), and add the selection "a trip day today in the trip's own zone". The day-of pass re-checks that day's legs only. Record that 09:00 UTC is late in Asian markets. The alternative (an hourly bucket that fires when it is ~06:00 local) is a cadence change the brief did not ask for; flag it, don't build it. |
| D7 | "Leave by" and the airport buffer check. | "Leave by" = next stop's start − the routed leg's minutes, today's rows only, only with a zone and confirmed dates, computed in `getUpNextInfo`'s module (no storage). The airport buffer check keeps `FLIGHT_BUFFER_MIN` and **adds** the routed airport leg's minutes when present; the call site is in `SlipView.tsx` (Track A), so 9b exports the helper and asks Track A to pass the leg. |
| D8 | FU-9A-4: polling vs a one-shot refetch. | One delayed invalidation from `invalidatePlan`, gated on the plan qualifying. No server "pending" flag (it would be wrong across instances). |
| D9 | T-3 uses a UTC day and ignores `dates_confirmed_at`. | Out of 9b's scope to change the hours re-check; for the **leg** re-check, skip plans whose dates are not confirmed (a re-check against a placeholder day is noise) and use the trip's zone. Flag the hours half as a follow-up. |
| D10 | `leg-google-coords` deletes 9a engine legs at 30 days and nothing rebuilds them (§6). | The job enqueues one plan recompute after its DELETE, on a qualifying plan only; the engine rebuilds the cleared pairs from fresh facts. One test: a 31-day-old Google engine leg is cleared and comes back routed after the debounce. |

## 8. Supply notes the engine exposes
- Free-text manual airports cannot be stamped and stay without minutes. The count of such anchors in production is
  a Replit read.
- `location_cache` holds only airports with a real IATA code. A small regional field with no code has no point.

Hard stop. Waiting for the architect's go and rulings D1–D10.
