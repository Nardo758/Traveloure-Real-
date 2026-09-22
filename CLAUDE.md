<!-- SLIMMED per Execution Protocol (DECISIONS.md ruling 26 §5, ruling 29) — 2026-08-04, as-of 5941a4ff.
     This file is an INDEX: invariants + pointers + boot-time operational notes ONLY.
     - Decisions/rulings:     docs/DECISIONS.md (append-only ledger — OUTRANKS every brief; cite by number, never paraphrase)
     - Historical findings:   docs/findings/CLAUDE_MD_ARCHIVE.md (the 1,100+ lines moved out of this file, with as-of SHAs)
     - Guard registry:        docs/DECISIONS.md §Guard registry (guard = runs in CI; script-only = MISSING)
     - Merge write-back:      .github/PULL_REQUEST_TEMPLATE.md (every merge writes its own deltas back)
     - Defect state:          lives in findings docs with as-of SHAs — NEVER here ("fix in flight" class is banned).
     Volatile current-state claims do not belong in this file. Re-verify anything stateful at Phase 0. -->

# Traveloure Codebase Architecture

This document captures architectural decisions to maintain consistency across code changes. Updates require approval from the designated decision-maker.

**Architectural Decision-Maker:** User (explicit confirmation required for schema/routing changes).

---

## Locked Decisions & Current Intent (updated Jul 12, 2026)

> This section carries **intent** — how the platform is *supposed* to work — from the decision-maker's sessions, which the
> repo alone can't convey. Where a "⚠️ current code" note appears, the code **diverges from intent**; that is a tracked
> **bug**, not the design. Do not "fix" the doc to match a divergence — fix the code (or leave it flagged).

2. **Admin auth = default-deny.** `/api/admin/*` is protected by a **blanket `requireAdmin`** guard
   (`app.use("/api/admin", …)` in `server/routes.ts`, DB role lookup on the session; 401/403; no bypass) — **landed via
   #141**; the previously world-writable `POST /api/admin/fee-config` hole is **closed on `main`**. Do **not** reintroduce
   per-endpoint opt-in — that pattern is what leaked.
3. **Delivery-method vocabulary = the 7.** Canonical set is `pdf, video, call, in_person, voice_notes, async_messaging,
   hybrid` — enforced by both `deliveryMethodEnum` (`shared/schema.ts:523`) and the migration-109 DB CHECK on
   `provider_services` + `service_templates`. No `document`/`digital`/hyphenated variants; the `CANONICAL_TEMPLATES` seeder
   must emit canonical values.
4. **Two parallel offering catalogs, never merged.** `expert_offering_types` (`serviceTier` + `deliveryFormats`) and
   `service_offering_types` (`categoryKey` → `service_categories`) are strictly separate. **Experts are NOT a
   `service_category`.** `offering_type_key` is persisted via **two separate FKs** (migration 107), `ON DELETE SET NULL`.
8. **No fee/commission/margin literals** anywhere outside `fee_bands`/config — grep-gated every phase. A hardcoded rate in
   touched code is a defect (see §13). **Phase 4.1 LANDED (migration 122):** the `499`/`8%` coordination constants —
   formerly the pre-existing §8 exception — are now admin-editable `fee_bands` rows (`coordination_floor` flat-dollars
   `499.00`; `coordination_percent` fraction `0.08`). `resolveCoordinationFee` reads them via the two bands and **falls
   back to the same code constants when a row is absent/non-positive** (a fee floor's safe failure mode), so the seed is
   behavior-neutral on apply and the constants survive only as the documented fallback default (`fee-literal-ok`,
   matching the `getFee` DEFAULT_FEE_CENTS fallback posture). Idempotent `ON CONFLICT DO NOTHING`; no schema/CHECK change
   → no publish-time push trap.
9. **Routing realities (corrected Aug 7, 2026 — decision-maker ratified).** `server/routes/experts.routes.ts` is now
   **MOUNTED and live** (`app.use` in `server/routes.ts`; the dark-endpoint repairs landed it — the earlier
   "imported-but-unmounted" note was stale). The **unmounted-router guard** (`scripts/check-unmounted-routers.cjs`,
   CI) is the arbiter of dark-route claims going forward — do not trust prose here over its output. Unchanged and
   still load-bearing: **dead endpoints return 200-HTML (the Vite catch-all), NOT 404** — never use a 404 as a
   "route is dead" signal.
11. **Auth/env.** Passport serializers register in **all** environments, not just Replit (fix #133) — email/password login
    works off-Replit. The `package-lock.json` `replit.local` pollution is scrubbed durably (#134; see Lockfile purity).
12. **A PENDING advisor may not write.** Trip-item mutation paths (create/edit/delete/reorder) gate the advisor branch
    on WRITE-access statuses (`accepted`/`assigned`, not `pending` — `TRIP_ADVISOR_WRITE_ACCESS_STATUSES`); read
    surfaces (assigned-trips, trip GET, plancard) keep granting `pending`. `itinerary_items.origin`
    (`'ai'|'traveler'|'expert'`, app-enforced, no CHECK — publish-trap avoidance, migration 181) is stamped
    server-side at create; both ratified Aug 7 2026. Regenerate preserves `origin='traveler'` and `suggestedBy='expert'`.
    **A READ GATE THAT NAMES A COLUMN NOTHING WRITES IS NOT A GRANT (ledger
    `2026-09-15-v32-v33-leads-door-item-read-gate`; decision-maker sentence applied 2026-09-15).**
    `trips.expert_id` is declared and has NO writer anywhere under `server/`; the trip's assigned expert
    lives in `trip_expert_advisors`, whose ONE author is `upsertTripAdvisorRow`. `GET /api/trips/:id`
    granted its expert arm on that dead column, so a legitimately assigned advisor was refused 403
    **and logged as an `[IDOR ATTEMPT]`** — a §13 falsehood in the log as well as a refused read. The
    arm now asks the CANONICAL §12 READ predicate `isTripAdvisor` (imported, never re-derived — §18
    rule 1), `pending` passes as this entry already rules for the trip GET, and the generate-itinerary
    stopgap's copy of the same dead arm is deleted (§18c). The column is KEPT and annotated in
    `shared/schema.ts` as written-by-nothing: do not build a new grant, fallback or display on it
    without first giving it a writer and ratifying that writer.

20. **Market-launch assets are DB-backed; extracted places are child rows (decision-maker ratified Aug 9, 2026).**
    Two additive tables (migrations 185/186, both declared in `shared/schema.ts` — publish-trap rule):
    **(a) `dmo_extracted_places`** — places extracted from a DMO guide are first-class child rows of
    `dmo_raw_content` (ON DELETE CASCADE; UNIQUE (dmo_content_id, "position")), replacing the
    `extracted_data.places` JSON blob as the source of truth (blob backfilled by 185, thereafter historical —
    written never read). Re-extract is replace-by-position but **must preserve expert-added `ticketing_url`**
    by `normalized_name` match — an expert's curation is never clobbered by a refresh. API response shapes are
    unchanged (server maps rows → the same `places` array), so clients are untouched.
    **(b) `market_geography`** — a market's water/parks/roads layer lives in the DB, written by the admin
    "Add market" flow (`/api/admin/markets`, under the §2 blanket guard), which runs the Overpass extract
    **server-side** (same UA/mirror/length-cap rules as `scripts/generate-market-geography.ts`) and can also
    seed `city_neighborhoods` from OSM `place=suburb|neighbourhood|quarter` nodes. Lookup is **DB-first with
    the committed `KYOTO_GEOGRAPHY` literal as server-side fallback** (absent row ≠ error; no-layer markets
    render honestly without geography, never another city's shapes — §13 posture). The client no longer
    bundles geometry — it fetches the public read endpoint. ODbL attribution ("© OpenStreetMap contributors")
    remains REQUIRED wherever any of this renders. The **vector-tile interactive map is PARKED** by the same
    ruling — do not start it as a side effect of geography work.

21. **Expert Notes are two-level and traveler-facing; `trips.expert_notes` stays PRIVATE (decision-maker
    ratified Aug 9, 2026).** UI label for both new fields is **"Expert Notes"**: per-item
    `itinerary_items.expert_note` and trip-level `trips.expert_traveler_note` (migration 187, additive
    nullable, declared in `shared/schema.ts`) are **delivered to the traveler** (PlanCard + delivered-plan
    surfaces, "from your expert" treatment). **`trips.expert_notes` is a DIFFERENT field** — the Workstation's
    private "Build notes" (`PATCH /api/trips/:id/expert-notes`) — and must never leak to traveler surfaces;
    do not rename or merge the three. Writes to the new fields gate on the same §12 advisor WRITE statuses as
    other item/trip mutations. Same ruling: **traveler-facing distance on map surfaces is ALLOWED** (store
    teaser day-km legend ratified — "users should be able to see the difference"); the Delta-framework
    brief's L3 ("distance never traveler-facing") is amended to headline *delta claims* only, not map
    annotation. The Advisor **fundamentals** checklist (ratified list in `server/routes/advisor.routes.ts`)
    is deterministic, §13-honest (a check with insufficient data is omitted with a reason, never guessed).

22. **Service map & route stops; Catalog is the map's home (decision-maker ratified Aug 10, 2026).**
    **(a) `service_route_points`** (migration 192, declared in `shared/schema.ts` — publish-trap rule) is the
    child-row home for a provider service's **ordered route stops**, on the `dmo_extracted_places` pattern:
    `ON DELETE CASCADE` FK → `provider_services`, `UNIQUE (service_id, "position")`, **nullable lat/lng — an
    unlocated stop stays visibly flagged, never guessed onto the map** (§13). Writes are owner-gated
    **replace-list** (`PUT /api/provider/services/:id/route-points`): positions derived server-side from array
    order, allowlist body (§19 posture — no `createInsertSchema` denylist parsed off the body). Coordinates for
    a stop come only from an explicit user placement (same L27-P3 confirm posture as the meeting pin).
    **(b) Placement:** the map authoring surface lives on **Catalog** (`/provider/services`, list↔map toggle) —
    per the C9 precedent that put availability-slot editing there (per-listing curation belongs to the "what I
    sell" module). Workstation ladder cards may deep-link in; Workstation never owns the surface. The meeting
    pin keeps its ONE write path (`extractServiceLocation` on POST/PATCH `/api/provider/services`, confirm-gated
    `LocationPointPicker`) — the map view mounts the same picker, no second pin-write rail.
    **(c) Rendering honesty:** route connectors are **straight dashed lines labeled as sequence, not travel
    routing**; no invented distances/durations (§13). `serviceRadius` may render as a ring around the confirmed
    pin (display only). Traveler surface (`GET /api/services/:id` now carries `routePoints`;
    `/services/:id` page): map renders **located stops only**, shows "X of Y stops located", and renders **no
    map at all when the service has no coordinates** — never a city-center fallback. Traveler map is
    Leaflet/OSM; ODbL attribution ("© OpenStreetMap contributors") REQUIRED wherever it renders.
    **(d) Distribute:** the "Route" share frame is a third format of the EXISTING share-image rail
    (`/api/share-image/service/:id.png?format=route`, satori template beside feed/story) — layout data resolved
    server-side from the row like the other two; measurement stays on Performance (`LinkAnalyticsPanel`), the
    share rail never grows its own analytics.

23. **Edit-split on approved listings (decision-maker ratified Aug 14, 2026 — ledger row 112, Q8).** An
    APPROVED listing is never taken down for an edit. Edits split server-side into two lanes:
    **safe edits** (price/pricing settings, photos & gallery order, availability/slots/blackouts, description
    wording, what-to-bring/access notes, meeting-pin position) apply to the live row immediately;
    **identity edits** (service name, category/offering, delivery method, safety-attestation-bearing changes,
    adding a route where there was none) do NOT touch the live row — they land in
    `provider_services.pending_changes` (jsonb) + `edit_review_status='pending'`, the approved version stays
    live and bookable, and the admin review queue applies them on approval (reject discards, listing stays
    live as-approved). The field split is decided ONLY server-side in the PATCH handler;
    `pending_changes`/`edit_review_status` are never client-writable (§19 posture — allowlist-stripped on
    every rail). Born-submitted (migration 111) is unchanged: this governs edits AFTER first approval only.
    **⚠️ current code (found by the Aug 16 console sweep, S-1):** this rule is enforced but **never
    stated to the provider**. Their only signal is an "Edit in review" pill on the Catalog row AFTER
    the edit lands — nothing tells them beforehand which changes go live and which re-enter review.
    The ratified mock draws that as a two-column panel on the listing home. Tracked as a defect, not
    the design. **Constraint on the fix:** since the split is decided ONLY in the PATCH handler, any UI
    must READ the server's own list, never restate it client-side — restating it is the
    derivation-drift class §18 rule 1 names, and it would drift the moment a field moves lanes.

24. **Gap #13 is closed on the field side; every question the flow asks has a traveler-side home
    (ledger `2026-08-16-bring-access`, migration 228).** The ratified mock's traveler read-out draws
    nine rows. Seven landed with lane M3; the last two — **Bring** and **Access** — had no column
    anywhere and no wizard field, so the flow never asked and nothing could render them (the inverse
    of T-REP's collected-and-never-read class). `provider_services.what_to_bring` and `access_notes`
    are additive-nullable TEXT, **declared in `shared/schema.ts`** (publish-trap rule), no DB CHECK
    (migration-181/195 posture), asked on **Logistics** — which is why they never appear on the
    pdf/async branches. **NULL = never answered ⇒ the row is OMITTED everywhere (§13)**, never
    rendered as "nothing to bring" or "no access notes", which are claims only a host can make; the
    traveler surface says out loud that **no accessibility standard is claimed on the host's behalf**,
    which is why these are free-text notes and not a checklist of certified attributes. They are
    deliberately NOT `trip_participants.accessibility_needs`/`mobility_level` — that is a TRAVELER's
    stated needs, a different person's answer. Both are ordinary owner-authored content (no amount,
    identity, rate or grant), so §19's strip does not apply and none was added.

25. **New ledger rulings are keyed by DATE-SLUG, not by number (ledger `2026-08-16-ledger-ids`).**
    `docs/DECISIONS.md` ids 1–122 are **FROZEN** — cited throughout this file and the briefs, never
    renumbered, never reused — and every NEW row is keyed `YYYY-MM-DD-<kebab-slug>`. Ruling 35's
    "claim the next free number" made collisions structural: three lanes collided on rows 120/121/122
    in one night while touching no common code. `check-decision-guards.cjs` now fails on a duplicate
    id of ANY shape, so a collision is a CI failure rather than a manual renumber. Cite old rulings by
    number and new ones by slug; both are permanent.

26. **Plus is DELIVERY, and does not go on sale until it delivers (decision-maker ratified Aug 27, 2026 —
    ledger `2026-08-27-plus-is-delivery`, `2026-08-27-plan-memberships`; migration 260).** Plus's product is
    the **scheduled occasion draft**: 14 days before each occasion a member registers (`occasions`), an
    idempotent scheduler builds a plan from the member's **home city** (`users.home_city`) on the EXISTING AI
    rail — an ordinary trip with `origin:'ai'`, `in_planning` items (`saveGeneratedItinerarySnapshot`), **not**
    a new artifact type, reusing the AI-Concierge task, **not** a new generator — and sends ONE reminder email
    (Resend outbox). Idempotency is the `occasion_drafts` ledger (dedupe on `(occasion_id, cycle_key)` — the
    concrete occurrence date, correct for any recurrence; §15 CLAIM→generate→PROMOTE). Because Autoscale holds
    no in-process cron, the **authoritative runner is an internal endpoint** (`POST /internal/run-occasion-drafts`,
    `INTERNAL_JOB_SECRET`) fired by a daily external trigger; the in-process timer is defense-in-depth only.
    Entitlement is **`plan_memberships`** — the ONE user-level record for the recurring plans (Plus
    `plus_annual` + Pro `pro_monthly`; `source ∈ {stripe, manual, beta}`), READ here (`isActivePlus`) and
    WRITTEN later by the separate Plus-**checkout** lane from the Stripe subscription webhook (it populates,
    never redefines). **Trip Pass stays per-trip (`trip_entitlements`), never in `plan_memberships`.**
    **`PLUS_SALES_ENABLED` (default off) is this lane's gate:** the `/pricing` Join-Plus CTA reads it (public
    flag on `/api/pricing`) and shows coming-soon until it is on. Flip it on ONLY once a draft fires
    end-to-end AND the home market is stocked — a thin draft in an unstocked market is honest (§13, a seed-lane
    signal), not a bug to hide. Checkout (Stripe annual) is a SEPARATE lane: this one delivers, that one collects.

27. **Neighborhood claims: `expert_neighborhoods` has ONE writer, and evidence is typed rows (decision-maker
    ratified Sep 2, 2026 — ledger `2026-08-29-neighborhood-claims`, `2026-08-29-evidence-is-the-test`,
    `2026-09-01-evidence-thresholds-config`, `2026-09-01-access-claims-held`, `2026-09-02-field-knowledge-phase0-ratified`;
    migration 272).** An `expert_neighborhoods` row is born ONLY by admin ratification of an expert's own claim
    (`expert_neighborhood_claims`, `neighborhood-claims.service.ts ratifyClaim`) — never by ops judgment or platform
    assignment. Enforced at the DB: a BEFORE INSERT trigger refuses any insert outside that transaction; the
    approval-hook name-match, the admin lead route's raw upsert and the demo seed's direct insert are retired, and
    the lead flag is UPDATE-only on an existing row. Legacy rows (`claim_id IS NULL`) are kept; the four
    verification-dependent readers cut to `verified_at IS NOT NULL` in Phase 3, one commit each. Verification
    evidence is the four-prompt capture written as TYPED rows (P1 = depth columns on `local_knowledge_nuggets`, the
    gem-candidate host; P2 `mini_slip_templates`; P3 `claim_contingencies`; P4 `access_claims`, HELD — never scored,
    surfaced or counted until scout-check). Scores are admin-only; the expert and the public see exactly two words,
    `claimed → verified`, and never test/exam/score/pass/fail. Every pass threshold lives in `evidence_thresholds`
    with NO code fallback — `thresholds_missing` blocks the scorer and Ratify alike. The onboarding step requires a
    claim only when the city has picker rows; otherwise it is skippable and the server stamps
    `local_expert_forms.no_neighborhoods_available_at` for ops backfill (not being able to claim is honest; not
    being able to apply is a funnel hole). Content of record: `docs/expert-field-knowledge/evidence-test.md`.
    **#699 (v2) is canonical; #698 (migration 271) is superseded** (ledger `2026-09-02-field-knowledge-v2-canonical`):
    migration 272 transforms the empty v1 state into v2 and only v2 declarations remain in `shared/schema.ts`. The one
    piece ported from #698 is `nugget_photos` with its consent invariant — no public/non-owner photo read unless the
    parent claim's `consent_at IS NOT NULL`; `listConsentedNuggetPhotos` is the one read path and carries the join.

28. **An occasion is a ROW carrying defaults, not a class (decision-maker ratified Sep 3, 2026 — ledger
    `2026-09-03-occasion-switches`; migration 276).** The three-class flow model did not survive its stress test:
    stops, an internal schedule and a guest list are three INDEPENDENT capabilities any occasion can need in any
    combination. So `experience_types` carries six switch columns — `default_stops` (one|many), `default_duration`
    (day|range), `default_schedule` (bool), `default_guests` (bool), `vocabulary` (travelers|guests|attendees),
    `default_visibility` (shown|hidden) — every one a DEFAULT the traveler can flip inside the plan, never a lock.
    All additive-nullable, **NO DB CHECK** (publish-trap posture, migrations 181/195/273 precedent; app-enforced,
    DB-permissive) and **declared in `shared/schema.ts`** (deploy-push durability rule). **NULL = not set ⇒ the
    reader falls back to the plain-trip shape explicitly and says so in a comment (§13)** — never a fabricated
    `one`/`day`/`off` presented as the occasion's own answer. Writes are allowlist-only
    (`experienceTypeSwitchesSchema`, `.pick()` — §19); no writer route exists in this lane, the seeder is the one
    author. Same ruling seeds four occasions that surfaces already referenced with no row behind them: `romance`
    (nav "Romantic Getaways"), `corporate` (nav "Corporate Retreats"), `milestone-birthday` and `family-occasion`
    (the two landing Moments) — reusing existing tabs/presets, authoring no new filter content. The class
    (`travel`/`event`/`couple`) survives ONLY as presentation vocabulary and must not be promoted back into a flow
    switch.

29. **An item belongs to an EVENT, and the event is a `user_experiences` row (decision-maker ratified
    Sep 3, 2026 — ledger `2026-09-03-item-event-link`; migration 277).** A plan is ONE `trips` row;
    an event inside that plan is ONE `user_experiences` row already bound to it by the existing
    nullable `user_experiences.trip_id` (no uniqueness — many events per trip). **No new event
    table** and no new artifact type: invites already hang off an event
    (`event_invites.experience_id`), a temporal anchor already can (`temporal_anchors.user_experience_id`),
    and the slip already mints one row per trip on "set up guest list"
    (`SlipLogisticsSection` → `POST /api/user-experiences`). The one thing missing was the link the
    other direction, which this adds: **`itinerary_items.user_experience_id`** — additive, NULLABLE,
    **NO DB CHECK** (migration-181/195/275 posture; a CHECK here is exactly the publish-time
    drizzle-push failure the Coordination Prevention rules warn about), FK
    `REFERENCES user_experiences(id) ON DELETE SET NULL`, plus
    `idx_itinerary_items_user_experience_id`. **Column AND index are declared in `shared/schema.ts`**
    — the deploy-push durability rule: an object `schema.ts` does not declare is dropped at publish
    and never recreated, because the migration is already stamped.
    **ON DELETE SET NULL is the ruling, not an implementation detail:** deleting an event must never
    delete the items planned under it. Every plan has ONE implicit unnamed event, so `NULL` is that
    event and items always resolve — a de-linked item falls back to the plan's implicit event, it is
    never orphaned and never silently destroyed (§13).
    **ADMISSION IS A §19 ALLOWLIST.** `insertItineraryItemSchema` **`.omit()`s** `userExperienceId`
    so the generic body parse cannot grant it, and a pick-based `itineraryItemEventLinkSchema`
    re-admits exactly that one field (nullable — an explicit `null` is how a traveler moves an item
    back to the implicit event). This is the §19 posture applied to a NEW column rather than
    retro-fitted to an old one: under a denylist schema a freshly-added column is client-settable BY
    DEFAULT.
    **THE PAIRING IS SERVER-VERIFIED, NEVER CLIENT-TRUSTED (§14 posture).** On both live write rails
    — `POST /api/trips/:tripId/itinerary-items` (the `server/routes.ts` monolith copy, which
    registers first and SHADOWS the `trips.routes.ts` twin) and
    `PATCH /api/trips/:tripId/itinerary-items/:itemId` (`trips.routes.ts`, the serving copy) — a
    non-null `userExperienceId` is resolved against the DB and REFUSED with a 400 unless the
    `user_experiences` row exists AND its `trip_id` equals the route's `tripId`. ONE implementation
    (`server/services/item-event-link.service.ts`), two callers — a second copy of the same
    admission decision is the derivation-drift class §18 rule 1 names. Writes gate on the same §12
    advisor WRITE statuses as every other item mutation. The shadowed POST twin is ANNOTATED, not
    duplicated (the migration-275 precedent).
    **READ EXPOSURE ONLY, no grouping UI in this lane:** `GET /api/trips/:tripId/itinerary-items`
    carries the column on each row, the plancard activity DTO carries it present-only-when-set, and
    the plancard payload gains an `events` array (the trip's `user_experiences` rows) behind the
    same owner/advisor/author gate the plancard already has. Grouping the slip by event is a
    separate lane.
    **THE EVENT IS ALSO THE BUDGET UNIT (ledger `2026-09-04-event-budget`; NO schema change — the
    pre-existing nullable `user_experiences.budget` is the home):** a budget is stated PER EVENT on
    the slip and never at intake, and the PLAN's total is DERIVED from those rows by one pure helper
    and never stored (a second stored number is free to disagree with the rows it summarises, §18
    rule 1); NULL = NOT STATED ⇒ the total line is OMITTED, never "$0" (§13); it is the traveler's
    own planning statement, read by NO charge/fee/payout/rate path (§14), and a PAYER — a money
    identity — is deliberately not modelled.

30. **A PLAN CARRIES ITS OWN TIMEZONE, AND ITS EVENTS SURVIVE BEING PLANNED BEFORE IT EXISTS
    (decision-maker ratified Sep 3, 2026 — ledger `2026-09-04-plan-mint`; migration 279).** One
    lane, because both halves are decided at the SAME moment: when a `trips` row is born.
    **(a) `trips.timezone` — ONE IANA zone per plan.** Until now nothing on a trip said what zone
    its times were in (`vendors.service_timezone` is a provider's own operating zone and is
    unrelated), so `server/utils/ics-calendar.ts` emitted `DTSTART`/`DTEND` with no TZID and no
    `Z` — RFC 5545 **floating time**, which every calendar client renders in the *reader's* own
    zone. A 16:00 ceremony in Tuscany showed as 16:00 in Sydney. `itinerary_items.start_time` /
    `end_time` stay `varchar(10)` **WALL-CLOCK strings and are never converted** — the column
    added here is the zone those strings are READ IN, not a re-encoding of them; no stored value
    moves and no backfill runs. Additive nullable `varchar(64)`, **NO DEFAULT, NO CHECK** (the
    publish-trap posture, migrations 181/195/273/275/276/277 — the IANA value set is
    app-enforced), **declared in `shared/schema.ts`** per the deploy-push durability rule.
    **NULL = NOT CAPTURED, and the .ics then keeps EXACTLY today's floating output with the
    reason said out loud (§13)** — never UTC, never the server's zone, never the nearest guess;
    a wrong zone is worse than an honest floating time because it looks authoritative.
    **THE ZONE IS SERVER-DERIVED, NEVER CLIENT-SETTABLE (§14 posture applied to a
    render-affecting fact).** `insertTripSchema` `.omit()`s it beside `marketSlug`, and
    `storage.createTrip`/`updateTrip` derive it from `trips.destination` exactly as they already
    derive `market_slug`. The derivation is ONE module — `server/services/trip-timezone.ts`,
    `resolveTripTimezone()` — which is a **LAUNCH-MARKET LOOKUP, NOT A GEOCODER**: it resolves the
    destination through the existing `resolveMarketSlug` and reads the existing `MARKET_TIMEZONES`
    map for the 8 operating markets. **No network call, no third-party lookup, and no new city
    list** (§13 forbids a second hardcoded one). A destination outside the 8 returns NULL. It is
    deliberately NOT `timezoneForMarket()`, whose "UTC for an unknown market" answer is right for
    the demand rollup's grain and wrong here — for a plan, UTC would be a claim.
    **A PLAN ALSO SAYS WHETHER ITS DATES WERE CHOSEN (amended Sep 15, 2026 — ledger
    `2026-09-15-d22-dates-confirmed`; migration 302).** `trips.start_date`/`end_date` are NOT NULL,
    so 42 D12's "no mint may invent a date" cannot be enforced by the schema alone: the ready-made
    clone, the two expert authoring builds and several cart mints fill a window in because the
    columns demand one. `trips.dates_confirmed_at` is the fact that tells those apart — additive
    nullable, NO DEFAULT, NO CHECK (the publish-trap posture), declared in `shared/schema.ts`, NO
    BACKFILL. **NULL = NOT CONFIRMED, and never "no dates"** (the plan HAS a window; nobody chose
    it): every reader labels it a PLACEHOLDER, the `.ics` keeps this ruling's FLOATING output rather
    than pinning an instant to a day nobody picked, and 45 (6)'s countdown is withheld — a pinned
    instant needs a real DAY as much as a real ZONE. **SERVER-DERIVED, never client-settable (§19,
    the same posture as `timezone` and `market_slug`):** `insertTripSchema` omits it and no pick
    re-admits it; `storage.createTrip` takes the MINT SITE's own `datesChosenByTraveler` — **opt-in,
    so a mint that says nothing makes no claim** — and `storage.updateTrip` stamps `now()` on any
    date change, which is the ONE re-date rail (the owner-gated `PATCH /api/trips/:id`, whose first
    client caller is the slip header's owner-only "Set your dates", 42 D16). The reader-side
    derivation is ONE module, `shared/plan-dates.ts` (§18 rule 1). **Availability revalidation on a
    re-date is NOT part of this and is not built** — it has no read half yet, and saying so is the
    honest half of shipping without one.
    **(b) The pending-events pen is DRAINED at mint.** `2026-09-03-switch-readers` shipped the
    "What's happening" chips and stated its own gap: with no trip row yet, ticked chips are HELD
    in `trip_contexts` as `pendingEventTitles` and nothing ever promoted them, so a traveler who
    chose their events before the plan existed lost them. At mint the pen is drained — **one held
    title ⇒ ONE `user_experiences` row bound to the new trip** (entry 29: an event IS a
    `user_experiences` row; no new artifact type) — through **ONE implementation**,
    `server/services/pending-events.service.ts`, called from every mint site (a second copy of
    this decision is the derivation-drift class §18 rule 1 names). Rules that must not be
    weakened: the write reuses the SAME owner-scoped `storage.createUserExperience` the
    `.pick()`-allowlisted `POST /api/user-experiences` uses, with `userId` from the mint's own
    owner and the trip owned by construction — the route's ownership rule is never bypassed;
    **a failed drain NEVER fails the trip mint** (logged, pen left intact — §15b's "an
    ancillary effect may not break the operation that authorizes it"); draining is **idempotent**
    (an existing same-title event on that trip is skipped, and the pen is cleared on success, so
    a second run creates nothing); and **an occasion that does not resolve is not invented** —
    `user_experiences.experience_type_id` is NOT NULL, so when the held context names no
    resolvable `experience_types` row the drain creates NOTHING and leaves the pen for a later
    mint (§13), rather than filing the traveler's events under a nearest-looking occasion.
    **Drained at traveler-owned mints only:** `storage.createTrip` (every door that funnels
    through it — R-B), the AI snapshot (`saveGeneratedItinerarySnapshot`) and the two
    `booking.service.ts` raw-SQL mints (cart auto-trip, saved-trip conversion). **NOT** at the
    expert **authoring** builds (`ready-made.routes.ts`, `expert-workspace.routes.ts` — `userId`
    is NULL by design, there is no traveler principal whose pen it could be) and **NOT** at the
    ready-made **clone** (the buyer bought a fixed plan; injecting their own held chips into a
    purchased product is content they did not ask that plan to carry). Those four still take the
    timezone — every mint site stamps the zone; only the traveler-owned ones drain the pen.
    **THE PEN IS NOT THE AUTHOR OF THE EVENTS THE PLAN MODAL ITSELF COLLECTED (amended Sep 6,
    2026 — ledger `2026-09-06-event-mint-dedupe`).** Both wrote them: the drain inside the mint,
    and `PlanModal.commitPlan` a moment later against rows SEEDED FROM THAT SAME PEN — so a
    "Build it myself" finish carrying a pen created every ticked event TWICE (a Kyoto wedding came
    back holding "Ceremony, Reception, Ceremony, Reception"). **THE MODAL IS THE AUTHOR** of the
    events it collected — it holds the occasion resolved on screen, which the drain can only guess
    at from a stored slug, and it honours an untick the pen still remembers — so the finish
    **RELEASES its own pen server-side, awaited, BEFORE it mints** (`releasePendingEventsPen`,
    `client/src/lib/trip-context.ts`; a release that lands after `POST /api/trips` is no release
    at all). Everything above is otherwise UNCHANGED: the drain keeps its whole job for every
    OTHER mint door and for a pen the modal never comes back for, it stays idempotent, it still
    never fails the mint, and it still creates nothing for an unresolvable occasion. The surviving
    writer is idempotent too — `commitPlan` creates only what the plan does not already carry —
    through the ONE identity rule `eventsNotYetOnPlan` (`shared/plan-events.ts`), which the drain,
    the modal and the slip's "Organize into events" all call (§18 rule 1). **NO UNIQUE index and
    NO DB CHECK was added** (publish-trap posture), and nothing dedupes in a reader.
31. **An occasion NAMES THE ROLES IT NEEDS, and the names come from the taxonomy authority — never a
    new vocabulary (decision-maker ratified Sep 4, 2026 — ledger `2026-09-04-roles-needed`;
    migration 280).** `experience_types.roles_needed` is a `text[]` of
    **`service_categories.category_key`** values: the answer to "who do you hire for a wedding?" is
    florist, photographer, caterer, officiant — and every one of those already exists as a category
    key. The column is a POINTER INTO THE EXISTING CATALOG, not a third one: CLAUDE.md's FAQ refuses
    a new service table and §4 refuses to merge the two offering catalogs, and referencing one
    violates neither. **The taxonomy REGISTRY is the authority** — `TAXONOMY_MIGRATIONS` in
    `scripts/lib/taxonomy-registry.cjs`, today `034` (24 rows) and `285` (`venue`) — and it, and
    nothing else, defines the legal value set. **A new category is a REGISTRY ENTRY plus a
    migration, never an ad-hoc INSERT** (amended Sep 4, 2026 — ledger `2026-09-04-venue-category`;
    this entry originally read "migration 034 is the sole taxonomy authority", true only for as
    long as 034 was the only assigner). ONE list, required by both reachability guards and by
    `shared/__tests__/roles-needed.test.ts` R3 — a second copy is the derivation-drift class §18
    rule 1 names, and the registry refuses a `category_key` claimed by two migrations (a fork, not
    a union). The four `aff_*` keys are affiliate SOURCES, not hireable roles, and are excluded: an
    occasion never "needs an `aff_air_hotel`". That leaves the 21 discipline keys.
    **A KEY THAT IS NOT REACHABLE IS THE BUG THIS COLUMN IS MOST LIKELY TO CAUSE, so it is guarded
    at CI.** `scripts/check-roles-needed-reachability.cjs` fails when any key in the seeder is not
    assigned by a registry migration. This is the SAME failure `check-category-reachability.cjs` exists for
    (ledger `2026-09-04-taxonomy-reconcile`), one table over: that guard exists because a
    `category_key`-less row is a dead taxonomy that *looks* live, and it has already bitten twice
    (`custom-other`; the ten `services-*` bundle rows). A `roles_needed` naming a key no category
    carries would render a hire prompt that resolves to no provider — the same dead-but-live-looking
    shape, arrived at from the other direction. The guard carries committed `--self-test` fixtures
    (§18d) and states its negative space: it checks REACHABILITY of the key, not whether any
    provider has actually listed in that category in a given market. Supply is a §13 honesty
    question for the reader, not a taxonomy question.
    **NULL = NOT SET ⇒ the reader omits the prompt and says why (§13).** Additive, nullable, **NO
    DEFAULT and NO DB CHECK** (the publish-trap posture — migrations 181/195/273/275/276/277/279;
    the value set is APP-enforced), **declared in `shared/schema.ts`** per the deploy-push
    durability rule. NULL is never rendered as "this occasion needs nobody", which is a claim only
    a planner can make. An EMPTY array is deliberately NOT introduced as a second empty state: two
    ways to say nothing is how a reader ends up guessing which was meant.
    **WRITES ARE ALLOWLIST-ONLY AND THE SEEDER IS THE ONE AUTHOR (§19).**
    `experienceTypeRolesSchema` is `.pick()`-based; no writer route exists in this lane. The seeder
    writes by **UPDATE keyed on `slug`**, idempotent and stale-only, exactly as
    `updateExperienceTypeSwitches` does for ruling 28's six switches — a second author of the same
    column is the derivation-drift class §18 rule 1 names. `roles_needed` is deliberately **NOT a
    seventh switch**: ruling 28's six are booleans and enums a traveler flips inside the plan, while
    this is a catalog reference list, and blurring them would invite a CHECK over a `text[]`.
    **READ EXPOSURE ONLY in this lane.** The hire-an-expert-per-event flow and the WhichEvent
    picker's role hint — the two surfaces this unblocks, both shipped deliberately blank — are
    separate lanes. This one gives them something true to read.

    **A REGISTRY MIGRATION MAY ALSO REPAIR AN EARLIER ONE (amended Sep 6, 2026 — ledger
    `2026-09-06-category-key-repair`; migration 289).** A stamped migration NEVER re-runs, so a
    migration that was WRONG when a database applied it stays wrong on that database forever, even
    after the file on disk is corrected. Migration 034 is that case: its original
    `UPDATE … WHERE slug` form assigned nothing where a slug did not match and nothing where the
    legacy row was absent, and although it was later repaired to an UPSERT, **production still
    carries the pre-repair outcome** — 27 `service_categories` rows, exactly two with a
    `category_key` (`custom_other`, `venue`), and no row at all behind `caterer` or `officiant`. So
    every `roles_needed` key but `venue` names a category the catalog does not carry, and the role
    chips (ruling 42 D6) resolve to nothing. **289 assigns EXACTLY 034's 24 keys and no others** —
    never `venue`, never a key of its own — matching an existing row by SLUG, then by
    `lower(btrim(name))`, then INSERTing 034's canonical row only where NEITHER identifier is on the
    table. Every write is guarded by `category_key IS NULL` (an admin-tuned band, copy or partner key
    is never clobbered) and a second run is a byte-for-byte no-op. It is **DATA ONLY — no ALTER, no
    CHECK, no index, no DEFAULT change** — so `scripts/preflight-prod-constraints.cjs` needs no new
    manifest entry and the deploy push has nothing to fail on. Because the registry refuses a
    `category_key` claimed by two migrations, 289 is registered as a **REPAIR** — `TAXONOMY_REPAIRS`
    in `scripts/lib/taxonomy-registry.cjs`, `<repairing file> → <repaired file>` — whose pairs must
    all already be claimed by its target and which CLAIMS nothing, so the taxonomy union is
    unchanged; the identical file undeclared still fails as a duplicate, because **the declaration is
    the licence, not the file's own say-so**. **§13, and it is the load-bearing half:** a row whose
    slug AND name have both drifted is UNREACHABLE by this repair — 289 would create 034's canonical
    row beside it — so that case is handed to a human by the read-only
    `scripts/preview-category-key-repair.cjs`, run against the real database BEFORE publishing. It
    does no fuzzy matching and offers no suggestions: a guess presented as a finding is how the wrong
    row gets keyed.

32. **NO EXPERT TOUCHPOINT EXISTS WITHOUT A SLIP; the slip is the intake, and the expert reads it
    LIVE (decision-maker ratified Sep 4, 2026 — ledger `2026-09-04-slip-precondition`).** The
    traveler enters the basics on the Trip/Plan slip, that mints the `trips` row, and only then can
    an expert be hired or view the stated plan. This is a PRECONDITION, not a drain: no code ever
    mints a trip from a lead, and no NEW author of `trip_expert_advisors` is introduced (the row
    already has six insert sites on `main` — see the correction below). It is what the
    schema already says (`trip_expert_advisors.trip_id` NOT NULL; `trips.start_date`/`end_date`
    NOT NULL, never invented — §13) and what the expert-request handler already states ("slip
    content is NEVER copied into the jsonb — the workspace reads the trip LIVE"); rail 2 already
    treats the `tripId` as "what authorizes the expert's plan-snapshot view". The ruling makes the
    two callers that violate it conform, and names the one missing piece.
    **(a) The `template_inquiry` lead (`experience-template.tsx`) MUST mint the slip first**, from
    the basics that page already collects (destination, dates, travelers — the same door the
    ladder's "Plan it myself" opens), and only then request. A lead with no trip today gets an
    expert stamped on `expert_requests.assigned_expert_id` and NOTHING else — the advisor row,
    notification and Assigned Trips entry all sit inside `if (tripId)`, the admin confirm path
    refuses it (`400 "Request has no associated trip"`), completion is a status flip plus a money
    split, and the traveler's POST is fire-and-forget behind a bare `catch {}`. It surfaces to no
    one. Where the page's dates are absent, the traveler is ASKED — never a guessed date.
    **(b) A storefront request (`POST /api/expert-booking-requests`) REQUIRES a `tripId`.** A
    traveler without a slip is sent to make one through the existing ladder and returns with
    `?tripId=` (the handoff `expert-detail.tsx` already implements). The request then creates the
    advisor row the same way a routed lead does — one implementation (`ensureTripAdvisorRow`), one
    more caller; a second copy is the derivation-drift class §18 rule 1 names.
    **(c) THE MISSING PIECE is CHOOSING.** The slip hires only by auto-route today (`EscalationCTA`).
    "Hire an expert" from the slip means slip → event → `experience_types.roles_needed` (Locked
    Decision 31) → a picker of experts in those roles → the same advisor-row author. That is the
    hire-an-expert-per-event flow, and it is a separate lane; this ruling gives it its
    precondition.
    **CORRECTION (same day, found by lane c):** this entry first said the advisor row "keeps its
    single author". That was FALSE. On `main` `trip_expert_advisors` is inserted from six
    production sites — `ensureTripAdvisorRow` and `assignExpertAdvisor` (both
    `booking-actions.service.ts`), `confirmLeadAssignmentTx` (`admin-query.service.ts`),
    `admin.routes.ts`, `ready-made.routes.ts`, `storage.ts` — and the UNIQUE (trip_id,
    local_expert_id) index is the only thing keeping them consistent. The ruling's intent stands
    unchanged: lanes (b) and (c) add CALLERS of `ensureTripAdvisorRow`, never a seventh insert.
    Consolidating the six is a separate lane and a §18-rule-1 debt, recorded here, not fixed.
    **THAT DEBT IS NOW PAID (ledger `2026-09-04-advisor-row-one-author`).** The ONE author is
    **`upsertTripAdvisorRow` in `server/services/booking-actions.service.ts`**; the other five
    sites are CALLERS, and `ensureTripAdvisorRow` survives as the invite-shaped wrapper over it
    (its four callers are untouched). It takes an optional drizzle `tx` handle so a caller already
    inside a transaction writes the row inside it. **A CONFLICT NEVER DOWNGRADES:** one atomic
    `INSERT … ON CONFLICT (trip_id, local_expert_id) DO UPDATE` — the statement is the guard
    (§15), never a check-then-insert — in which `status` moves only UP a rank ladder
    (`accepted`/`assigned` rank 2, `pending`/`rejected` rank 1, NULL/unknown 0), equal rank is a
    no-op (so every caller is idempotent by construction), `rejected` sits at `pending`'s rank so
    a re-invite cannot clear a refusal while a deliberate grant still outranks one, `message` is
    `COALESCE(existing, incoming)`, and **nothing else is touched** — `workspace_status`,
    `assigned_at`, `expert_response` and the plan-approval columns are insert-only there. The
    ladder is written down ONCE (`server/utils/trip-advisor-status.ts`) and the upsert's SQL
    `CASE` is GENERATED from it. Guarded by `scripts/check-advisor-row-author.cjs` (own CI job,
    committed `--self-test` fixtures, §18d): no `.ts` under `server/` outside the author file may
    insert this row. It catches inserts, not updates — the guard states its own negative space.
    No schema change, no migration.
    **Callers now include the concierge read grant** (ledger `2026-09-20-concierge-plan-read`,
    §51) — `grantConciergePlanRead` is one more CALLER of this ONE author, never a new insert site.
    **Side findings recorded, not fixed here.** The first two are now **FIXED** by ledger
    `2026-09-04-golf-occasion-and-housekeeping`: (a) `expertAdvisorStatusEnum` in `shared/schema.ts`
    omitted `assigned`, which code writes and gates on (no DB CHECK — verified against every
    migration — so it worked; the enum was stale), and `assigned` is now declared; (b)
    `/api/expert/assigned-trips` was defined in both `booking-actions.ts` and `experts.routes.ts`
    with the first shadowing the second, and the dead `experts.routes.ts` twin — which was also
    status-blind — has been DELETED, leaving the `booking-actions.ts` copy as the one definition.
    Still open: `optimization_context.planSnapshot` is written and never read; the template page
    re-POSTs a lead on every snapshot change.
33. **ONE PLANNING MODAL, MANY DOORS (decision-maker ratified Sep 4, 2026 — ledger
    `2026-09-04-one-modal-many-doors`; option 1).** There is exactly ONE planning modal: the five
    ratified steps **Occasion → Where → When → Who → What's happening** (`docs/design/wedding-flow/`
    `Step1Occasion` / `Step2Where` (formerly `ModalWhere`) / `Step3When`/`Step3Day`,
    `Step4Who`/`Step4Variants`, `Step5Events` (formerly `ModalEvents`) — renamed by ledger
    `2026-09-04-golf-occasion-and-housekeeping`, which resolved the "the filename hides that this IS
    step 2" note this entry originally carried). The OPENER is unchanged: every door still goes
    through `usePlanning().open(source)` (ruling `2026-08-28-single-planning-entry`); what it
    RENDERS changed, and this entry **supersedes that ruling's chooser SCREEN only** — the
    single-opener rule stands untouched, and so does `scripts/check-planning-entry.cjs`. The
    Trip-Strip edit panel (`edit-trip-panel.tsx`) was RENAMED to `PlanModal`, not copied: it already
    owned the ONE save (context write, `PATCH /api/trips/:tripId/occasion`, the main-moment anchor,
    the per-event `user_experiences` rows, the pre-trip pen), and a second component with a second
    save is the drift class §18 rule 1 names. Its three former importers — the Trip Strip, the cart
    header, the experience-template page — now open it through the opener, so the modal has ONE
    mount.
    **DOORS DIFFER IN TWO THINGS ONLY: what arrives pre-filled, and which step opens first.** That
    decision is ONE pure function, `resolvePlanSteps` (`client/src/lib/plan-steps.ts`, unit-tested):
    hero / `/start/events` / marketplace → **step 1**; a Moment, the nav Wedding row or an
    experience CTA carrying an occasion → **step 2** with an "<Occasion> · change" pill; a
    city/destination **pre-fills** step 2 and never skips it; the Trip Strip's Edit → step 1 or 2 by
    what the plan already holds, with every visible step reachable from the rail. Ready-made
    purchases are untouched and still go straight to the slip.
    **THE SKIP IS KEYED ON THE RESOLVED ROW, NOT A STRING (§13).** A door naming an occasion the
    catalog cannot resolve does NOT skip — the question is asked rather than hidden under a pill
    nothing could fill. Step 5 is visible only when `showsSchedule(row)` is true (NULL ⇒ not shown,
    the plain-plan shape); steps 2 and 3 are NEVER skipped (`destination`/`start_date`/`end_date`
    are NOT NULL); step 4 is always visible and always skippable — untouched ⇒ NULL, never 2.
    **THE CHOOSER'S THREE WAYS TO BUILD ARE THE FINISH of the last visible step, not a sixth step
    and not a first one:** you say what you are planning before you say who should build it. A
    `source.branch` deep-open (the pricing ladder rows, the Moments CTA) still runs every step and
    shows only that one CTA. Each branch's downstream behaviour is unchanged, sign-in gates
    included; the Plus `occasion` branch stays reachable as a fourth finish CTA, and stays HIDDEN
    while `PLUS_SALES_ENABLED` is off.
    **HELD / NOT BUILT, deliberately:** step 2 stays ONE destination — the Step2Where "add another
    stop" control is OMITTED, not disabled, because ordered stops need a `trip_destinations` table
    that does not exist (`WEDDING_FLOW_BUILD_SEQUENCE.md` §0 F4); the Step4Variants corporate
    budget-approver and family accessibility fields are NOT built (no column holds either — a
    separate decision, and deliberately NOT `trip_participants.accessibility_needs`, §24).
    **NO SCHEMA CHANGE.** Step 4 writes the EXISTING `trips.adults`/`trips.kids` (de-masked by
    migration 241) through the EXISTING owner-gated pick-based allowlist on
    `PATCH /api/trips/:tripId/occasion`, extended by exactly those two nullable integers (§19
    shape — no new route, no second admission rail); `travelers` stays DERIVED from the pair by one
    `partyTotal`, so the Trip Strip's chip and the columns cannot disagree.

34. **A PLAN'S STOPS ARE ORDERED CHILD ROWS, AND `trips.destination` IS THEIR POSITION-0 MIRROR
    (decision-maker ratified Sep 4, 2026 — ledger `2026-09-04-stops-and-event-time`; migration
    281).** `trip_destinations` is the child-row home for a plan's ordered stops, on the
    `service_route_points` pattern (ruling 22, itself the `dmo_extracted_places` pattern): FK →
    `trips(id)` **ON DELETE CASCADE**, `UNIQUE (trip_id, "position")`, an index on `trip_id`, and
    **table + UNIQUE + index all declared in `shared/schema.ts`** (deploy-push durability rule — an
    object that file does not declare is dropped at publish and never recreated). Additive, **NO DB
    CHECK** (publish-trap posture, migrations 181/195/273/275/276/277/279/280); shape is
    app-enforced by a pick-based allowlist (§19).
    **`trips.destination` STAYS and is NOT deprecated.** It is the single string every existing
    reader uses and it stays NOT NULL, so it is the **POSITION-0 MIRROR** of the list: when the list
    is written, position 0's `name` IS `trips.destination`. Positions are **0-based** here (unlike
    route points' 1-based pins) precisely because of that. The mirror is enforced in the **ONE
    writer** and deliberately **NOT by a trigger** — a trigger would be a second author of
    `trips.destination` (§18 rule 1) and could not re-run the `market_slug`/`timezone` derivations
    that hang off it (ruling 30), which is why the mirror is written **through
    `storage.updateTrip`**.
    **ONE WRITER, OWNER-GATED, REPLACE-LIST.** `PUT /api/trips/:tripId/destinations` →
    `server/services/trip-destinations.service.ts` `replaceTripDestinations`. Owner-gated
    (`verifyTripOwnership`, fail-closed) and deliberately **NOT the §12 advisor posture**: stops are
    the plan's IDENTITY — they move its market, its zone and its headline destination — not its
    contents. Positions are derived server-side from array order; `position`/`id`/`tripId` are not
    in the allowlist, which is `.strict()` and **refuses** an unknown key rather than silently
    stripping it. Cap 20. Child rows replace in ONE transaction under a `FOR UPDATE` lock on the
    parent (the route-points race).
    **§13 — THE ABSENCES ARE ANSWERS.** **No rows = NOT CAPTURED**: there is no backfill
    (manufacturing a position-0 row for every legacy trip would turn "we never asked" into "the
    traveler said one stop"), and every reader falls back to `trips.destination` **explicitly and
    says so** — never "this plan has nowhere to go". **lat/lng NULL = UNLOCATED**: the stop stays
    visibly flagged and is never guessed onto a map (no city-center fallback, no geocode-on-read); a
    HALF coordinate is refused. **An EMPTY list is a 400** — `trips.destination` is NOT NULL, so zero
    stops is not a state the schema can hold. **READ EXPOSURE ONLY in this lane:**
    `GET /api/trips/:id` (the `trips.routes.ts` copy — the monolith's inline twin was already
    removed and is annotated so it is not re-added) and the plancard payload each carry
    `destinations: [...]` behind their existing gates. The stop-list UI is a separate lane.
    **The client rail landed with ledger `2026-09-04-plan-stops-ui`:** `default_stops` finally has
    a reader (`stopsShape`, NULL ⇒ `one`), the plan modal's step 2 is that ordered list under
    `many` (row 1 IS the destination field), the location-mismatch alert compares EVERY stop and
    can add the listing's city as one, and both surfaces write through the single client writer
    `client/src/lib/plan-stops-writer.ts` — never a second rail, and never a list the caller did
    not first read.

35. **AN EVENT CARRIES ITS OWN WALL-CLOCK TIME, AND THE PLAN'S MAIN MOMENT STAYS AN ANCHOR
    (decision-maker ratified Sep 4, 2026 — ledger `2026-09-04-stops-and-event-time`; migration
    282).** An event inside a plan is one `user_experiences` row (ruling 29). It already carried
    `event_date` — the DAY — and nothing at all for the TIME OF DAY, so "ceremony at 15:00" and
    "tee time 07:40" had no column and the flow never asked. `user_experiences.start_time` is
    additive nullable `varchar(5)`, **"HH:MM" WALL-CLOCK, stored verbatim and NEVER converted** —
    the same posture `itinerary_items.start_time`/`end_time` take. The zone it is **read in** is the
    plan's `trips.timezone` (ruling 30); where that is NULL the time is honestly zone-less and a
    reader keeps its zone-free behaviour rather than substituting UTC or the server's zone (§13).
    **NO DEFAULT, NO DB CHECK** (publish-trap posture), **declared in `shared/schema.ts`**.
    **NULL = NOT SET, and is NEVER rendered as midnight or "all day"** — both are claims nobody
    made; a reader shows the day and no time.
    **IT IS NOT THE PLAN'S MAIN MOMENT.** That stays a `temporal_anchors` row written by the plan
    modal's existing path — ONE anchor for the plan's centre of gravity. This is the start time of
    ONE event among the several a plan can hold. Do not merge or re-point the two.
    **ADMISSION IS THE EXISTING ALLOWLIST, EXTENDED BY ONE FIELD (§19).** `userExperienceBodySchema`
    (`content.routes.ts`) is already `.pick()`-based and already shared by `POST /api/user-experiences`
    and its PATCH; `startTime` is added to **that** pick rather than given a second admission rail.
    The format authority is `userExperienceStartTimeSchema` in `shared/schema.ts`, stated ONCE and
    `.extend()`ed onto the field — a re-stated regex at the route is the drift §18 rule 1 names. It
    is a **SHAPE check only**: `^\d{2}:\d{2}$`, and **range is deliberately NOT validated** ("25:00"
    parses) because nothing reads or does arithmetic on the value yet and a range rule invented by
    an admission schema becomes a second authority the day a real time model arrives. **READ
    EXPOSURE ONLY:** `GET /api/user-experiences` (full-row select — it rides automatically) and the
    plancard `events` array carry it as-is. The `.ics` export is **untouched** in this lane; events
    are not exported today, and if they ever are, the floating-time posture holds until a zone is
    captured.
    **THE CLIENT RAIL LANDED WITH LEDGER `2026-09-04-event-time-ui`:** step 5's ratified Day · Time ·
    Place table, the `WhichEvent` / slip clock line (ONE derivation, `eventMetaLine`, reading
    `start_time` and never `event_date`), an owner-only time edit on the slip's event header through
    the SAME `/api/user-experiences/:id` PATCH (no second rail), the pre-trip pen widened from
    `pendingEventTitles: string[]` to `pendingEvents: {title, eventDate?, startTime?, location?}[]`
    (the old key read for one release, both cleared together), and `start_time ASC NULLS LAST` added
    as a tie-break AFTER the date in BOTH storage readers. A day or place the traveler did not answer
    inherits the PLAN's at CREATE through ONE shared `planEventRowValues` (`shared/plan-events.ts`);
    the TIME inherits nothing, and NULL is still never midnight. Events remain unexported to `.ics`.

36. **Planner roles live in the EXPERT catalog, and the Event Planner track is partitioned by an
    explicit KEY LIST on both sides (decision-maker ratified Sep 4, 2026 — ledger
    `2026-09-04-earn-planner-roles`; migration 283).** The /earn Event Planner card listed
    `service_offering_types` rows — the PROVIDER catalog — while its "I plan & coordinate events"
    door went to the expert application, whose `local_expert_forms.offering_type_key` FKs into
    `expert_offering_types` (migration 107). That table held NO planner rows, so every key the door
    carried was clamped to NULL by `storage.createLocalExpertForm` — **silently**. Six rows now fill
    the gap (`wedding_planner`, `wedding_day_of_coordinator`, `proposal_planner`, `party_planner`,
    `corporate_event_coordinator`, `date_night_designer`), all in the **EXISTING `coordination`
    tier**: `service_tier` carries a DB CHECK over five values and a sixth is exactly the
    publish-time drizzle-push failure the Coordination Prevention rules warn about. **The two
    catalogs are still never merged (§4)** — the card lists BOTH, provider categories for the event
    VENDORS and expert keys for the event PLANNERS, and a row carries which side it came from
    because the tables have separate key namespaces (`proposal_planner` is a row in each, and
    /start/events forwards `?offeringTypeKey=` to whichever door the person picks).
    **A tier cannot make this split, so an explicit list does:** `EVENT_PLANNER_OFFERING_KEYS`
    (`client/src/lib/earn-roles.ts`), checked BEFORE the tier mapping, and guarded both directions
    by `scripts/check-earn-planner-keys.cjs` (committed `--self-test` fixtures, stated negative
    space — §18d). Same ruling: **`specialized` moves to Trip Planner** (Local Expert keeps
    `advisory` + `live_support`), so relocation/pet-travel/content-scout consults stop landing in a
    wizard whose required steps are a locality proof and a born-and-raised claim. The expert
    application's role picker **reads the same rows live** and restates no names; and **the clamp
    is now visible, never silent** — the NULL fallback stays (an application must not fail) but it
    is `logger.warn`ed with the form id and the route returns `offeringTypeKeyUnrecorded` so the
    applicant is told, because a refused answer and an absent one are different facts (§13).

37. **THE GUEST LIST BELONGS TO THE EVENT; THE PLAN'S ROSTER IS DERIVED (decision-maker ratified
    Sep 4, 2026 — ledger `2026-09-04-guests-per-event`). NO SCHEMA CHANGE.** An invite already
    belongs to ONE event (`event_invites.experience_id` → a `user_experiences` row, ruling 29) and
    a plan holds many events (`user_experiences.trip_id`, no uniqueness), so the plan-level list is
    **computed, never stored**: ONE row per PERSON, deduplicated by **normalised email** (lowercase,
    trimmed), with ONE COLUMN per event carrying that event's own RSVP —
    attending / declined / pending / **not_invited**, and those last two are deliberately different
    answers. There is **NO name matching and no fuzzy match of any kind** (ledger
    `2026-09-04-guest-list-reconciliation` refuses it), so a guest with no email is its OWN row and
    is never merged. ONE implementation, `server/services/plan-guest-roster.service.ts`
    (`buildPlanGuestRoster`, pure) behind `GET /api/trips/:tripId/guests`; event ORDER stays
    `storage.getUserExperiencesByTrip`'s (`2026-09-04-event-order`) and is never restated (§18
    rule 1). The gate is the shared **owner tier** (`authorizeTripOwnerTier`), narrower than the
    plancard's, because the response carries guest emails and dietary notes — the PII class L20
    tier 4 keeps from an assigned expert. **`trip_participants` is the TRAVELLING PARTY, a different
    population under a different predicate, and is NEVER merged into this roster**; the unratified
    `trip_participants.event_invite_id` link is not built and is not needed. **§13: nothing is
    zero-filled** — an event with no invites still renders a column (every cell `not_invited`),
    `from`/`dietary` are blank when unstated (never "Unknown"/"None"), `totals.countries` is
    OMITTED rather than 0 when no origin country exists, and no event start TIME is emitted — **(corrected
    2026-09-04, ledger `2026-09-04-reaudit-fixes`)** not because the column is missing, which was this
    entry's original reason and stopped being true when migration 282 added
    `user_experiences.start_time` (Locked Decision 35), but because the ratified `Guests.dc.html` board
    draws none: it puts event times on the SLIP and the picker and keeps these columns to the event's
    name and its headcount. Do not start emitting times here without amending that board. Surface: `client/src/pages/plan-guests.tsx` at
    `/plans/:tripId/guests`; per-event invites keep their ONE writer (`GuestInviteManager`), and a
    `default_visibility: hidden` occasion has no guest surface at all (ruling 28, `SlipProposal`).
    **The TRAVELING PARTY now has its own surface (ledger `2026-09-04-plan-islands`):**
    `SlipTravelingParty`, a section on the slip beside "Guests & invites" that adds / edits /
    removes a `trip_participants` row (name, role, arrival, departure, accessibility needs,
    mobility level — never a money column, §14) through the EXISTING owner-gated participant
    routes, hidden under a `default_visibility: hidden` occasion exactly as Guests is; it says on
    screen that it answers "who is traveling" while the derived roster answers "who is invited",
    and the two are **still never merged**.

38. **STEP 4 ASKS A SECOND QUESTION, AND THE OCCASION'S OWN SWITCHES CHOOSE IT (decision-maker
    delegated Sep 4, 2026 — ledger `2026-09-04-step4-variants-fields`; migration 284).** Ruling 33
    shipped step 4 with a ruled omission — the Step4Variants artboard's corporate budget-approver
    and family accessibility fields were NOT built because no column held either. Migration 284 adds
    the three: `trips.budget_approver_name` (varchar 120), `budget_approver_email` (varchar 255) and
    `accessibility_note` (TEXT, app-capped at 2000). Additive nullable, **NO DEFAULT and NO DB
    CHECK** (publish-trap posture — migrations 181/195/273/275/276/277/279/281/282), no backfill,
    **declared in `shared/schema.ts`** per the deploy-push durability rule.
    **WHICH ONE IS ASKED IS THE ROW'S ANSWER, NOT A CLASS (ruling 28):** the approver pair when the
    party noun resolves to **"attendees"**, the note when **`default_guests` is explicitly true**.
    The two predicates live ONCE in `client/src/lib/plan-steps.ts` (`asksBudgetApprover`,
    `asksAccessibilityNote`) beside the door table, and the first DELEGATES to `partyNoun` rather
    than re-reading `vocabulary` — a second reading of that pair would drift from the label it sits
    under (§18 rule 1). **NULL = the question was never asked, a finished answer (§13):** every
    reader OMITS the row and never renders "no budget approver" or "no accessibility needs", which
    are claims only the traveler can make. `accessibility_note` is deliberately **NOT**
    `trip_participants.accessibility_needs` — that is one PARTICIPANT's stated needs about themself,
    a different person's answer on a different surface (the line ruling 24 drew for `access_notes`),
    and it is free text because no accessibility standard is claimed on anyone's behalf.
    **ADMISSION IS AN ALLOWLIST, AND THERE IS EXACTLY ONE RAIL EACH (§19):** the pick-based
    `tripOccasionBody` on the owner-gated `PATCH /api/trips/:tripId/occasion` (the rail
    `adults`/`kids` already ride — no new route) and, pre-trip, the hand-written `tripContextSchema`
    on `PUT /api/trip-context`. Both `.extend()` the SAME `shared/schema.ts` field schemas, so the
    pen and the row cannot disagree; `insertTripSchema` **omits all three**, because under an
    `.omit()` denylist a freshly-added column is client-settable BY DEFAULT and the mint body would
    otherwise be a second author. They reach the trip row at MINT the way the party pair does: the
    finish mints, then re-enters the ONE `commitPlan`, which PATCHes the new id.
    **HOME-CITY DEFAULT (step 2):** a day-shaped occasion (`default_duration = "day"` — a date
    night) pre-fills the destination from the signed-in member's `users.home_city`, read off the
    payload the client already fetches (`GET /api/auth/user`; `sanitizeUser` strips only the
    password and Instagram token, so no new route). **A SHOWN DEFAULT AND A CHOSEN VALUE ARE
    DIFFERENT FACTS (§13):** it is a visibly filled, clearable value that says out loud where it
    came from, and it is NOT written to the pen or the row until the traveler moves FORWARD past
    step 2 — one confirmation point (`goToStep`), offered once per open.
    **AUTHORING RELABEL:** an expert building for a client sees "Who is traveling with your client?"
    over "The client's party". It is an explicit `PlanningSource.authoring` flag passed by the door,
    **never inferred from the viewer's role** (an expert planning their own holiday is a traveler),
    it grants nothing, and no door sets it today — the expert authoring builds are server rails with
    no plan-modal surface yet.

39. **EVERY ADD SURFACE IS A VIEW OF `itinerary_items`, AND THE CART IS ONE OF THEM (decision-maker
    ratified Sep 4, 2026 — ledger rows `2026-09-03-slip-convergence`, `2026-09-03-trip-pdf`,
    `2026-09-03-plan-vocabulary`, `2026-09-03-expert-templates-consumer-sunset`). NO SCHEMA CHANGE.**
    There is ONE store of a plan's contents — `itinerary_items` — and every surface that adds to a
    plan (Discover, the slip, a service page, a ready-made clone, the AI rail) writes there. The
    **cart is the `ready_for_checkout` PROJECTION of that store, not a second store**: adding is a
    write to the slip, and carting is a STATUS CHANGE on a row that already exists. There is no
    separate cart table to reconcile, and no surface may invent one.
    **ONE COPY-DOWN.** `syncItemProjection` is the single place a booked service's facts are copied
    onto its item row, and it carries the slot and the stay dates (migration 275). A second copier —
    a route that spreads its own subset onto the row — is the derivation-drift class §18 rule 1
    names, and it is how a slip and a cart start disagreeing about the same booking.
    **A PLAN ITEM MAY CARRY A UNIT COUNT, AND NULL MEANS ONE (ledger `2026-09-15-d41-item-quantity`,
    migration 298; decision-maker D-41 = yes, sentence applied 2026-09-15).** `itinerary_items.quantity`
    is additive-nullable with no DEFAULT, no CHECK and no backfill, declared in `shared/schema.ts`.
    **NULL = ONE UNIT** — the item model's own historical shape, never 0 and never a guessed count
    (§13). It is written by `server/services/cart-projection.service.ts` and by nothing else, in BOTH
    directions: `syncItemProjection` carries the item's count onto the cart row, and both cart→item
    rails carry the line's count onto the item through the ONE shared `buildPlanItemValues`. That
    lifts D-16 (a) — the `quantity_gt_one` refusal is DELETED, not left unreachable (§18c) — because
    the round trip is now faithful above one unit. **There is ONE admission rule for units and it is
    D-14's** (ledger `2026-09-15-d14-quantity-is-units`): a traveler sets them on the CART LINE, where
    the archetype rule validates the question, and the item receives the count by PROJECTION;
    `insertItineraryItemSchema` omits the column and storage strips it (§19). A single-unit line is
    carried as NULL rather than 1, because `cart_items.quantity` is `DEFAULT 1` and writing it would
    turn "never asked" into "the traveler answered one". **A ready-made clone does not carry it** — a
    plan item's unit count is the BUYER's cart-line answer, and the author's count is not an answer
    the buyer gave. **It is a UNIT count, not a party count** — a plan item carrying a party size is a
    separate decision nobody has made — and checkout math is untouched: the money path still prices
    `rate × quantity` off the CART row.
    **THE TRIP-LESS GUEST CART IS SANCTIONED, and it is a FALLBACK.** A visitor with no plan yet
    still has somewhere to put a thing; that path stays until G2 (guest trips) replaces it, and G2
    is HELD as its own architecture (ledger `2026-09-04-held-decisions`). It is not a licence to
    build cart-only features off to one side.
    **"PLAN" IS THE UNIVERSAL NOUN.** Trip, itinerary and event are the shapes a plan takes; the
    word the traveler reads is *plan*, on every surface including the PDF. The retired
    `expert_templates` consumer lane is gone from this vocabulary entirely — `ready_made_trips` is
    the single store lane.

40. **`users.id` IS INTERNAL; AN EARNER'S PUBLIC IDENTITY IS THE HANDLE, AND CONTACT IS ADDRESSED BY
    CONTEXT (decision-maker ratified Sep 5, 2026 — ledger `2026-09-05-user-id-is-internal`;
    migration 287).** `users.handle` is the ONE public name of an earner — it is what `/s/:handle`
    already serves and what a person can be told out loud. `users.id` is an INTERNAL key: it is a
    join column and a session subject, not an address, and a surface that publishes it hands every
    client a durable cross-surface identifier for a person that the person never chose and cannot
    rotate. **Travelers and earners contact each other ONLY through platform channels** — there is
    no outbound contact link on a storefront, and this ruling adds none — and a channel is opened by
    naming **WHAT the conversation is about**, never by naming a row id.
    **THE THREE ADDRESS KINDS, and they are the whole set.** A conversation is opened by exactly one
    of: a **handle** (`{ handle }` — "I am writing to this earner because of their storefront"), a
    **service** (`{ serviceId }` — a public, `approval_status='approved'` listing, which resolves to
    its owner), or a **booking** (`{ bookingId }` — which resolves to the OTHER party of a booking
    the caller is already on). Each one is a claim the SERVER can check; a `receiverId` is not.
    **THE RECIPIENT IS SERVER-DERIVED — §14's identity rule applied to the OTHER END of the
    message.** §14 says a money endpoint derives the ACTOR from the session and never from
    `req.body`. The same reasoning binds the RECIPIENT of a platform message: a client-chosen
    counterpart id is an identity the caller picked, and it is what makes user ids worth harvesting
    in the first place. `POST /api/conversations/start` takes a `.strict()` **pick-based allowlist**
    (§19) of exactly one address kind plus an optional `about`, resolves the counterpart itself, and
    **returns no user id at all** — the recipient comes back as `{ handle, displayName, avatarUrl,
    verified }`. Self-messaging is refused, `isBlockedBetween` is honoured, and the SAME
    `checkMessageRateLimit` every other write path calls is applied with `isNewConversation` from
    `hasExistingConversation` — one limiter, one more caller, never a second throttle (§18 rule 1).
    **AN UNRESOLVABLE ADDRESS IS A 404, NEVER A 403 (§13 posture, the custom-venues precedent):**
    "no such thing" and "not yours" are the SAME sentence, so the rail cannot be used to probe which
    services or bookings exist.
    **THE CLIENT-VISIBLE CONVERSATION ID CARRIES NO USER IDS.** `buildConversationId` concatenates
    the two user ids, so the internal id IS the counterpart's id to anyone who sees it — a leak
    through the thread key itself, which no projection over the participant object would ever catch.
    `toPublicConversationId` is a keyed **HMAC-SHA256** over that internal id, truncated to 32 hex
    chars, and `resolvePublicConversationId` resolves it by walking the **SESSION USER'S OWN**
    conversation list and matching — so a public id is meaningless to anyone but the two people in
    the thread, and a non-participant holding one resolves nothing. The key is `SESSION_SECRET` (the
    secret the session cookie and the concierge claim-token HMAC already use — **no new required env
    var**); when it is absent the fallback is a **process-lifetime random** key, never a fixed
    literal, so an unconfigured environment yields ids that stop resolving after a restart rather
    than ids anyone can compute (**fail closed**: a wrong-looking id is refused, a guessable one
    would not be).
    **EVERY CONVERSATION RECORDS WHAT IT IS ABOUT.** `conversation_contexts` (migration 287,
    declared in `shared/schema.ts` per the deploy-push durability rule) is one additive table:
    `(conversation_id, context_kind, context_id)` UNIQUE, `context_kind ∈
    {storefront, service, booking}` **app-enforced with NO DB CHECK** (the publish-trap posture,
    migrations 181/195/273/275/276/277/279/280/281/282/284). It is written ONLY server-side by the
    start rail — its insert schema is `.pick()`-based (§19) and no client body ever reaches it — so
    the platform can see PRE-service traffic (a storefront enquiry, a question about a listing) and
    POST-service traffic (a thread about a booking) as different things. **NO BACKFILL: a thread
    with no context rows is an OLDER thread and renders honestly as having no context (§13)** —
    never as "storefront", which would be a claim nobody made.
    **SYMMETRY.** The rule is about publishing an id, not about which side of the marketplace the
    person is on: a traveler's `users.id` is internal for the same reason, and the same rails carry
    both directions of a thread. The earner's handle is public because an earner PUBLISHES a
    storefront; that is the only asymmetry.
    **THIS IS A THREE-LANE RULING, and lanes 2/3 are the rest of it, not optional polish.** Lane 1
    ADDED the server-resolved rails beside the existing ones and changed no client: every
    legacy id-based input keeps working, annotated `deprecated — removed after lane 3`, and
    `POST /api/chat`'s body-sourced `receiverId` warns ONCE PER PROCESS so the day clients stop
    sending it is visible.
    **LANE 2 HAS LANDED (the public projections and the guard — ledger
    `2026-09-05-ld40-lane2-public-ids`). THE STANDING RULE IS: A PUBLIC PAYLOAD NEVER CARRIES
    `users.id`, AND THE GUARD IS `check-public-user-id`.** Removed: `loadStorefront`'s `earner.id`
    (and with it the deprecated `/api/provider-storefront/:handle` twin, which delegates to the
    same builder); the `id` on every `GET /api/provider-storefronts` row, whose consumer keyed on
    it and now keys on the handle the query already guarantees (`handle IS NOT NULL`); the owner's
    `userId` on the public `GET /api/services/:id` detail, stripped ONCE at the top so all four
    product-shape branches inherit it; and `userId` on the unauthenticated `GET
    /api/provider-services` browse — **which also stopped publishing `revenueShareRate`, a §18
    rate-bearing column that ruling 42 stripped from the write rails and
    `2026-09-05-experts-public-projection` stripped from two other public reads, and that this
    third one was missed by both.**
    **A ROUTE THAT CAN ONLY BE ADDRESSED BY A USER ID IS WHY AN ID IS IN A PAYLOAD, so the ROUTE
    moves.** `service-detail.tsx` held `service.userId` for exactly one thing — the verification
    badge at `/api/providers/:userId/public-verification`. The badge is now addressed by the
    LISTING (`GET /api/services/:id/provider-verification`), which resolves the owner server-side
    behind the SAME F2 read-gate the detail read applies and answers ONE 404 for a listing that is
    absent, unapproved or paused (never a 403 — the `POST /api/conversations/start` posture). ONE
    implementation, `loadPublicVerification`, two callers (§18 rule 1); the user-addressed twin is
    annotated `deprecated` and goes one release later, so a cached SPA mid-deploy keeps its badge.
    **TWO EXPOSURES SURVIVE, EXEMPTED AND PRINTED, NEVER SILENT:** `EXPERT_PUBLIC_FIELDS.id` (the
    `/api/experts` and `/api/experts/:id` payloads) and `ready_made_trips`'s feed `authorId`, which
    the `/experts` cross-sell shelf JOINS to it. Both carry `public-user-id-ok: <reason>`, which the
    guard prints on every run, pass or fail (ruling 32's disposition for `fee-literal-debt`: filed
    debt must not become a silent baseline). They are one debt, not two, and the blockers are rails
    rather than projections: `POST /api/trips/:tripId/advisors` takes a client-supplied
    `localExpertId` and answers with `expertUserId` (`HireExpertDialog`); `chat.tsx` resolves a
    counterpart's display name by matching a thread's user id against the `/api/experts` list; and
    underneath both, **`/experts/:id` is today the ONLY public profile an earner who has claimed NO
    handle has** — so removing the id there would not degrade honestly (§13), it would delete those
    earners from the site. Giving them a handle, or a handle-shaped hire rail, is the next lane.
    **THE CLAIM PROMPT HAS LANDED** (ledger `2026-09-05-handles-are-claimed`): handles are ASKED
    for — a persistent console banner and an optional last step in both application wizards,
    prefilled by ONE shared `suggestHandle` helper — and never generated on an earner's behalf.
    **STILL NOT REMOVABLE, and out of this guard's predicate by design:** `ConversationSummary.
    otherUserId`, `?clientId=` and the WebSocket frame are all on AUTHENTICATED surfaces, so the
    guard does not scan them; they keep the prerequisites lane 3 recorded below.
    **LANE 3 HAS LANDED (the clients).** Every traveler-facing contact CTA now names a CONTEXT:
    the storefront sends `{ handle }`, service detail sends `{ serviceId }`, a `service_bookings`
    row on My Bookings sends `{ bookingId }`, and expert cards send `{ handle }` when the row has
    one. ONE client module owns both halves of the decision — `client/src/lib/earner-address.ts`
    (`resolveContactAddress`, `startConversation`, `earnerProfilePath`, `resolveChatUrlTarget`),
    §18 rule 1 — and `useAskExpert` is its one caller for contact. `/chat` reads the canonical
    `?conversation=<opaque id>` and SENDS `{ conversationId }`; **`senderId` is no longer sent on
    any branch**. Card links prefer `/s/:handle` — which is already where `/experts/:id` redirects
    a handled earner — and keep the id route only for a row with no claimed handle. The
    `?about=` subject stays a COMPOSER PREFILL and is deliberately never passed to the start rail,
    which would deliver it as a message the traveler never typed. Pinned by
    `client/src/lib/__tests__/earner-address.test.ts` (18 proofs, wired into `build.yml`).
    **WHAT LANE 2 MUST STILL REMOVE, and what it must fix first.** Removable now: `earner.id` from
    `loadStorefront` (no client reads it — the storefront's own-page check compares HANDLES), and
    `service.userId` from the public service payload as far as CONTACT is concerned. **Not yet
    removable, each marked in the code with the grep-able `LD 40 lane 2: still id-addressed`:**
    `?clientId=` on the three earner inboxes and the workspace (a TRAVELER has no handle, and
    those lists group `/api/chats` themselves instead of using `useConversationThreads`, which now
    joins the opaque id — moving them onto it is the fix); `/expert/clients/:clientUserId`, which
    builds the INTERNAL pair id client-side; the gem-curator and ready-made-purchase CTAs, whose
    payloads carry no handle; `expert-detail.tsx`, which only renders for a handle-less earner;
    and `ConversationSummary.otherUserId`, which `useConversationThreads` joins on. Removing
    `otherUserId` therefore requires that hook to read its threads from `GET /api/messages`
    outright, and removing the `/experts/:id` route requires every card row to carry a handle.
    Do not remove a deprecated INPUT until those are done, and do not add a new id-addressed
    contact rail at all.


41. **THE FREE DRAFT IS A SKETCH; OPTIMIZE IS THE PLAN; THE MAP SHOWS THE COMPARISON
    (decision-maker ratified Sep 5, 2026 — ledger `2026-09-05-draft-sketch-optimize-plan`;
    lane 1 = `2026-09-05-trip-pass-run-gate`, LANDED).** One ruling, four lanes. It draws the
    line between what the platform gives away and what it charges for, and it fixes the place
    where the two disagreed.
    **(a) A TRIP PASS COVERS THE RUN, NOT JUST THE CHARGE — LANE 1, LANDED.**
    `coversAction(tripId, "optimizer_run")` was consulted at exactly ONE place: the charge point,
    `POST /api/optimization-payments`. The RUN gate — the `canRunOptimizer` decision inside
    `POST /api/itinerary-comparisons` and `POST /api/itinerary-comparisons/:id/regenerate` — never
    read `trip_entitlements` at all. So a pass holder running outside the 24h free-rerun window was
    answered `{coveredByTripPass:true}`, the client created the comparison with **no**
    `optimizationPaymentId` (correctly — a covered run has no PaymentIntent), and the run gate, seeing
    no recent run and no PI, refused: the comparison was born `pending_payment` with **zero variants
    generated**. Nothing threw and nothing logged; the traveler had paid for the pass, was told the
    run was included, and got a perfectly ordinary "payment required" screen. **THE FIX IS ONE
    PREDICATE, NOT A THIRD COPY OF THE RULE (§18 rule 1):**
    `resolveOptimizerRunAuthorization` (`server/services/optimizer-run-authorization.ts`) is the ONE
    decision about whether the optimizer may run, returning a discriminated
    `{authorized:true, basis:'trip_pass'|'free_rerun'|'paid'} | {authorized:false, reason}`, and both
    sites call it. The bases are ordered **pass → free re-run → the payment already recorded on the
    comparison → a freshly verified PaymentIntent**, with the pass FIRST so the run gate and the
    charge gate can never disagree about a covered trip, and because "free re-run" would be the wrong
    reason to report for a covered one even when it also happens to be true (§13).
    **THE PREDICATE DECIDES; IT NEVER WRITES.** It imports no `db`, no `storage` and no Stripe client
    — its three server reads arrive injected — so it takes no claim of its own and can be proven by a
    pure CI test with no database. The §15 **atomic conditional** that records a fresh PaymentIntent
    stays at the regenerate route (`UPDATE … WHERE id = ? AND optimization_payment_id IS NULL`), and
    a `paid` result says whether that claim is still owed (`claimRequired`). **A TRIP PASS BASIS
    TAKES NO CLAIM AND SPENDS NO PaymentIntent:** `optimizer_run` coverage is unlimited by ruling
    (`trip-entitlement.service.ts`), so there is no counter to race on, and a supplied PI is neither
    verified nor recorded on a covered run. **The pay endpoint's behaviour is UNCHANGED** — this lane
    added no charge, removed none, and touched no fee.
    **§13 — HOW THE BASIS IS RECORDED, AND WHAT IS NOT CLAIMED.** `itinerary_comparisons` has no
    basis column: it records a payment IDENTITY (`optimization_payment_id`) and nothing else, so a
    free re-run and a pass-covered run are both stored as "no payment id". Writing a sentinel like
    `"trip_pass"` there would be a fabricated payment identity (§19a) **and** would poison the reuse
    lookup that reads that column, and a $0 `fee_ledger` row is forbidden by that table's
    `amount<>0` CHECK. So the basis is recorded exactly the way the suppressed CHARGE records it
    (ledger `2026-08-29-trip-pass-provenance`): a `[trip-pass] … (covered_by:trip_pass)` line plus a
    `runBasis` on the run response, with the durable record being the active `trip_entitlements` row
    on the trip and the absence of a PI. **It is deliberately not claimed to be pinned per
    comparison** — a per-comparison basis column is a schema change nobody has ratified, and stating
    the limit is the honest half of shipping without one.
    **(b) THE FREE AI DRAFT RUNS ONLY ON AN EMPTY SLIP (lane 2).** Any AI action on a slip that
    already holds items is **Optimize**, and goes through the existing pay gate. There is no second
    free rail hiding behind a different button.
    **(c) THE FREE DRAFT IS A SKETCH (lane 2):** one version, no anchor, no metrics, no live catalog
    pricing, external fills flagged as such. It **may run a cheaper model tier as a COST decision**,
    env-configurable — that is a spend choice and **never a product claim**, so no surface may
    describe the draft by which engine produced it. The primary generate path **MUST** write
    `ai_cost_tracking` (the table CLAUDE.md's publish-trap rule already flags as load-bearing).
    **(d) THE HEURISTIC PREVIEW IS SHOWN BEFORE THE CHARGE (lane 3).** The existing free
    `POST /api/optimization-preview` renders on the slip beside Optimize, so the traveler sees what a
    paid run would buy before paying; the charge happens only on confirm.
    **(e) THE MAP SHOWS THE COMPARISON (lane 4).** The review board's map gains **"Your plan"**
    (the baseline) as a tab and a compare toggle drawing baseline + focused proposal as two sequence
    lines, each carrying its own "X of Y located" line (ruling 22's honesty posture — located stops
    only, no invented distances, no city-centre fallback). The slip's Optimized strip links back to
    the revisitable board.
    **(f) RECORDED AS OPEN DEBT, NOT FIXED BY THESE LANES.** The `ai_task` and `expert_revision`
    Trip Pass entitlements have **no consumption or charge site at all**
    (`server/services/trip-entitlement.service.ts` — `coversAction` answers `true`/`consumeRevision`
    exists, and nothing calls either), so Trip Pass and `/pricing` promise more than the code
    enforces. Owner = the **memberships-checkout lane** (starts 2026-10-01 per
    `docs/design/PRICING_AND_FEATURE_MAP.md`). Naming it is not fixing it: until that lane lands,
    do not describe those two as enforced benefits.
    **`ai_task` NOW HAS ONE (ledger `2026-09-15-d20-d21-proposal-charge`, migration 300;
    decision-maker sentence applied 2026-09-15).** The AI proposal APPLY is the charge point:
    `coversAction(tripId, "ai_task")` is the FIRST basis of the one pure predicate
    `resolveProposalApplyAuthorization`, so a covered plan applies with `charge_basis='trip_pass'`,
    takes no claim, creates no PaymentIntent and writes no ledger row, while an uncovered one is
    charged FLAT from the `concierge:ai_task` `fee_bands` row — ONCE per distinct proposal,
    idempotent on the proposal id (`ai-apply-<proposalId>`), the §15b claim on the proposal row
    taken BEFORE the Stripe call.
    **`expert_revision` IS RETIRED, NOT PENDING (decision-maker ratified Sep 21, 2026 — ledger
    `2026-09-21-expert-revision-retired`). THIS CLAUSE'S DEBT IS CLOSED BY DELETION.** This entry
    recorded `expert_revision` as promised-but-unenforced and named the memberships-checkout lane
    as its owner. That framing was wrong in one decisive way: **the expert-revision PRODUCT was
    never missing.** Ruling 11 (`plan-work-access.service.ts`) already makes a `plan_work` listing
    purchase grant the SELLING EXPERT `accepted` — a §12 WRITE status — on the buyer's plan, inside
    the authorization transaction and idempotently. A traveler paying their expert for a round of
    changes is that: the expert's OWN listing price, through the one checkout, with the traveler
    service fee waived by `traveler_service_fee` like any other booking on that trip. Nothing about
    it needs the Trip Pass spine.
    What was unbuilt was only the Trip Pass **INCLUSION** — and it is refused, because **the expert
    sets the price**, so "Trip Pass includes one expert revision" can only mean the platform paying
    an earner at a platform-set rate. That is a P&L decision with a seller-consent half, and
    neither was ever ratified. **§18c applied:** `consumeRevision` and the `expert_revision`
    `TripPassAction` are DELETED, and `trip-pass.routes.ts` stops writing
    `allowances_snapshot.revisionsRemaining` — a hook with no consumer and no ratified funder is
    deleted, never left as a future maybe. **Trip Pass now sells three benefits and enforces
    exactly three** (`optimizer_run`, `ai_task`, `traveler_service_fee`); the two traveler-facing
    surfaces stopped advertising the fourth in ledger `2026-09-21-trip-pass-revision-claim`.
    **§13 — NO BACKFILL:** passes sold earlier still carry `revisionsRemaining` in their FROZEN
    snapshot and are not rewritten; the snapshot records what was bought, and nothing reads the key
    now. **Re-introducing a Trip-Pass-funded revision is a NEW MONEY DECISION, not a re-wiring** —
    guarded by `client/src/lib/__tests__/trip-pass-copy.test.ts` T4/T5, which fail if the action or
    the hook returns.
42. **THE SLIP IS THE ONE PLANNING SURFACE; SEVENTEEN RULINGS ON HOW EVERY FINISH, DOOR, MINT AND
    EXPERT TOUCH LANDS THERE (decision-maker ratified Sep 5, 2026, evening — ledger
    `2026-09-05-slip-one-surface-seventeen`).** (Locked Decision NUMBERS are this file's own frozen series and are unrelated to ledger ids, which are date-slugs per ruling 25.) Rulings 32, 33 and 39 each named one half of the
    same shape: no expert touchpoint exists without a slip (32), there is ONE planning modal and
    many doors (33), and every add surface is a view of `itinerary_items` (39). What none of them
    said out loud is where a plan LIVES between the modal closing and the trip ending. It lives on
    the **slip** (`/plans/:tripId`), and every finish, every door, every mint and every expert
    touch resolves there. The seventeen rulings below are one ratification, sequenced in the build
    order at the end; each is a ruling in its own right and none is optional polish.

    **D1 — THE PLAN'S OCCASION IS A ROW REFERENCE, NOT A GUESS OFF A COARSE KEY.**
    `trips.experience_type_id` is persisted: additive nullable, **FK → `experience_types` ON DELETE
    SET NULL**, **NO DB CHECK** (the publish-trap posture — migrations
    181/195/273/275/276/277/279/280/281/282/284/287), **declared in `shared/schema.ts`** per the
    deploy-push durability rule, and **NO BACKFILL** — deriving a row id for every legacy trip out
    of the coarse `trips.experience_type` key would turn "we never asked" into "the traveler chose
    this occasion". It is written **ONLY** through the existing pick-based allowlist on the
    owner-gated `PATCH /api/trips/:tripId/occasion` (the rail `adults`/`kids` and ruling 38's three
    columns already ride — no new route, no second admission rail, §19), and the handler
    **server-derives the id from the slug**: a client hands a slug, never a row id, so the
    catalog stays the authority on which occasions exist.
    **NULL = NEVER CAPTURED ⇒ every reader falls back to the current event-type lookup EXPLICITLY
    and says so in a comment (§13)** — never a nearest-looking row presented as the plan's own
    answer. Ruling 28's six switches, ruling 31's `roles_needed` and ruling 33's step-1 skip all
    read this row, and all of them currently reach it through a LOSSY coarse-key lookup: five
    frozen keys standing in for a catalog of many.
    **CLIENT-SIDE FIRST, and the client's resolution is EXACT.** `useOccasionSwitches` resolves the
    occasion from the plan's OWN events when they agree on one `experience_type_id` — an exact id
    match over the `user_experiences` rows the plan already carries (ruling 29), with **no
    guessing**: events that disagree, or that name no occasion, resolve NOTHING and the reader
    falls through to the lossy lookup exactly as today. That half ships before the column, needs no
    migration, and is honest on its own.

    **D2 — "WHO BOOKS" IS ASKED ONCE, AT FINALIZE, AND `with_expert` ROUTING LEAVES THE PLANNING
    VIEW.** Routing an item to an expert is a question about a PURCHASE, not about a plan's
    contents, and asking it per item on the planning surface put a commerce decision on every row
    of a list whose job is "what are we doing". It is asked **once at Finalize** — *book these
    myself* / *my expert books these* — with **per-item exceptions inside Finalize** for the plan
    where one line differs. The per-item **"Send to expert" control on the item row is REMOVED**,
    and the **write-only `optimizationContext.routedItemIds` is DELETED (§18c: no consumer +
    a state-bearing effect ⇒ delete, don't gate)** — it was written by the routing control and read
    by nothing, which is precisely the shape §18c exists to refuse. Deleting it is not a
    behaviour change to any reader, because there is no reader.

    **D3 — EXPERT WORK IS PROTECTED WHERE MONEY IS PROTECTED.** An item carrying
    `itinerary_items.expert_note` (ruling 21) or `origin='expert'` (ruling 12) is **paid human
    work sitting in a row a machine may rewrite**. Those rows join the optimizer baseline's
    **PROTECTED set** — `server/services/optimizer-baseline.service.ts`, **the single read-set
    expression**: injected into the optimizer as constraints, **never emitted** as suggestions, and
    **never deleted by apply-to-trip** — AND `itineraryItemRebuildDeletable()` **spares them**, so
    a regenerate cannot destroy them either. **ONE CLASS ADDED TO THE EXISTING PREDICATES, NEVER A
    SECOND PREDICATE**: a parallel "is this expert work?" test written beside the baseline's own is
    the derivation-drift class §18 rule 1 names, and it is how one rail starts protecting a row the
    other rail deletes. Both predicates already carry the protected-origin idea; this widens each
    in place.

    **D4 — THE OWNER MAY NOT WRITE `itinerary_items.expert_note`.** Ruling 21 made the field
    traveler-FACING; it never made it traveler-WRITABLE, and a note labelled "from your expert" that
    the traveler wrote themself is a false attribution on a surface whose whole value is whose
    words those are. It is **stripped from the owner's item PATCH path** — the §19 allowlist shape,
    the field is simply not in the owner's pick — and **only a §12 WRITE-status advisor**
    (`accepted`/`assigned`, never `pending`) writes it, through the advisor rail that already gates
    every other item mutation. This is §19 applied to an AUTHORSHIP field rather than a money one:
    the class is the same — a privileged column reachable by default through a body schema nobody
    re-read when the column was added.

    **D5 — THE `local` FINISH MINTS THE SLIP.** Ruling 33 said each finish branch's downstream
    behaviour was unchanged; **this amends that clause for the `local` branch and no other**. A
    traveler who finishes the modal with "plan with a local" was sent to `/experts` with a
    `?destination=` and **no trip**, which walks straight into what ruling 32 forbids: an expert
    touchpoint with no slip behind it, whose lead surfaces to nobody. The `local` finish now
    **MINTS the slip through the SAME `mintTripSlip` the `myself` finish uses** — one mint door,
    one more caller (§18 rule 1) — **behind the SAME sign-in gate**, checked BEFORE anything is
    minted, and forwards `tripId` to `/experts` so the storefront request rail ruling 32(b)
    requires has the trip it needs. The reason is ruling 32's precondition, not a preference.

    **D6 — TWO ROLE QUESTIONS, TWO CATALOGS, AND THEY ARE NEVER MERGED (§4, and the FAQ's refusal
    of a new service table).** "Who plans this WITH me" is a **plan-level** question and its answer
    is the **EXPERT picker** — `HireExpertDialog`, the ONE picker, reading `expert_offering_types`
    roles. "Who do I HIRE for this event" is an **event-level** question and its answer is
    `experience_types.roles_needed` (ruling 31), which is a pointer into
    `service_categories.category_key` — the PROVIDER catalog — so it resolves to a **PROVIDER
    browse pre-filtered by that category, ending in Add to plan on the ruling 39 rail
    (`itinerary_items`)**. Two questions, two existing catalogs, two existing rails; **no new
    table**. Ruling 31 shipped `roles_needed` deliberately unread and named this as the surface it
    unblocks; this says which of the two catalogs it opens, and that a florist is not an advisor.

    **D7 — ONE ADVISOR-ADD RAIL, AND THE READER RETURNS ALL OF THEM.** The older
    `POST /api/trips/:id/expert-advisor` takes a raw `req.body.expertUserId` with **no allowlist**
    — the §19 denylist shape, on an ACCESS grant — and is **RETIRED** in favour of the pick-based
    `POST /api/trips/:tripId/advisors`, which is already the rail `HireExpertDialog` uses and which
    routes through `upsertTripAdvisorRow`, the ONE author ruling 32's correction established. The
    slip keeps **ONE picker**. Same ruling: the advisor **READER returns ALL advisors on a plan**,
    not the first — the UNIQUE `(trip_id, local_expert_id)` index has always permitted several, the
    schema has always allowed it, and a reader that silently returns one of many is a plan quietly
    hiding a person who can write to it.
    **THE `POST /api/leads/route` DOOR IS RETIRED, NOT RESTORED (ledger
    `2026-09-15-v32-v33-leads-door-item-read-gate`; decision-maker sentence applied 2026-09-15).** It
    had been a comment over no handler since the June 2026 route defragmentation. A "score experts
    and auto-assign" door would be a second author of the advisor row, which this clause forbids and
    `scripts/check-advisor-row-author.cjs` refuses; `POST /api/expert-requests` (Locked Decision 32)
    already runs the same `lead-routing.service.ts` and calls the one author. The scoring service
    stays live — what was retired is the door, not the logic — and `server/routes/payments.routes.ts`
    carries the note saying so. Do not re-add the route.

    **D8 — `/trip/:id` IS NOT A PLANNING SURFACE.** The finalized Trip Card is the read-out of a
    plan that is DONE. A pre-final plan that lands there gets a second, divergent editing surface
    beside the slip — the drift class §18 rule 1 names, worn as two pages. Pre-final plans
    **REDIRECT to `/plans/:tripId`**, by **the same `finalVersion` rule `PlanCard` already
    applies** — the rule is read, never restated (a second copy of "is this plan final?" would
    drift the day the definition moves). The **contract board moves to the slip**, where the plan
    it describes lives.
    **WORDING CORRECTED TO MATCH THE CODE (2026-09-07, decision-maker accepted the register's C1;
    no behaviour change):** the implementation does not bounce the browser — it renders an honest
    NOTICE naming the slip with one action to it, which ONE armed spec asserts
    (`slip-rail-actions` A12, on the blocking `slip-rail-actions-gate.yml`); the two names this
    clause carried before, `journey-1` and `finalize-booking-modal`, were never wired into any
    workflow (D-17, ledger `2026-09-15-d17-d8-specs-armed` — both repaired, neither armed; wording
    corrected 2026-09-15, decision-maker). Read "REDIRECT" here as "does not open as a planning
    surface, and sends the traveler to the slip"; a literal bounce would break that spec and tell
    the traveler nothing about why they moved.

    **D9 — THE BOOKINGS SECTION LIVES ON THE SLIP, AND ITS AUDIENCE IS §15d's.** Balance payment
    (§15d) is offered in a bookings section **on the slip**, visible to **the owner and a
    `payer`-role `trip_participants` row, and to nobody else** — the SAME predicate
    `canPayBalance` (`server/services/balance-payer.service.ts`) the route itself runs, read by the
    surface rather than re-typed on it (§18 rule 1; re-typing it is how a button appears for
    someone the server will refuse). Everything §14/§15 governs is untouched: the amount stays
    server-derived, the actor stays the session, the transitions stay atomic conditionals, and the
    balance-payer claim is unchanged. This ruling moves a SURFACE, not a rail.

    **D10 — THE PER-EVENT ADVISOR LINK STAYS "JOINS THIS WHOLE PLAN", AND ONE QUESTION IS LEFT
    OPEN, NAMED.** Ruling 32(d) said an advisor joins the plan, not an event; the per-event hire
    affordance says so out loud rather than implying a per-event scope the row cannot hold
    (`trip_expert_advisors` keys on `trip_id`; there is no event column and this ruling adds none).
    Pre-hire conversations **may** later carry a **trip context kind** on `conversation_contexts`
    (ruling 40, migration 287 — `context_kind` is app-enforced with no DB CHECK precisely so a
    fourth kind is a code change and not a publish trap); that is a later lane and is not built
    here. **OPEN, RECORDED, NOT RULED: the `boys-trip` vocabulary.** The decision-maker did not
    rule on it. The seeded value **STANDS** untouched and the question is recorded here as open —
    an unruled string left in place is honest; a lane silently renaming it would be a vocabulary
    decision taken by whoever happened to touch the seeder (§13).

    **D11 — `IntakePanel` COLLAPSES INTO THE ONE MODAL, AND UNTIL IT DOES ITS FABRICATED PARTY
    SPLIT IS STRIPPED.** Ruling 33 established ONE planning modal; `IntakePanel` is a second one,
    with its own two steps, its own create call and its own answers. It **collapses into the ONE
    modal — its mounts become DOORS** (`usePlanning().open(source)`), which is the same move ruling
    33 made on `edit-trip-panel.tsx`: renamed into the one modal, never copied beside it. **UNTIL
    that lands, its `kids: 0` write is STRIPPED.** Ruling 33 de-masked the party pair precisely so
    an untouched field saves as **NULL** — the panel never asks about children and then files
    "0 kids" as the traveler's answer, which is a fabricated split of a number they did give
    (§13). Same ruling: **`AiPlannerDraftPanel` mints through the ONE mint helper**
    (`buildTripMintBody` / `mintTripSlip`), never its own assembled body — a second mint body is a
    second place D12's invariants have to be remembered.

    **D12 — NO MINT MAY INVENT A DESTINATION OR A DATE, AND `market_slug` IS A NAMED MINT
    INVARIANT.** `trips.destination`, `start_date` and `end_date` are NOT NULL, and ruling 32's
    `checkSlipPrecondition` refuses a lead whose slip has none — so a mint site that fills one in
    to satisfy the column is manufacturing the exact fact the precondition exists to require. **The
    six mint sites ASK or REFUSE**; none guesses. Same ruling, amending ruling 30: **`market_slug`
    joins `timezone` as a NAMED mint invariant** — ruling 30 made the zone a stamped-at-mint,
    server-derived fact and stated it for every mint site, and `market_slug` is derived from the
    same `trips.destination` by the same `storage.createTrip`/`updateTrip` path but was never
    written down as an invariant. **The two raw-SQL mints in `booking.service.ts`** (the cart
    auto-trip and the saved-trip conversion) bypass that path and therefore **stamp it
    explicitly** — the same treatment ruling 30 already gave them for the zone. A plan with no
    market slug is invisible to every market-scoped reader while looking perfectly normal on the
    slip. **Because the date columns are NOT NULL, this clause is enforced by a FACT, not by the
    schema: `trips.dates_confirmed_at` (Locked Decision 30, amended Sep 15, 2026) records whether
    the window was chosen, and a mint that filled one in to satisfy the columns leaves it NULL.**

    **D13 — A DOOR PASSES WHAT IT HOLDS, AND CI CHECKS THE NAMED ONES.** Ruling 33 ruled that doors
    differ in exactly two things — what arrives pre-filled and which step opens first — and
    `resolvePlanSteps` decides the second. Nothing decided the first, and nothing checked it: a
    door that holds an occasion or a city and passes NEITHER opens a modal that asks the traveler a
    question the page it came from already knew the answer to. **A surface that HOLDS an occasion
    or a city MUST PASS IT** in its `PlanningSource`. `scripts/check-planning-entry.cjs` grows a
    **per-surface REQUIRED-FIELD list** beside its existing entry-shape list, with committed
    `--self-test` fixtures (§18d) run before the guard in CI.
    **STATED NEGATIVE SPACE, and it is the load-bearing half of this ruling: the guard can see what
    a door PASSES, never what the page KNOWS.** It cannot tell that a page holding a city passed
    none — only that a NAMED door stopped passing the field it was ruled to pass. Adding a surface
    to the list is a human decision, and a surface absent from the list is unchecked, not
    exonerated. That limit is why the rule is written here as well as in the script: a green run
    means green-within-stated-bounds.
    **AND A DOOR PASSES ONLY WHAT IS TRUE (§13).** Where a field would have to be invented — a rail
    that names eight markets and no one of them, an earner "location" that is a NEIGHBOURHOOD
    rather than a city — the door passes **NOTHING**. An absent field is how the modal is told "not
    known"; a placeholder is how it is told a lie, and the required-field list must never be
    satisfied by manufacturing one.

    **D14 — `/quick-start` IS RETIRED.** It is a second front door asking the modal's own questions
    in its own shapes, and ruling 33 left exactly one. Same ruling: **CityGrid's "Plan now" opens
    the modal with `{ city, country }` pre-filled** — the grid holds both, so under D13 it passes
    both, and a traveler who clicked a specific city is never asked which city.

    **D15 — A PLAN STARTED FROM A LISTING ENDS BACK AT THAT LISTING.** `PlanningSource` gains
    **return-to context** — `returnTo: { kind: 'service' | 'expert', id/handle }` — so a plan
    started from a service page finishes with **that listing offered for Add to plan** (the ruling
    39 rail, `itinerary_items`; the cart is its `ready_for_checkout` projection, never a second
    store) and a plan started from an expert finishes with **that expert offered to choose** (D6's
    plan-level picker; D5's mint has by then given the request its slip). It is **context the door
    already holds** — a listing page knows which listing it is — so under D13 it is passed, not
    reconstructed. It is a RETURN ADDRESS and **grants nothing**: it authorizes no add, no hire and
    no read, and every downstream gate is unchanged. An expert addressed here is addressed the way
    ruling 40 requires — by handle where the row carries one — never by a bare `users.id`.

    **D16 — THE SLIP'S EDIT CONTROLS ARE THE OWNER'S; THE EXPERT'S EDIT SURFACE IS THE
    WORKSTATION.** Item add / edit / delete / reorder render on the slip **for the OWNER only**.
    The expert already has an edit surface — the Workstation — and a second one on the traveler's
    own plan produces two places the same mutation is authored and two places its §12 gating has to
    be remembered. **The expert's presence on the slip stays READ, NOTE, SUGGEST, MESSAGE**: they
    see the plan live (ruling 32), write `expert_note` (D4), suggest items, and talk. This is a
    RENDER rule, not a new permission: the §12 WRITE-status advisor rails on the server are
    untouched, and a rule about which buttons draw is never the thing that keeps a write out —
    the route's own gate is (§14 posture).

    **D17 — THE OPTIMIZER RUN IS AUTHORIZED BY THE ITEM-MUTATION PREDICATE, NOT THE LOGISTICS
    ONE.** An optimizer run — paid, free re-run, or Trip Pass — **rewrites the plan's items**. It
    is therefore authorized for **the owner or a §12 WRITE-status advisor (`accepted`/`assigned`),
    NEVER `pending`**, through the **same predicate item mutations already use** and **not**
    `authorizeTripLogistics`, which is a READ-shaped tier that grants `pending` (correctly, for
    reading). Ruling 12 drew this line for every other item write path; the optimizer is the
    largest item write on the platform and was gated by the wrong one of the two. ONE predicate,
    one more caller — a second "may this person rewrite the plan?" test is the drift class §18
    rule 1 names.
    **D17 IS NOW ONE PREDICATE IN FACT (ledger `2026-09-15-v29-one-trip-write-resolver`, punchlist
    V-29 = option B; decision-maker sentence applied 2026-09-15).** The ONE "may this person rewrite
    the plan?" test is `authorizeTripLogistics(tripId, userId, route, { requireWriteAccess: true })`;
    the collaborator-only `getTripWriteRole`/`canMutateTrip` resolver is DELETED (§18c), and
    `getTripRole` survives as the READ resolver only. Stated delta, because it is a behaviour change
    on eight rails and not a refactor: an OWNER with no `trip_collaborators` row is no longer refused
    on their own plan (ownership is read from `trips.user_id`), and the trip AUTHOR and an
    AUDIT-LOGGED ADMIN gain write on the item PATCH/DELETE, the backup-plan and transport-leg writes
    and the four optimizer run gates — exactly the principals B already granted on reorder,
    expert-traveler-note and the proposal rails. §12 is unweakened: `pending` never writes, and the
    two rails that gated a write through the READ resolver stop granting it. Open and recorded: the
    plancard READ still resolves the owner only through `trip_collaborators` (the read-side twin).

    **BUILD ORDER — THREE WAVES, AND EACH LANE APPENDS ITS OWN LEDGER ROW.**
    **Wave 1** is everything that needed no decision beyond what is ratified here and touches no
    schema: the doors passing what they hold and the guard's required-field list (D13), `/quick-start`
    and CityGrid (D14), the `IntakePanel` `kids: 0` strip and the one-mint-helper move (D11), the
    mint invariants (D12), the owner-only render rule (D16).
    **Wave 2** is the decision items that still touch no schema: the Finalize question and the
    `routedItemIds` deletion (D2), the protected-set widening (D3), the `expert_note` owner strip
    (D4), the `local` finish mint (D5), the advisor rail retirement and the all-advisors reader
    (D7), the `/trip/:id` redirect and the contract board move (D8), the bookings section (D9),
    the return-to context (D15), the optimizer predicate (D17).
    **Wave 3** is schema and the large surfaces: `trips.experience_type_id` and its
    `useOccasionSwitches` client half (D1), the two role surfaces (D6), the `IntakePanel` collapse
    (D11).
    A wave is a sequence, not a batch: **each lane appends its OWN ledger row** naming what it
    landed and what it left, so this entry stays the ruling and the ledger stays the record of
    which parts of it are real.

    **ADDENDUM — D18–D22, THE FIVE THE CANVAS DREW AS PENDING (decision-maker ratified Sep 5,
    2026, evening — ledger `2026-09-05-slip-decisions-d18-d22`).** The slip canvas
    (`slip-canvas/gen.py`) drew a DEFAULT for four open questions and marked each with a coral
    `pending` chip, and a fifth fell out of the rail's own honest note about an expert nobody
    could message. All five are now ruled. They are recorded HERE, in this entry's voice, because
    each one settles a clause of the seventeen rather than opening a new subject; **nothing above
    is renumbered**.

    **D18 — THERE IS NO UNDO AFTER AN OPTIMIZE APPLY, AND THE CANVAS DRAWS NONE.** Apply replaces
    every in-planning row in ONE transaction and nothing holds the previous set, so an "Undo"
    control would promise a restore no code path can perform (§13). The safeguard is the one that
    already exists and is ratified: the run is **REVIEW-FIRST** (LD 41 (d) — the free heuristic
    preview beside Optimize, then the comparison board), and the **baseline column** on that board
    is "Your plan" as it stands (LD 41 (e)), so what would change is seen BEFORE the charge and
    before the write. **NO PRE-APPLY SNAPSHOT IS INTRODUCED**: deciding otherwise means deciding
    where that snapshot lives, what it costs to keep, and how it interacts with D3's protected set
    — a schema question nobody has ratified. "See what changed" ships alone; it is a record of the
    apply, never an offer to reverse it.

    **D19 — "MY EXPERT HANDLES THESE" NEVER MEANS THE EXPERT PAYS.** D2's Finalize question routes
    items to the expert; routing is about WHO ARRANGES a booking, never about whose card is
    charged. The routed items land in the expert's **Workstation queue with a notification**, the
    expert arranges them, and **the traveler pays each booking at checkout** through the rails
    §14/§15 already govern — amount server-derived, actor from the session, transitions atomic.
    **NO EXPERT-PAYS-FOR-TRAVELER RAIL EXISTS AND NONE IS BUILT**: an earner fronting a traveler's
    money is a second money path with a second refund story and a second insolvency question, and
    it is not created as a side effect of a routing control. The copy on the Finalize chooser says
    who ARRANGES, and never implies who pays.

    **D20 — AN OCCASION MAY NOT RENAME ITS EVENTS.** The word is **"events"** on every surface,
    including a golf trip's rounds and a conference's sessions. `eventCountLabel`
    (`client/src/lib/plan-vocabulary.ts`) stays the ONE spelling (§18 rule 1). A per-occasion event
    noun would be a **SEVENTH SWITCH** on `experience_types`, and ruling 28's six are booleans and
    enums a traveler flips inside the plan — a noun is neither. **THE FLAVOUR LIVES IN THE EVENT'S
    OWN TITLE**, which the traveler already writes ("Round 1 · Kyoto Golf Club"), so nothing is
    lost by keeping the container's name constant; what would be lost by varying it is a single
    word for a single concept across the slip, the picker, the guest board and the PDF. Migration
    276's `vocabulary` column keeps its own job unchanged — it names the PEOPLE
    (travelers|guests|attendees), never the things they attend.

    **D21 — A GUEST-LIST OCCASION'S HEADER COUNTS BOTH POPULATIONS, NAMED.** Where the occasion
    has a guest list (`default_guests` true) and the derived roster carries invitees, the slip
    header reads **"N traveling · M invited"**; where it does not, it reads the party-noun label it
    already read. The two populations are the ones Locked Decision 37 keeps apart — the
    **TRAVELING PARTY** (`trips.adults`/`kids`, the plan's own columns) and the **INVITED ROSTER**
    (derived from the events' `event_invites`, `GET /api/trips/:tripId/guests`) — and naming both
    is the whole point: they are different people and **are never merged into one number**.
    **ONE LABEL DERIVATION** (`plan-vocabulary.ts`, beside `partyCountLabel` and delegating to it
    for the no-guest-list case), **NO NEW COLUMN**, and no second count anywhere — the invited
    number is the SERVER's own `totals.invited` off the roster the slip already reads. §13 holds
    in both directions: a roster that has not answered, one the viewer may not read and one with
    nobody on it all render the party label ALONE — never "0 invited" — and a plan whose party was
    never stated renders the invited count alone rather than inventing a party of one.

    **D22 — LOCKED DECISION 40 IS AMENDED: THE CONTEXT KINDS GAIN `advisor`.** LD 40 named three
    address kinds — `handle`, `serviceId`, `bookingId` — and said they were the whole set. They
    were the whole set **for an EARNER addressed from the marketplace**, and they left a real
    thread unaddressable: the traveler and the advisor **on their own plan**. An advisor who has
    claimed no storefront handle had no address at all, and the rail said so out loud rather than
    render a dead button (`SLIP_EXPERT_NO_HANDLE_NOTE`), which was honest and was not a product.
    A fourth kind, **`advisor`**, is a **PLAN-SCOPED** thread: the client names `{ tripId }` — a
    plan, not a person — and the SERVER resolves the counterpart from the trip plus the
    `trip_expert_advisors` row in a §12 access status (owner ⇒ the plan's advisor; advisor ⇒ the
    plan's owner). **A USER ID OR A HANDLE IS NEVER ACCEPTED FOR THIS KIND** — that is LD 40's own
    rule, unweakened: the recipient stays server-derived, the response still carries no user id,
    and an unresolvable address is still ONE 404 so the rail cannot be used to probe which trips
    exist. `conversation_contexts.context_kind` is **app-enforced with NO DB CHECK** precisely so a
    fourth kind is a code change and not a publish trap (LD 40's own note, and D10's), so **this
    amendment needs no migration**. "Message your expert" on the slip uses it, and the three
    original kinds are untouched.

    **D23 — THE ITEM ROW'S ORIGIN CHIP IS READ EXPOSURE OF LOCKED DECISION 12'S COLUMN** (ledger
    `2026-09-06-item-origin-chip`): the ratified `ItemRow` artboard's three-value provenance chip
    (`traveler` = "you added", `ai` = "AI draft", `expert` = "from your expert") reads
    `itinerary_items.origin` — carried on the plancard activity DTO present-only-when-set, `full`
    channel only, NULL omitted and never rendered as an author (§13) — through the ONE mapping
    `client/src/lib/item-origin.ts`; **no schema change, no migration and no new writer**, the
    column stays server-stamped at create and client-settable nowhere.

    **D6 IS NOW APPLIED ON THE EVENT HEADER (ledger `2026-09-06-slip-conformance`).** D6 ruled that
    the two role questions have two catalogs and are never merged; until this lane the event
    header's only role affordance was "Hire an expert", which opened the PLAN-level EXPERT picker
    from an EVENT — the exact conflation D6 names. The picker keeps its ONE home (the rail's Build
    card, "Hand off to a local expert"; `HireExpertDialog` is unchanged and undeleted), and the
    header now asks the EVENT's own question: one chip per `experience_types.roles_needed` key
    (ruling 31), each opening the EXISTING marketplace browse pre-filtered by that
    `service_categories.category_key` and carrying the plan's id so Add to plan lands on the
    ruling 39 rail. No new catalog, no new table, no new browse, and no server or schema change.
    **§13 holds in the direction that matters:** NULL / absent / empty `roles_needed` draws NOTHING
    — never "this occasion needs nobody", which ruling 31 forbids by name — and the client
    reconstructs no role list of its own from a slug, a title or a keyword. The advisor-standing
    sentence STAYS on the header and is now spelled ONCE, shared with the rail's new Expert card
    (§18 rule 1). Same lane, same ruling's D16: the slip is laid out as the ratified canvas draws
    it — the rail as a fixed 320px right column (Build · Plan · Share · Finish), the status counts
    and the List | Map toggle merged into one view bar, and no version on the WORKING header, since
    a version exists only once a plan is final. What D6 still does not have is a way to seed an
    occasion's roles in an e2e: the chips' rules are proven purely, and their silence is proven in
    the DOM.

43. **PAYMENT METHODS: NOTHING AT SIGNUP; STRIPE HOLDS THE VAULT; WALLETS ON EVERY PLATFORM CHARGE;
    ONE SOFT SAVE PROMPT (decision-maker ratified Sep 5, 2026, evening — ledger
    `2026-09-05-payment-method-posture`; this lane = `2026-09-05-wallets-on-platform-intents`).
    NO SCHEMA CHANGE, NO MIGRATION, NO NEW TABLE OR COLUMN.**
    **(a) SIGNUP COLLECTS NO PAYMENT METHOD. EVER.** This is a CONVERSION decision, not an
    oversight to be tidied up later: nothing is charged before a run, a pass or a booking, so
    asking for a card at the door costs signups and buys nothing. There is no variant of this —
    no "optional card field", no deferred-capture step, no card on an onboarding screen.
    **(b) A PAYMENT METHOD ENTERS THE ACCOUNT AT ONE OF EXACTLY TWO MOMENTS**, and both already
    existed: at FIRST PURCHASE (the Payment Element, vaulted against the durable Stripe customer
    with `setup_future_usage: off_session` — FP-1), or PROACTIVELY on the profile's Payment
    methods card (the H7 SetupIntent add-card rail). **SAVED METHODS LIVE IN STRIPE, NEVER IN OUR
    TABLES** — we hold `users.stripe_customer_id` and nothing else, and the legacy
    `wallets`/credits tables stay RETIRED (410). A third vaulting path is the derivation-drift
    class §18 rule 1 names: the moment two rails can vault, they can disagree about what is saved.
    **(c) EVERY PLATFORM PaymentIntent OFFERS WALLETS** — Apple Pay, Google Pay, Link — through
    Stripe `automatic_payment_methods`, with **`allow_redirects: "never"`** wherever the
    surrounding flow cannot handle a redirect return. In this codebase that is EVERY embedded
    sheet: they all confirm with `redirect: 'if_required'`, and `StripeCheckout`'s single
    hard-coded `return_url` (`/booking/confirmation`) is wrong for the pass, ready-made, optimizer
    and coordination-fee flows that share it — so a redirect-based method enabled in the Stripe
    dashboard would strand the traveler on the wrong page. **Wallets are NOT redirect methods, so
    `never` suppresses none of them**; it suppresses exactly the class that would break. The
    covered charges are the provider-services checkout, Trip Pass, the optimizer run, the
    ready-made purchase, deposits, balances and the coordination fee. **AFFILIATE PURCHASES NEVER
    SEE WALLETS — the partner takes that payment (§16), and we do not create a PaymentIntent for
    it at all.**
    **THE ONE EXEMPTION IS STRUCTURAL, NOT A SHORTCUT.** An off-session confirm against a NAMED
    saved card (`payment_method` + `confirm: true` + `off_session: true` — FP-1 one-click) cannot
    carry `automatic_payment_methods`: Stripe rejects the combination, and logically so, because
    that call exists precisely BECAUSE a method is already vaulted. The wallet choice on that path
    was made when the card was saved. It is annotated in place (`ld43-wallets-exempt: <reason>`)
    and **PRINTED on every CI run** rather than silently allowed — an exemption that is never
    re-read becomes a baseline (the §18d posture `phase2-fee-gate`'s `fee-literal-debt` takes).
    **HOSTED CHECKOUT SESSIONS ARE A DIFFERENT RAIL AND WERE DELIBERATELY NOT CHANGED.** The two
    `checkout.sessions.create` sites (platform transport commerce; the expert-service session) keep
    `payment_method_types: ['card']`: a hosted session's method set is DASHBOARD-configured rather
    than set by `automatic_payment_methods`, and dropping the pin also admits delayed-notification
    methods whose `checkout.session.completed` can arrive UNPAID — a webhook-behaviour change this
    ruling did not authorize. Both carry an audit note so the decision stays visible; widening them
    is an operator + webhook lane, not a find-replace.
    **§14/§15 ARE UNTOUCHED BY THIS RULING AND MUST STAY THAT WAY.** `automatic_payment_methods`
    is a PRESENTATION parameter. No amount moved, no amount became client-sourced, and **not one
    idempotency key or atomic claim changed** — the keys (`tp-buy-…`, `rm-buy-…`, `coord-fee-…`,
    `expert-svc-…`, `pi-<key>`, the optimizer's derived key) are pinned by the lane's own test
    precisely so a later "tidy-up" of this parameter cannot drag one along with it.
    **(d) ONE SOFT PROMPT TO SAVE A METHOD, AT TWO MOUNTS AND NO THIRD.** After a Trip Pass
    purchase (`TripPassCard`), and at Finalize when the plan actually holds bookable rows —
    `ready_for_checkout` items or bookings — on `SlipView`. It reuses the EXISTING
    `AddCardDialog`/SetupIntent rail and mints no Stripe call of its own (see (b)). It is
    dismissible per scope (localStorage, every read and write wrapped — an absent or throwing store
    reads as NOT dismissed, because showing a soft prompt once more is the harmless failure and
    suppressing it forever is not), and it **never blocks**. **NEVER AT SIGNUP** (that is (a)).
    **§13 — IT RENDERS ONLY ON A KNOWN-EMPTY VAULT.** `GET /api/me/payment-methods` returns
    `{available:false, methods:[]}` when Stripe is unconfigured or the read degraded, and an
    in-flight read also reports no methods. **Neither of those is "this traveler has no card"** —
    they are "we have no answer" — so the prompt shows in NEITHER. One predicate,
    `shouldOfferSavePayment` (`client/src/lib/save-payment-prompt.ts`), answers this for both
    mounts; a second copy is how one surface starts nagging someone who already saved a card.
    **(e) APPLE PAY NEEDS A ONE-TIME STRIPE-DASHBOARD DOMAIN REGISTRATION. THAT IS AN OPERATOR
    STEP, RECORDED HERE, NOT CODE**, and no test can assert it was done — which is why the FAQ
    answer says wallets appear "where your device and browser support them" rather than promising a
    specific button. The same answer was corrected in this lane: it previously stated there was no
    wallet integration, which stopped being true the moment (c) landed. **PayPal is still not
    integrated and is still not claimed.** **The association file's PATH is now served (ledger
    `2026-09-05-well-known-static`): `/.well-known/*` is a static mount registered ahead of both
    SPA catch-alls, which were answering Stripe's verification fetch with the SPA's 200-HTML "404
    – Lost at Sea?" page — the file itself remains an operator drop-in, and the dashboard
    registration remains the operator step this clause rules it to be.**

44. **THE PLATFORM'S BOOKING AGENT IS THE AI COPILOT FIRST; A HUMAN OR A PARTNER API MAKES THE
    PURCHASE; BROWSER CONTROL IS READ-ONLY (decision-maker ratified Sep 5, 2026, evening — ledger
    `2026-09-05-ai-booking-agent`). NO SCHEMA CHANGE, NO MIGRATION, NO CODE IN THIS LANE — it is a
    design ruling; content of record is `docs/design/AI_BOOKING_AGENT_BRIEF.md`.**
    (Locked Decision NUMBERS are this file's own frozen series and are unrelated to ledger ids,
    which are date-slugs per ruling 25. 40–43 are present above; this is 44.)
    The platform already promises the traveler, on every partner-fulfilled item, that *"our booking
    agent will handle this and add it to your trip"* (`AffiliateBookButton.tsx`). Today that promise
    is kept by a pooled human queue whose **assignment is `getExpertUserIds(10)[0]`** — the first
    `role='expert'` row the table returns, with **no category and no city match** despite the
    comment above the call claiming both (`server/routes/content.routes.ts:7534`,
    `server/services/content-query.service.ts:568`) — and whose **traveler-facing read
    (`GET /api/affiliate-booking-requests/user`) has ZERO callers in `client/`**. The one piece of
    machine help that exists, the ratified verification leg
    (`server/services/booking-verification.service.ts`), is mounted on the trip-scoped Workstation
    only; the POOLED queue an unassigned request actually lands in
    (`client/src/pages/expert/inbox.tsx` `AgentBookingRequestsSection`) has no verify control at all.
    **(a) THE COPILOT IS ASSIGNED FIRST, BEFORE ANY HUMAN.** It researches (Tavily) and verifies
    through the EXISTING verification leg — **extended, never forked**: `safeParseExtractedFacts` /
    `buildFlagsAndVerdict` / `draftAgentNote` and the in-flight+throttle claim taken BEFORE the paid
    calls are one implementation each, and a second extractor or a second verdict predicate beside
    them is the derivation-drift class §18 rule 1 names. It resolves ambiguities with the traveler
    (which time slot, which room class), prepares an exact purchase packet, and DRAFTS the
    traveler-facing confirmation. **Humans see only requests that are READY TO BUY or FLAGGED.**
    **(b) AN API PARTNER IS BOOKED END TO END BY THE AGENT** through the partner's booking API:
    a REAL confirmation id, **idempotent by construction (§15** — CLAIM → AUTHORIZE → PROMOTE with
    a TTL reclaim and the §15b pre-flight marker, never a compensating rollback**)**, **amount
    server-derived from the partner's own priced availability response (§14)**, commission left at
    the honest `"0.00"`-pending-partner-report the confirm path already writes (never estimated).
    **AMADEUS IS CITED AS THE SHAPE, NOT AS RUNNING CODE, AND THE FILE SAYS SO:** ledger row 34
    (2026-08-05) DROPPED it — service deleted, provider-health entry removed, `/api/amadeus/flights`
    retired, `/api/amadeus/locations` reduced to a `location_cache` read — and revival needs new
    credentials **and a new ruling**. **There is no partner BOOKING client anywhere in `server/`**
    (grepped). So (b) is DESIGNED and UNBUILT, and a speculative client for an unsigned partner is
    exactly the second unaudited money path this rule exists to refuse. The nearest live thing is
    `viator.service.ts`'s `checkAvailability` — a real partner AVAILABILITY API with no booking
    call, which makes it a better `researching` INPUT than a page extract and still not a purchase.
    **(c) AN AFFILIATE (LINK) PARTNER GETS A ONE-CLICK HUMAN PURCHASE.** The human booking agent, or
    the traveler themselves, presses the final buy on the partner's page opened through the
    platform's TRACKED redirect (`sub_id` carrying the request id — the parallel lane
    `2026-09-05-affiliate-subid-live`; the token is already baked into the STORED `affiliate_url` at
    create by `applyAttributionSubId`, dormant behind `TP_SUBID_ATTRIBUTION`, and the reconciliation
    matcher already adopts the partner's REAL reported amount off it rather than estimating).
    **THE AGENT NEVER TYPES A CARD INTO A PARTNER FORM AND NEVER COMPLETES A PURCHASE BY BROWSER
    AUTOMATION**, for three reasons each of which alone is sufficient: affiliate programs treat
    automated conversions as FRAUD and it is the commission the whole rail exists to preserve that
    is forfeited; a bot purchase is a **money movement with no server-verified actor and no
    idempotent claim** (§14 wants the actor from the session, §15 wants a retry to produce one
    effect — a headless press satisfies neither, and a re-run is a second REAL charge); and card
    handling outside Stripe is a **PCI exposure** (the same hard gate MONEY_MAP §0a already sets for
    Model B). **THE ONE RAIL THIS NEEDS DOES NOT EXIST:** `POST /api/content/affiliate-redirect` is
    content-addressed, unauthenticated and hands the URL to whoever asks — right for its
    informational job, wrong for this one. Phase 3 builds a **request-addressed,
    authorization-gated** redirect admitting only the request's own traveler or its assigned agent.
    **§16 IS NOT LOOSENED BY THAT:** §16 prohibits UNTRACKED raw outbound and off-site booking CTAs;
    a tracked, gated, request-scoped redirect is the agent rail completing itself.
    **(d) BROWSER CONTROL IS READ-ONLY.** Playwright or a hosted browser is for VERIFICATION and
    PRICE CAPTURE where Tavily's extract falls short. Write-capable automation against a partner is
    revisited **only with that partner's WRITTEN CONSENT, recorded in the ledger** — a ruling, not a
    ticket.
    **(e) THE STATUS VOCABULARY IS HONEST (§13):**
    `received → researching → ready_to_buy → purchased_by_<human|traveler|api> → confirmed`, plus
    `flagged` and `unavailable`. **"BOOKED" IS SAID ONLY WITH A CONFIRMATION IN HAND** — so
    `purchased_by_*` (a named actor attempted a purchase) and `confirmed` (we hold the reference)
    are DIFFERENT FACTS and are never collapsed, and the slip's bookings section (ruling 42 **D9**,
    owner + `payer`-role audience, gated by the same `canPayBalance` predicate the route runs)
    renders **"prepared, awaiting purchase" DISTINCTLY from "booked"**. `flagged` is a QUESTION and
    `unavailable` is the PARTNER'S ANSWER — today's single `failed` bucket conflates them, which is
    the §13 lie this vocabulary exists to prevent. Value set is **APP-ENFORCED with NO DB CHECK**
    (the publish-trap posture; `status` is `varchar(30)` today and stays so) and **NO BACKFILL** —
    a row that was `assigned` under the old vocabulary was assigned under it, and rewriting it to
    `received` would invent a fact about work nobody did; readers map the legacy four explicitly and
    say so. Statuses a HUMAN may set are allowlisted; `researching` and `purchased_by_api` are
    **server-written only** — a human may not type themselves into a machine state.
    **A SERVER-SIDE BIRTH SITE BORN AFTER THIS VOCABULARY BIRTHS `received`, NOT LEGACY `pending`
    (ledger `2026-09-20-handoff-born-received`):** the booking-concierge hand-off does; the
    traveler-initiated create route (`content.routes.ts`) stays on `pending` by its own standing,
    cited exception, unchanged.
    **(f) COST AND HONESTY.** Every copilot model call writes `ai_cost_tracking` through the
    EXISTING `trackAnthropicResponse` — and because that table is one of the two objects this file
    already names as a **deploy-push casualty** (created by `025b_ai_cost_tracking.sql`, absent from
    `shared/schema.ts`, so a publish drops it and the stamped migration never recreates it),
    **declaring it is a prerequisite of multiplying call volume through it**, recorded here.
    **THAT PREREQUISITE IS MET, AND SO IS THE ONE UNDERNEATH IT (ledger
    `2026-09-17-ai-cost-actor-id`, migration 310; landed via PR #981).** `ai_cost_tracking` is
    declared in `shared/schema.ts`, and the attribution it records is now a STRING: `users.id` is a
    varchar while `user_id` here is a uuid, so an account whose id was not uuid-shaped raised
    `22P02` and the WHOLE cost row vanished into a deliberately-swallowed error. `actor_id
    varchar(255)` is additive, nullable, with NO DEFAULT, NO CHECK, NO INDEX and NO BACKFILL;
    `user_id` keeps its type, because `ALTER COLUMN … TYPE` is a §20 DECLINE prompt at publish. ONE
    writer sets `actor_id` always and `user_id` only when the id parses as a uuid, and a failed
    insert is logged with its SQLSTATE instead of being silent; ONE reader expression,
    `COALESCE(actor_id, user_id::text)`, attributes the pre-310 and post-310 eras alike (§13 — the
    fallback is explicit and nothing was backfilled).
    The copilot **never invents availability, price or policy — `null` WITH A REASON** — and **a partner
    page that cannot be read leaves the request `researching` with the reason, NEVER
    `ready_to_buy`**. Absent fields are OMITTED on the traveler surface, never zero-filled: a null
    price is "the page did not state one", not "$0".
    **NEGATIVE SPACE, and it is the load-bearing half.** This ruling creates **no second booking
    store** (`affiliate_booking_requests`, `service_bookings`, and the cart as `itinerary_items`'
    `ready_for_checkout` projection are the three, and there is no fourth); touches **no §14/§15/§17
    invariant on the platform money path** (an affiliate purchase mints no platform PaymentIntent at
    all — ruling 43(c)); **estimates no commission**; changes **nothing about how a request is
    CREATED** (the §16 server-resolution rewrite — the client supplies a booking reference, never a
    URL, and never receives one — is untouched and is what makes this lane safe to build at all);
    and **does NOT fix the arbitrary human assignment**, which is recorded as a finding and needs
    its own ruling. An `affiliate_booking_requests.status` describes a PARTNER purchase and an
    `itinerary_items.routingStatus` describes OUR cart projection (ruling 39) — **never merged,
    never mirrored, never derived from each other**.
    **ASSIGNMENT IS RULED (2026-09-08, decision-maker; ledger `2026-09-08-assignment-is-claimed`).**
    This entry recorded that the arbitrary assignment "needs its own ruling". It has one:
    **auto-assignment is RETIRED and a request is CLAIMED from the pool.** No assignee is stamped
    at create; the request lands in the existing pooled queue and is claimed by whoever takes it,
    and any matching only ORDERS that queue. Stamping the first `getExpertUserIds(10)[0]` row
    created an owner who never agreed to the work and hid the request from everyone else. §13: an
    unclaimed request says so and is never shown as someone's. Existing assigned rows keep their
    assignee — no backfill, because a row that was assigned was assigned.
    **BUILD SEQUENCE = ruling 42's build order, WAVE 2b** (namespaced per ruling 37 — never a bare
    "wave 2"), each phase appending its OWN ledger row: **Phase 0** assignment + status vocabulary
    (no schema); **Phase 1** copilot research/prepare (extends the verification module, wires the
    pooled queue's missing verify affordance, declares `ai_cost_tracking`); **Phase 2** API-partner
    end-to-end (**blocked** — no signed partner exists on `main`); **Phase 3** the one-click human
    purchase UX (**depends on** `2026-09-05-affiliate-subid-live` being on).
    **SEVEN QUESTIONS ARE OPEN AND NAMED IN THE BRIEF, NOT DECIDED HERE:** the purchase packet's
    carrier (jsonb beside `verification` vs a typed child table — schema, so it needs its own
    ratification); which rail carries the copilot's question to the traveler (the LD 40 conversation
    rail is structurally human↔human — `buildConversationId` concatenates two `users.id` — so (a)'s
    phrasing needs one of three concrete answers, and **whichever wins, the copilot's words are
    attributed to the COPILOT**, the same false-attribution line ruling 42 D4 drew for
    `expert_note`); the snapshot staleness window (config, never a literal); the `sourceType`/
    `userId` a copilot-initiated call writes to `ai_cost_tracking`; who SENDS the drafted
    confirmation (the copilot only DRAFTS it); the `origin` a copilot-prepared, human-pressed
    booking's itinerary item carries (the confirm path writes `origin:'expert'` today, true when an
    expert pressed and false when the traveler did); and which partner is Phase 2's first.
    **CUSTODY PURCHASING IS RATIFIED IN PRINCIPLE, NOT YET BUILT (ledger `2026-09-19-concierge-custody-rulings`).**
    `docs/design/CONCIERGE_BOOKING_UNIVERSAL_DESIGN.md` CB-1 and CB-3–CB-7 are adopted; CB-2 keeps
    Locked Decision 51's Booking Concierge fee UNCHANGED (pass-through principal, no second fee, no
    re-base on partner principal). LD 43(c)'s "affiliate purchases never see wallets" and LD 44(c)'s
    "purchases with their own payment method" will be AMENDED when Lane 3 actually lands a platform
    PaymentIntent / issued card — not now, since no code exists. The HARD STOP (CB-8 numbers, the
    companion audit) still holds; do not start Lane 3 against this paragraph alone.
    **A PURCHASE NOW WRITES THE LINKED PLAN ITEM IN PLACE (ledger `2026-09-19-linked-item-purchase-write`;
    design doc §5 S5/S6).** `markLinkedItemBooked`/`markLinkedItemConfirmed`
    (`server/services/partner-item-write.service.ts`) update the request's own linked
    `itinerary_items` row atomically, keyed on `itinerary_item_id` + `trip_id`, and never a second
    item; the unlinked legacy create is kept byte-for-byte, and the `origin` question above stays
    open — this lane does not decide it.

45. **THE AI CONCIERGE IS AN ACTOR ON THE PLAN, NOT A PLACE; THE CONSOLE IS ONE SPINE WITH EVERY
    OTHER TAB A VIEW (decision-maker ratified Sep 7, 2026 — ledger rows
    `2026-09-07-concierge-conversation-trip-id`, `-concierge-page-is-a-door`,
    `-ask-ai-drawer-paid-task`, `-trip-cart-leaves-sidebar`, `-my-events-folds-into-my-plans`,
    `-trip-card-loses-tab-shell`, `-console-one-grammar`, `-home-owns-time-axis`; content of record
    is the Console & AI Concierge brief, `docs/design/CONSOLE_AND_AI_CONCIERGE_BRIEF.md`).**
    (Locked Decision NUMBERS are this file's own frozen series and are unrelated to ledger ids,
    which are date-slugs per ruling 25. 40–44 are present above; this is 45.)
    The core ruling: every AI surface is a control on the slip that reads the plan live and writes
    ONLY through proposals — the AI Planner splits at the mint (before it, a door into the one
    planning modal; after it, a drawer on that plan's slip), and the console stops being ten peer
    destinations and becomes one spine, **My plans**, with every other tab a view that reads plans
    and lands its actions on one plan's slip. **The eight:** **(1)** a nullable trip id on the AI
    conversation row, so a conversation can belong to a plan — additive, no CHECK, declared in
    `shared/models/chat.ts`; **(2)** the concierge page becomes a DOOR into the one modal on the
    `/quick-start` retirement pattern (LD 42 D14), its guest claim token surviving — the three-tier
    chooser exists three times today and one question answered in three places is the drift class
    §18 rule 1 names — **LANDED** (lane L6, ledger `2026-09-07-concierge-door`): the intent form
    opens the one modal with the destination and the CATALOG-resolved occasion slug it holds, the
    tier→finish map is one pure module (`client/src/lib/concierge-tiers.ts` — `ai` → the free
    draft, `expert` → the local-expert finish now carrying a real `tripId` per LD 32, `full` →
    NOTHING, since a coordination engagement is not a way to build a plan and keeps the rail it
    already has), the dead `/cart?…&concierge=` hand-off is deleted (§18c) and the guest claim
    token is untouched; **(3)** the "Ask AI about this plan" drawer on the slip is the home of the
    PAID AI task (`concierge:ai_task`) — every answer is a proposal, apply is the traveler's click,
    charged only on apply, expert items protected per LD 42 D3; **(4)** Trip Cart LEAVES the
    sidebar — checkout is reached from the slip's Finish card and the Finalize chooser, the route
    kept as the guest fallback until G2, gated on the checkout page reading the plan's
    `ready_for_checkout` items (LD 39's no-second-store) rather than `cart_items`; **(5)** My events
    folds into My plans — a done-for-you engagement is a card on its plan's slip, the money rail
    untouched; **(6)** the Trip Card loses its tab shell — one page: frozen plan, live status, the
    booking-agent drawer, a typographic hero when no market photo is known (never a photo of
    nowhere); **(7)** the traveler console adopts the ONE site grammar — coral primary (`#E85D55`),
    the earn tokens, Fraunces headings, Geist Mono eyebrows — and Discover, Experts and checkout
    render INSIDE `DashboardLayout`; **(8)** Home owns the TIME AXIS, AMENDING R-A — dated rows
    across every plan, nearest first, a row with no date omitted never guessed, plus what changed
    since the last visit; no plan card, no counts, no messages, which live on My plans, the slip
    and Inbox. **EVERY AI WRITE IS A PROPOSAL** — free draft on empty, Optimize or a paid task on
    non-empty, apply on confirm, expert work protected per D3; no fourth AI write path (the posture
    R-J ratified for connected agents: agents build and stage, humans pay). The build sequence is
    the brief's §10: eighteen lanes in four waves, serial, one ledger row per lane; L16 (the paid
    drawer) needs its own design brief before build, and L17 waits on LD 44 phase 0.
    **(6) HAS LANDED (lane L9, ledger `2026-09-07-trip-card-one-page`).** `/trip/:id` is ONE page —
    the full-stage `PlanCard` plus a 320px right rail (Booking agent · Your expert · Suggestion ·
    Back to planning); the Itinerary/Bookings/Logistics tab shell and the page's stock-photo hero
    are gone, purchases render in the card's Purchases drawer and in the My-bookings ledger, and
    the booking-agent card is a PLACEHOLDER until L16/L17 that reads only the stages today's rows
    carry (LD 44 (e)'s legacy four mapped explicitly; it never claims a copilot exists). Two
    invariants bind every lane after: **all plan-time reasoning is ONE module,
    `shared/plan-timing.ts`** — lane L10 owns its start-instant half and the 48-hour window (which
    it IMPORTS from `shared/trip-primary-surface.ts`, so that constant does not move and the two
    files must never import each other both ways), and L9 added the wall-clock half on those same
    primitives; and **a countdown renders only where `trips.timezone` exists** (LD 30 — no usable
    zone ⇒ no instant at all), with the temporal engine's "90 minutes per item" assumption deleted
    in favour of an item's own `end_time`. `tripCardIsPrimary`'s no-zone answer is UNCHANGED: making
    it zone-aware requires moving that constant, which is a deliberate later lane. Two things the
    lane found and did NOT change: the pre-final case renders an honest NOTICE with one action to
    the slip rather than the redirect D8's wording implies (two armed specs assert the notice), and
    `GET /api/trips/:id/expert-advisor` returned ONE advisor where D7 rules it returns all — now
    FIXED (ledger `2026-09-07-all-advisors-reader`): it returns every advisor in a §12 read-access
    status, and `advisor` survives as the named first element.
    **(8) HAS LANDED (lane L10, ledger `2026-09-07-home-time-axis`).** ONE server reader —
    `GET /api/me/upcoming` over the PURE `buildUpcomingRows` (`server/services/upcoming.service.ts`)
    — emits six dated kinds, each naming the column that produced it: an unpaid booking
    (`service_bookings.status`, dated by the EXISTING `resolveServiceDate`), a balance
    (`balance_due_at`), the handover (derived `start − 48h`), a trip start (`trips.start_date`), an
    event (`user_experiences.event_date`; invites carry no deadline column, so none is shown) and
    an occasion whose Plus draft FIRED end to end (`occasion_drafts`, LD 26). §14 applied to
    reads: the owner is the session, never the query string. §13: an undated row is OMITTED, no
    `tz` is claimed for a NULL-timezone plan (LD 30 — the row becomes a calendar day), and nothing
    is zero-filled. **The 48-hour window is ONE derivation shared with the Trip Card lane** —
    `shared/plan-timing.ts`, which IMPORTS `TRIP_CARD_HANDOVER_WINDOW_MS` rather than restating it
    and is pinned to agree with `tripCardIsPrimary`'s own date arm (§18 rule 1). Home now renders
    Coming up · Since you were here · the home-city block · the start strip, and the plan card,
    the routing counts, the expert panels and the message previews are GONE from it — their
    information lives on My plans, the slip, Experts, Discover and Inbox; no component file and no
    endpoint was deleted, and the now-importerless panels are recorded in that ledger row as
    §18c candidates for a later lane, not acted on here.
    **(3) HAS ITS STORE AND ITS CHARGE POINT (ledger `2026-09-15-d19-plan-proposals`, migration 299;
    `2026-09-15-d20-d21-proposal-charge`, migration 300; punchlist D-19 = option (b), D-20 = A,
    D-21 = A; decision-maker sentence applied 2026-09-15).** An AI proposal lives in
    **`plan_proposals`** — a child table of `trips` (CASCADE, additive, **NO DB CHECK and NO DEFAULT
    on `status`**, table and index declared in `shared/schema.ts`), a **LOG and not an ordered list**
    (no `position`, no UNIQUE), with a nullable `conversation_id` **ON DELETE SET NULL** so deleting a
    thread never deletes the proposals it produced. It is deliberately **NOT** the expert
    `trip_suggestions` rail, whose `expert_id` is NOT NULL and whose approve path hardcodes
    `origin:'expert'` — the false attribution LD 42 D4/D23 forbid by name — and that rail is
    untouched. The value set is app-enforced and stated ONCE (`shared/plan-proposals.ts`, §18 rule
    1); admission is **pick-based and reaches no request body** (§19, no `createInsertSchema`
    denylist exists at all); ONE service owns the table and its discard is an **atomic conditional**
    (§15/§18b), so an applied proposal is never discardable — **D18: `applied_item_ids` is a record,
    never an undo**. Read exposure, discard, pay and apply are gated by the same owner/§12-WRITE
    advisor predicate item mutations use, with **one 404 for every refusal**. The APPLY is charged as
    LD 41 (f) now records; additions are born `origin:'ai'` (server-stamped), and a `replaces` naming
    protected expert work is REFUSED with the item ids, never skipped (D3). The Ask-AI drawer UI and
    the CREATE rail are the lane that follows; nothing produces a proposal outside tests yet.
    **(3) AMENDMENT — OPTION B, REFUND THE FEE ON EXPIRY (decision-maker ruling Sep 16, 2026 —
    ledger `2026-09-16-l16-lane1-review-fixes`).** A PAID proposal refused at apply for a stale
    price or an unavailable listing is NEVER applied at a changed price and NEVER left
    paid-and-unappliable: the fee is REFUNDED through the ONE shared Stripe refund call site under
    `ai-task-refund-<proposalId>`, the §15b claim being the atomic status flip to `refunded` taken
    BEFORE the Stripe call; a failed Stripe call keeps the claim and the retry re-drives the same
    key. The apply's liveness re-check is BY ID under `optimizerCatalogLivenessWhere`, the ONE
    predicate the optimizer's catalog reader pages over — never by membership in a page of its
    result.
    **(3) SECOND AMENDMENT — EVERY APPLY REFUSAL OF A PAID PROPOSAL REFUNDS IT, AND THE AUDIT ROW
    NAMES THE REFUSAL (decision-maker ratified Sep 17, 2026 — ledger
    `2026-09-16-l16-lane1-review-fixes`).** A paid proposal refused at apply is refunded whatever
    the refusal — stale price, unavailable listing, or protected work (LD 42 D3) — through the ONE
    shared refund path under `ai-task-refund-<proposalId>`; `protected_item` was previously left
    charged, unappliable AND undiscardable. `not_applicable` is excluded by ruling: it reports a row
    that was already terminal. The `refunds` audit `reason` records the REFUSAL that caused the
    refund, never the mechanics of the call; on the ONE path where the original refusal is genuinely
    unrecorded — a retry completing a refund whose Stripe call threw — it records
    `unknown_prior_refusal` and never a reason re-derived from the proposal's state now, which could
    attribute the refund to a refusal that had not yet happened (§13).
    **A CALLER THAT LOSES THE RACE TO THE REFUND CLAIM IS ANSWERED `refunded`, NEVER
    `not_applicable` (ledger `2026-09-19-proposal-refund-race-reason`):** a status read that lands
    after a concurrent caller's claim commits is told the refund it can see; `not_applicable` keeps
    meaning terminal-before-the-request (applied/discarded), never a raced refund.
    **(3) HAS LANDED AS FAR AS THE MODEL CALL (lanes 2 and 3, ledger
    `2026-09-16-l16-lanes2-3-drawer`).** The Ask-AI drawer is a rail card of its own on the slip —
    never a third branch of `slipBuildAiAction` — and every sentence it says has ONE home
    (`client/src/lib/ask-ai-drawer.ts`; §18 rule 1). **Its visibility MIRRORS the routes and never
    widens them:** ask / read / discard for the owner or a §12 WRITE advisor, and **pay and apply
    for the OWNER only** (LD 42 D-48 as amended) — with the advisor arm proven by the proposal log's
    own `requireWriteAccess` read SUCCEEDING, because `tripRole === "expert"` grants `pending` and
    the client may not restate §12's status list. **The money line is the server's `aiTask
    { coveredByTripPass, priceCents }` block on the existing `GET …/proposals` and nothing else** —
    no second fee read, no literal, and all three ways of having no answer render NO claim and NO
    number (§13). **Review-first and no undo is drawn** (D18). The model call and the post-final
    Trip Card mount are the two things still unbuilt, and the drawer says the first one out loud.
    **(3) THE CREATE RAIL'S MODEL CALL — THE PROMPT SCOPE, AND WHAT IS NEVER IN IT (ledger
    `2026-09-16-l16-lane1b-model-call`; landed via PR #974).** `POST /api/trips/:tripId/proposals`
    reads the plan LIVE and makes ONE model call whose whole input is the named `AiTaskPromptScope`
    (`server/services/ai-task-prompt.ts`, pure) — the trip's own fields, the ordered items with the
    protected set MARKED AS CONSTRAINTS through the one existing predicate pair, the plan's events
    and stops, and, **for the paid task only** (an empty plan defers to the free draft, LD 41
    (b)/(c)), the catalog from `loadOptimizerCatalog`. **`trips.expert_notes`, guest PII, any other
    plan's or traveler's data, any `users` row and anything from `fee_bands` are never in it**, and
    neither is a protected row's `expert_note` TEXT — the model is told the row is untouchable,
    never what the expert wrote on it (LD 42 D4). No number the model produces is ever persisted,
    and a failed ask writes NO proposal row while still writing an attributable `ai_cost_tracking`
    row **iff the SDK surfaced usage** — where it did not, the honest record is no row and a log
    line saying why (§13). An EMPTY change set is neither a model error nor a parse failure, so the
    row IS written and **no summary is invented**. **Recorded as a filed migration ruling, not fixed
    in that lane:** `ai_cost_tracking.user_id` is a `uuid` column while `users.id` is `varchar`, so
    an account whose id is not uuid-shaped loses its WHOLE cost row silently — the fix is an `ALTER
    COLUMN TYPE` plus the `shared/schema.ts` declaration the deploy-push rule already requires of
    that table.
    **(3) IS COMPLETE: THE DRAWER NOW MOUNTS POST-FINAL TOO, AND IT IS A MOUNT AND NOT A SECOND DRAWER
    (lane 4, ledger `2026-09-17-l16-lane4-postfinal`; landed via PR #977).** The SAME `AskAiDrawer`
    renders on the Trip Card's rail in the **Suggestion card's slot** — that card draws nothing unless a
    suggestion is actually pending, so the ratified rail still reads four (LD 45 (6)). **Nothing
    branches on the page:** copy, visibility, the `aiTask` money line, the 503/409/429 readings, D-50
    (c)'s staleness-as-refusal and owner-only pay/apply are identical on both mounts, and the `surface`
    prop picks a test id and nothing else. **The ONE addition is D-49's review-first sentence, in the
    same copy module** (§18 rule 1): a plan that is CURRENTLY final is told, before the charge, that
    applying makes a **NEW Trip Card version** and the version is **NAMED** (`v{n+1}`, the one being
    read kept); a REVISING plan is told its card keeps the version it has, because
    `reFinalizeIfCurrentlyFinal` writes none; and a surface that does not state the plan's final
    standing — the slip — says **NOTHING** (§13). **No undo is drawn** (LD 42 D18), and LD 41 (b)'s
    empty-plan branch is kept although it cannot fire post-final. **L16 is complete**; lane 5 was ruled
    out by D-45.

46. **AN ARTIFACT IS ACCEPTED, NOT TIMED OUT; A REVISION IS A ROW; AND A HYBRID MAY DECLARE ONE ARTIFACT
    WITHOUT MOVING ITS MONEY (decision-maker ratified Sep 15, 2026 — punchlist D-24/D-25/D-26/D-40, all
    option A, and D-27 (7 days); ledger `2026-09-15-d24-d26-acceptance-columns`, migration 303, and
    `2026-09-15-d27-artifact-timer-acceptance-prompt`).** `service_bookings.accepted_at` records the
    traveler's ANSWER where `completed_at` records the money event, and **the acceptance deadline is
    DERIVED** from the per-booking `service_bookings.delivered_at` plus `acceptanceWindowDays()` (config,
    default 7, env-overridable) and **never stored** — a stored end date is a second authority that
    disagrees with the config the moment it moves. Delivery is **PER BOOKING** (`delivered_at` +
    `deliverable_file`, the listing's `service_file` as the honest fallback with the reader saying which it
    served), because a listing-level artifact means a revision for one traveler rewrites the file every
    other buyer downloads. A revision is a **CHILD ROW** (`booking_revision_requests`, FK CASCADE,
    `UNIQUE (booking_id, "position")`) whose **count is DERIVED and never stored**, with **no
    `revision_status` mirror**; the allowance is the listing's own `revisions_included`, **read on every
    decision and never copied onto the booking**, and a request beyond it is refused **with the number
    stated and is never a dispute**. Acceptance completes through the **EXISTING `completeBooking` as a
    new CALLER** (`traveler_accepted`) over its own atomic conditional — **no second minting path**, and
    `awaiting_acceptance` is deliberately kept out of `COMPLETION_ALLOWED_FROM_STATUSES` because that list
    is also the timer's candidate predicate. **`provider_services.declared_artifact_deliverable` lets a
    `hybrid` listing declare ONE artifact that takes acceptance on its own while the booking keeps D-7
    completion: accepting or revising it GATES NOTHING about completion or the mint.** All columns
    additive-nullable, NO DEFAULT, NO CHECK, declared in `shared/schema.ts`, no backfill; the two new
    `status` values are app-enforced (LD 44(e)). **§13: NULL = never accepted / never delivered / no
    per-booking artifact / not declared, each OMITTED — never "not accepted", never "no artifact", never
    "0 revisions remaining" beside a button that refuses; an undated booking is on NO acceptance clock and
    says so.**
    **`artifact_timer` IS AN ACCEPTANCE-PROMPT RULE, NEVER A COMPLETION RULE (D-27; no migration).** A
    clock may never complete an artifact booking in the seller's favour: the nightly job ASKS
    (`confirmed → awaiting_acceptance` once a delivery instant exists) and ESCALATES
    (`awaiting_acceptance → disputed`, system reason `acceptance_window_elapsed`, after
    `acceptanceWindowDays()` — CONFIG, default 7) into the **EXISTING** admin dispute queue through **the
    ONE dispute writer**; never a second queue and never an `admin_review` status. Only the traveler's
    acceptance, or a human resolving that dispute, completes an artifact and mints its held earning. The
    delivery instant is ONE derivation stated with its source (`per_booking` | `listing_clock`), and a
    derived listing-clock instant is **never written back to `delivered_at`**. The payment verification
    sits on the ASK, because opening the acceptance rail on an unpaid booking would hand the traveler a
    button that mints. **NULL = no instant ⇒ the booking is skipped with `no_delivery_timestamp` and never
    put on a clock (§13)**, and rows completed under the old timer are never rewritten. Left for later
    lanes, named: brief §7 lane 4 (every surface), and the refund on a rejected artifact, still UNRULED.
    **THE REFUND ON A REJECTED ARTIFACT IS THE ADMIN'S DISPUTE OUTCOME — the line above is now ruled
    (ledger `2026-09-17-ld50-remainder-and-artifact-refund`; landed via PR #973).** A traveler's
    rejection of an artifact **moves no money**: it ASKs and then ESCALATEs into the existing admin
    dispute queue through the ONE dispute writer, exactly as D-27 already had it. The refund is the
    **ADMIN's resolution outcome** — a full refund of what that booking's traveler was charged,
    through the ONE shared Stripe refund call site under `artifact-reject-refund-<bookingId>`, with
    the §15b claim taken from the `disputed` from-state BEFORE the call and the booking and every
    not-yet-refunded `booking_component_states` row moved to `refunded` in that same statement.
    **No seller payout is ever minted**, in two layers: the ledger reversals run first, and no
    from-state list reaching the completion mint contains `refunded`. The amount is server-derived
    from the row (§14); the body is a `.strict()` pick of an optional admin note that reaches the
    audit log and nothing else (§19); a Stripe failure reverts the claim to `disputed`. No new
    queue, no new status, no new table, no migration. **§13:** `refunded: true` is said only with a
    refund id in hand, a retry reports `alreadyRefunded` and claims NO id, and
    `no_payment_intent` / `nothing_charged` / `wrong_status` are refused by name.
    **THE SURFACES EXIST (PR #979, ledger `2026-09-17-surfaces-acceptance-completion`).** The traveler
    accepts, asks for a revision, reads the delivery date, the DERIVED acceptance window, their own
    revision requests and the timer's ask/escalate states on **My Bookings**; the seller declares
    completion and reads the traveler's window on **both earner consoles**; the admin's artifact refund
    is an outcome button on the **existing** dispute queue, shown only for `disputed` rows. **No surface
    computes a window, a deadline or an allowance** — every figure is the server's own derivation, and
    the five from-state lists the controls read were moved into `@shared` and re-exported by their old
    homes so a surface and its rail read ONE array. **What is NOT drawn:** the slip's D9 bookings
    section and the Trip Card's Purchases drawer carry the two new STATUS LABELS only, because the
    plancard payload holds no acceptance or declaration fields and widening it is unratified.

47. **THE SELLER DECLARES; THE TRAVELER HAS A WINDOW; "COMPLETED" IS SAID AT ITS CLOSE (decision-maker
    ratified Sep 15, 2026 — ledger `2026-09-15-d36-d39-completion-declared`; migration 304).** For the
    owner-declared rules and the place-anchored timer, completion is TWO guarded flips with the traveler's
    dispute window between them: `confirmed → completion_declared` (the seller, or `service_date_timer`,
    stamps `service_bookings.completion_declared_at` and MINTS NOTHING) and `completion_declared →
    completed` (the nightly job, actor `window_elapsed`, the ONE `completeBooking`, payment gate at that
    flip). The window is `declaredCompletionWindowDays()` — a DELEGATION to `holdWindowDays('service_booking')`,
    never a parallel constant — and its deadline is DERIVED (`shared/declared-completion-window.ts`), never
    stored. **D-37:** the held earning's `available_at` is anchored to the DECLARATION, so the window is served
    once and no payout instant moved; a NULL anchor keeps `now`. **D-38:** a dispute inside the window is the
    SAME `disputed` row and queue (no `admin_review`, no disputes table); the queue tells stages apart by
    derivation; zero flagged earnings is never read as cleared — the status is the block. **D-39:** on
    `coordination_states` the ASSIGNED COORDINATOR declares, `completed` is the window's word, the traveler's
    one move is `completion_declared → disputed`, and the window gates the admin REFUND only — **no coordinator
    earning is ever minted**, and whether one should be stays unruled. Bundles and property still complete
    directly. "Completed" is never rendered before the window closes. **The in-person timer opens the window at
    its EXISTING fire instant (service date + 1 + N days), preserving every payout instant (decision-maker kept
    this Sep 16, 2026)** — opening it at the day boundary would pay sellers earlier and needs its own ruling.

48. **A BUNDLE'S COMPONENTS ARE ROWS, AND A PARTIALLY COMPLETED BUNDLE IS ITS OWN STATE THAT MINTS ONCE OVER
    REDUCED FIGURES (decision-maker ratified Sep 15, 2026 — ledger `2026-09-16-d32-d35-bundle-components`;
    migration 306).** `booking_component_states` is the child-row home for a purchased bundle's components (FK
    → `service_bookings` ON DELETE CASCADE, UNIQUE (booking_id, component_service_id), `status` app-enforced
    with NO CHECK, declared in `shared/schema.ts`), BORN by the checkout claim's composer
    (`storage.createServiceBooking`, the §19d named exemption) from a snapshot that — D-33 — carries each
    component's catalog price at purchase in cents, SERVER-DERIVED (§14) and never re-read from the listing;
    the client-facing birth rail strips `bundleComponents`/`componentCompletions`. Every component transition
    is ONE atomic conditional (`pending → completed|failed`, parent `confirmed` in the same WHERE); the parent's
    outcome is the ONE derivation `deriveBundleOutcome`, never stored. `completed` still means EVERY component.
    **D-34:** `partially_completed` (code-only, LD 44(e)) is reached exactly when every component has an
    answer, ≥1 delivered and ≥1 failed, from `confirmed` only, NAMING the failed component; it joins the PAID
    lists and the money-integrity invariant, not the terminal, disputable or timer-candidate lists —
    **`COMPLETION_ALLOWED_FROM_STATUSES` is deliberately NOT widened (ratified Sep 16, 2026)**: the state is
    entered only when nothing is pending, so nothing late exists. **D-35:** that flip mints ONCE, inside its
    transaction, through the SAME `mintCompletionEarningsForBooking`, over the row's own figures scaled by the
    delivered share of the snapshot (pro-rata — bundles are discounted), never per component and never a rate
    literal; **the platform fee is the PURCHASE-TIME resolver output SCALED, never a band re-resolved at
    completion (ratified Sep 16, 2026)** — a band edit after the sale must not move a payout, the same logic
    that snapshots the price. A NULL snapshot price refuses the flip. NO BACKFILL: a legacy bundle is read
    from its jsonb with the source NAMED and can never be partially completed. The component REFUND is
    Locked Decision 50.

49. **A CUSTOM QUOTE IS A `service_quotes` ROW WITH AN EXPIRY, NEVER A PRICE ON THE LISTING (decision-maker
    ratified Sep 15, 2026 — ledger `2026-09-15-d28-d31-service-quotes`; migration 305).** A REQUEST mints no
    booking; the owner issues `amount_cents` with `expires_at` derived from `QUOTE_VALIDITY_DAYS` or a choice
    under the ONE platform `QUOTE_VALIDITY_CEILING_DAYS` (refused with the number stated, never clamped); an
    expired quote is re-quoted as a NEW row (`superseded_by`), never edited, and `expired` is derived, never
    stored; acceptance is an atomic claim carrying `expires_at > NOW()` in its WHERE clause (§15) that mints
    through the EXISTING birth-rail writer with the quote's amount as `total_amount` (§14 — the accept body
    carries no amount) and stamps `booking_id`; a quote-approve listing with deposits enabled resolves
    `deposit_balance` (D-31). The quote-born booking is born UNPAID; the charge through `/api/checkout` is its
    own lane.
    **THE SURFACES LANDED (PR #978, ledger `2026-09-17-surfaces-quotes-settlement`):** the traveler's
    Quotes tab on `/my-bookings` and the seller's issue/withdraw queue on BOTH Catalogs. The client
    derives NO lifecycle and NO window — `expired` arrives resolved and no day count or ceiling exists
    client-side, so D-29's refusal is worded back from the server's own numbers. The CHARGE is still its
    own lane and the surface says so out loud rather than drawing a Pay button that leads nowhere (§13).
    **THE CHARGE LANE LANDED (PR #988) AND NOW CARRIES THE RULED FEE (decision-maker ratified Sep
    19, 2026 — ledger `2026-09-19-quote-born-traveler-fee`).** `POST /api/checkout`
    `{ quoteBookingId }` charges the SAME ruled traveler service fee every service booking carries,
    resolved/waived (Trip Pass) through the ONE shared `resolveTravelerServiceFeeSnapshot` (§18
    rule 1) the cart calls too, and disclosed before the traveler completes payment.
    **A QUOTE MAY NAME THE PLAN IT WAS ASKED FROM, AMENDED (ledger `2026-09-19-quote-plan-link`;
    migration 314).** `service_quotes.trip_id`/`itinerary_item_id` are additive, server-verified
    (LD 40 posture) at request; accept copies the link onto the booking (so the #988 waiver now
    fires) and the item is projected through the ONE copy-down, LD 39. NULL = not from a plan (§13).
    **THE FEE IS DISCLOSED ON THE ACCEPT CARD, NOT ONE SCREEN LATER (ledger
    `2026-09-20-quote-fee-preaccept`)**, a READ-ONLY list-time figure via the same shared resolver
    (the charge-time snapshot stays the record); a FULL refund is proven to carry the fee back
    through the identical whole-row rail and ledger reversal the cart uses.
    **A QUOTE-APPROVE LISTING CAN NOW GO LIVE (ledger `2026-09-20-quote-listing-goes-live`).** The
    price-required publish gate (`server/routes.ts`, both create/update rails) refused every
    `custom_quote` listing unconditionally; `listingPriceGate` exempts it (price authority is the
    quote, never the listing), and `ServiceForm.tsx` can now select the priceType at all.

50. **A PARTIALLY FULFILLED BUNDLE SETTLES ONCE BY ITS PURCHASE-TIME COMPONENT ALLOCATION (decision-maker
    ruling, Sep 16, 2026 — ledger `2026-09-16-bundle-partial-settlement`; build lane dispatched the same
    day).** Every Traveloure-custody bundle must snapshot a nonnegative gross allocation for each required
    component when purchased, and those allocations must sum exactly to the bundle's pre-fee purchase price. A
    component's current catalog price, seller tier, or later configuration must never change that snapshot.
    When final bundle fulfillment establishes that some required components were delivered and others will not
    be delivered, Traveloure records one partial settlement. The seller earns only the purchase-time allocated
    value of the delivered components, less the commission applicable to the original purchase. The traveler
    is refunded the allocated value of the undelivered components plus the same proportional share of
    traveler-paid Traveloure fees and surcharges. Stripe processing costs are not deducted from the traveler's
    refund; Traveloure absorbs any nonrecoverable processing cost. A listing's traveler-cancellation policy
    does not excuse seller nonperformance: when the seller or provider fails to deliver a component, that
    component's allocated amount is refundable even if the bundle was labeled non-refundable; when the
    traveler voluntarily cancels an outstanding component, the component's allocated amount follows the
    snapshotted cancellation policy and deadline. Partial settlement is NOT whole-row cancellation: the booking
    remains fulfilled in part, records component-level outcomes, and must not use the terminal whole-row
    `refunded` state or release all reserved capacity. The settlement creates reduced seller earnings,
    proportional platform revenue, an amount-specific refund audit record, and a Stripe refund to the original
    payment method as ONE retry-safe operation. The settlement amount and component outcome set are immutable
    after successful settlement; repeated requests, concurrent requests, Stripe retries and webhook redelivery
    must converge on one seller earning, one platform-revenue result, and at most one Stripe refund for the
    settled amount. Historical purchases always use their stored component, fee, commission, custody and
    cancellation snapshots. Traveloure may issue refunds only for components whose payment custody belongs to
    Traveloure; affiliate or partner-custody components retain the external partner's cancellation and refund
    process and must not produce a Traveloure Stripe refund. **Settlement happens only when the undelivered
    components are conclusively cancelled, failed or otherwise closed — never inside the component-completion
    recorder, and no partial completion is reinterpreted as immediately final.**
    **`booking_component_states.status = 'refunded'` MEANS THIS COMPONENT'S MONEY IS SETTLED, AND
    THE SETTLEMENT IS ITS WRITER (ledger `2026-09-17-ld50-remainder-and-artifact-refund`; lands with
    PR #973).** The value was DECLARED so readers read it correctly and **written by nothing**, so a
    component whose allocation had actually gone back to the traveler read `failed` or `cancelled`
    forever. Its writers are exactly the two paths on which the money settles: the partial-settlement
    promote, stamping it in the SAME UPDATE as `refunded_at` / `refund_amount_cents` /
    `stripe_refund_id` under the same `settled_at IS NULL` guard that makes the promote exactly-once,
    with the from-state INSIDE the statement (§18b); and the admin's artifact-rejection refund
    (Locked Decision 46). A component refunded **0** is never stamped — nothing was refunded (§13) —
    and who ended the component and why is not lost, since `failed_at`/`failure_reason`,
    `cancelled_at`/`cancel_reason` and the pinned `cancel_refund_percent` stay on the row and the
    immutable `component_outcomes` names both outcomes verbatim. Because the settlement derivation
    REFUSES a `refunded` component by name, **a promoted settlement is answered from its own settled
    row and never re-derived** — this ruling's own immutability clause, not a shortcut.
    **A WHOLE-ROW CANCEL QUOTES THE SNAPSHOT, NEVER THE LIVE LISTING (same ledger row).** A
    cancellation quote reads the tier PINNED on `service_bookings.offering_contract_snapshot`, so a
    seller who tightens their policy never tightens it retroactively for an outstanding booking; the
    whole-row and the per-component rails read it through **ONE parse** (§18 rule 1), and the quote
    NAMES which record answered. **§13: a pre-291 row with no snapshot falls back to the live listing
    EXPLICITLY, named on the response and logged** — never silently, because refusing it would strand
    every legacy traveler behind a record-keeping gap they had no part in; a snapshot whose policy is
    NULL is the DIFFERENT fact "the listing declared none" and takes the ONE normalizer's stance. The
    component rail keeps REFUSING instead, correctly — it serves only post-307 bundles, snapshotted
    by construction.
    **NOTHING RESERVES CAPACITY PER COMPONENT, AND THE CODE STATES THAT RATHER THAN RELEASING
    SOMETHING ELSE (same ledger row).** The checkout claims per CART LINE and a bundle is ONE line;
    the purchase-time component snapshot carries no slot and `booking_component_states` has no slot
    column — so a failed or cancelled component has nothing to give back, and releasing the BOOKING's
    own claim would be wrong twice over (the bundle still occupies its window, and this ruling forbids
    releasing all reserved capacity). Both component writers therefore STATE it —
    `componentCapacity: { released: 0, reason: "no_component_capacity_reserved", … }`, read through
    the ONE pair of claimed-slot deciders (§18 rule 1) — and **a per-component release is NOT
    invented: it needs a per-component slot record (a column on `booking_component_states`, or a
    `slotId` on the snapshot entry the checkout composer writes), which is an unratified
    schema/composer decision** (a reader for a fact no writer produces is the shape §18c refuses).
    **THE SURFACES LANDED (PR #978, ledger `2026-09-17-surfaces-quotes-settlement`):** ONE
    `BundleComponentsPanel` with an audience on the traveler's and both sellers' booking surfaces,
    reading the ONE new `GET /api/bookings/:id/components` (allowlist projection, audience derived from
    the row, one 404 for absent and not-yours alike). There is NO preview before a component cancel —
    none exists server-side — so no number is shown before the act and the pinned percent renders after
    it. "Prepared, awaiting settlement" is NEVER rendered as "refunded", a claimed settlement is never
    rendered as settled, and NO capacity sentence is rendered anywhere, because nothing reserves
    capacity per component.
    **PER-COMPONENT CAPACITY IS NOT BUILT, BY RULING (decision-maker ruled Sep 17, 2026 — ledger
    `2026-09-17-per-component-capacity-not-built`; no PR — this is the ruling that closes the open
    question the paragraph above named).** A bundle claims capacity as ONE cart line on the bundle
    listing; its components never claimed a slot of their own, so a failed or cancelled component
    has nothing to release, and the bundle's slot stays held because the occasion still happens. The
    honest statement `released: 0` / `no_component_capacity_reserved` (landed via PR #973) is the
    design, not a gap; a per-component slot record would invent a reservation nobody made.
    **AN ALL-UNDELIVERED BUNDLE IS CANCELLED BY THE ONE COMPONENT WRITER, IN THE SAME ATOMIC
    STATEMENT THAT RELEASES ITS SLOT (decision-maker ratified Sep 17, 2026 — ledger
    `2026-09-17-all-undelivered-parent`; landed via PR #982; NO schema change, NO migration, NO new
    status value).** When the LAST deliverable component of a bundle becomes terminal-undelivered
    and none remain, the ONE component writer (`settleBundleAllUndelivered`, called by both the
    seller's component-failure rail and the traveler's component-cancel rail — §18 rule 1) flips the
    PARENT `service_bookings` row `confirmed → cancelled` through
    `storage.updateServiceBookingStatus` with `ALL_UNDELIVERED_CANCEL_FROM_STATUSES` — ONE entry,
    `confirmed`, deliberately not the whole-row cancel's list, which admits `pending` and would
    terminalise an unauthorized claim (§15b) — so the transition is the guard (§15/§18b) and the
    booking's claimed slot units come back inside that same transaction through the ONE
    `deriveClaimedSlotIds`/`deriveClaimedSlotUnits` readers: a retry, a concurrent last-flip and the
    whole-row cancel rail all release nothing twice. Provenance is a MERGE, never a column:
    `booking_details.allUndelivered = { at, cause, componentIds }`, the components NAMED, the cause
    from the ONE derivation `deriveAllUndeliveredCause` (`seller_failed` | `traveler_cancelled` |
    `mixed`; **NULL for anything that is not all-undelivered ⇒ nothing is triggered and no cause is
    written**, §13). **THE MONEY IS THE EXISTING D-51 SETTLEMENT AND THERE IS NO SECOND REFUND
    PATH:** `issueBundlePartialSettlement` refunds each component at its OWN pinned answer — a
    failed one at its full allocation (a listing's cancellation policy never excuses seller
    nonperformance), a traveler-cancelled one at the percent its snapshotted policy pinned — plus
    the same proportional share of every traveler-paid fee, as ONE Stripe refund. It admits
    `cancelled` ONLY for a row carrying that marker, so an ordinary whole-row cancellation is still
    refused, and its `nothing_delivered` refusal is opted out of by an explicit input only this
    caller passes. **§13, and it is the load-bearing half: A CANCELLED PARENT MINTS NOTHING** — the
    retained remainder of a late strict traveler-cancel is recorded on the immutable settlement row
    and is deliberately NOT minted, because minting on a cancelled parent is a new money event
    nobody has ratified. **Left, named, not built:** no notification for the parent cancel, and
    `revertPurchasedItemsForBooking` is not called on this path.

51. **THE BOOKING CONCIERGE FEE IS CAPPED, AND ITS EXPERT SHARE IS SPLIT AT COMPLETION — ALL
    PLATFORM-SET, NEVER EXPERT-SETTABLE (decision-maker ratified Sep 18, 2026 — ledger
    `2026-09-18-concierge-fee-cap-split`; migration 311, DATA-ONLY).** The 5% facilitation fee is
    `min(price × rate, max_amount)` from ONE band, `expert_concierge_booking` — the admin panel's
    own cap field, unread until this lane (`resolveConciergeBookingFee`, PURE, no expertId/listing
    parameter). At COMPLETION, `mintCompletionEarningsForBooking` credits the listing owner the
    share snapshotted at PURCHASE from `expert_concierge_booking_expert_share` (percent,
    admin-editable, `fee-literal-ok` fallback 0.75 — the R6/migration-142 posture), folded into the
    SAME earnings rows and out of `platform_revenue.platform_fee`, inside the EXISTING idempotent
    mint (a retry mints nothing new). Migration 258's `concierge:booking_pct` /
    `concierge:booking_cap_cents` duplicates are retired (`is_active=false`, kept, never dropped).
    A row born before this lane carries no share snapshot and splits nothing — no backfill (§13).
    **THE HAND-OFF THIS FEE PAYS FOR IS WIRED (ledger `2026-09-18-concierge-handoff`, migration
    312).** Checkout of a `booking_concierge` line creates the plan's partner requests: ONE
    `createHandoffRequestsForBooking`, called by both promotion paths, turns each still-unpurchased
    partner item (`affiliate_product_id` set, `provider_service_id` NULL) that resolves to a live
    partner into ONE idempotent `affiliate_booking_requests` row. **AMENDS
    `2026-09-08-assignment-is-claimed` FOR PAID HAND-OFFS ONLY:** stamped `expert_id` = the
    listing's owner, who is paid this entry's share to do the work; the pool default stands for
    every other, traveler-initiated request.
    **THE PLAN IS RESOLVED BY THE ITEM LINK, ELSE THE BOOKING'S OWN `trip_id` (ledger
    `2026-09-20-handoff-booking-trip-basis`)** — a marketplace-added concierge purchase with no
    plan item behind it now hands off too; the basis is recorded (`planBasis`), never guessed.
    **THE PLATFORM MAY ITSELF OFFER BOOKING CONCIERGE WHERE NO EXPERT DOES (decision-maker ratified
    Sep 18, 2026 — ledger `2026-09-18-platform-concierge-listing`; migration 313, DATA-ONLY).** A
    reserved `users` row + approved `local_expert_forms` row (all 8 `OPERATING_MARKETS`) + approved
    `booking_concierge` listing surfaces through the SAME two live gates (`/api/experts`, the
    lead-routing scorer) — no new predicate, no `expert_neighborhoods` touch (065's own comment
    was stated intent, never live code — annotated in place, not rewritten). **NO SPLIT:** the
    completion mint skips the concierge-fee expert-share re-split for this owner
    (`isPlatformConciergeUserId`) — 100% stays platform revenue; base earnings mint is untouched.
    **POOLED, NOT ASSIGNED:** a platform-owned hand-off stamps `expertId: null` (corrects
    `2026-09-18-concierge-handoff`'s stale "no branch needed" note). **RANKS LAST** by the scorer's
    own floor (`specialties: []`, no history) — no new column, no tie-break.
    **THE CONCIERGE READS THE PLAN IT WORKS (decision-maker ratified Sep 20, 2026 — ledger
    `2026-09-20-concierge-plan-read`).** A `pending` (§12 READ-only) `trip_expert_advisors` row is
    granted at HAND-OFF (the listing owner, never the platform account) and at CLAIM (whoever
    takes a pooled request that names a trip), through the ONE author `upsertTripAdvisorRow`
    (`server/services/concierge-plan-read.service.ts`, never throws — §15b). A conflict never
    downgrades an already-`accepted`/`assigned` advisor. No schema change.
    **RULING 11's WRITE GRANT EXCLUDES `booking_concierge` (decision-maker ratified Sep 20, 2026 —
    ledger `2026-09-20-plan-work-grant-concierge-exclusion`).** `booking_concierge` still
    classifies `plan_work`, but its plan access is the READ grant above, never checkout WRITE; the
    platform's reserved account is refused outright at the one author, for every caller.

### §13 — Known Defects (these are BUGS, not intended behavior — do not describe them as how the platform works)

Defect state is VOLATILE and no longer lives in this file (ruling 26 §5): open defects live in findings/audit docs
with `as-of` SHAs (see `docs/findings/CLAUDE_MD_ARCHIVE.md` for the §13 history archived 2026-08-04). Governing
invariants that grew out of §13 defects remain here as §14–§16 below.


### §14 — Money-endpoint server-derivation rule (client-trusted amount/identity cluster)

**GOVERNING RULE (convention — enforce on every money/ownership endpoint):** a money endpoint derives the
charge/refund **amount from the server-side catalog/record**, and the **acting user from the session** — **NEVER**
from `req.body`. `req.body.amount` / `req.body.price` / `req.body.userId` must never reach a payment or ownership
decision. This class appeared **seven times** (coordination-fee $0-budget, template mass-assignment $0.01 price,
world-writable fee-config, then the four below); the rule closes the class so the eighth can't be written.
**Guard:** `scripts/check-money-endpoints.cjs` (grep gate) fails if a payment/ownership route reads
`req.body.amount`/`price`/`userId` into a money decision — the cheapest durable catch for the next instance. Do not
remove it. **Now operation-scoped (hardened Jul 14, 2026 — wired into CI via `.github/workflows/build.yml`):** it scans
**every** `.ts` under `server/routes` + `server/services` **plus the `server/routes.ts` monolith**, and flags a
body-sourced amount/price/userId when EITHER the file is money-named (original coverage, no regression) OR the **enclosing
route handler performs a money operation** (Stripe call / transfer / refund / charge / payout / earning-or-revenue write /
capture-confirm). Handler-scoping keeps the monolith from flagging unrelated reads. Escape hatch unchanged: a genuinely
safe read (e.g. a server-capped payout *withdrawal* of the user's own balance, or a preview that never charges) carries a
`money-derive-ok` comment on the line. (First catch on landing: the two dark `payouts/request` handlers in
`experts.routes.ts` — a non-money-named file the old guard never scanned — reviewed as safe withdrawals, annotated.)
**EXTENDED ONE DERIVATIVE UP BY §18 (ruling 42):** the same prohibition now covers the **RATE** that
multiplies the amount — a commission split / fee percentage / band selector is never client-settable,
and the guard predicate and its schema-mediated blind spot are described there. Read §14 and §18 together.
**GENERALIZED BY §19 (ruling 46):** amount, identity and rate are three instances of one class —
**privileged-field mass-assignment through a denylist (`.omit()`) schema** — whose structural fix is a
pick-based **allowlist** body schema. §19 also binds ruling 41's `stripePaymentIntentId` clause on the
booking-BIRTH side. Read §14, §18 and §19 together.
**§14 APPLIES TO READS AS WELL (ledger `2026-09-05-custom-venues-owner-scope`).** A list or detail route whose
rows are user-owned derives the owner from the **session** (`getUserId(req)`) and never from `req.query` /
`req.params`; an owner id that arrives on the query string is IGNORED, not trusted, and a filter the caller may
not use (someone else's `tripId`) is treated as ABSENT rather than as an error. The reason this is stated
separately from the money clause: `GET /api/custom-venues` was unauthenticated and passed a query-supplied
`userId` into a storage reader that treated the owner as one OPTIONAL filter among three, so **omitting it
returned every row on the table** — a leak with no money, no mutation and no error in any log. Storage readers
for user-owned rows therefore REQUIRE an owner and refuse an empty one (second layer, the §18 placement), and
one shared predicate answers "is this row yours" for all of a table's routes rather than being re-typed per
route (§18 rule 1) — the two custom-venue routes that leaked were exactly the two that had no copy of it.
Guarded by `check-query-userid-reads` (its negative space is in the Guard registry: NAME-based, query/param
only, body-sourced ids belong to `check-money-endpoints`).
**SECOND INSTANCE, AND THE OTHER HALF OF THE CLASS (ledger `2026-09-05-vendors-read-scope`).** The same sweep
found `GET /api/vendors`: unauthenticated, `createdById` off the query string, the same
"no conditions ⇒ every row" ternary — **and a SELECT that joined `users`**, so every row carried the creating
account's EMAIL. Two rules fall out and neither is optional. **(a) NOT every table is owner-scoped, and
pretending one is would be its own §13 lie.** A `vendors` row is a SHARED business listing every signed-in
member may browse; scoping the ROWS to the session user would hide listings the caller is entitled to see. The
fix is therefore a GATE plus a PROJECTION, not an owner filter: what was privileged was the CREATOR, not the
listing. **(b) A LEAK CAN BE IN THE SELECT, WHICH NO ROUTE-LEVEL GREP SEES.** A reader that joins a PII table
by default is one careless caller away from publishing it, so a table with both a public and an audit audience
gets **TWO NAMED READERS** — `getVendorsForDirectory` (no join) and `getVendorsWithCreator` (the join, named
for what it carries) — with the undifferentiated old name RETIRED so no call site keeps the join silently, plus
an **allowlist projection** over the response (`VENDOR_DIRECTORY_FIELDS` + the existing `pickPublicFields`) as
the second layer, so a column added later is not published by default. An admin-only FILTER belongs on an
`/api/admin/*` path under §2's blanket guard — **never** as an allowlist entry in the guard script, because an
allowlisted route is invisible to that predicate forever, including for a later regression on the same route.
**THIRD INSTANCE, AND THE RULE IT SETTLES: A DENYLIST IS NOT A PROJECTION (ledger
`2026-09-05-experts-public-projection`).** The three PUBLIC expert routes — `GET /api/experts`,
`/api/experts/counts`, `/api/experts/:id`, none authenticated — served the whole `users` row and the whole
`local_expert_forms` row, because `storage.getExpertsWithProfiles` spread the raw rows and then DELETED
three names (`password`, `instagramAccessToken`, `instagramUserId`). Three names over a thirty-six-column
table publishes everything nobody thought of: `email`, `homeCity`, every `stripe*` column,
`commissionOverrideExpertSharePercent` (a §18 RATE), `suspensionReason`, plus — under `expertForm` — the
applicant's identity documents (`govId`, `travelLicence`), the payout/fee family and the admin review
internals. **So the required shape for a user-row response is the same ALLOWLIST the vendors lane landed,
and the allowlist must be MECHANICALLY TRUE:** the projector derives the table's column set from the schema
(`getTableColumns`) rather than restating it, so "a column the allowlist does not name" is COMPUTED. A
hand-copied denylist — or a hand-copied allowlist that must be edited to stay correct — is the §19 failure
one layer out: nobody edits a list for a column that did not exist when it was written. Two layers as ever
(storage projects, the route projects again with the SAME idempotent projector, §18 rule 1), and §13 holds
on the absences: a null nested row stays `null` and never becomes `{}`, and an unbounded jsonb column is
narrowed to the one key a page reads and OMITTED when that key has no real value. **No grep guard covers
this class** — a projection defect lives in a storage SELECT and a spread, which no scan over route files
can see (§18d); the committed test is the layer.
**NOT in this cluster (named, separate lanes):** F2 born-approved wizard (D1a/Phase-3, root cause = the
`provider_services.approvalStatus` default); the idempotency cluster (payout double-transfer, `/confirm` TOCTOU,
`/checkout` dup-bookings — see §15); marketplace Phase B surfacing.

### §15 — Money-safety idempotency invariant (double-spend on retry/race)

**GOVERNING INVARIANT:** any endpoint that moves money or creates a purchase/booking must be **idempotent** — a
retry / double-click / replay produces the **same single effect**, enforced by BOTH (a) a Stripe `idempotencyKey` on
the external call and (b) an **atomic conditional DB update** (`UPDATE … WHERE status = <expected>`) so the state
transition itself is the concurrency guard. A check-then-update (`if status==X { update }`) is the TOCTOU bug, **not**
a guard. Claim the row atomically **first**, then make the external call — so a concurrent caller can't also pass.

**THE CLAIM'S SIZE IS PART OF THE CLAIM (ledger `2026-09-15-v26-slot-units`; decision-maker sentence applied
2026-09-15).** An inventory claim takes the quantity the line actually bought, and the arithmetic and its guard live
in the SAME single statement (`booked_count + units <= capacity`) — a claim that adds a fixed 1 while the charge
multiplies by N is a guard that cannot refuse the case it exists for. A claim is REFUSED, never clamped. And the
RELEASE reads what the claim RECORDED taking (`bookingDetails.claimedSlotUnits`, a server-authored §19d key), never
what the line was PRICED at: a row born before a claim widened carries the old size, so the record travels on the row
(§13) and an absent record means the smallest claim that rail ever took. The checkout passes the ONE number the price
multiplies by (`resolveItemUnitCount`, §18 rule 1); a stay claims one unit of each night's slot and says why.
Proven by `server/__tests__/slot-units.db.test.ts` (S1–S8, CI job `slot-units`).

**§15b — the CLAIM is not the COMMITMENT (ruling 38, checkout atomicity).** "Claim first, then call" says what must
be written *before* the external call; it does **not** license writing everything else there too. Irreversible state —
cart clears, `purchased` flips and their diary rows, counters, notifications, **emails** — must follow the operation
that authorizes it, never precede it. The canonical shape is **CLAIM (provisional) → AUTHORIZE → PROMOTE**, with a
**TTL reclaim** rather than a compensating rollback (rollback code runs in exactly the conditions that broke the
operation; expiry survives a process death). On `/api/checkout` the provisional marker needs no new state:
`status='payment_pending' AND stripe_payment_intent_id IS NULL` **is** an unauthorized claim by construction. Two
rules that fall out and must not be weakened: (1) the void and the authorization stamp are BOTH atomic conditionals on
that same predicate, so a promote and a void can never both win; (2) **a sweep must never void a row whose
PaymentIntent may exist** — a pre-flight `bookingDetails.stripeAttemptAt` marker is written before the Stripe call, an
unmarked row is provably un-attempted and safe to void with no network call, and a marked row is only ever reconciled
against Stripe (found ⇒ promote, definitively-absent ⇒ void, unreachable ⇒ quarantine, never guess). See
`server/services/checkout-claim.service.ts`; proven by `server/__tests__/checkout-claim-sweep.db.test.ts` and
journey negative **N16**.

**§15c — ONE payment promotion, TWO callers (ruling 39; tasks #212/#213 CLOSED).** Ruling 38 recorded that both
documented reconciliation paths were **inert for cart checkout** — `handlePaymentSucceeded` and
`POST /api/bookings/confirm-payment` queried the legacy **`bookings`** table with `service_bookings` ids and matched
nothing — which left the TTL sweep as the **only** recovery mechanism on the money path. Both now drive
`promotePaidCheckout` (`server/services/checkout-claim.service.ts`, step 5 of the same spine): **one promotion
implementation, two callers**, so the webhook and the client fallback can never diverge on what "confirmed" means.
Rules that must not be weakened: (1) the promotion is an **atomic conditional** —
`UPDATE … SET status='confirmed' WHERE status='payment_pending' AND stripe_payment_intent_id=<pi>` — so a double
signal is exactly **one** flip and one diary row, the loser a no-op; (2) **only the webhook** may resolve a booking
from the PaymentIntent's `bookingIds` metadata and stamp a PI onto an unstamped claim (a signature-verified Stripe
delivery is Stripe's word; a client-supplied PI is not) — this is what rescues the server-died-mid-authorization
window, where nothing keyed on `stripe_payment_intent_id` can find the row; (3) a **late signal never resurrects a
voided row** — void wins after TTL, and the signal lands in a **reconciliation-exception** state
(`bookingDetails.reconciliationException` + a `checkout_reconcile_exception` diary row + `logger.error`, surfaced by
`GET /api/admin/bookings/reconciliation-exceptions`) — ops-visible, never silent; (4) the promotion is the **money
leg only** — it must never re-run `promoteAuthorizedCheckout`'s non-idempotent effects (counter increments, provider
emails); the one effect it does retry is `markItemPurchased`, an atomic conditional flip and therefore safe.
The legacy `bookings` rail is **still live** (`POST /api/bookings/process-cart`) — do **not** delete it while
making the cart rail work; both rails run, each no-ops on ids it does not own. Proven by
`server/__tests__/checkout-payment-promotion.db.test.ts` (negatives **N17/N18/N19**); the sweep's 9/9 suite is
untouched and still green — redundancy means every layer stands alone.
**AMENDED BY D-12 (decision-maker 2026-09-15, ledger `2026-09-15-d12-service-bookings-canonical`):
`service_bookings` is the CANONICAL rail, and the legacy one takes a DATED no-new-writes switch** —
`legacyBookingsNoNewWritesFrom()` (`server/config/legacy-bookings.config.ts`, env
`LEGACY_BOOKINGS_NO_NEW_WRITES_FROM`; **unset = no cutoff decided ⇒ writes allowed**, and the date is the
decision-maker's, set in no environment by that lane). From the cutoff `process-cart` answers 410
`legacy_rail_closed` **before any read or write**. The two CLIENT surfaces this clause used to name are GONE:
`/booking-demo` (route and page retired) and `/itinerary-comparison/:id`'s "Book Now" (its cart lines carried no
`provider_service_id`, so nothing on that board was service-linked — a proposal reaches purchase by
`apply-to-trip` and the slip, LD 39/LD 45 (4)). **Nothing that READS the rail moves**: its GET,
`confirm-payment`, `bulk-status`, `POST /api/bookings/refund`, the legacy confirm/cancel paths, the webhook's
legacy branch and §17's `scanLegacyRail` all survive retirement, and the sentence above still binds — a rail
that stops taking new rows is not a rail that forgets the rows it has.

**§15d — a balance may be paid by the OWNER or by a `payer`-role participant, and nothing else moves
(ledger `2026-09-04-cost-split-phase-one`).** `POST /api/bookings/:id/pay-balance` was owner-only; it now also
admits a `trip_participants` row on **the booking's own trip** whose `user_id` is the session user and whose
`role` is exactly `payer` (`TRIP_PARTICIPANT_ROLE_PAYER`, declared once in `shared/schema.ts` — the column is
free text, app-enforced, no DB CHECK). The predicate is ONE pure helper, `canPayBalance`
(`server/services/balance-payer.service.ts`), called once from the route; a second copy is the drift class §18
rule 1 names. **Everything §14/§15 governs is unchanged:** the AMOUNT stays server-derived from
`service_bookings.balance_amount` (nothing money-related is read from `req.body`, and no `money-derive-ok`
annotation was added), the ACTOR stays the session, and the state transitions stay atomic conditionals —
**a permission check is not a claim**, and a check-then-update would still be the bug. **The widening FORCED one
new guard: a balance-PAYER CLAIM taken BEFORE the Stripe call** (`claimBalancePayer`), because
`createPaymentIntent` on the saved-card branch sends `off_session: true, confirm: true` — a real charge at
creation — and two payers necessarily hold two different idempotency keys, so without the claim two concurrent
payers would take TWO REAL CHARGES for one balance and no post-call stamp could undo it. One statement
(`status='deposit_paid' AND stripe_balance_intent_id IS NULL AND COALESCE(recorded_payer, me) = me`): the holder's
own retry re-claims (idempotent), anyone else is refused 409 `balance_payment_in_progress` with no Stripe call.
The "already started" early return, the post-stamp fallback and the stamp itself are all **payer-scoped** — an
existing balance PaymentIntent is never handed to a different person's card (it carries the first payer's
customer + `setup_future_usage`). **NOTHING RELEASES A CLAIM:** a thrown Stripe error is exactly the case where a
PaymentIntent cannot be proven absent (§15b), so a claim clears only when the balance is paid. That is a LIVENESS
limit, not a money-safety one, and a TTL reclaim belongs to phase two. **The
Stripe idempotency key now carries the actor:** `bal-<bookingId>` → `bal-<bookingId>-<payerUserId>`, because
`createPaymentIntent` builds the PaymentIntent FROM the actor (their customer, email, saved card), so one key
with two actors is one key with different parameters — an error, or the second payer handed the first payer's
PaymentIntent. One payer retrying still rebuilds the SAME key and gets the SAME single charge. **WHO paid is
recorded on the row's existing `booking_details` jsonb by that same atomic conditional** (`balancePaidByUserId`,
merged never assigned, no new table) so the promotion's diary row names the payer even when the promoting signal
is the WEBHOOK, which has no session. The balance payer never becomes the booking's owner — `traveler_id` is
untouched — so a refund of a balance paid by a collaborator returns to **that collaborator's card** by Stripe's
own semantics; no refund routing is built. **Phase two (the real split — per-event payers, shares, who owes
what) needs its own design brief and is not started.**

### §17 — Drift DETECTION rule (one job, both rails; detect, don't repair — ruling 40)

**GOVERNING RULE:** the daily Stripe-vs-DB reconciliation job (`server/jobs/stripeReconciliation.ts`) scans
**BOTH booking rails** — cart checkout (`service_bookings`) and the still-live legacy `bookings` — and its
findings are **persisted rows**, never only log lines. Until this landed the scan read the legacy table only,
so **cart-checkout charges (the primary checkout) were invisible to it**: `service_bookings` ids never appear
in the legacy table, so the queries matched zero rows and errored on nothing — the same disjoint-id-space
failure §15c fixed on the promotion side, one layer up. Recovery was three-layered while **detection was
one-eyed**.

**DETECT, DON'T REPAIR.** The job writes exception rows; it never promotes at will, voids, refunds, cancels or
invents a booking. Repair belongs to the three recovery layers (§15b/§15c) plus a human — a detector that also
repairs is a fourth, unreviewed writer on the money path. **ONE narrow exception:** a PaymentIntent Stripe says
succeeded whose booking is still an unpromoted claim is handed to the **EXISTING shared** `promotePaidCheckout`
with `actor="reconciliation"`, diary-logged — that is recovery layer 2's own logic arriving late, not new
repair code. Nothing else.

**§17's narrow exception now stands on the READY-MADE rail too, and it moves no money (ledger
`2026-09-15-d18-announced-marker`, migration 297; decision-maker D-18 = A, sentence applied 2026-09-15).**
`ready_made_purchases.notified_at` records that a delivered purchase's buyer announcement EXISTS. Its ONE
writer is `notifyBuyerOfReadyMadeDelivery` (§18 rule 1), stamping through an atomic conditional
(`WHERE notified_at IS NULL`, §15) the moment it knows the buyer's notification row exists — **existing** and
**inserted by this call** are deliberately different tests, because the already-inserted case IS the
half-finished state the column records; the email stays gated on the insert. The drift job DETECTS a `cloned`
purchase whose marker is NULL past a config grace (`server/config/ready-made-announce.config.ts` — no literal,
§8 untouched) and HANDS IT BACK to that sender; it composes no message and **writes the column never**. A
successful hand-off records nothing; only a failed one appends `rm_delivery_not_announced` (`warning`).
**NULL = no record of an announcement (§13), and there is no backfill** — a `paid` row is never announced (it
was never delivered), and a buyer who deleted their own clone trip is not indicted for housekeeping.

**Rules that must not be weakened:**
1. **Exceptions are APPEND-ONLY** (`reconciliation_exceptions`, migration 177). No UPDATE, no DELETE path.
   Re-detection is absorbed by the UNIQUE `dedupe_key` + `ON CONFLICT DO NOTHING`, so a drift that persists a
   month is ONE row stamped with the run that FIRST saw it — while the run row records `exceptions_detected`
   separately from `exceptions_new`, so "still drifting" stays visible without mutating a recorded fact.
2. **Every pass writes a `reconciliation_runs` row — including a clean one and a skipped one.** Silence must
   be distinguishable from the job not having run; the previous version logged "Clean" to stdout and left no
   durable trace, so a healthy quiet day and a scheduler dead since the last deploy rendered identically.
   Every per-rail tally the pass computes is written onto that row by the ONE run-row writer — including
   the ready-made rail's `checked_ready_made_purchases` and `ready_made_announce_hand_offs` (ledger
   `2026-09-15-d42-reconciliation-tallies`, migration 301; decision-maker sentence applied 2026-09-15) —
   and those columns are additive **nullable with no default**, because **NULL = not tallied** is the only
   reading a pre-migration run can bear and a stamped `0` would claim a pass examined nothing (§13).
3. **The expected charge is SERVER-DERIVED** — `SUM(total_amount + platform_fee)` over the PaymentIntent's own
   booking rows (§14), with a tolerance that is the checkout's accumulated `.toFixed(2)` rounding, **not** a
   rate (§8). Never taken from Stripe, never from a client.
4. **No new writes were required on the checkout path.** The scan keys on linkage that already exists:
   `service_bookings.stripe_payment_intent_id`, `pi.metadata.bookingIds`, the `idempotency_key` sibling
   convention (`key`, `key#1`, …), `refunds.stripe_refund_id`, and the legacy `charge.metadata.bookingId`.
   Adding a write to make detection easier would put the detector inside the thing it audits.
5. **`GET /api/admin/reconciliation/exceptions` is a SIBLING of `GET /api/admin/bookings/reconciliation-exceptions`
   (§15c), not a replacement.** That one shows exceptions a payment SIGNAL recorded on a booking row it could
   not promote — it can only ever describe a row that exists. This one is the SCAN's output and can describe
   money with no row behind it at all. Both are listed on `/admin/reconciliation`.

**§17b — amends §15c's "webhook only" clause.** Ordering-1 capability (resolve bookings from
`pi.metadata.bookingIds` and stamp a PI onto an unstamped claim) is gated on the PaymentIntent being **Stripe's
own word**, and is now open to `SERVER_VERIFIED_ACTORS` = `{webhook, reconciliation}`: a signature-verified
delivery, **or** the drift job's authenticated read of the PaymentIntent from the Stripe API with the platform's
own secret key. Ruling 39 wrote "webhook only" because the signed delivery was then the only server-verified
source that existed. **The clause that does NOT move: a CLIENT-supplied PaymentIntent may never resolve or stamp
anything** (proven by N17c). See ruling 40.

Proven by `server/__tests__/reconciliation-detection.db.test.ts` (negatives **N20/N21/N22**, 15 proofs); the
sweep's 9/9 and the promotion suite's 11/11 are untouched and green.

### §18 — Rate-bearing fields are never client-settable (ruling 42; extends §14 one derivative up)

**GOVERNING RULE:** §14 forbids a client-supplied **amount / price / identity** from reaching a money
decision. §18 extends the same rule to the **RATE** that multiplies the amount: a commission split, a
fee percentage, a revenue share or a band selector is resolved from **`fee_bands` only** (§8) and is
**never settable on any schema a client can reach** — regardless of whether anything reads it today.
The required shape for a privileged field is **STRIP-AND-CLAMP, in two layers**: the zod insert schema
`.omit()`s it (layer 1) **and** the storage writer strips-and-derives it (layer 2), *"so every caller is
covered"* — the same placement the approval-lifecycle strip already uses in `updateProviderService`.

**The instance this closes:** `provider_services.revenueShareRate` was exposed by
`insertProviderServiceSchema`, parsed off `req.body` by **both** POST and PATCH
`/api/provider/services`, spread into the row, and read at `payments.routes.ts` as *"the final override
(takes priority over config)"* over the `fee_bands`-resolved split **at the real Stripe charge**. The
clamp was range-only, so `1.00` was accepted ⇒ provider share 100 %, platform fee `0.00`. No UI ever
sent the field; it was reachable only by a crafted request.

**Rules that must not be weakened:**
1. **Derivation delegates — never re-implements.** The server-side value comes from ONE call into the
   existing `resolveCommissionRates` (via `resolveServiceOwnerShareRate`), using the same option shape
   `/api/checkout` uses. Two authors resolving rates two ways is how this class returns.
2. **Update paths are checked as hard as inserts.** The PATCH path was the easier of the two to reach —
   `insertProviderServiceSchema.partial()` let a single-field request set nothing but the split on an
   already-approved listing — and it was the one the audit found stripped on neither side.
3. **A field with no consumer is still stripped.** The dormant fee/payout family on
   `insertLocalExpertFormSchema` is exactly why: nothing read it, which is why nobody noticed it was
   mass-assignable.
4. **Guard:** `scripts/check-money-endpoints.cjs`. Its `req.body` predicate now also covers
   `rate|share|commission|split`, and — because the actual hole was **schema-mediated** and therefore
   invisible to any line-level `req.body` grep — it carries a second pass intersecting *insert schemas
   that expose a rate-bearing column* with *insert schemas parsed from a request body*. A
   privileged-by-design setter (an admin band editor) carries `money-derive-ok` on the COLUMN line in
   `shared/schema.ts`. Do not remove either pass.

**§18b — the owner rail may not move a booking out of a provisional state (ruling 42, SD-1).**
`status='payment_pending' AND stripe_payment_intent_id IS NULL` is an unauthorized claim by
construction (§15b) and belongs to the claim machine (`checkout-claim.service.ts`), which stays its
**sole author**. `PATCH /api/provider|expert/bookings/:id/status` checked the *target* status and never
the *current* one, so a provider's Accept promoted an unpaid claim to `confirmed` — after which
`voidClaim` **and** `promotePaidCheckout` both matched **zero** rows and the claimed
`vendor_availability_slots.booked_count` was destroyed with **no code path in the repo to return it**.
The owner rail now carries a from-state allow-list AND the §15 **atomic conditional**
(`updateServiceBookingStatus`'s `expectedFromStatuses`: `UPDATE … WHERE id = ? AND status IN (…)`); the
pre-check is only the error message, **the transition itself is the guard**. Callers that omit the
parameter keep the previous unconditional behaviour verbatim. Note the money layers held here and only
the **inventory** layer failed — so an assertion that watches only `status` is not sufficient
(P3 asserts the slot; P4 asserts the row stays reclaimable by both recovery layers).

**THREE MORE WRITERS, AND ONE HOME FOR THE LISTS (ledger `2026-09-15-v23-v25-from-state-guards`;
decision-maker sentence applied 2026-09-15).** SD-1 was the first instance, not the class.
`POST /api/bookings/:id/dispute` (three-argument call), `POST /api/admin/disputes/:bookingId/reject`
(two-argument) and `storage.updateCoordinationStatus` (no such parameter at all) each flipped a status
against a row a prior SELECT had returned. The dispute rail made a `payment_pending` provisional claim
disputable — the same stranding, one rail over; the admin reject's target status **MINTS** earnings and
stamped `completed_at` inside the writer's own transaction, so a rejection on a since-refunded row minted
real money and restarted the traveler's dispute window; the coordination writer read-modify-wrote its
`state_history`, so a losing writer's transition was **erased from the audit trail**. All three now pass a
named from-state list and answer **409** on `undefined` — a lost race is never `success: true`. Two rules
fall out. **(a) A COLUMN THAT ANCHORS A DEADLINE IS STAMPED ONCE.** `completed_at` is
`COALESCE(completed_at, NOW())` **in the SET expression**, because a read-then-decide would reintroduce
the very shape this rule exists to refuse. **(b) THE LISTS HAVE ONE HOME** —
`server/utils/booking-from-states.ts`, on the `server/utils/trip-advisor-status.ts` precedent — so "which
statuses may become X" on `service_bookings` is answered once (§18 rule 1). `payment_pending` is absent
from every list, permanently and by name. The traveler arm's coordination ORDERING rule is **not** part of
this and stays D-39's (punch list); the code says so at the line that passes the from-state. Proven by
`server/__tests__/from-state-guards.db.test.ts` (F1–F7, CI job `from-state-guards`).

**§18c — no consumer + irreversible effect ⇒ DELETE, don't gate (ruling 42, AC-1).**
`POST /api/vendor-availability/:id/book` was `storage.bookSlot(req.params.id)` behind `isAuthenticated`
and nothing else: any account could exhaust any provider's inventory, and because it created no booking
row the TTL sweep had nothing to reclaim and `releaseSlot` had no reachable caller. It had zero
consumers. Gating it would have preserved a second, unaudited way to consume inventory beside the
checkout spine. `storage.bookSlot` itself is untouched — it is checkout's atomic claim (§15/C3).

**§18d — a guard states its NEGATIVE SPACE, and a predicate change ships with fixtures (ruling 43).**
Every entry in the `docs/DECISIONS.md` Guard registry carries a one-line statement of what its predicate
does **not** cover; green means **green-within-stated-bounds**. `phase2-fee-gate.sh` was case-sensitive
with an `[A-Za-z]*` identifier tail and therefore blind to **every SCREAMING_SNAKE fee constant** — this
codebase's dominant convention — while reporting PASS for its whole life. Both `-i` and `[A-Za-z_]*` are
load-bearing. Because a wrong predicate is invisible by construction, both guards now carry committed
`--self-test` fixtures that run in CI **immediately before** the guard itself (the ledger-lint
precedent). The gate also honours ruling 32's second disposition: `fee-literal-debt:#<task>` exempts a
line from failing but is **reported on every run**, so filed debt never becomes a silent baseline.

**A GUARD THAT PARSES COMMANDS MUST READ ONLY COMMANDS (ledger `2026-09-15-test-guard-prose-echo`;
decision-maker sentence applied 2026-09-15).** `check-test-files-wired.cjs` searched a workflow's `run:`
text for a runner NAME rather than for a runner INVOCATION, so a failure-summary `echo` whose prose
contained "npx tsx --test server/__tests__/<file>" donated the bare noun `server` as a directory
selector and reported 203 unrun suites as reachable for eight days, greenly, across two ledger rows
that quoted its numbers (the true inventory is 274/507 reachable, 233 orphans; both earlier rows
carry a dated correction). The predicate now takes selectors only from a segment whose LEADING
command is the runner, with quotes, heredocs, comments and annotations excluded, and both the old
blind spot and the new assumption are written into the script's own `CANNOT DETECT` block (it still
excludes `e2e/` and still exits 0 — both are stated limits awaiting a ruling, not omissions). **A
predicate that can be satisfied by documentation ABOUT the thing it measures is not measuring the
thing** — and an advisory guard is exactly where such a defect survives longest, because nothing
ever goes red.

**A TEST DIRECTORY IS NOT NECESSARILY ONE RUNNER, so "wire the directory" is available only where it
is (ledger `2026-09-15-orphans-t1-t3-green-directories`; decision-maker sentence applied 2026-09-15).**
`tsx --test` cannot load a file that imports from `vitest` (it dies in the runner before any
assertion), and `vitest` cannot run a `node:test` file; Node 22 has no file-level exclusion flag, and
`scripts/check-test-files-wired.cjs` models only `*`, `**` and `?`, so a bracket class or an extglob
would run without being SEEN and the files would read as still orphaned. A mixed directory is
therefore wired as **two steps split by NAME**, with the limit stated in the workflow — a file added
there is orphaned until somebody names it, and the ratchet is what says so. A single-runner directory
keeps the whole-directory glob and stays closed by construction.
**A TEST FILE UNDER A DIRECTORY A CI JOB SELECTS BY NAME IS ORPHANED UNTIL IT IS NAMED THERE; IT
LEAVES THE ORPHAN LIST BY BEING RUN OR BY BEING GONE — NEVER BY A BASELINE ROW OR AN ALLOWLIST
(ledger `2026-09-17-orphan-971-wired`).** The paragraph above states the wiring shape; this states
its consequence for a file that arrives afterwards. A suite added to such a directory by a lane that
did not name it read as unwired while being right, and the code it covered was right too — the
ratchet is a branch-protection context, so every open PR inherited the red. The repair is the
one-line job change the job's own comment predicts: the file joins the runner list it belongs to.
`scripts/test-orphan-baseline.txt` is untouched and the ratchet may only shrink, so a new orphan is
never absorbed by growing the baseline, and the guard's predicate is not touched to make a file
disappear from it.
**A HIGH-RISK ROLE-CONSOLE MUTATION RAIL OUTSIDE THE PREFIX BACKSTOP IS PROBED, NEVER EXCLUDED
(ledger `2026-09-16-ci-red-repairs-3`).** `expert-provider-mutation-auth.test.ts` derives its probe
set from an assembled prefix backstop and requires every other high-risk role-console route to be
NAMED. Four rails landed that are `isAuthenticated` plus an ownership check INSIDE the handler, so
no prefix backstop could see them; they were given a real resource fixture and **PROBED** through
the suite's second probe set, `RESOURCE_PROBES`, and were **not** added to `EXCLUSIONS` — an
exclusion is an allowlist on a mutation rail, and the §14/§19 posture refuses to grow one where a
fixture is buildable. Each rail is probed anonymous ⇒ **401**, the resource's own non-owner ⇒ **404**
(LD 40's one sentence for "no such thing" and "not yours", with the row proven unchanged), owner ⇒
past the ownership gate. The structural gate now refuses a rail in two sets, a `RESOURCE_PROBES` key
that is not high-risk, a prefix-probed rail carrying a fixture, and a `RESOURCE_PROBES` key with no
probe. **The exclusion list only shrinks.**

### §19 — Privileged-field mass-assignment is a STANDING CLASS; the fix shape is an ALLOWLIST (ruling 46)

**GOVERNING RULE:** §14 forbids a client-supplied amount/price/identity from reaching a money
decision; §18 extended it to the RATE. §19 states the **shape** all three share and fixes it
structurally: **a privileged column is client-settable BY DEFAULT under a denylist (`.omit()`)
schema, and nobody edits an omit list for a column that did not exist when it was written.** The
required fix shape for a client-reachable body is an **ALLOWLIST — a pick-based schema** — so a new
privileged column is unreachable until someone deliberately names it.

**Three instances, one class:** `provider_services.revenueShareRate` (§18/ruling 42); the dormant
fee/payout/Stripe-linkage family on `insertLocalExpertFormSchema` (same sweep); and
`service_bookings.stripePaymentIntentId` at `POST /api/bookings` (ruling 46). **Posture as of
ruling 46:** all **186** `createInsertSchema(...)` calls in `shared/schema.ts` are `.omit()`-based and
**ZERO** are `.pick()`-based. Converting the layer is filed as **`#PS18`** with a committed negative
fixture (`booking-birth-provenance.db.test.ts` **B6**); until it lands, every one of those schemas is
a denylist and must be read as one.

**§19a — `stripePaymentIntentId` is written ONLY by the shared promotion path.** Ruling 41's clause
stands with **no carve-out**, and it binds on the **BIRTH** side as well as the promotion side. A
booking-create endpoint accepting the field from `req.body` **is the violation, not a tension**:
`POST /api/bookings` `.parse`d the `.omit()`-based `insertServiceBookingSchema` off the body and
SPREAD it into `createServiceBooking`, so a crafted request birthed a booking already carrying its
own PaymentIntent. That is **not a promotion**, so **N17c can never catch it** — and the row then
looks authorized to every consumer keyed on that column (the sweep skips it, `promotePaidCheckout`
matches it, the drift job trusts it as linkage). Stripped in **three** layers: the schema `.omit()`,
the storage strip in `createServiceBooking` (which covers the internal `as any` callers a type-level
omit cannot reach), and the route allowlist. `stampAuthorization`/`resolveAndStamp`
(`checkout-claim.service.ts`) remain the column's **sole** writers.

**§19b — the rows already on disk get DETECTION, never silent trust or silent repair.** A fix stops
new rows and says nothing about old ones (§17). Drift kind **`payment_provenance_unverified`**
(`warning`, cart rail; `GET /api/admin/reconciliation/exceptions`). **Its predicate follows ruling
41's invariant as STATED — the PROVENANCE of the id, not one implementation of it — so TWO
independent forms each clear a row:** the §15b pre-flight `bookingDetails.stripeAttemptAt` marker
(the spine wrote it), **or** Stripe's own `metadata.bookingIds` naming the booking when the job reads
the PaymentIntent with the platform's own secret key (§17b). Corroboration is not a forger's
loophole — `metadata.bookingIds` is written server-side by `createPaymentIntent`, so a lifted
PaymentIntent names the bookings it actually paid for and never the row it was planted on, and a
PaymentIntent absent from Stripe is never seen at all. **Do not narrow this to the marker alone:**
that would indict every legitimate booking whose PI predates ruling 38 but which Stripe can still
vouch for. Once a row fails both, the PS15 mass-assignment, a seeded fixture, and a pre-ruling-38 row
are **indistinguishable** — which is why the kind is *unverified*, not *forged*, and why the job does
nothing about it.

**§19c — guard.** `scripts/check-money-endpoints.cjs`'s schema-mediated pass carries a
PAYMENT-IDENTITY column predicate (`stripe<Thing>Id` / `paymentIntentId`) beside the rate one, with
committed `--self-test` fixtures (§18d). It knows those **two** classes and nothing else — an amount,
a `status`, an authorization grant (`#PS16`) is still invisible to it. That stated blind spot is the
reason the answer is `#PS18`, not a wider grep.

**§19d — AN ALLOWLIST STOPS AT THE COLUMN; A FREE-FORM JSONB NEEDS ITS OWN ADMISSION LAYER
(punchlist V-10, ledger `2026-09-12-booking-birth-holes`).** `createBookingRequestSchema` is the
pick-based allowlist ruling 46 required — and two of the five keys it admits are FREE-FORM jsonb
(`bookingDetails`, `bookingMetadata`), so everything the server later stores INSIDE them was
client-settable at birth. `booking_details.travelerCharge` is that class's money instance: its mere
PRESENCE is the era discriminator `travelerChargeBasis` reads, and three live readers compute a
different amount on each branch (the cancellation quote, the REFUND CEILING clamp, the checkout
re-drive). A planted key moves a row's refund ceiling **without touching a single money COLUMN**,
which is why §14's `req.body` grep and §19's column-level strips both look straight past it. Strip
placement, and it is the part that does not generalise: layer 1 is the admission schema; layer 2 is
**`storage.createServiceBookingAtomic`**, the client-facing birth rail's writer — deliberately NOT
`createServiceBooking`, which is the CHECKOUT CLAIM's writer and legitimately COMPOSES that key
server-side on every purchase, so a blanket strip there would erase a real money fact and re-read
the platform as pre-A3. **When one writer is shared by a client rail and a server composer, the
strip goes on the client rail's writer and the server composer keeps a named, asserted exemption**
(B8). The key list (`shared/booking-details-admission.ts`) is a DENYLIST, because an allowlist needs
a ratified `booking_details` shape nobody has decided — stated, pinned by B7, and extended by hand
until that shape exists.

Proven by `server/__tests__/booking-birth-provenance.db.test.ts` (**B1–B9**, 10 proofs — B7/B8 are
§19d, B9 is V-11's priceless-listing refusal); sweep 9/9, promotion 11/11 incl. **N17c**, detection
15/15 and ruling 42's P1–P6 untouched and green.

### §16 — Affiliate-outbound rule (agent-booking, ratified Jul 23, 2026)

**GOVERNING RULE (decision-maker directive):** affiliate/partner content must behave like the Discover feeds —
**no surface may send the traveler off-site with a raw `window.open(affiliateUrl)`**. Any "book" action on
partner-fulfilled content routes through the in-platform **booking-agent rail**:
`POST /api/affiliate-booking-requests` (the rail Discover's `unified-result-card` already uses) — the server
auto-assigns a booking agent (expert), **keeps the affiliate URL server-side** (it is deliberately never returned
to the client; the agent books through it, preserving commission and preventing disintermediation), and the
confirmed booking is logged onto the traveler's trip (migration 051 `affiliate_booking_requests.trip_id`).
Tracked *informational* outbound (e.g. the curated-content `POST /api/content/affiliate-redirect`, which records
into `affiliate_clicks` before redirecting) remains allowed — the prohibition is on **untracked raw outbound and
off-site *booking* CTAs**. First application: all 10 Travelpayouts card types
(`client/src/components/travelpayouts/*Card.tsx`) — previously every card's "Book" was a raw
`window.open(affiliateUrl || bookingUrl)` (untracked, funnel-leaking, inconsistent with the Amadeus add-to-cart
hotels on the same page); now they share `useAgentBooking` → the booking-agent rail. **Filed (architectural,
per the same directive):** fold the parallel `/api/catalog/*` Travelpayouts feed into the CENTRAL content system
(content registry / `affiliate_products` + placement rules) so all content lives in one system — a design job
(live-priced API feeds vs registry rows), not a mechanical move; do not build a third content home in the interim.


---


### §20 — Publish-time SQL is declined by default (the deploy diff is not a schema authority)

Schema changes reach production ONLY via `runMigrations` on boot, from committed migration files in `server/migrations/`. Any Replit publish/redeploy prompt that offers to run its own SQL — especially `DROP` or `ALTER` — is DECLINED by default; no variant is approved. Such a prompt means the workspace checkout and the deployment database disagree (a stale or drifted checkout schema being diffed against prod), NOT that production needs the SQL. Fix by syncing the checkout, never by approving the diff:

- `git checkout main && git fetch origin && git reset --hard origin/main`
- Restart the dev app once; confirm boot shows migrations current (no new applies, no schema complaints).
- Republish; the confirmation screen must show a normal build with no database-migration step.
- If destructive SQL still appears, decline and STOP, then escalate — it means something else.

(ops-hardening, 2026-08-29)

**THE ONE EXPECTED PROMPT, AND ITS TEST (amended Sep 17, 2026 — decision-maker, after the `72b92cfcf`
publish).** Replit runs its schema push BEFORE the new instance boots, so a publish that carries a
freshly merged column-adding migration will ALWAYS offer that column as `ALTER TABLE … ADD COLUMN`
SQL — production has not yet run the migration that adds it. That prompt is EXPECTED, not a
disagreement, and it may be approved **only when every offered statement matches, byte for byte in
effect, a migration that is registered in `server/migrations/migration-files.ts`, declared in
`shared/schema.ts`, and not yet stamped on production** — and that migration writes the column with
`ADD COLUMN IF NOT EXISTS`, so the boot that follows finds it present, does nothing, and stamps the
row (that is exactly what happened with migration 309 on Sep 17). Declining it is also safe: boot
adds the same column a minute later. **Everything else keeps §20's default — DECLINE and STOP:** any
`DROP`, any `ALTER COLUMN … TYPE`, any NOT NULL or DEFAULT change, any CHECK, any index, any
statement for an object no registered migration names, and the "copy development database to
production" option under any wording. A dispatch that tells an operator "the push has nothing to
add" is TRUE only when production has already booted the newest migration; say which case applies.

### Branch and publish rule

**Never commit on `main`.** Before any write in any task:
`git checkout -b task-<id> origin/main`. All work is committed on that branch and pushed; a draft
PR carries it to review. `main` in the workspace exists only to be reset to `origin/main` before a
publish. A publish is only ever made from a workspace where `main == origin/main`.

Five incidents, two of which reached production, justify this rule. The sixth (2026-09-06, commit
`96c39f5` served before it was on `main`) is now refused mechanically by `scripts/publish-preflight.cjs`.
**The way of working — roles per model, lane briefs, the serial landing procedure, the publish
procedure and the usage-hygiene rules — lives in `docs/OPERATING_PROCEDURE.md` (ratified Sep 6,
2026); a session reads both files.**

## Service Model: Canonical Table

### Decision: `provider_services` is the canonical service source (NOT `expert_service_offerings`)

**Why:**
- `service_bookings.serviceId` and `service_reviews.serviceId` both FK to `provider_services.id`
- This creates an immutable structural dependency: transactions *must* reference provider_services
- Making a different table canonical (e.g., ESO) would fragment the booking/review/payment path
- The data itself has already converged: wizard writes to provider_services, bookings FK there

**What This Means:**
- All **service** creation (expert custom, provider, and the `service_templates` seed catalog) writes to `provider_services`.
  **Do not conflate with expert *itinerary* templates:** those were a separate product living in the `expert_templates` table (marketplace), **not** `provider_services`. That lane is **FULLY RETIRED** — seller side Jul 27 2026 (`docs/findings/CLAUDE_MD_ARCHIVE.md` §10), consumer side ledger `2026-09-03-expert-templates-consumer-sunset` (gate = PROD purchase counts; decision-maker confirmed zero purchases ever). **No surface, feed, purchase path or admin queue remains**; the `expert_templates` / `template_purchases` / `template_reviews` tables and their storage accessors are KEPT as historical rows (no migration). **`ready_made_trips` is the single store lane.** Note `/admin/expert-templates` and `/api/admin/expert-templates*` are a NAME COLLISION — they read `expert_service_offerings`, not this lane.
- The approval workflow (draft → submitted → approved) is stored as `approval_status` on `provider_services`, not elsewhere.
  **F2-CLOSED (migration 111):** offerings are now born `submitted` — `provider_services.approval_status` defaults `"submitted"`
  at both the ORM (`shared/schema.ts:578`) and the DB column; existing rows grandfathered `approved` (no backfill). Approval-lifecycle history (§1/D1a) archived in `docs/findings/CLAUDE_MD_ARCHIVE.md`.
- `expert_service_offerings` (ESO) remains a read-only template/offerings catalog for the signup flow
- ESO is NOT a transaction source; it's a convenience catalog for onboarding

**Transport-commerce exception (`service_bookings.service_id` is nullable):**
- The `serviceId → provider_services` FK and the dependency above **still hold for provider-service bookings/reviews.**
- The one documented exception: **transport-commerce bookings** (`bookingDetails.bookingType = "transport"`) reference a `transport_booking_options` row, not a `provider_services` row, so they carry a NULL `service_id`.
- `service_id` was made nullable by migration `050_service_bookings_service_id_nullable.sql` (the strand fix in PR #46 inserts these rows; the change previously lived only in `shared/schema.ts` + a hand-run dev ALTER with no migration, so prod still rejected the insert).
- Recorded here per the Coordination Prevention rule; ratified by the decision-maker by merging the PR that carries this note + migration 050. Any **further** loosening of this FK requires explicit decision-maker approval.

**Consolidation Timeline:**
- **Phase 1+2 (DONE):** Migrations 011-012 add schema columns and consolidate `expert_custom_services` → `provider_services` with category mapping
- **Phase 3 (DONE):** Build shared ServiceForm component targeting provider_services (role-aware, both expert and provider)
- **Phase 4 (DONE):** Apply User Console theme to expert pages (#1A1A18, #7A7A72, #E8E8E2, #FAFAF8)
- **Phase 5 (DONE):** Migration 013 drops deprecated tables/columns: expert_custom_services, expert_selected_services, ESO workflow columns. **NOTE (corrected Jul 15, 2026):** `expert_service_categories` was **intentionally NOT dropped** by 013 and is **restored/seeded by migration 030** as the read-only ESO onboarding catalog — do not list it among the dropped tables.

**What Was Deprecated:**
- Commit `bfc3db2` made ESO canonical by adding workflow columns. This contradicted the booking-FK fact and is superseded by this document.
- The `runEsoBackfill()` startup migration is disabled; migrations 011-012 handle schema + data consolidation to provider_services.
- Deprecated tables (expert_custom_services, expert_selected_services) and ESO workflow columns are dropped by migration 013. (`expert_service_categories` is **NOT** dropped — retained by 013, restored/seeded by migration 030 as the ESO onboarding catalog; corrected Jul 15, 2026.)

---

## Service Creation Consolidation

All service creation routes converge on one destination: `POST /api/provider/services` writes to `provider_services`.

- Experts creating custom services use the same route/schema as providers
- Role-based filtering happens at read time. **F2-CLOSED (migration 111):** the read-side approval gate is now implemented on
  all **public** `provider_services` surfaces (they filter `approval_status = 'approved'`). `GET /api/expert/services`
  (`server/routes.ts` → `storage.getProviderServicesByStatus`) is the **owner console** and stays **intentionally ungated**
  — it filters by `userId` + the active/paused `status` param so an owner sees their own `submitted`/unapproved listings.
  Admin reads (the review queue) are likewise ungated. Only public/non-owner reads gate on `approved`. Approval-lifecycle history (§1/D1a) archived in `docs/findings/CLAUDE_MD_ARCHIVE.md`.
- No separate tables; no separate approval workflows

## Coordination Prevention

**If you are making changes that affect:**
- Service creation routes (`POST /api/provider/services`) — note the `expert_custom_services` **table** is **dropped**
  (migration 013); do not re-add it. The former `/api/expert/custom-services` and `/api/admin/custom-services` **routes**
  operated on `provider_services` (via the mapper) and were **renamed** to `/api/expert/service-listings` and
  `/api/admin/provider-services` (the misnomer fix, Jul 14 2026) — the `custom-services` vocabulary is retired in code
- Service schema (`provider_services`; `expert_service_offerings` = read-only catalog; `expert_templates` = the RETIRED marketplace — historical rows only, ledger `2026-09-03-expert-templates-consumer-sunset`; `ready_made_trips` = the store lane)
- The two offering catalogs (`expert_offering_types` / `service_offering_types`) — never merge them (see §4)
- Approval workflows (status enums, submission logic)
- Fee/commission config (`fee_bands`) — no rate literals in code (see §8)
- Service category taxonomy
- **Database migrations** (schema or data)

**Then:**
1. Update this document FIRST with the decision and rationale
2. Reference this document in your commit message
3. If you find this document conflicts with your plan, escalate to the decision-maker (user) rather than overriding

**CRITICAL: Migration Directory**
- All SQL migrations must go in `server/migrations/` (NOT `migrations/`)
- Register each migration in `server/migrations/migration-files.ts` — the **canonical registry** for both runtime and the
  chain-integrity test. `run-migrations.ts` imports this list rather than carrying its own copy (see the migration-chain
  repair note below). Registry order is authoritative; numeric filename order is not.
- Migrations are applied at server startup via `runMigrations()` (server/index.ts)
- `/migrations/` is for Drizzle-only migrations; `server/migrations/` is the active set

**CRITICAL: Replit deploy-push vs. our migrations (the "publish-time CHECK failure" trap)**
- Replit's Autoscale deploy runs an **automatic drizzle-kit schema-push** from `shared/schema.ts` at publish —
  and it enforces the schema's CHECK constraints **WITHOUT** running our migrations' value-remap steps first.
  So a migration that adds a CHECK over a column still holding legacy values on prod fails the deploy mid-push
  (`check constraint … violated by some row`) and offers the **DESTRUCTIVE** "copy dev database over production"
  option. **Never accept that option** — it overwrites prod with dev. This bit us twice on the Jul 15 publish
  (`expert_earnings.status='pending'`, `service_templates.delivery_method='document'`).
- **SECOND VARIANT OF THE SAME TRAP — the deploy push also DROPS INDEXES that `shared/schema.ts` does not
  declare (found Jul 30, 2026; proven in isolation: a single `DROP INDEX "sb_idempotency_key_idx"` statement).**
  This makes an index-only migration **non-durable across publishes**: publish 1 → push drops it → the migration
  runs for the first time → recreated; **publish 2+ → push drops it → the migration is already stamped → it is
  NEVER recreated → the index is silently gone.** Live instance: migration 155's UNIQUE partial index on
  `service_bookings.idempotency_key`, deliberately left out of `schema.ts` to avoid a duplicate-key push failure —
  which is measurably **load-bearing** (without it, 3 concurrent same-key checkouts produced **3 real Stripe
  charges**; with it, 1). **Rule: an index the code depends on must be DECLARED in `shared/schema.ts`, not only
  created in a migration** — otherwise the deploy push is authoritative and will remove it. Before declaring a
  UNIQUE index, check prod for existing duplicates (`SELECT <col>, count(*) … GROUP BY 1 HAVING count(*) > 1`),
  since a violated UNIQUE fails the publish and offers the destructive "copy dev over production" option.
  **THE SAME MECHANISM APPLIES TO TABLES, not just indexes (found Jul 30, 2026 by the table-existence sweep).**
  A table created by a registered migration but **absent from `shared/schema.ts`** is the same shape of object the
  push targets. Live instance, now CLOSED: **`ai_cost_tracking`** (created by `025b_ai_cost_tracking.sql`) was absent from
  `schema.ts` and is now DECLARED, column for column and index for index — including `.desc().nullsFirst()` on
  both indexes, which is load-bearing (drizzle's bare `.desc()` emits `DESC NULLS LAST` and made the push plan
  `DROP INDEX` + `CREATE INDEX` on every publish). It remains the worked example of the rule: ~7 hot writers,
  one reader, and a stamped migration that would never have recreated it.
  `scripts/preview-ai-cost-tracking-shape.cjs` is the read-only instrument for checking a real database against
  that declaration before publishing. (`service_demand_requests` was dead and has since been RETIRED deliberately by migration 158 — dropped in both environments.) **Rule
  generalized: any DB object the code depends on — index OR table — must be declared in `shared/schema.ts`, or the
  deploy push is authoritative and will remove it.**
- Guard: **before publishing any migration that adds/changes a CHECK**, run
  `node scripts/preflight-prod-constraints.cjs "<PROD_DATABASE_URL>"` — it reports every row that will violate a
  declared CHECK and prints the remap to apply on prod first (see `docs/RELEASE.md`). When you add a new CHECK
  migration, add its column to that script's `CONSTRAINT_MANIFEST`. The real fix (disable the deploy-push so
  `runMigrations()` is authoritative) is a Replit deployment setting, filed.

**CRITICAL: Drizzle push has TWO schema entry points — do not collapse to one**
- `drizzle.config.ts` `schema` is an **array**: `["./shared/schema.ts", "./shared/guest-invites-schema.ts"]`.
  Both are required. `shared/schema.ts` does **not** re-export `guest-invites-schema.ts` (that file imports *from*
  `schema.ts`, so a re-export would be circular), so its 4 tables — `event_invites`, `guest_travel_plans`,
  `invite_templates`, `invite_send_log` — are only reachable by push through the explicit second array entry.
- **Do not "simplify" this back to a single `schema: "./shared/schema.ts"`.** Those 4 tables would silently vanish from
  `drizzle-kit push`; because migration `001_guest_invite_system.sql` is bootstrap-stamped (001–050) it never re-creates
  them, so a fresh push-canonical deploy would be missing them and `server/storage.ts` guest-invite code would throw
  `relation "event_invites" does not exist`. If you add a **new** schema file with its own `pgTable`s that `schema.ts`
  doesn't re-export, add it to this array too.

**CRITICAL: Lockfile purity (do not remove these guards)**
- `npm install` inside the Replit workspace resolves through Replit's package-firewall proxy and bakes
  unreachable `package-firewall.replit.local` URLs into `package-lock.json` — that breaks `npm ci` on every
  GitHub runner (this kept main red ~Jul 7–11). The main recurrence engine is `.replit [postMerge]` →
  `scripts/post-merge.sh` → `npm install` after every merge.
- **Source-level prevention — VERIFIED WORKING Aug 11, 2026:** `.replit [env]` pins
  `npm_config_registry = "https://registry.npmjs.org/"` (LOWERCASE key, deliberately — Replit injects the
  lowercase spelling and npm resolves a case-collision in its favor; the same-key pin overwrites it at
  shell spawn). With the pin in force `npm config get registry` reports the real registry and pollution
  never forms. The layers below are defense-in-depth for the day a platform change outflanks it.
  **THE PIN WAS SILENTLY ABSENT FROM 2026-08-16 TO 2026-09-22, AND THIS PARAGRAPH KEPT ASSERTING IT
  (ledger `2026-09-22-replit-env-vars-restored`).** `e9511082b` — a commit whose subject is console
  conformance screenshots — deleted the pin and its comment block from `.replit` as collateral, and
  nothing noticed for five weeks because the failure is SILENT BY DESIGN: the `postinstall` scrub
  catches pollution at the formation event, so the only observable difference is that pollution is
  now SCRUBBED rather than PREVENTED. The pin is restored. **The lesson is about this file, not about
  `.replit`: a "VERIFIED WORKING" claim in CLAUDE.md is a claim about a date, never about now.** No
  guard reads `.replit`, so nothing could have contradicted the sentence — which is exactly the shape
  §18d calls a predicate that cannot fail. Treat every prevention layer named here as
  CHECKABLE-BUT-UNCHECKED, and check it rather than trusting the prose.
- Guards, in order: the `postinstall` script scrubs immediately after EVERY install — at the formation
  event itself, regardless of who invoked the install (added Aug 11, 2026; this also covers commits made
  through hook-bypassing interfaces, e.g. Replit's Git pane); `scripts/post-merge.sh` scrubs right after
  its install; the git hooks scrub staged lockfiles — BOTH `.githooks/pre-commit` (normal commits) AND
  `.githooks/pre-merge-commit` (merge commits; added Aug 11, 2026 — **git does not run pre-commit for a
  merge**, and that gap is exactly how 55 polluted URLs reached CI on merge `3f5b40f`, failing 13 checks
  on PR #453); the CI `lockfile-purity` gate is the backstop and the only guard that cannot be bypassed.
  All use `scripts/scrub-lockfile.cjs` (URL-only rewrite; integrity hashes untouched).
- **The `.npmrc` does NOT reliably prevent pollution from forming — VERIFIED by incident, Aug 11, 2026.**
  55 `replit.local` URLs formed in this repo with the `.npmrc` present, so treat the hooks/scrubs as
  load-bearing, never as belt-and-braces. Keep the `.npmrc` anyway (harmless, may help in some contexts).
  NOTE the old verification one-liner (`npm install && grep -c ...`) is INVALID as a probe: an
  up-to-date install short-circuits ("up to date ... in 2s") without resolving anything, so its clean
  grep proves nothing. A real probe must force resolution (delete `package-lock.json` first) — but the
  incident already answered the question; do not burn time re-proving it.
- Do not remove the `.npmrc`, the `postinstall` scrub, either hook, or the CI gate; do not run bare
  `npm install` and commit without the scrub.

---

## FAQ

**Q: Can I add a new service table?**
A: No. Consolidate into provider_services or escalate to decision-maker.

**Q: Can I make expert_service_offerings accept writes again?**
A: No. It's a read-only template source. Writes must target provider_services.

**Q: What about the ESO columns (status, submittedAt, etc.) that are still in the schema?**
A: They're deprecated — kept for backward-compat in Phase 5. Don't write to them. Don't read from them. Use provider_services columns instead.

**Q: Can I change the approval status enum?**
A: No without explicit user approval. Document the change in this file.

**Q: Why is `service_bookings.service_id` nullable if transactions must reference provider_services?**
A: Provider-service transactions still must — the FK and dependency hold for them. Transport-commerce bookings are the single documented exception: they reference `transport_booking_options`, not `provider_services`, so `service_id` is NULL for them (see "Transport-commerce exception" above; migration `050`). Any further loosening of this FK requires decision-maker approval.
