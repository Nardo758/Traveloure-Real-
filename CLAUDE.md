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
31. **An occasion NAMES THE ROLES IT NEEDS, and the names come from the taxonomy authority — never a
    new vocabulary (decision-maker ratified Sep 4, 2026 — ledger `2026-09-04-roles-needed`;
    migration 280).** `experience_types.roles_needed` is a `text[]` of
    **`service_categories.category_key`** values: the answer to "who do you hire for a wedding?" is
    florist, photographer, caterer, officiant — and every one of those already exists as a category
    key. The column is a POINTER INTO THE EXISTING CATALOG, not a third one: CLAUDE.md's FAQ refuses
    a new service table and §4 refuses to merge the two offering catalogs, and referencing one
    violates neither. **Migration 034 is the sole taxonomy authority** — the only assigner of
    `category_key`, 24 rows — so it, and nothing else, defines the legal value set. The four `aff_*`
    keys are affiliate SOURCES, not hireable roles, and are excluded: an occasion never "needs an
    `aff_air_hotel`". That leaves the 20 discipline keys.
    **A KEY THAT IS NOT REACHABLE IS THE BUG THIS COLUMN IS MOST LIKELY TO CAUSE, so it is guarded
    at CI.** `scripts/check-roles-needed-reachability.cjs` fails when any key in the seeder is not
    assigned by migration 034. This is the SAME failure `check-category-reachability.cjs` exists for
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
**NOT in this cluster (named, separate lanes):** F2 born-approved wizard (D1a/Phase-3, root cause = the
`provider_services.approvalStatus` default); the idempotency cluster (payout double-transfer, `/confirm` TOCTOU,
`/checkout` dup-bookings — see §15); marketplace Phase B surfacing.

### §15 — Money-safety idempotency invariant (double-spend on retry/race)

**GOVERNING INVARIANT:** any endpoint that moves money or creates a purchase/booking must be **idempotent** — a
retry / double-click / replay produces the **same single effect**, enforced by BOTH (a) a Stripe `idempotencyKey` on
the external call and (b) an **atomic conditional DB update** (`UPDATE … WHERE status = <expected>`) so the state
transition itself is the concurrency guard. A check-then-update (`if status==X { update }`) is the TOCTOU bug, **not**
a guard. Claim the row atomically **first**, then make the external call — so a concurrent caller can't also pass.

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
The legacy `bookings` rail is **still live** (`/booking-demo`, `/itinerary-comparison/:id` →
`POST /api/bookings/process-cart`) — do **not** delete it while making the cart rail work; both rails run, each
no-ops on ids it does not own. Proven by `server/__tests__/checkout-payment-promotion.db.test.ts` (negatives
**N17/N18/N19**); the sweep's 9/9 suite is untouched and still green — redundancy means every layer stands alone.

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

**Rules that must not be weakened:**
1. **Exceptions are APPEND-ONLY** (`reconciliation_exceptions`, migration 177). No UPDATE, no DELETE path.
   Re-detection is absorbed by the UNIQUE `dedupe_key` + `ON CONFLICT DO NOTHING`, so a drift that persists a
   month is ONE row stamped with the run that FIRST saw it — while the run row records `exceptions_detected`
   separately from `exceptions_new`, so "still drifting" stays visible without mutating a recorded fact.
2. **Every pass writes a `reconciliation_runs` row — including a clean one and a skipped one.** Silence must
   be distinguishable from the job not having run; the previous version logged "Clean" to stdout and left no
   durable trace, so a healthy quiet day and a scheduler dead since the last deploy rendered identically.
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

Proven by `server/__tests__/booking-birth-provenance.db.test.ts` (**B1–B6**, 7 proofs); sweep 9/9,
promotion 11/11 incl. **N17c**, detection 15/15 and ruling 42's P1–P6 untouched and green.

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

### Branch and publish rule

**Never commit on `main`.** Before any write in any task:
`git checkout -b task-<id> origin/main`. All work is committed on that branch and pushed; a draft
PR carries it to review. `main` in the workspace exists only to be reset to `origin/main` before a
publish. A publish is only ever made from a workspace where `main == origin/main`.

Five incidents, two of which reached production, justify this rule.

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
  push targets. Live instance: **`ai_cost_tracking`** (created by `025b_ai_cost_tracking.sql`, missing from
  `schema.ts`) is written from ~7 call sites (`claude.service.ts`, `itinerary-optimizer.ts`, chat routes,
  content/experts/trips routers, `routes.ts`) and read by `lead-routing.service.ts` for the admin cost breakdown.
  If a publish drops it, the migration is already stamped so `runMigrations()` will **never recreate it** — silent,
  permanent loss of AI-cost observability. (`service_demand_requests` was dead and has since been RETIRED deliberately by migration 158 — dropped in both environments.) **Rule
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
