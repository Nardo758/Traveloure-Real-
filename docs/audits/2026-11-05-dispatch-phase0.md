# Phase 0 — brief verification against main bc5199b (read-only checkout of main)

Read-only. Paths are relative to the repo root. "±N" means the defect is at the cited place, off by N lines.

| # | ID | Status | Evidence (file:line, short) | Scope impact |
|---|----|--------|-----------------------------|--------------|
| 1 | A-1 | confirmed | `client/src/lib/waitlist-guest-plan.ts:141-151` forwards only `gemId` (:149). `server/services/guest-plan.service.ts:80-93` is a `.strict()` body with `gemId` as the only link; :265-275 insert writes no contentType/contentId/providerServiceId. The cards themselves carry `sourceContentId` (city-feed-card.tsx event :1424, vendor :1854/:1981, supply :2193/:2331); :1375/:1715/:2051 are the `wrapAdd` lines, and the id is dropped by waitlist-guest-plan.ts:149. The recommendation card's payload carries no `sourceContentId` at all (city-feed-card-recommendation.tsx:183-190, wrap at :134). Catalogue: `catalogueAddItem` (client/src/lib/catalogue-search-copy.ts:77-84) sends providerServiceId/viatorProductCode, which the guest mapper drops, so the result is title only (wrap at catalogue-search-results.tsx:52). | None for the guest path. The recommendation card needs an id added at the card itself, not only in the mapper. |
| 2 | A-2 | confirmed | waitlist-guest-plan.ts:126-127 throws "400: no destination". browse-save.ts:39 uses `(item as any)?.city ?? null`. Which payloads omit city: see the specific-check section. Only the catalogue result omits it, and that includes partner_viator. | Narrow: the fix is the catalogue payload (or pass the `city` prop through `CatalogueResultRow`). |
| 3 | A-3 | confirmed (mixed) | city-feed-card.tsx:1964 "Book now", with Add at :1987 (the same pattern on the gem card at :1182). landing-hero.tsx:518 `copy.bookNow` (BookableTileCard; :703 does not gate on mode). **:231 is already gated** (`mode === "open"`). ready-made-detail.tsx:597-599 "The price buys the plan", :618-619 "Includes 1 revision…after purchase". The "after purchase" line is at **:676**, not :653-660 (653-660 is the waitlist buy button, which is already gated). StorefrontBookingPanel.tsx:249, :413 "Check availability". bento-action-state.ts:103. tile-action-copy.ts:13/18. storefront-offering-action.ts:59, :127. deals.tsx:238 (±1). booking-mode-prompt.ts:61 "Instant booking". | Drop landing-hero :231 (already done). Re-point the ready-made revision line to :676. |
| 4 | A-4 | confirmed | guest-plan.service.ts:187-192 maps slug→`eventTypeForSlug` (coarse); the slug is not stored. guest-plan-map.tsx:257 passes `occasionSlug` (cited :253, ±4). `writePlanPenOccasion` (server/services/plan-pen-occasion.service.ts:17) has 3 callers: trips.routes.ts:3706/3708 and occasion-drafts.service.ts:406. None is on the guest rail or in `claimGuestPlans`. | None. The pen is keyed by owner id, so the write must happen at claim (a guest has no owner). |
| 5 | A-5 | confirmed | 433_guest_plans.sql:9-11 has only plain partial indexes and no UNIQUE. guest-plan.service.ts:196 `storage.createTrip` is unconditional. waitlist-guest-plan.ts:124-130 reads then creates. `currentGuestTrip` (:129-137) orders by createdAt desc, so a duplicate hides the earlier plan. | None. |
| 6 | A-6 | confirmed | verified-email-action-gate.ts:56-58 is enforcement = `emailSendsEnabled()`. :68 `if (!input.enforced) return "allow"`. | None. |
| 7 | A-7 | confirmed (mitigated on press) | SignInModal.tsx:439-447 "Sign up" switch link and user-menu.tsx:90-96 "Sign Up" button; neither reads the mode. Pressing the modal link to signup triggers `useWaitlistSignupGate` (SignInModal.tsx:71 → SignupForm.tsx:142-160), which redirects to the waitlist. user-menu opens the modal in sign-in mode. | Copy/label only. The redirect already exists. |
| 8 | A-8 | confirmed | plan-entry.ts:456-458 `chosenOccasionSlug` = `occasionSlug \|\| OCCASION_GROUP_DEFAULT_SLUG[group]`. `canStartPlan` is at **:501-503** (`!!state.market`), not :130 (:130 is `DEFAULT_GROUP = "trips"`). PlanEntry.tsx:775-786 is the start button. shared/experience-group.ts:191-197 has the default slugs. | Line correction only. |
| 9 | A-9 | confirmed | PlanningContext.tsx:581-593: the occasion PATCH `.catch` only `console.warn`s (:590-593). | None. |
| 10 | A-10 | confirmed | queryClient.ts:12-23: localStorage UUID, and the header is omitted silently when storage throws. guest-plans.routes.ts:73 returns 400 `guest_session_required`. | None. |
| 11 | A-11 | confirmed | guest-plan.service.ts:265 → storage.ts:8449-8462 `createItineraryItem` is a plain `db.insert`, with no idempotency, no opts and no coordSource/fromLocalInput passed. | None. |
| 12 | A-12 | confirmed | browse-save.ts:28 decides by mode alone while auth loads. signup-mode.ts:41-43 is fail-closed to "waitlist". | None. |
| 13 | A-13 | confirmed | `"traveloure_guest_session"` at waitlist-guest-plan.ts:18 and queryClient.ts:14/17. Also App.tsx:1550 and SignInModal.tsx:87. | Two more copies than the brief lists. |
| 14 | A-14 | moved | The `/marketplace` → `/destinations` redirect is now App.tsx:**1484-1486** (the cited 1478-1483 are /weddings and /proposals). The "copy implying Marketplace starts a plan" was not located. | Line correction. The copy half is unverified. |
| 15 | A-15 | confirmed | emailAuth.ts:422-430: when enforced and the email is unverified, forgot-password sends `issueEmailVerification` instead of a reset. | None. |
| 16 | A-16 | confirmed | App.tsx:779 single `/places` route. hidden-gems.tsx:74-81 reads `?city=`. | None. |
| 17 | C-5 | confirmed | gem-discovery.service.ts:37-50 CATEGORY_LABELS; keys at shared/schema.ts:7006-7019. hidden-gems.tsx:127 "Local Picks", :131 subtitle "Local places and experiences that tourists rarely find". | None. |
| 18 | K-7 | confirmed (and the guard is blind) | cities-rail.tsx:82 `` `crowd ${c.crowdBand}` ``, landing-hero.tsx:583 `` `crowd ${hero.crowd}` ``, CityCard.tsx:109 `` `${crowdLevel} crowd` ``. The guard reads template fragments but skips these. See the specific-check section. | **Widens**: the never-say guard's LOWER_TOKEN skip has to change too, or these stay uncaught. |
| 19 | K-8 | confirmed | experts.tsx:455 "Find Your Perfect Local Expert". ai-matched-experts-section.tsx:253 "Find Your Perfect Expert Match", :213 "best expert matches". pricing.tsx:306 eyebrow "BEST FOR ONE TRIP". destination-calendar.tsx:166 "best times to visit". ready-made-detail.tsx:525 "Best season". pages/ai-assistant.tsx:271 "Best destinations…". | None. |
| 20 | K-9 | confirmed (copy) / scope note | landing-mockups.tsx:293 "Plan with AI". architecture-diagram.tsx 34/42/59/99/158/179/219/233 are all "AI…" strings. Mounts: see the specific-check section. Both `/architecture` and `/landing-mockups` are dev-only (production redirects to `/`). `/ai-assistant` is sign-in only. | **Narrows**: architecture-diagram and landing-mockups are not reachable in production. |
| 21 | N-6 | **wrong** | Both files run in CI through directory globs: build.yml:3088 (`client/src/lib/__tests__/*.test.ts*`, job unit-suite-client-lib) and build.yml:3113 (`client/src/components/plancard/__tests__/*.test.ts*`). Both use `node:test`. `check-test-files-wired.cjs` reports 1398/1421 reachable, and neither file is among the 23 orphans. | **Drop the lane.** |
| 22 | N-7 | confirmed | check-decision-guards.cjs:73 `yamlText.split("\n")`. Same at check-ledger-union-merge.cjs:48 and check-test-files-wired.cjs:156, :197, :436. No CR stripping. | None. |
| 23 | A-17 | **wrong** (all four pass at bc5199b) | check-claims-only-user-lookups: OK (1020 files). transport-hub.routes.ts:340 already uses `getUserId(req)`, and its `claims.sub` is inside a comment. check-public-user-id: OK (4 printed exemptions). check-coverage-matrix: OK (6 deferred tags registered). check-omit-schema-ratchet: 187 omit = OMIT_BASELINE 187, OK. | **Drop**, or re-derive where the failures came from. The claims-only script scans `process.cwd()/server`, so running it from the wrong cwd behaves differently. |
| 24 | A-18 | confirmed | guest-plan.service.ts:255-262 leaves an unlocated gem with no point. MapControlCenter.tsx:86-88 `isLocated`, :671 "Not on the map yet", :845 "not on the map". browse-save.ts:39-42. Seed gems without coordinates: see the specific-check section. | None. Data gap: 21 seeded Kyoto rows have no point. |
| 25 | A-19 | confirmed | guest-plan-map.tsx:263 `saveToGuestPlan({ title, dayNumber })` drops gemId and any id. | None. |
| 26 | A-20 | confirmed | gem-discovery.service.ts:413-418 `getAvailableCategories` maps all 12 `discoveryCategories` with no data filter. | None. |
| 27 | A-21 | **wrong** (for the guest page) | guest-plan-map.tsx (WaitlistGuestPlan :225-378) renders no Optimize and no Getting home. MapControlCenter hides the plan rail and board for a guest (:427, :572). "Getting home" renders nothing anywhere (ToolsTray.tsx:99-108 returns null). | **Re-scope**: if the concern is the claimed plan on `/plans/:id`, that is the signed-in slip, not the guest page. |
| 28 | A-22 | confirmed | guest-plan-map.tsx:356-365 renders a bare `<ol>` "Day N · title" list, not the Trip Slip/DayBlock. | None. |
| 29 | A-23 | confirmed | guest-plan-map.tsx:281-293 `guest-map-no-record` with a bare "Start a plan" link. The same bare link appears at :123-136 (signed-in) and :147-155 (no record). | Three sites, not one. |
| 30 | A-24 | partly fixed / moved | MapControlCenter.tsx:691-711 already has `role="tablist"`/`role="tab"`, `aria-selected`, `aria-controls`, roving `tabIndex`; the tabpanel with `aria-labelledby` is at :823-827. Still missing: no `onKeyDown`/arrow-key handler in the file, so tabs with `tabIndex=-1` cannot be reached by keyboard. | **Narrows** to arrow-key navigation. |
| 32 | A-26 | already fixed (scheduling) | Mounted at internal.routes.ts:504 (router in routes.ts:1350). JOB_CADENCE daily at internal.routes.ts:247. Posted in scripts/ci/post-internal-jobs.sh:307 (daily bucket), run by jobs-cron.yml:93. Remaining: `GUEST_PLAN_RETENTION_DAYS` unset ⇒ disabled (guest-plan.config.ts:24-25, service :318-320). | **Narrows** to setting the env value (an operator step). |
| 33 | A-27 | confirmed / moved (columns) | shared/schema.ts:6711 `insertItineraryItemSchema` omits contentType/contentId/sourceClass/coordSource and others. The relevant columns are at :6120 (providerServiceId) and :6257-6258 (contentType/contentId), not :6091-6109 (those are the base columns). guest-plan.service.ts:242-263 writes none of them. | Line correction only. |
| 34 | A-28 | confirmed | bento-action-state.ts:94/103/107. tile-action-copy.ts:11-20. trip-capabilities.pure.ts:95-161 (the action ladder). trip-capabilities.routes.ts:85 `isAuthenticated`, so a guest gets no capabilities. | None. |
| 36 | A-30 | confirmed | beta-rollout-fees.test.ts:61 `decideBandKey(..., "beta_flat", ...)`. fee-keep-copy.ts:60 builds "`${label} cohort rate, locked when you join`", and :64 is the doc example "beta cohort rate, locked when you join". | String at :60, not :64. |
| 38 | A-32 | partly verified | Signed-in browse adds send no `coordSource`: none of the client add paths set it (only expert/workspace.tsx:525-602). The server admits it from the body only (routes.ts:13577, trips.routes.ts:3394). CN-1 hotels links-only and concierge write-authority were not traced. | Question-form brief. Needs a sharper claim. |
| 39 | A-33 | confirmed | browse-supply.ts:352-355: gems and events carry no point in the public payload and list as "not on the map". | None. |
| 40 | A-34 | confirmed | intake-panel.tsx:50 STEP_LABELS, :313 "What kind of trip". Mounted at dashboard.tsx:14/231 and my-trips.tsx:10/494. shared/schema.ts:115 `eventType…default("vacation")`. plan-entry.ts:252-258 `planEntryChoiceLabel`. trip-slip.ts:187-190 `planTitle`. | None. |
| 41 | A-35 | confirmed | IntakePanel's create (intake-panel.tsx:197-215) sends only `eventType: eventTypeForSlug(slug)`; featured `anniversary-trip` → `"other"` (checked by running it). No occasion PATCH and no slug persisted. trips has no `occasion_slug` and the guest plan has none (see the specific-check section). | None. Persisting the slug needs a schema decision. |
| 42 | A-36 | confirmed | experts.tsx:455 (same as K-8). | Merge with K-8. |
| 43 | A-37 | mostly already fixed | Two call sites: App.tsx:1567 (sign-in watcher) and guest-plan-map.tsx:116. Both go through `claimGuestPlans`, which shares one in-flight promise (waitlist-guest-plan.ts:153-166). The plan page first reads the stored claimed id (:114) and skips the POST when it is there. A sequential second POST is possible only when the first claimed nothing, and the server claim is an atomic conditional (guest-plan.service.ts:286-300), so the second returns `[]`. | **Narrows / likely drop.** |

(The brief list has no #31, #35 or #37; those are notes.)

---

## Specific checks

### trips.event_type nullability; trips.occasion_slug
- `shared/schema.ts:115`: `eventType: varchar("event_type", { length: 30 }).default("vacation")` is **nullable** (no `.notNull()`).
- Migrations: `server/migrations/000_baseline_schema.sql` creates `public.trips` at :3930, and its `event_type` (:3942) is `character varying(30) DEFAULT 'vacation'` with **no NOT NULL**. No later migration alters trips.event_type. The `event_type … NOT NULL` hits in the baseline (:328, :860, …) belong to other tables (ai_blueprints, cross_sell_events, …).
- **No `trips.occasion_slug`** in the schema or the migrations. The only `occasion_slug` is on `blog_posts` (schema.ts:12581; migration 329_blog_posts.sql:17). trips does carry `experience_type` (varchar 20, schema ~:141) and `moment_key` (:149). LD 42 D1's `trips.experience_type_id` is also not on main (ai-task-prompt.ts:95 says so). The occasion slug lives only in the trip-context pen (`writePlanPenOccasion`, trips.routes.ts:3706).

### K-7: never-say guard and template literals
- The guard is `scripts/check-never-say-copy.ts` (baseline `scripts/never-say-baseline.json`).
- It does read template fragments: :156 `isStringLiteral || isNoSubstitutionTemplateLiteral`, and :157 `isTemplateHead || isTemplateMiddle || isTemplateTail`.
- **But** :159 drops any non-JSX fragment whose trimmed text matches `LOWER_TOKEN = /^[a-z0-9_.\-:/#?=&]+$/` (:91), which is a single lower-case token.
- `` `crowd ${x}` `` has the head "crowd " (trimmed to "crowd"), and `` `${x} crowd` `` has the tail " crowd". Both are single tokens, so they are **skipped**. The three cited lines are invisible to the guard, even though "crowd" is a banned word (the fixture at :295 is `["Fewer crowds","crowd"]`).

### K-9: route mounts
- `pages/ai-assistant.tsx`: App.tsx:41 lazy import, route `/ai-assistant` at App.tsx:1515-1517 = `DashboardLayout` + `ProtectedRoute`. **Not public** (signed-in only). Separate pages exist at `/expert/ai-assistant` (:944) and `/ea/ai-assistant` (:1124).
- `pages/architecture-diagram.tsx`: App.tsx:147 lazy import, route `/architecture` at App.tsx:518-520. It renders only when `NODE_ENV === "development"` and otherwise does `<Redirect to="/" />`. **Not reachable in production.**
- (`/landing-mockups`, App.tsx:503-505, is the same dev-only shape.)

### N-6: workflows
- `grep round2-exp-qa|row-gate1-partner1 .github/` finds no name match.
- Globs cover both files:
  - `.github/workflows/build.yml:3088` runs `node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/*.test.ts*` (job `unit-suite-client-lib`).
  - `.github/workflows/build.yml:3113` runs `npx tsx --test client/src/components/plancard/__tests__/*.test.ts*` (job `unit-suite-client-components`).
- Both files import `node:test`.
- `node scripts/check-test-files-wired.cjs` reports 1398/1421 reachable, 23 orphans, and neither file is listed. → **N-6 is wrong.**

### A-17: guard runs (node, no network; node_modules symlinked into the worktree)
| script | result |
|---|---|
| check-claims-only-user-lookups.cjs | PASS: "OK — scanned 1020 files, no claims-only user lookups found". transport-hub.routes.ts:340 is `getUserId(req)!` with `claims.sub` only in a trailing comment. |
| check-public-user-id.cjs | PASS: "OK — scanned 91 route file(s) and 5 projection file(s)". It prints 4 exemptions: schema.ts:3701 EXPERT_PUBLIC_FIELDS.id; ready-made.routes.ts:1205 authorId; storefront.routes.ts:1267; content.routes.ts GET /api/discover. |
| check-coverage-matrix.cjs | PASS: "6 deferred tag(s) registered; all claim cells marked & existing ids annotated". |
| check-omit-schema-ratchet.cjs | PASS: 205 call sites, 187 omit, 18 pick, 0 bare; denylist 187 = OMIT_BASELINE 187. |

No failing file:line anywhere.

### A-26: guest-plan retention
- Mounted: `router.post("/internal/jobs/guest-plan-retention", requireInternalSecret, …)` at server/routes/internal.routes.ts:504. The router is mounted at server/routes.ts:1350.
- Scheduled: JOB_CADENCE entry `{ job: "guest-plan-retention", bucket: "daily" }` at internal.routes.ts:247. It is in the `daily` bucket of scripts/ci/post-internal-jobs.sh:307, which `.github/workflows/jobs-cron.yml:93` runs (`post-internal-jobs.sh --due`) along with the Replit scheduled trigger. It is pinned in post-internal-jobs.test.sh:211/263.
- Effect: it does nothing until `GUEST_PLAN_RETENTION_DAYS` is set (guest-plan.config.ts:24-25; service logs `disabled` at :318-320).

### A-37: client call sites of POST /api/guest-plans/claim
- The request itself is made in one place: `client/src/lib/waitlist-guest-plan.ts:177` (`claimGuestPlansOnce`), wrapped by `claimGuestPlans` (:159-166), which shares an in-flight promise.
- Callers:
  1. `client/src/App.tsx:1567`: the sign-in watcher (with /api/cart/migrate).
  2. `client/src/pages/guest-plan-map.tsx:116`: SignedInLanding, called only when no claimed id is already in sessionStorage (:114).

### A-2: city on each browse card's add payload (the guest path reads `item.city`, browse-save.ts:39)
| card | city in payload? | evidence |
|---|---|---|
| gem | yes | city-feed-card.tsx:1195, :1315 |
| event (incl. Fever partner events) | yes | city-feed-card.tsx:1420, :1506, :1629 |
| vendor / service | yes | city-feed-card.tsx:1849, :1976 |
| supply (activity/hotel, partner product cards) | yes | city-feed-card.tsx:2190, :2327 |
| recommendation (incl. affiliate) | yes | city-feed-card-recommendation.tsx:187, :271, :352, :454, :521 |
| catalogue search result (incl. `partner_viator`) | **no** | `catalogueAddItem`, client/src/lib/catalogue-search-copy.ts:77-84 (title, type, providerServiceId, viatorProductCode only); called at catalogue-search-results.tsx:109. With no plan yet, the save throws "400: no destination". |
| guest map browse add | n/a (passes `plan.destination` explicitly) | guest-plan-map.tsx:311 |

(DateHighlightStrip ignores `onAdd`: discover-location.tsx:1198-1206.)

### A-18: Kyoto gem seed sources and rows without lat/lng
Sources that insert Kyoto `travel_pulse_hidden_gems` rows:
1. `server/data/hidden-gems.json` via `server/seed-travelpulse.ts:161-174`. The JSON has **no latitude/longitude field at all**, so all 13 Kyoto rows are unlocated.
2. `server/seeds/phase-4-kyoto-fill.seed.ts` (KYOTO_GEMS :46-175; insert :271-281).
3. `server/seeds/popular-cities-content.seed.ts`: 8 Kyoto rows (:256-402). **All have coordinates.**
4. `server/seeds/landing-moment-demo.seed.ts:36-50`: 1 Kyoto dev fixture.
5. `server/migrations/400_kyoto_feed_cleanup.sql`: 3 rows inserted at :234, :286, :334 with no lat/lng columns ("New cards do not invent latitude or longitude", :35).

(`server/seeds/major-cities-backfill.seed.ts` has no Kyoto rows.)

Kyoto seed gems with no coordinates:
- hidden-gems.json (13): Kibune Shrine; Pontocho evening walk; Otagi Nenbutsu-ji; Kishiwada Cafe; Tofuku-ji Temple; Kagurazaka Ishikawa; Sannenzaka & Ninenzaka; Kurama-dera Temple; Kishiwada; Tetsugaku-no-Michi (Philosopher's Path); Kibune; Tofuku-ji Temple during autumn; Nishiki Market alley stalls.
- phase-4-kyoto-fill.seed.ts (4): Hanami Koji Street; Sannenzaka Shopping Street; Arashiyama Bamboo Grove; Togetsukyo Bridge.
- migration 400 (3): Tenryu-ji; Arashiyama Bamboo Grove (also in the row above, deduped by place_name); Ginkaku-ji.
- landing-moment-demo.seed.ts (1, dev fixture): Kusho Myōjin Shrine at Ninna-ji.

Located in seeds: phase-4 (Gion Corner, Kiyomizu-dera, Pontocho Alley, Kyoto Tower, Nishijin Textile Museum, Nishiki Market, Fushimi Inari Shrine) and all 8 popular-cities rows.

Not checked: which of these rows production actually holds or has hidden. Migration 425 hides Yoshida Sanso Ryokan, which is a located row.
