# Experiences map planner — Phase 0 audit, Lanes 1–5 (Lane 0, read-only)

> Written 2026-10-05 (ET) by Lane 0 of `docs/planning/briefs/experiences-map-planner.md`. Base: `main`
> `71e675270fc6502e7b290ca12e5c4c896ebba781` (`check-lane-base.sh` OK). **Nothing was built:** no product
> code, no migration, no client change. `file:line` is at that base, except `CLAUDE.md`, the ledger and
> the surface spec, which are cited as they stand on this branch (Lane 0 added text to them).
> Where the code and the brief disagree, the code is right; each such case is marked **Brief ≠ code**.
> Section B of the brief is not ruled, and nothing below is a recommendation to build from it.

---

## Lane 1 — Coral fill

**What exists**
- `client/src/index.css:12`: `:root --primary: 3.3 76.2% 62.2%` = `#E85D55`, white on it 3.43:1. `:13` sets `--primary-foreground: 0 0% 100%`. `:14` sets `--primary-hover: 3.3 66% 52%` (#D53D34, 4.62:1).
- `client/src/index.css:123–128`: `.console-scope` has `--primary: 3 76% 62%` (≈#E85C54, 3.45:1). The same value is on `--ring`, `--sidebar-primary` and `--sidebar-ring`. `:125` sets `--primary-hover: 3 66% 52%`.
- `client/src/index.css:96`: `--earn-coral-ink: #E85D55`. `:149`: `--console-brand: #E85D55` (in `.console-scope`). Dark theme: `:193` `--primary: 350 100% 65%`, `:239` `--earn-coral-ink: #F0908A`, `:170` `--console-brand: #F07068` (not ruled).
- `tailwind.config.ts:34–37` maps `primary` to `hsl(var(--primary))`, so every `bg-primary` follows the token. `tailwind.config.ts:153` hard-codes `glow-primary` as `rgba(232,93,85,0.4)`.
- The target `3 55.8% 51.2%` is `#C8443D` (4.83:1). Confirmed by calculation.

**Brief ≠ code**
1. `index.css:124` is not "the second light value". It is `.console-scope`, written in a different form (`3 76% 62%`). Four sibling variables (`:126–128`) carry the same coral. The brief does not say whether those move.
2. "26 client files reference `E85D55`": the true count is **28 files** under `client/` (`grep -rli e85d55 client`). It is 26 if the two test files are excluded.
3. The ruling cannot be met by `--primary` alone:
   - **`var(--earn-coral-ink)` is used as a filled background on 39 lines in `.tsx`** (`grep -rn earn-coral-ink client/src --include=*.tsx | grep -v __tests__ | grep "background\|bg-\["`), nearly all with `text-white`. Examples: `components/trip/plan-modal.tsx:2647`, `landing/landing-hero.tsx:327,388,470,527,690`, `pages/service-detail.tsx:1620,1931,1964,2338`, `pages/storefront.tsx:522,685,976,1037,1307`, `components/layout.tsx:817,881,1006`.
   - The ruling keeps that variable at `#E85D55`, so these stay below 4.5:1 unless they are retokenized to a new fill variable.
   - `--console-brand` is used as a background at `dashboard-sidebar.tsx:152,174`, `location-point-picker.tsx:397` and `dmo-picker-modal.tsx:145`. Whether these carry white text was not checked.

**Literal fills behind white text** (the ruling's violations):
- `components/shared/action-items-list.tsx:15`
- `components/backoffice/booking-mode-banner.tsx:128`
- `components/plancard/PlanCard.tsx:538`
- `components/dashboard/SavedTripsSection.tsx:129`
- `pages/admin/neighborhood-backfill.tsx:115`
- `pages/admin/qa-checklist.tsx:560`
- `pages/admin/routing-queue.tsx:245`
- `pages/provider/services.tsx:1123`
- Gradient avatars with white initials, which are partly fills: `ea-sidebar.tsx:146`, `expert/expert-sidebar.tsx:224`, `admin-sidebar.tsx:265`.

**Coral used as text on a light ground** (the ruling wants `#B8403A`; about 20 sites). Examples: `share-tools.tsx:383,408,448`, the three sidebars, `services.tsx:1077,1085,1791`, `expert/catalog.tsx:231`. A slightly different coral, `rgba(232,85,85,…)`, also appears in the three sidebars and `qa-checklist.tsx:736`.

**Tests and guards that will move**
- `client/src/lib/__tests__/footer-pages-one-layout.test.ts:39` pins `--primary: 3.3 76.2% 62.2%`. It fails on the change.
- `client/src/lib/__tests__/console-grammar.test.ts:75` pins `.console-scope --primary: 3 76% 62%`. `:76` pins `--console-brand: #E85D55`, and `:54` lists `#E85D55` in `CONSOLE_HEXES`.
- `client/src/components/__tests__/landing-hero-representative.test.tsx:109,227` assert `background:var(--earn-coral-ink)`.
- `scripts/check-page-hex.cjs` (guard-batch, `build.yml:3311–3316`) bans raw hex in pages against a baseline.
- **No contrast/WCAG test exists anywhere.** A new one in `client/src/lib/__tests__/` is picked up by `unit-suite-client-lib` (`build.yml:2941`).

**Locked Decision conflicts:** LD 45 (7) said "coral primary (`#E85D55`)" (`CLAUDE.md:1686`). It is amended by Lane 0 (`CLAUDE.md:1822`).

**Migrations:** none.

---

## Lane 2 — Events page

**What exists**
- **Route:** `client/src/App.tsx:471–473` `/events` → `<BrowseShell><DiscoverPage surface="events" />`. `/global-calendar` redirects there (`App.tsx:546–550`). **There is no `/events/:id`.**
- **What the page renders:** the events tab (`client/src/pages/discover.tsx:2201–2206`) renders `EventsComingUpBlock` (`:2204`) and then `<GlobalCalendar />` (`:2205`).
- **Inside `GlobalCalendar`**, the default view is `month-destinations` (`GlobalCalendar.tsx:226`). Its left column, in order:
  - "Where to Go" (`:611–621`)
  - vibe filters (`:639–668`, list at `:155–165`)
  - Best / Good / Average / Events city sections (`:695–741`)
  - "Events & Festivals in {month}" (`:743–855`)
  - The small year calendar is the right column (`:553–608`).
- **Month/Week/Day today** are filter modes on the small calendar only (`CompactYearCalendar.tsx:14`; buttons `:469–495`; `WeekZoomView` `:185`; `DayZoomView` `:296`). There is no full-size calendar stage. The `year` and `month-grid` views exist but cannot be reached from the default (`GlobalCalendar.tsx:226,357,367`).

**The four known defects: all confirmed, two worse than stated**
1. **Month-level events are painted on days 1/8/15/22.**
   - `GlobalCalendar.tsx:295–298` (`for (let d = 1; d <= 28; d += 7)`).
   - Highlights get day 1 or 15 at `:302`.
   - The week/day filter keeps every undated event (`:508–510`).
   - The seed is almost all month-level (`server/seed-destination-calendar.ts:23–26`).
2. **The calendar is locked to the current year.**
   - `GlobalCalendar.tsx:224` `new Date().getFullYear()`.
   - No year control (`CompactYearCalendar.tsx:465`).
   - Month stepping wraps without changing the year (`GlobalCalendar.tsx:377–387`).
   - On the server, `/api/travelpulse/global-calendar` filters `startMonth` only and ignores `destination_events.year` (`server/routes/content.routes.ts:5917–5924`; `shared/schema.ts:3895`).
3. **The calendar is hidden on phones.** It is worse than phones: it is hidden below `lg`, 1024px (`GlobalCalendar.tsx:554` `hidden lg:block`; the toggle at `:628` is also `hidden lg:flex`). The card has a fixed width (`CompactYearCalendar.tsx:383`). Below `lg` there is no week or day filtering at all.
4. **Two event lists disagree.** It is worse: they come from **two tables that are never joined.**
   - "Coming up" reads `city_events` via `GET /api/city-events/upcoming` (`events-strip.tsx:209`; `server/routes/landing.routes.ts:256–265`; `city-events.service.ts:350–371`, now to +180 days).
   - The month list and the calendar dots read `destination_events` (`content.routes.ts:5917–5924`).
   - Each list has its own plan door: `/experiences/travel?…` (`GlobalCalendar.tsx:824`) versus the planning modal (`events-strip.tsx:136–143`).
   - Also: `gte(startsAt, now)` (`city-events.service.ts:355`) drops events already under way, so the "On now" label (`shared/city-events.ts:179`) cannot fire.
   - Also: Fever rows are written with no `startMonth` (`server/services/partner-events-cache.service.ts:251–278`), so they never match the month filter.
   - Also: multi-month events show only in their start month.

**What the boards need that does not exist**
- An event detail route, and a public GET for one `city_events` row. Today the only public read is `/upcoming`. The internal by-id reader `loadEventGuideFacts` (`server/services/blog-event-facts.service.ts:108`) is a candidate basis for "organizer facts".
- **The event's real locality** (the board's "outside the city, planned from …", `Main.dc.html:600`).
  - `city_events.city` is the market (`server/seeds/city-events.manual.ts:15–19`).
  - `venueLocality` exists on the seed entry but is "lookup-only (never stored)" (`city-events.service.ts:59–62,225–228`).
  - Seeded cases held outside their market: Kyoto/Osaka (`manual.ts:313–315,327–329`), Kyoto/Suzuka (`:153–155`), Porto/Portimão (`:138–140`).
- An organizer column. `city_events` has none (`shared/schema.ts:10301–10336`; only `ticket_url`, which `EventCard` never renders).
- A link from a blog post to an event page. The blog door deliberately carries no id (`server/services/blog-posts.service.ts:390–401`).
- Comments and locals' notes on an event: no table references `city_events`. The nearest precedent is `blog_post_reactions` (`shared/schema.ts:12119–12128`). Lane 2c is not armed.
- The current behaviour behind an unruled §B question: vibe filters already filter **destinations only** (`content.routes.ts:6045–6053`; `allEvents` is unfiltered at `:6098`).

**Ledger conflicts**
- `2026-08-25-events-as-designed` (`docs/DECISIONS.md:419`) reads "`/events` body and calendar unchanged. Header adopts the shared masthead + rail only."
- Rulings A2(1)–(4) change the body and the calendar, so the building lane must write the row that supersedes those parts. The masthead and rail are not contradicted.
- `2026-09-28-city-events` (R202) guards the Coming-up block (`shared/__tests__/city-events.test.ts`, `client/src/components/__tests__/landing-events-strip.test.tsx`, `server/__tests__/city-events.db.test.ts`). Merging the lists touches these.

**Migrations**
- 2a: none strictly needed (read changes only).
- If "outside the city" is stored: e.g. `city_events.venue_locality` (additive, nullable). Filling existing manual rows would need a third ruled seeder rewrite exception (LD 59 allows only `vertical`/`series_key` fill and the venue relookup).
- 2b: possibly an organizer column. A public slug could reuse `source_id` with no migration (unruled).
- 2c (not armed): an event comments/notes table.

---

## Lane 3 — Groups-first picker

**What exists**
- **The plan modal's occasion step** is inline, `client/src/components/trip/plan-modal.tsx:1903–1950`. It is a flat grid (`:1913` `grid-cols-1 sm:grid-cols-2`) of buttons (`:1916–1941`, testid `option-occasion-<slug>`).
  - There is **no** `Step1Occasion` component, no search and no "See all".
  - Rows come from `GET /api/experience-types` (`:472–475`; `server/routes/content.routes.ts:1222`; `server/storage.ts:4691–4694` selects every column). So **`experienceGroupFor` can run client-side on rows already fetched**; nothing calls it there today.
- **`/experiences`** renders `client/src/pages/experiences.tsx` (`App.tsx:600–602`): a flat card grid (`:141–188`), with copy "Choose from 8 curated experience templates" (`:108`; 29 rows are seeded).
  - **Its entry is `IntakePanel`, not `PlanModal`** (`:121–127`, `:215–220`).
  - `IntakePanel` already has a featured/"More types" split (`client/src/components/intake-panel.tsx:44,149–155,396–433`).
- **`experienceGroupFor`** is at `shared/experience-group.ts:46–62`. It is called by `SlipView.tsx:1589` (data attribute only, `:1862`), `server/services/item-lock.service.ts:38`, `plan-option-sets.service.ts:146` and `feedback.service.ts:30`.
- **Group mapping of the 29 seeded rows** (switches written by `updateExperienceTypeSwitches`, `server/seeds/experience-template-tabs.seed.ts:5135–5188`):

  | Group (traveler label) | Rows |
  |---|---|
  | trips ("A trip") | 6 |
  | moments ("One evening") | 3: `date-night`, `proposal` (hidden), `show` (`:4924–4926`) |
  | celebrations ("A celebration") | 12, incl. `corporate-events` |
  | hosted_events ("A hosted event") | 3: `wedding`, `reunions`, `corporate` |
  | group_travel ("A group getaway") | 5 |

  No seeded row has NULL switches.

**What the R127 guard is today**
- `shared/__tests__/experience-group.test.ts:48–50` (G4) asserts only that keys match `/^[a-z_]+$/`. It does not scan any UI.
- `playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts:192–194` asserts the exact text "Trips" is absent on the slip.
- No static scan exists (`scripts/` has no R127 hit).
- Amending "to allow exactly those five" therefore means a new assertion that **only** those five strings render, from one home. Today there is nothing to loosen, only something to add.
- None of the five labels exist in client or shared code. `shared/group-manifest.ts:48–80` declares eyebrows ("Your plan · Trip", …) that no client code was found to render.

**What the boards need that does not exist:** the group step, "See all occasions", search, one shared component, and one home for the five labels.

**Conflicts and constraints**
- `scripts/check-planning-entry.cjs:82–86,169–175,238–245` requires `/experiences` to keep either `<IntakePanel` + `setIntakeOpen(true)` or `<PlanEntryCta`, and to pass a literal `city`.
- `experiences.tsx:211–213` records the IntakePanel collapse (LD 42 D11) as a wave-3 lane not started. "One picker in both places" therefore means either the picker lives inside IntakePanel too, or the D11 collapse lands first.
- **Decision needed.** Brief A3.5 makes the Experiences entry the map's starting state, which changes what `/experiences` must offer under this guard.
- e2e specs click `option-occasion-*` directly after opening: `playwright/tests/planning-entry.spec.ts:80,105,112,131,141` and `j-kyoto-trips-golden-path.spec.ts:202,234,249`. A group step in front of the tiles breaks them unless they click a group first.
- `resolvePlanSteps` (`client/src/lib/plan-steps.ts:257–282`) is unaffected as long as the picker ends with `setOccasionSlug`. A door carrying an occasion still skips the step.

**Migrations:** none (the group is derived, R127).

---

## Lane 4 — Trip map planner

**What exists**
- **`experience-template.tsx`** is 3,412 lines, served at `/experiences/:slug[/new]` (`App.tsx:603–608`).
  - **Map:** the last `ExperienceMap` is on its desktop panel (`:3019`).
  - **Catalog reads:** seven `/api/catalog/*` reads plus `/api/venues/search` and POST `/api/geocode` (`:145,246–354,1308`). All are `isAuthenticated` (`content.routes.ts:1503–1672,4359`).
  - **How it writes:**
    - With a trip in TripContext, a service goes to `POST /api/trips/:tripId/itinerary-items` with `dayNumber: 1` (`:1737–1744`).
    - With no trip, it goes to `/api/cart` (`:1752–1764`).
    - Partner hotel/activity/event picks go to the cart **even with a plan** (`client/src/lib/template-external-add.ts:13–19`).
  - **Signed out:** add toasts and redirects to `/` (`:1642–1652`), keeping no pending action.
- **`MapControlCenter`** (`client/src/components/plancard/MapControlCenter.tsx`, 508 lines)
  - Plan and Browse layers (`:301–320`). Google with Leaflet fallback (`:142`). Supply from `/api/services`, `/api/affiliate/products` and `/api/experts` (`:156–168`, all public).
  - **Browse Add** writes `POST /api/trips/:tripId/itinerary-items` (`:187–199`).
  - **`tripId` is required.** There is no trip-less or signed-out mode. It shows one day at a time with no "All days" (`:271–283`).
- **Mint:** `mintTripSlip` (`client/src/lib/trip-slip.ts:184–201`). Callers: `PlanningContext.tsx:421`, `experience-template.tsx:1615`, `concierge/index.tsx:263`.
  - After mint, `runBranch` sends `ai` and `myself` to `/plans/:tripId` (`PlanningContext.tsx:497–516`). A door's `source.onFinish` runs first and can own the landing (`:492–495`).
  - `BRANCHES_THAT_MINT` is `client/src/lib/plan-steps.ts:85`.
- **Free draft:** `POST /api/ai/generate-itinerary` (`content.routes.ts:4582`).
  - Empty-plan gate (LD 41 b): `resolveAiDraftEligibility` (`server/services/ai-draft-eligibility.ts:70–104`), enforced at `content.routes.ts:4709,5278`, `routes.ts:1805` and in-transaction at `content-query.service.ts:429–436`.
  - Client reads `draftItemCount` (`plancard.routes.ts:782`) into `slipBuildAiAction` (`slip-rail.ts:70–73`).
- **Writers to reuse:** `SLIP_ITEM_ENDPOINTS` (`client/src/lib/slip-item-tools.ts:29–34`) and `browseAddBody` (`browse-supply.ts`). The add endpoint is gated owner/advisor/author/EA (`routes.ts:13149–13185`).
- **Days and lines:** `DayBlock` (`client/src/components/plan/DayBlock.tsx:31`). Straight connectors join located pins in day order (`map-scene.ts:151–156`). `isLocated` and `locatedCountLabel` are at `MapControlCenter.tsx:53,58–62`. The slip's "N of M located" is `SlipView.tsx:2043–2051`.
- **Sign-in:** `traveloure_return_to` in sessionStorage (`App.tsx:230–311`; `SignInModal.tsx:146–154`, which ends in a full reload). The guest pen hands off answers only (`client/src/lib/trip-context.ts:697–756`). The modal's mint gate opens sign-in and remembers nothing (`PlanningContext.tsx:407–411`). Guest trips stay held: `POST /api/trips` is 401 for anonymous callers (`routes.ts:1545–1551`).

**What the boards need that does not exist**
1. A map-first plan view. There is no `/plans/:id/map` and no `?view=`: the slip view is local state, defaulting to list (`SlipView.tsx:1472`). The precedent for a query landing is `?handoff=open` (`HandoffChooser.tsx:278–279`).
2. **A freshly minted empty plan cannot open the slip's map today.** The Map toggle is disabled when nothing is located (`SlipView.tsx:1489–1492,2036`). The board's "Your empty plan opens here, on the map" needs that changed for the map planner.
3. A trip-less or signed-out map, which `MapControlCenter` cannot render (it requires `tripId`).
4. **A pending action that survives sign-in.** None exists, and sign-in reloads the page.
5. An "All days" view and the board's five supply tabs (Activities, Hotels, Services, Dining, Flights). How these map onto `MapControlCenter`'s three supply reads is not mapped.

**Locked Decision conflicts and tensions**
- **LD 39** (`CLAUDE.md:739`, one store) is broken today by the template page: partner picks go to the cart with a plan in hand, and there is a trip-less cart fallback. The map planner must not inherit either.
- **D8** (`CLAUDE.md:1160`): the template's "View in Trip Planner" links to `/trip/:id` (`experience-template.tsx:2136,3078`).
- **D16** (`CLAUDE.md:1265`): the map planner must reuse `canEditPlanItems` (`client/src/lib/slip-viewer-role.ts:35–37`), as the slip does (`SlipView.tsx:2094`).
- **The ruled `ExperienceMap` board draws three things current rules do not allow:**
  - **Area-only stops as rings** at area positions (`ExperienceMap.dc.html:183,205`, "Shown by area…"). This sits against §13, ledger `2026-10-03-no-ward-pins` and `MapControlCenter.tsx:6–7` ("never guessed onto the map"). **Needs a ruling.**
  - A **"loose" group of items with no day**, but `itinerary_items.day_number` is NOT NULL (`shared/schema.ts:5712`).
  - A literal "$5.99" on the Optimize button. The brief §D already says amounts resolve from `fee_bands`.

**Migrations**
- None for the ruled scope. Landing on the map can be decided at the finish (`onFinish`, or a `?view=` param), and a pending action can live in sessionStorage.
- A migration would be needed only for a persisted "opens on map" preference, or for day-less items.

---

## Lane 5 — Pets on trips (not armed)

**What exists:** nothing that records pets.
- There is no pet column, field, filter, fact type or Places request in `shared/`, `server/` or `client/src`.
- The only hits are the `pets-animals` service category (`shared/constants/providerCategories.ts:338`), a "No pets." string in a property test (`server/__tests__/s8-property-builder.db.test.ts:305,311`), and "pet-travel" in comments (`client/src/lib/earn-roles.ts:94`).

**Brief claims checked**
- **Confirmed:** `allowsDogs` is named only in `PLACES_ATMOSPHERE_FIELDS` (`server/services/content-facts/places-adapter.ts:87`). The list's comment says it exists "so a test can prove the default asks none of them". Asking for it moves a call to the `details_enterprise_atmosphere` SKU (`:41`, cost at `:191–192`).
- **Confirmed (gap 1):** the trips party is `adults`/`kids` only (`shared/schema.ts:130–131`).
- **Confirmed (gap 2):** `asksAccessibilityNote` is `guestListSetting(occasion) === true` (`client/src/lib/plan-steps.ts:344–346`, pinned by `client/src/lib/__tests__/plan-steps.test.ts:325–331`). The trips column is `accessibilityNote` (`shared/schema.ts:255`). LD 38 (`CLAUDE.md:699`) rules "the note when `default_guests` is explicitly true". **Offering it on trips amends LD 38.**

**Where a pet answer would have to be admitted**
- `insertTripSchema` `.omit()` (`shared/schema.ts:2735–2747`)
- `tripOccasionBody` pick/extend and `TRIP_OCCASION_NULLABLE_KEYS` (`server/routes/trips.routes.ts:3451–3487`)
- `tripContextSchema` (`server/routes/trip-context.routes.ts:98ff`, which strips unknown keys), and the client `TripContext`
- The Who step body (`plan-modal.tsx:2265–2292`; note block `:2374ff`; held/PATCH writes `:1040,1069,1086`)

**Homes for the three sources**
- **Host:** none structured. `provider_services.house_rules` is property-level free text (`shared/schema.ts:1373`); `amenities` (`:1374`); `what_to_bring`/`access_notes` (`:1219–1220`, LD 24).
- **Local:** `local_knowledge_nuggets.nugget_type` has no pet type (`shared/schema.ts:10040`). `place_facts` origin `expert_nugget` is publishable once verified (`shared/content-facts.ts`, `isPublishable`).
- **Google:** a new `FACT_TYPES` value is needed (`shared/content-facts.ts:125–141`); none is pet-related.

**Border link:** `publicFactAttribution` (`shared/content-facts.ts:298–311`) already produces "from <source> · checked <date>". But `isOfficialPublicFact` admits only `hours, closure, ticketing_rule, transit, event` (`:206,213–218`). A border fact type rendered publicly would amend R-p (LD 57). Plan-only rendering would not.

**Service animals:** there is no plan-level home. `trip_participants.accessibility_needs` (`shared/schema.ts:5564`) is a participant's own answer (LD 24/37/38), not the plan's.

**Migrations (each a hard stop)**
- Trips pet kind and count: additive nullable, no default or CHECK, declared in `schema.ts`.
- A service-animal home: a column, or the accessibility note offered on trips (an LD 38 amendment, no DDL).
- Possibly a structured host pet-policy column on `provider_services`, unless `house_rules` is ruled the source.
- `FACT_TYPES` and nugget-type additions are code-only (varchar columns).

---

## Not proven

- **Production state:** none was read. That includes `experience_types` rows (extra slugs or NULL switches, which would fall outside the five groups as `plain_plan`), whether `city_events` and `destination_events` are populated, whether any `place_facts` have `place_ref_kind='event_id'`, and whether services/affiliate products carry Kyoto coordinates for map pins.
- **Runtime rendering** of the coral sites. White text inherited from a parent, or set on a different line, may be misclassified. The four `--console-brand` backgrounds and the `bg-primary` sites were not checked for white text.
- **The "silently sets the active plan" mechanism** on the template page (spec step 8, smoke 11). The likeliest candidate is `writeTemplatePen` in its persist effect (`experience-template.tsx:1155–1216`; `client/src/lib/template-pen.ts:33–53`). Not reproduced.
- **Why smoke 11 saw 404s and not 401s** on the catalog and geocode routes, which exist and are authenticated.
- Whether `createComparison`, `generateItinerary` and the AI Itinerary Builder dialog in the template page are unreachable at runtime. Only call sites were grepped.
- Whether `POST /api/trips/:tripId/itinerary-items` keeps `affiliateProductId`/`latitude`/`longitude` for every caller. The allowlist was read only in part.
- Whether `GROUP_MANIFEST.eyebrow` is rendered through an indirect read.
- Whether any test pins `GlobalCalendar`'s `hidden lg:block` or the 1/8/15/22 behaviour.
- Google's current SKU for `allowsDogs`. The tier comes from the repo's own list.
- No tests, build or Playwright were run. This lane changed docs only.

## Decisions the next lanes need (not taken here)

> **Answered 2026-10-05, 17:42 ET** by `experiences-map-planner-rulings-2.md` (ledger `2026-10-05-coral-three-tokens` … `2026-10-05-pets-fields-and-service-animal`). Lane 1: three tokens and `.console-scope` fills move (rulings 1–2). Lane 2: the real city is stored (3). Lane 3: ungrouped rows under "See all" only (5), Proposal under "One evening" (4), `IntakePanel` leaves `/experiences` in 8a (6). Lane 4: no area marks (7), no day-less items (8), the map opens on Browse (9), signed-out browsing last (10). Lane 5: the two gaps (11–12). Kept below as asked.

1. **Lane 1:** do `.console-scope` `--primary` (and its four siblings) move with `:root`? Do the 39 `var(--earn-coral-ink)` fills move to a new fill token?
2. **Lane 2:** store the event's real locality (a column, plus a seeder fill exception), or derive it?
3. **Lane 3:**
   - How do `plain_plan` rows appear in a five-group picker?
   - Where do hidden occasions (`proposal`) go? Proposal's placement is unruled (§B).
   - Does the D11 `IntakePanel` collapse land before the shared picker?
4. **Lane 4:**
   - The area rings on the board versus `2026-10-03-no-ward-pins`.
   - "Loose" day-less items versus `day_number NOT NULL`.
   - A map that opens on an empty plan versus the slip's disabled Map toggle.
5. **Lane 5:** the two §B gaps, as the brief already says.
