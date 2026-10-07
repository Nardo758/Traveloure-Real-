# Step 8d — Phase 0 re-check (Track A, read-only)

> Written 2026-10-07 by Track A for `docs/planning/briefs/step-8-brief.md` rev 3.1, section "8d — Signed-out browsing on
> the map" (items 24–26), decision D3's second half, and the signed-out e2e gate (`:232–233`).
>
> **Base:** `main` `cb7e3543f81c322bdb9dab1ea76c4d6b49f79afe` (`bash scripts/check-lane-base.sh cb7e354` → OK). It
> includes 8a (R346), 8b-1 (R348), 8b-2 (R352) and 8c (R354). The Events sunset PR may take R355 ahead of 8d.
>
> **Nothing was built:** no product code, no migration, no commit, no branch. `file:line` refers to that base.
>
> Where the code and the brief disagree, the code is right; each case is marked **Brief ≠ code**.

**Migrations:** none needed for any option below. G2 stands: nothing is stored for a guest on the server.

---

## A. What a signed-out visitor can read today on `/plans/*?view=map` and Browse

**Nothing. The plan page never mounts for a guest.**

- **The route is protected.** `/plans/:tripId` is
  `<PlanPageShell><ProtectedRoute component={SlipViewPage} /></PlanPageShell>` (`client/src/App.tsx:721–727`). The two
  sibling routes `/plans/:tripId/guests` (`:705–711`) and `/plans/:tripId/compare/:setId` (`:714–720`) are protected the
  same way, and so is `/trip/:id` (`:683–689`).
- **What `ProtectedRoute` does for a guest** (`App.tsx:231–277`):
  - writes `sessionStorage.traveloure_return_to` = path + search, `?view=map` included (`:238–241`);
  - opens the sign-in modal, "Sign in to continue" (`:242–246`);
  - navigates to `/` (`:247`) and renders only a spinner (`:251–257`).

  So the page component never mounts, no plan query fires, and `?view=map` is read only after the gate
  (`client/src/pages/slip-view.tsx:21`).
- **After sign-in:**
  - `SignInModal` does a full reload to `returnTo`, else the session return path, else the role home
    (`client/src/components/SignInModal.tsx:146–154`).
  - It has **no success callback**: its props are `open`, `onOpenChange`, `title`, `description`, `returnTo`
    (`:20–26`; `SignInModalContext.tsx:4–8`).
  - For the OAuth path, `AuthReturnToRestorer` (`App.tsx:319–337`) does the same job.
- **Even past the gate, every plan read is session-gated.** The page's one data source is
  `GET /api/trips/:tripId/plancard` (`slip-view.tsx:23–32`). It is `isAuthenticated` plus owner/advisor
  (`server/routes/plancard.routes.ts:652`, `:663–691`).
  - A 401, 403 or 404 renders "Couldn't load this plan" (`slip-view.tsx:55–62`; `client/src/lib/plancard-refetch.ts:47–49`).
  - Every other read `SlipView` makes is session-gated too (section B).
- **There is no guest or anonymous branch** in `slip-view.tsx` or `SlipView.tsx`. The word "guest" there means the plan's
  guest list.
- **The public pages that DO exist for a guest:**
  - `/experiences`, `/experiences/:slug` and `/:slug/new` (`App.tsx:609–620`);
  - `/services/:id` (`:500–504`);
  - `/discover` (`:488–494`);
  - the token pages:
    - `/trips/shared/:token` (`:516–518`)
    - `/itinerary-view/:token` (`:511–515`)
    - `/saved/shared/:token` (`:520–522`)
    - `/invite/:token` (`:524–526`)
    - `/t/:slug` (`:431–433`)
    - `/s/:handle` (`:436–438`)
- **The one public page that already mounts `MapControlCenter`** is `itinerary-view.tsx:737–744`.
  - It mounts it `readOnly`, which turns Browse off (`MapControlCenter.tsx:155`, `:377`).
  - Its `tripId` is a variant id, not a trip.

**`MapControlCenter` cannot render Browse without a plan as written:**

| # | what it needs | where | what happens with no plan |
|---|---|---|---|
| 1 | `tripId: string` (required) | prop `:78`; used by the add POST `:236`, remove DELETE `:247`, invalidations `:238–240, :249–250`, and every testid (`:328–440`, `:645–657`) | the add and remove paths and the testids have nothing to interpolate |
| 2 | `days` (required) | `:80`, `:167` | **`if (!day) return null;` (`:319`)**, so the whole component renders nothing |
| 3 | `tripDestination` (required) | `:79`; it is the only source of `city` (`:169`), which gates the three supply reads (`:183–195`) | no city means no Browse rows |
| 4 | a canvas centre | `firstPoint` = first plan pin, else the anchor (`:302`); else `GET /api/geocode` (`:303–308`) | **`/api/geocode` is `isAuthenticated`** (`server/routes/content.routes.ts:6456`; "R312: session required", `:6453–6454`, a Maps-quota cost guard). A guest gets a 401 body with no lat, so `center` is null (`:309–313`), the canvas says "No mapped stops for this day yet" (`:421–426`), and only the Browse LIST renders (`:610–639`). Browse markers never centre the map (`map-scene.ts:148–167`). |
| 5 | `readOnly` false | `:155`, `:377` | Browse is off when `readOnly` |
| 6 | plan items, for "On day N · Remove" | `addedItemFor` (`:219–230`; `browse-supply.ts:202–210`) | harmless: nothing is added yet |

**The add path today:**
- The Browse card's "Add to day N" (`:593–605`) runs `add.mutate`, which posts
  `POST /api/trips/${tripId}/itinerary-items` with `browseAddBody(place, dayNumber ?? 1)` (`:234–244`).
- `browseAddBody` (`client/src/lib/browse-supply.ts:222–244`) builds
  `{title, itemType:"activity", providerServiceId | affiliateProductId, dayNumber, locationName, latitude?, longitude?}`.
- There is no client auth check. A guest would get a 401 toast, "Couldn't add that" (`:243`).

## B. Which readers are public and which are session-gated

Mount order matters (`server/routes.ts:842–1502`): routers are mounted before most inline monolith routes, except
`tripsRoutes`, which is mounted LAST (`:13862`), so an inline trip route shadows its `trips.routes.ts` twin.

**Global limits** (the whole list of protections a public Browse read has):
- Every /api read: `generalRateLimiter`, 100/min per IP (`server/index.ts:126`; `rate-limiter.ts:153–158`).
- Plancard reads: 180/min (`index.ts:128`).
- There is no CAPTCHA or bot check anywhere in `server/`.
- The limiter store is in-memory per process, keyed on `req.ip` (`rate-limiter.ts:63`; `trust proxy` 1,
  `replitAuth.ts:123`).

**The Browse layer's four reads are all PUBLIC:**

| endpoint | client caller | handler | gate | notes |
|---|---|---|---|---|
| `GET /api/service-categories` | `MapControlCenter.tsx:172–176` | `content.routes.ts:992` → `storage.ts:2970` | PUBLIC | reference rows |
| `GET /api/services?location=` | `:183–184` | `content.routes.ts:2870` → `storage.getAllActiveServices` (`storage.ts:3195`) | PUBLIC | active + approved + the R353 pool exclusion (`:3197–3201`); ten fields nulled (`:3225–3236`); property-pin jitter (`content.routes.ts:2878`). **Finding F1 below: `userId` is NOT stripped.** No pagination. |
| `GET /api/affiliate/products?city=&limit=100` | `:185–186` | `content.routes.ts:8795` | PUBLIC (admins see more, `:8798`) | approved partners only, URLs stripped (`:8817`); `limit` has no upper bound (`affiliate-scraper.service.ts:602`) |
| `GET /api/experts?location=` | `:187–195` | `server/routes.ts:5425` | PUBLIC | `toPublicExperts` projection (`:5555`); pool account dropped (`:5433–5434`) |

**Other public reads near this surface:**
- `/api/experience-types` (`content.routes.ts:1222`)
- `/api/pricing` (`pricing.routes.ts:152`)
- `/api/city-neighborhoods?city=` (`content.routes.ts:934`, capped at 200)
- `/api/maps/tiles` (`markets.routes.ts:32`, the Leaflet fallback)
- `/api/markets/geography` (`markets.routes.ts:13`)
- `/api/media/place-photo` (`routes.ts:5091`)

**Session-gated (a guest gets 401):**
- **The map's centre fallback:** `GET /api/geocode` (`content.routes.ts:6456`).
- **The trip mint:** `POST /api/trips` (`server/routes.ts:1546`). It answers 401 "Sign in to create a plan" before the
  parse or any write (`:1549–1552`).
- **The add rail:** `POST /api/trips/:tripId/itinerary-items` (`routes.ts:13157`, owner / write-advisor / author / EA,
  `:13162–13188`).
- **The plan reads:**
  - `GET /api/trips/:id`: share-token or session (`trips.routes.ts:364`, 401 at `:376–380`).
  - `GET /api/trips/:tripId/plancard` (`plancard.routes.ts:652`).
  - `GET /api/trips/:tripId/itinerary-items` (`routes.ts:13081`).
- **Every read `SlipView` makes:**
  - `place-photos` (`plancard.routes.ts:597`)
  - `versions` (`versions.routes.ts:45`)
  - `anchors` (`trips.routes.ts:1607`)
  - `airport-leg` (`:1720`)
  - `where-to-stay` (`plan-option-sets.routes.ts:317`)
  - `option-sets` (`:127`)
  - `expert-advisor` (`booking-actions.ts:683`)
  - `expert-help` (`expert-door.routes.ts:25`)
  - `guests` (`guest-invites.ts:250`)
  - `trip-context` (`trip-context.routes.ts:229`)
  - `cart` (`routes.ts:9269`)
  - `saved-items` (`saved-items.routes.ts:17`)
- **Travel time and place facts:** these exist only inside the plancard DTO (`plancard.routes.ts:789`, `:854`).

**Public plan surfaces that exist today** (none fits 8d; listed so nothing is reinvented):
- `GET /api/trips/shared/:token` (`booking-actions.ts:626–648`): a minted share of a REAL plan.
- `GET /api/itinerary-share/:token` (`trips.routes.ts:2035`).
- `GET /api/saved-places/shared/:token` (`saved-items.routes.ts:122`).
- The plancard assembler's `teaser`/`preview` levels (`trip-plan.service.ts:590–676`) have no anonymous trip endpoint.
  Its header forbids calling it with "full" from an unauthenticated surface (`:19–24`).

**Conclusion:** everything a plan-less Browse needs to READ is already public. Nothing needs to be opened on the server,
**except the canvas centre** (decision 3).

## C. What the guest sign-in record (8b-2) already covers

`client/src/lib/pending-plan-record.ts`:
- **Storage:** key `traveloure_pending_plan` (`:24`); sessionStorage only (`:42–48`); TTL one hour (`:25`).
- **Shape** (`:29–38`): `{v:1, savedAt, expiresAt, branch:"myself"|"ai", door, answers, source:{experienceSlug, city,
  country, destination}}`.
- **Parse:** accepts only branch `myself` or `ai` (`:62–73`).
- **`takePendingPlanRecord`** removes the record BEFORE parsing and sets `takenThisLoad` (`:88–107`).

**Covered today:**
- the modal's answers, the door and the branch;
- written at both gates:
  - the modal's finish: `guestGate` → `recordFor` (`client/src/contexts/PlanningContext.tsx:509–534`);
  - the AI form's sign-in: `guestSignInFromAiForm` (`:535–540`);
- read once after the sign-in reload, on the first signed-in render (`:543–561`);
- cleared before the plan is created;
- replayed through the one modal, `open({…, resumeAnswers, autoFinish})` (`:550–558`), so the plan is created by the
  ONE mint (`mintPlan` → `mintTripSlip`, `:418–467`; `client/src/lib/trip-slip.ts:184–200`);
- landing on `?view=map` through `planLandingPath` (8b-2 D4);
- the pen hand-off is skipped while a record exists or was taken this load (`client/src/lib/trip-context.ts:737`).

**NOT covered (8d's half of D3):**
1. **No pending add.** The record has no item field, and `recordFor` does not copy `source.pendingItem` (`:509–520`).
2. **No plan-less browsing.** No route or component shows the map to a guest (section A).
3. **The one existing "add after mint" path cannot carry a map add as it stands.** Billboard-gem `pendingItem`
   (`client/src/lib/billboard-gem-planning.ts:18–75`; `shared/pending-plan-items.ts:13–17`) is attached by `mintPlan`
   after the mint, idempotently, with a recovery record (`PlanningContext.tsx:441–463`). But:
   - **(a) It holds `{id, title, city}` only.** It posts `dayNumber: 1`, `locationName: city` and a gem marker
     (`pending-plan-items.ts:60–69`), with no `providerServiceId`/`affiliateProductId`, so a map add sent through it
     would lose its listing link.
   - **(b) It lives in React state.** For a guest `mintPlan` returns before minting (`:426–431`), so it does not survive
     the sign-in reload.
4. **Other guest add buttons don't come back to the same page after sign-in.** `service-detail.tsx:1097–1100`,
   `AffiliateBookButton.tsx:56–62`, `useAgentBooking.ts:61–62` and `use-content-agent-booking.ts:92–93` call a bare
   `openSignInModal()`, so after sign-in `SignInModal` sends the visitor to their role home (`SignInModal.tsx:152–154`).
   Not 8d's to fix; it shows that "add survives sign-in" has no precedent beyond the gem.

**Brief ≠ code: the 8b-2 signed-out e2e gate was not met.**
- The brief requires "8b-2: start on Experiences, finish the pop-up, sign in, and land on the new plan's map with the
  answers kept" (`step-8-brief.md:232–233`).
- No such spec exists. The 8b-2 Phase 0 itself recorded "No signed-out round-trip e2e exists"
  (`docs/planning/briefs/step-8b2-phase0.md:111`).
- The 8b-2 gate list I built against named the signed-in e2e (`j-map-layout.spec.ts`) and not this one, and I did not
  flag the gap at merge. That should have been raised then.
- Today the record's post-sign-in half (replay → mint → land on the map with the answers kept) is proven only by the
  pure M9 with an injected `replay`. Nothing drives it in a browser. (decision 6)

**The boards** (`docs/design/experiences-map-planner/ExperienceMap.dc.html`, `ExperienceMapMobile.dc.html`; README row 1:
"guest sign-in gate (step 8d)", status ruled):
- **Banner** (`:57–58` [mobile `:51–52`]): "Browse freely. Your plan is created when you sign in, and these answers come
  with you."
- **Gate dialog** (`:305–318` [`:75–87`]):
  - eyebrow "SIGN IN TO START YOUR PLAN";
  - heading "Your plan is created when you sign in";
  - "Kyoto, Thu 12 – Mon 16 Nov and 2 travelers are kept from your answers.";
  - `gateNext`;
  - buttons "Sign in", "Create account", "Keep browsing".
- **`gateNext`** (`:565–578`):
  - add: "<name> is added as soon as you are in.", **landing on day 1** (`:573–575`);
  - draft: "Your free draft starts as soon as you are in.";
  - start: "Your empty plan opens here, on the map."
- **A guest Browse add** sets `gate:'add:'+id` (`:431`).
- **The guest has NO day chips** (`showDayChips: member`, `:540–547`).
- **Other guest copy:**
  - band eyebrow "NO PLAN YET · TRIP";
  - empty "Your plan" text: "You have no plan yet. Browse the map freely. Your plan is created when you sign in."
    (`:628`);
  - tray "NO PLAN YET / … / Sign in to start" (`:645–649`).
- So the board's guest arrives with answers already given (dates, party), which means AFTER the modal, and with no plan.

## D. Every spec that pins signed-out behaviour

**How CI runs specs:**
- Playwright's default config has no storageState (`playwright.config.ts:18`, `:29`, `:57–66`), so every spec is
  signed-out unless it logs in.
- `test:journeys` runs only on push to main and nightly (`journey-suite.yml:197`), not on PRs.

| file:line — test | asserts | wired | 8d touches it? |
|---|---|---|---|
| `client/src/lib/__tests__/step8b2-map-layout.test.ts:190` **M9** | record: 1h TTL, take clears before replay, second consume is "none", expired removed; regex on the `trip-context.ts` skip line (`:232`) | `build.yml:2953` `unit-suite-client-lib` | **yes**: the record gains the add; "the add runs once" needs a pin |
| same `:175` **M7** | `planLandingPath`: `ai` anywhere and `myself` from `experiences` go to `?view=map` | same | maybe |
| same `:72` **M1**, `:80` **M2** | the Browse add body carries the shown day; unlocated rows get no pin | same | maybe (the add body is held, then replayed) |
| same `:183` **M8**, `:236` **M10** | `SlipView` source: draft row gate, `{data.trip && slipView !== "map" && (`, one `<FinishCard>`, one `<SlipDraftAiRow>` | same | only if 8d touches `SlipView` |
| `smoke5-fixes.test.ts:38` **S2** | the `PlanningContext` `ai` branch's `setLocation(planLandingPath(…, "ai", …))` regex | same | maybe (8d edits the replay) |
| `rc1-finish-mints.test.ts:31` **R1**, `:46` **R4** | a guest still reaches the AI form; a guest's Save is no sign-in wall | `:2953`, `:2795` | no |
| `local-finish-mints.test.ts:43` **M4** | only `myself` requires the mint | `:2953`, `:2789` | no |
| `client-pen-scope.test.ts:207` **P3** (`:208–277`) | guest pen hand-off: only into an empty server pen, once, no tripId | `:2953`, `:745` | maybe (a record carrying an add is a new case beside them) |
| `rc345-active-plan.test.ts:194` **H1** | the hand-off fills around a plan opened mid-flight | `:2953` | no |
| `rc2-add-to-plan.test.ts:40–53` D3–D6, `:96` S2, `:109` S4 | a guest's Discover add is `guest_cart`; unknown auth is held | `:2953` | maybe (only if 8d adds a value to `decideAddTarget`) |
| `shared/__tests__/buy-action.test.ts:221` A1, `:227` A2, `:242` L1 | `sign_in` leads a guest's ask; a guest's Add lands in `guest_cart` | `:635`, `:2940` | maybe (only if the map add goes through the resolver) |
| `ea-people.test.ts:46` | `App.tsx` regex `PlanPageShell><ProtectedRoute component={SlipViewPage}`, **the only pin that `/plans/:tripId` is protected** | `:2953` | only if 8d unprotects `/plans/:tripId` (recommendation: it does not) |
| `footer-guest-routes.test.ts:82` | no footer link resolves to a protected route | `:579`, `:2953` | no |
| `map-scene.test.ts:181` **M7**, `:190` **M8** | an exact `MapControlCenter.tsx` line; `MapControlCenter` is the only map on its listed surfaces | `:2953` | maybe (8d edits `MapControlCenter`) |
| `playwright/tests/planning-entry.spec.ts:155` (AI guest gate), `:180` (myself guest gate) | guest sees sign-in; the record holds `branch` (and `expiresAt−savedAt = 3600000`); nothing in the URL | `unwired-spec-gate.yml:178` | **yes for `:180` under decision 1** (myself from the experiences door would land on the guest map, not the sign-in modal) |
| same `:264`, `:281`, `:292` | `/experiences` signed out: nothing open, Continue disabled until both are picked, opens at When; exact `?destination=` | same | maybe |
| `playwright/tests/journeys/j-map-layout.spec.ts:26` | signed-in 8b-2 journey (Browse, Day 2 add, Your plan, list) | `kyoto-slice-gate.yml:177`, `journey-suite.yml:197` | maybe (shared `map-browse-*` testids); the natural home for the signed-out sibling |
| `cosmetic-public-surfaces.spec.ts:89` **B1** | `/experiences/:slug` at 390px: occasion pressed, no overflow | `app-routes-gate.yml:329` | maybe (if the guest map is on `/experiences`) |
| `selection-controls.spec.ts:30–56` | signed-out `/experiences/<slug>` pre-picks; a visit makes no non-GET `trip-context` write; no console errors (a guest 401 tolerated) | `selection-controls-gate.yml:202` | maybe (a guest map must stay write-free; a geocode 401 would log) |
| `app-routes.spec.ts:132` | signed-out visits incl. `/plans/1` render no NotFound | `app-routes-gate.yml:212` | only if `/plans/:tripId` stops redirecting |
| `personas/journey-guest.spec.ts:60` | guest browses Kyoto supply; a protected action prompts sign-in, no 500 | `persona-nightly.yml:219` (nightly) | no |
| `e2e/supply-demand/d5-guest-to-auth.spec.ts:21` | guest Add on `/services/:id` → sign-in → "does the item survive?", soft (files findings) | `supply-demand-e2e.yml:113` | no; the closest analogue, and it is soft |
| `server/__tests__/guest-trip-mint-responds.http.test.ts:211–248` R1–R3 | anonymous `POST /api/trips` → 401 before the parse, no row | `guest-trip-mint-responds-gate.yml:112` | no (8d relies on it) |
| `guest-cart-becomes-plan.http.test.ts:309–955` G1–G17 | `/api/cart/migrate` + resolve-trip | its gate `:110` | no |
| `leads-door-and-trip-read-gate.db.test.ts:280` **A5** | anonymous `GET /api/trips/:id` → 401 | `build.yml:2142` | no |
| `journey-suite-negatives.http.test.ts:460` **N9** | sessionless item route → 401/403 | `suite-server-tests.yml:115` | no |
| `mutation-auth.http.test.ts:201`, `:271`; `mutation-auth.inventory.test.ts:80` | anonymous trip PATCH/DELETE refused; every mutation has a disposition | `suite-mutation-auth.yml:104` | only if 8d adds a server mutation (none recommended) |
| `pool-listings-not-public.db.test.ts:94` PL2, `:107` PL4; `storefront-role-agnostic.http.test.ts:372` | `GET /api/services` and `/api/experts` answer with no cookie, public projection | `suite-server-tests.yml` | no |
| `scripts/check-tripless-cart-writers.cjs:43` | frozen trip-less cart writers | `build.yml:86–88` | **yes, by design**: a guest map add must NOT write `/api/cart`, and this guard fails if one does |

**Gaps (signed-out behaviour with no pin):**
1. The 8b-2 round trip after sign-in (replay → mint → `?view=map` → answers kept). See section C.
2. `returnTo: currentPagePath()` (`PlanningContext.tsx:429`, `:538`).
3. `guestGate` / `onGuestGate` / `onGuestSignIn` have no unit pin. Only `planning-entry.spec.ts:155/180`, which stops at
   the modal.
4. Plan-less `MapControlCenter`. It does not exist yet.
5. Anonymous `/api/geocode` → 401, which nothing pins either way.
6. A signed-out visit to `/plans/:id?view=map` (bounce + returnTo). Only the `ea-people` regex and the tolerant
   app-routes sweep cover it.
7. The pending add surviving sign-in once. New in 8d.
8. Anonymous `POST`/`GET /api/trips/:id/itinerary-items` and the plancard read have no explicit 401 pin; mutation-auth
   probes itinerary-items only cross-owner.
9. No inventory of public GET routes exists.

## E. Findings outside 8d's scope (recorded, not fixed here)

- **F1. `GET /api/services` publishes each listing owner's `users.id`**, against LD 40's "a public payload never carries
  `users.id`".
  - `storage.getAllActiveServices` nulls ten fields (`server/storage.ts:3225–3236`) but not `userId`, and the route
    returns the rows (`content.routes.ts:2870–2880`).
  - The siblings strip it: `/api/provider-services` (`routes.ts:3289`) and `/api/services/:id`
    (`content.routes.ts:2414–2425`).
  - `check-public-user-id` is green, so its predicate does not see this read.
  - The map's Browse layer is a live consumer.
  - **Recommend:** a small separate lane. Strip it in both layers, and widen or annotate the guard's negative space.
- **F2. `GET /api/services/:id` has no pool-account exclusion** (`content.routes.ts:2386–2391`), unlike the list reads
  that R353 covered. A pool listing is readable by id. Recommend handing it to the Events session, whose R353 lane this is.
- **F3. `GET /api/affiliate/products` takes an unbounded `limit`** (`affiliate-scraper.service.ts:602`). A public read
  with no cap.

## Decisions the lane needs (not taken here)

1. **Where a guest browses, and when they get there.** The board's guest arrives AFTER the modal, with answers and no
   plan ("NO PLAN YET · TRIP"; the dialog repeats the dates and party).
   - **Recommend:**
     - When a signed-out member finishes the modal on `myself` from the `experiences` door, they land on a NEW
       unprotected guest map route, e.g. `/plans/new?view=map`. They do not see the sign-in modal at that point.
     - The 8b-2 record is written exactly as today (it already holds the answers), so the page reads its answers from
       the record without consuming it.
     - `/plans/:tripId` stays protected, so `ea-people.test.ts:46` and `app-routes` are untouched.
     - Every other door and branch keeps today's gate. That includes `ai`, whose "Draft it with AI · free" on the guest
       map opens the gate with the board's "draft" copy.
   - This changes `planning-entry.spec.ts:180` for the experiences door only. That would be a sanctioned edit.
2. **A plan-less `MapControlCenter`**, a mode for the Browse layer only (item 24).
   - **Recommend a `guest` prop instead of making `tripId` optional:**
     - Pass ONE synthetic day (Day 1; the board draws no chips).
     - Use a non-trip testid suffix.
     - Make "Add to day 1" call an `onGuestAdd(place)` callback, not the POST.
     - Hide Remove, the "Your plan" layer, versions, anchor and areas.
   - The Browse reads are unchanged and already public (section B), and the member path is untouched.
   - `map-scene.test.ts` M7/M8 stay green if the exact line pinned there is not edited.
3. **The guest canvas centre.** `/api/geocode` is session-gated as a Maps-cost guard (R312).
   - **Recommend:** centre on the `OPERATING_MARKETS` centroid (`shared/operating-markets.ts:31–37`, already the source
     of the start page's pins).
     - The guest flow only reaches the eight cities: Continue requires one (8a).
     - It is a canvas centre, not a pin. It is the same fact the member map gets from geocoding the destination, and no
       stop is drawn on it (LD 22's no-city-centre rule is about pins).
   - If the destination is not one of the eight, show no canvas (the list still renders), as today.
   - Do NOT open `/api/geocode` to guests.
4. **What the record carries for the one add, and how it runs once** (items 25–26).
   - **Recommend:**
     - Extend the record with an optional `pendingAdd: { kind: "listing"|"partner", id, title, dayNumber: 1 }`.
       Version-bump the record (`v: 2`); `parse` accepts `v1` without an add.
     - The guest's Add writes it and opens the board's gate dialog. A second Add replaces it, because D3 allows one
       action.
     - After sign-in the replay mints through the one mint, then runs the add through the EXISTING
       `POST /api/trips/:id/itinerary-items` with the body rebuilt by `browseAddBody`.
     - Rebuild the body from a fresh public read (`GET /api/services/:id` for a listing, the affiliate products read for
       a partner), so a listing withdrawn during the round trip is reported, not added, and no client-held coordinate is
       trusted.
     - "Once": the record is already cleared before the mint. The add is made idempotent the way the gem attach is:
       read the new plan's items first and skip if a row already carries that `providerServiceId`/`affiliateProductId`.
       A failed add after a successful mint uses the same recovery shape as `pendingBillboardGemRecovery`
       (`PlanningContext.tsx:239–275`): "Your plan was created; retry adding <name>". It never re-mints.
     - No server change, no guest store, no `/api/cart` write (the 8c guard enforces the last).
   - **Assessment for item 26:** the add can survive the round trip cleanly, so this does not need a stop. The one
     non-clean case is the listing becoming unavailable in between, and it is reported, never silently dropped.
5. **The gate dialog's copy and the "Keep browsing" path.** The board copy is used as drawn, with no numbers invented.
   - "Kyoto, Thu 12 – Mon 16 Nov and 2 travelers" is rendered from the record's answers. A party the guest did not give
     is omitted, never "1 traveler" (§13).
   - **Recommend:** the dialog is the existing `SignInModal` with the board's title and description passed in, plus a
     "Keep browsing" dismiss. Do not build a second sign-in form. (`SignInModal` already takes `title`, `description`
     and `returnTo`; "Create account" is its existing register tab.)
6. **The e2e.**
   - **Recommend ONE new signed-out spec that closes both the 8b-2 gap and 8d's own gate**:
     1. start on `/experiences`, pick Travel + Kyoto, Continue;
     2. modal: dates, party, finish on `myself`;
     3. the guest map opens with the banner and the answers;
     4. Browse lists the fixture listing; Add opens the gate showing the dates and the listing name;
     5. sign in (or create an account) in the modal;
     6. the page reloads, the plan is created ONCE (exactly one `trips` row for the user), it lands on `?view=map`, the
        answers are kept (destination, dates, party), and the listing is on Day 1 (exactly one `itinerary_items` row,
        with `provider_service_id` set);
     7. a reload creates nothing more.
   - Wire it beside `j-map-layout.spec.ts` in `kyoto-slice-gate.yml`, with its `spec-green:` line.
7. **Sanctioned edits I expect to ask for** (to be finalised at build):
   - `planning-entry.spec.ts:180`, for the experiences door only, under decision 1.
   - `step8b2-map-layout.test.ts` M9, for the record's `v2` shape, keeping all its existing assertions.
   - Any `map-scene.test.ts` M7/M8 line only if decision 2 cannot leave it as is.

   Nothing else is expected to change. Mutation-auth counts are unchanged, because no server mutation is added.
8. **F1–F3.** Recommend FOLLOWUPS entries now and separate lanes. F1 is a live LD 40 gap on a public read; F2 belongs to
   the Events session's R353 lane.

## Not proven

- I did not run the app for this Phase 0. The claims are read from source at `cb7e354` and spot-checked:
  - `App.tsx:724`;
  - `MapControlCenter.tsx:300–319`;
  - `content.routes.ts:6456` and `:2870–2880`;
  - `storage.ts:3195–3240`;
  - `routes.ts:1546–1552`;
  - `pending-plan-items.ts`;
  - the gem attach at `PlanningContext.tsx:436–467`.
- I did not check whether the Google map script loads for a signed-out visitor with `MAPS_BROWSER_KEY`. If it does not,
  the Leaflet fallback (`/api/maps/tiles`, public) would draw.
- I did not verify that `SignInModal`'s register tab honours `returnTo` the same way its sign-in tab does.
