# Step 8a — Phase 0 re-check (Track A, read-only)

> Written 2026-10-06 by Track A for `docs/planning/briefs/step-8-brief.md` revision 3.1, section "8a — Entry".
> Base: `main` `b18b06a408522cad2594a5aab50f2838c0daf6d0` (`bash scripts/check-lane-base.sh b18b06a…` →
> OK; `origin/main` unchanged at writing). **Nothing was built:** no product code, no migration, no
> commit, no branch. `file:line` is at that base. Where the code and the brief disagree, the code is
> right; each case is marked **Brief ≠ code**. Prior evidence re-checked: the Lane 0 audit
> (`docs/planning/briefs/experiences-map-planner-phase0-audit.md`, Lane 3) at its base `71e6752`.

**Migrations:** none needed. 8a is client + guard + docs. (355 and 356 are taken; 357 would be next.)

---

## 1. The occasion picker (8a item 1)

**What exists**
- The modal's occasion step is inline, `client/src/components/trip/plan-modal.tsx:1903–1945`: a flat grid
  (`:1913` `grid-cols-1 sm:grid-cols-2`) of buttons, testid `option-occasion-<slug>` (`:1927`), each
  ending in `setOccasionSlug(t.slug)` (`:1920`). The brief's `:1903–1950` is correct to within the
  closing lines (`:1946` starts step 2).
- Rows: `GET /api/experience-types` (`plan-modal.tsx:472–475`) → `server/routes/content.routes.ts:1222–1228`
  → `server/storage.ts:4691–4695` (every column, `is_active = true`, by `sort_order`). The route drops
  aliased slugs, and `slugAliases` is empty (`content.routes.ts:1214`). So the switch columns
  `experienceGroupFor` reads are already on the client.
- `experienceGroupFor` is `shared/experience-group.ts:45–62` (pure). Keys: `plain_plan`, `moments`,
  `celebrations`, `trips`, `hosted_events`, `group_travel` (`:20–26`). No client code renders a group
  today; `SlipView.tsx:1589` reads it for a data attribute (`:1862`) and the slip frame (`:1964`).
- The board's five labels exist nowhere in `client/` or `shared/`. `shared/group-manifest.ts:87–119` holds
  different, unrendered eyebrows ("Your plan · Trip" …).

**The seeded catalog, grouped** (read on a local database seeded by this commit's boot; production not read):
| Group | Label (brief) | Active rows |
|---|---|---|
| `trips` | A trip | 5: `romance`, `honeymoon`, `golf-trip`, `anniversary-trip`, `travel` |
| `moments` | One evening | 3: `date-night`, `show`, `proposal` (hidden) |
| `celebrations` | A celebration | 12, incl. `corporate-events`, `birthday`, `milestone-birthday` |
| `hosted_events` | A hosted event | 3: `wedding`, `reunions`, `corporate` |
| `group_travel` | A group getaway | 5: `boys-trip`, `girls-trip`, `family-occasion`, `retreats`, `bachelor-bachelorette` |

- 29 rows total; **28 active**. **Brief ≠ code (small):** the audit counted 6 trips. The 29th row,
  `sports-event`, is inactive here, so the API does not return it. Ruling 5 holds: no seeded row is
  `plain_plan`, so "See all occasions" is the only home a NULL-switch row would have, and none exists
  today. The fixture test has to build one.
- Ruling 4 holds: `proposal` resolves to `moments` ("One evening").

**R127 today:** `shared/__tests__/experience-group.test.ts:48` (G4) only checks that keys are lower-case
identifiers. `playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts:194` asserts the exact text
"Trips" is absent on the slip. Neither conflicts with five new labels kept in one home (the labels are not
the keys). Nothing guards the labels today (8a item 4 adds it).

## 2. `/experiences` as the starting state (8a items 2, 6)

**What exists**
- Route: `client/src/App.tsx:605` `/experiences`; `:608` `/experiences/:slug`; `:611` `/experiences/:slug/new`
  (the audit's `:600–602` moved). D5: the two slug routes stay on the old template page in 8a.
- Page: `client/src/pages/experiences.tsx` (222 lines). It is a flat card grid linking to `/experiences/:slug`
  (`:146–187`), a "Need Help Deciding?" card (`:190–203`), and the entry button `:119–127` that opens
  `IntakePanel` (`:214–219`).
- Copy to remove: "Choose from 8 curated experience templates" at `:108` ✓. **Also on the page and not in
  the brief:** the SEO description `:95` ("Explore curated experience templates …") and the heading
  "Plan Your Perfect Experience" (`:104`), which `planning-entry.spec.ts:245` asserts.
- Query parameters the page reads: `?destination=` and `?country=` (`:64–65`), `?plan=1` (`:75`, opens the
  intake on arrival). Links into the page pass other parameters it ignores:
  `TripQueueIndicator.tsx:34` (`?destinations=…&multiCity=true`), `discover-location.tsx:1478,1488,1508`
  (`?city=…&q=…`).

**The Where half**
- The eight cities are `OPERATING_MARKETS` (`shared/operating-markets.ts:31`), each with a city, country,
  market key and lat/lng. **No component draws them as a map with pins today.** The board's map credits
  "Natural Earth"; the design asset `docs/design/experiences-map-planner/assets/world-map.svg` (34 KB,
  1100×480) is in the repo but not under `client/`.
- **City photos:** the board's are `/_blob/…` references that are not in the repo. The client holds credited
  photos for **Kyoto and Bogotá only** (`client/public/images/landing/`, credits in `ATTRIBUTION.json`, read
  through `landing-hero.tsx:57`). The other six cards would be typographic. The board itself says "No photo
  yet for Edinburgh".
- The board's lower links ("Open it on the map", "Find a local expert", "Browse Ready-Made Trips") and the
  "Show / Festival" card: D6 keeps the card out. The three links name existing routes.

## 3. The door and the step (D1, D4; 8a item 2)

- `focusStep` is typed `"who"` at `client/src/lib/plan-steps.ts:222` and read at `:272–279`.
  **Brief ≠ code:** it is typed `"who"` a second time at `client/src/contexts/PlanningContext.tsx:101`.
  Both widen for D1. `SlipView.tsx:1848` is the only current sender.
- `resolvePlanSteps` is `plan-steps.ts:257–282`; rule 4 ("steps 2 and 3 are never skipped") is the header
  at `:32–36`; the LD 33 sentence is `CLAUDE.md:540`. The modal calls `resolvePlanSteps` at
  `plan-modal.tsx:622` and `:774`. A door's `city` pre-fills step 2 at `:485`.
- `DOORS_THAT_START_A_NEW_PLAN` is `plan-steps.ts:152–166` ✓. **Brief ≠ code (what else moves):** a door is
  a member of the closed list `PLAN_DOORS` (`shared/slip-funnel-events.ts:29–48`), which says "adding one
  is a doc amendment first" (`:28`): `docs/planning/slip-funnel-events.md` §3.1 (`:100–128`). Two tests pin
  the list: `server/services/__tests__/trip-mint-entry.test.ts:127` (`PLAN_DOORS.length === 14`) and
  `client/src/lib/__tests__/new-plan-door.test.ts:32–33`.
- **Collision with the Events session:** its 2b adds `event_detail` to the same three places (the
  doc §3.1, `PLAN_DOORS`, the count test). Whichever merges second rebases; the count becomes 16.
- D4's finish branch: `nav.json:141` is "Plan with AI" (`client/src/locales/en/nav.json:140–142`, key `ai`).
  The map landing is 8b-2; until then 8a lands on the slip's list view as today.
- Pre-fill: `CityGrid.tsx:136` is the model a city door follows (`{ door, city, country, newPlan: true }`).

## 4. `IntakePanel` leaves `/experiences`; the guard (8a item 3)

- `scripts/check-planning-entry.cjs`: the `/experiences` entry-surface row `:82–86` ✓; the required-field
  row (`city`) `:169–175` ✓; the shape test `:238–245` ✓ (`<IntakePanel` + `setIntakeOpen(true)`, or
  `<PlanEntryCta`). **Also moves:** its self-test fixtures for this page, `:521` (`EXPERIENCES`) and
  `:555` (the JSX-prop case), and the header text `:21` and `:304`.
- Other `IntakePanel` callers, **not touched in 8a** (D11): `client/src/pages/my-trips.tsx:494` and
  `client/src/pages/dashboard.tsx:168`.

## 5. e2e specs that click occasion tiles (8a item 5)

- `playwright/tests/planning-entry.spec.ts:80, 105, 112, 131, 141` ✓.
- `playwright/tests/journeys/j-kyoto-trips-golden-path.spec.ts:202, 234, 249, 250, 316, 326` ✓.
- **Brief ≠ code, missing from the list:** `e2e/supply-demand/lib/flows.ts:851, 855` (the supply-demand
  journeys pick an occasion tile, then fall back to any tile).
- **Brief ≠ code, also moves:** `planning-entry.spec.ts:239–264` pins the old `/experiences`: the heading,
  "the page CTA opens the intake panel" and "`?plan=1` opens the intake panel on arrival".

## 6. Coral (brief "Rulings", coral line)

- The fill token does not exist on `main`: `client/src/index.css:12` is still `--primary: … #E85D55`. It
  lands with **#1310** (open, Events session). 8a's new filled buttons (Continue, the picked group) should
  use the token `--primary` through `bg-primary`, which follows whichever value is on `main`.

## 7. `FOLLOWUPS.md` (8a item 7)

- `FOLLOWUPS.md` exists at the repo root (a second one, `docs/backoffice/FOLLOWUPS.md`, is unrelated).

---

## Not proven

- Production's `experience_types` rows were not read; the grouping above is the seed. A production row with
  NULL switches would appear under "See all" only, as ruled.
- The board's mobile picker (`ExperiencesMobile`) was read for structure only.

## Decisions the lane needs (not taken here)

1. **`?plan=1`.** Nothing in the client links to it, but `planning-entry.spec.ts:261` pins it.
   - Option a: drop it, so the page is the start state.
   - Option b: make it open the modal through the new door.
   - Recommend (a). Ruling F-T1 already says "a route never auto-opens".
2. **The map on the Where half.**
   - Option a: the static Natural Earth SVG (moved into `client/public/`, the eight pins placed from
     `OPERATING_MARKETS` lat/lng).
   - Option b: the existing `MapControlCenter` (Google Maps JS, billed per load).
   - Recommend (a). It is what the board draws, it costs nothing per view, and it needs "Natural Earth" as
     its credit.
3. **Photos for six cities** are not in the repo. Recommend typographic cards for those six (§13: never a
   photo of nowhere), and the two credited photos for Kyoto and Bogotá.
4. **`?destination=` on arrival.** Recommend it pre-picks the city card only when it names one of the eight.
   Otherwise nothing is picked; never a nearest match.
5. **The page heading and SEO text.** The board's "What are you planning?" replaces "Plan Your Perfect
   Experience". Confirm, since `planning-entry.spec.ts:245` and the SEO description change with it.

## Decisions as taken (decision-maker go, 2026-10-06: "8a Phase 0 accepted. Go, base b18b06a or later.")

1. **`?plan=1`: dropped.** Nothing outside the spec linked to it; the spec test at
   `planning-entry.spec.ts:261` is deleted and the page never auto-opens anything (F-T1).
2. **The map: the static Natural Earth SVG**, moved to `client/public/images/world-map.svg`, with the
   eight pins placed from `OPERATING_MARKETS` lat/lng and "Map: Natural Earth" rendered. No Google map
   on an entry page; nothing billed on load.
3. **Six cities without photos: typographic cards.** No stock, no AI, no Google photo (R-aq). Kyoto
   and Bogotá keep their credited photos, with the credit rendered.
4. **`?destination=` pre-picks only an exact match of the eight;** otherwise nothing is picked, never
   the nearest. **Addition:** `?city=` (from `discover-location.tsx:1478,1488,1508`) is handled the
   same way. `?destinations=&multiCity=true` (`TripQueueIndicator.tsx:34`) stays ignored and is noted
   in `FOLLOWUPS.md` (FU-8A-3).
5. **Heading: "What are you planning?"** The spec at `planning-entry.spec.ts:245` and the SEO
   description change in the same PR.

Also ruled in the go:
- **The door.** The §3.1 doc amendment is written first. `PLAN_DOORS` gains `experiences`, and the
  count test moves to 15. The Events lane's 2b (`event_detail`) touches the same three places; the
  second to merge rebases and the count becomes 16.
- **Specs.** `flows.ts:851,855`, `planning-entry.spec.ts:239–264` and `check-planning-entry.cjs:521/:555`
  are updated in this PR.
- **`focusStep`.** It widens in both `plan-steps.ts:222` and `PlanningContext.tsx:101`.
- **Catalog.** The picker lists active rows only, so 28 is right. `sports-event` is not touched.
- **Coral.** The fill is built on `bg-primary`, and either merge order with #1310 is fine.
- **Out of scope.** `IntakePanel` on `my-trips` and `dashboard` stays for D11. No migration.
