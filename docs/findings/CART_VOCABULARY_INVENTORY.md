# "Cart" Vocabulary Inventory — Trip Slip Rename Scoping

**Audit date:** 2026-08-08 · **Branch:** `claude/sync-local-repo-2j7ghv` · **Scope:** read-only, zero code changes.

**Purpose:** the decision-maker is considering making the Trip Slip (`/plans/:tripId`, `SlipView.tsx`) the
first destination for added items instead of a pre-trip global Cart, and has flagged that the global
"Cart" header/nav on every page would need renaming. This document inventories every place the word/concept
"Cart" surfaces so that rename can be scoped honestly, split into what is safe to rename, what needs
coordinated spec updates, and what should not be renamed at all.

---

## 0. Summary counts

| Bucket | Count | Risk if renamed |
|---|---|---|
| Distinct user-visible strings (headings/buttons/toasts/labels) | ~35 distinct strings across 12 files (482 raw case-insensitive `cart` hits across `client/src`, most in `cart.tsx` and `experience-template.tsx`) | Low — cosmetic |
| `data-testid` values containing "cart" | 14 distinct testid patterns, defined across 10 component/page files | Medium — breaks Playwright specs unless coordinated |
| `/api/cart/*` server routes | 10 endpoints (`server/routes.ts` ×9, `server/routes/payments.routes.ts` ×1) | Medium/High depending on what's renamed (see §4) |
| Client files calling `/api/cart*` | 13 files | Medium — must move in lockstep with any route rename |
| DB/schema objects using "cart" vocabulary | 1 table, 1 index, 1 FK column, 2 seeded config-row keys, 1 unconstrained-but-persisted string literal ("rail") | **DO NOT RENAME** (see §5) |
| CI gates keyed on the word "cart" | 1 dedicated workflow (`cart-checkout-redirect-gate.yml`) + cart assertions inside 3 more workflows | High if file paths/testids move without updating the gate |
| Files with any "cart" occurrence (true positives, false positives like "Cartagena"/"CartesianGrid" excluded) | `client/src`: 61 · `server/*.ts` (non-test, non-migration): 40 · `server/__tests__`: 5 · `server/migrations`: 17 · `playwright/tests`: 19 · `e2e/`: 4 · `.github/workflows`: 5 | — |

---

## 1. User-visible strings (`client/src/**`)

The word "Cart" is not confined to one page — it is the load-bearing noun across the entire
pre-checkout flow. Representative strings by file (exact text, file:line):

| String (exact) | File:line | Context |
|---|---|---|
| `"Your Cart"` | `client/src/pages/cart.tsx:1443` | H1 page title, cart step |
| `"Your cart is empty"` | `client/src/pages/cart.tsx:1535` | Empty-state heading |
| `"Browse our services and add something you like"` | `client/src/pages/cart.tsx:1536` | Empty-state body (no "cart" itself, but paired with the heading above) |
| `"Cart"` (step-pill label) | `client/src/pages/cart.tsx:1378` | Flow-stepper pill ("Cart → Optimize → Itinerary → Payment") |
| `"Cart"` (back-button label, 3 branches) | `client/src/pages/cart.tsx:1436-1439` | Back-button text depending on flow step |
| Toast title `"Cart is empty"`, description `"Add items to your cart first"` | `client/src/pages/cart.tsx:921, 1059, 1235` | 3 separate call sites, identical copy |
| `"Cart is empty"` / `"Add some services first"` | `client/src/pages/discover.tsx:728` | Toast |
| `"Cart is empty"` / `"Add some services first"` | `client/src/pages/experience-template.tsx:1232` | Toast |
| `"Your cart is intact — please try again."` | `client/src/pages/cart.tsx:725` | Payment-failure reassurance copy |
| `"Add to Cart"` (×2, hotel + service variants) | `client/src/pages/service-detail.tsx:1145, 1189` | Primary CTA button |
| `"Added to cart"` / `"Service has been added to your cart"` | `client/src/pages/service-detail.tsx:276, 281` | Success toast |
| `"Added to cart"` (room variant) | `client/src/pages/service-detail.tsx:398` | Success toast |
| `"Couldn't add this stay to your cart. The dates may no longer be available."` | `client/src/pages/service-detail.tsx:406` | Error toast |
| `"Add to Cart"` / `"Adding..."` | `client/src/pages/discover.tsx:457` | CTA button, loading state |
| `"Add to Cart"` | `client/src/components/service-browser.tsx:203` | CTA button |
| `"Add to Cart"` | `client/src/components/venue-card.tsx:145` | CTA button |
| `"Add to cart"` (lowercase "c") | `client/src/components/dashboard/RecommendedServices.tsx:205` | CTA button — inconsistent casing vs. the rest of the app |
| `"Added to your trip cart"` / `'"${item?.title}" is in your cart — plan & optimize whenever you're ready.'` | `client/src/components/add-to-experience-dialog.tsx:88-89` | Success toast |
| `"Could not add to cart"` | `client/src/components/add-to-experience-dialog.tsx:94` | Error toast |
| `"Add to my trip cart"` | `client/src/components/add-to-experience-dialog.tsx:225` | Button label |
| `"Added to cart!"` / `"Service has been added to your cart."` | `client/src/pages/trip-details.tsx:392` | Success toast |
| `"Failed to add to cart"` | `client/src/pages/trip-details.tsx:395` | Error toast |
| `"Please sign in to add items to your cart"` | `client/src/pages/trip-details.tsx:376`, `experience-template.tsx:1473` | Sign-in gate toast |
| `"Go to checkout"` (icon: `ShoppingCart`) | `client/src/components/plancard/ActivitiesSection.tsx:239` | Plancard → `/cart` link |
| `"Back to Cart"` (×3) | `client/src/pages/itinerary-comparison.tsx:1093, 1127, 1163` | Back-navigation buttons |
| `{cartCount} · ${cartTotal}` chip | `client/src/components/trip/trip-strip.tsx:157-165` | **The nav-header cart chip** — global, see §2 |
| `"View Cart"` | `client/src/pages/experience-template.tsx:2709` | Persistent cart-summary CTA |
| `"Cart updated"` / `"Item quantity increased"` | `client/src/pages/experience-template.tsx:1492, 1515` | Toast |
| `"Added to cart"` / `'${item.name} added to your cart'` | `client/src/pages/experience-template.tsx:1495, 1529` | Toast (×2 call sites) |
| `"Removed from cart"` | `client/src/pages/experience-template.tsx:1552` | Toast |
| `"Failed to add to cart"` / `"Failed to update cart"` / `"Failed to remove from cart"` | `client/src/pages/experience-template.tsx:1517, 1531, 1562` | Error toasts |
| `"Your cart is empty"` (Sheet variant) | `client/src/pages/experience-template.tsx:2020` | Empty state inside the slide-over cart sheet |
| `"Add some items to your cart first for better optimization results."` | `client/src/pages/experience-template.tsx:689` | Inline hint |
| `"Review the items in your cart and click \"Proceed to Payment\""` | `client/src/pages/booking-demo.tsx:121` | Legacy booking-demo page copy |
| `"Review Your Booking"` + `"{n} item(s) in cart"` | `client/src/components/booking/BookingFlowModal.tsx:300, 306` | Modal header |
| FAQ answer: `"Browse services on the Discover page, add items to your cart, and proceed to checkout..."` | `client/src/pages/help.tsx:48` | Help-center content |
| Fee-disclosure comment referencing "the cart shows this fee..." | `client/src/pages/pricing.tsx:210` | Comment only, not rendered copy — but describes what the pricing page tells users |

**Not cart vocabulary (false positives excluded from all counts above):** `CartesianGrid` (Recharts import,
`admin/revenue.tsx`, `admin/tourism-analytics.tsx`), `"Cartão CNPJ"` (Portuguese for "CNPJ card",
`provider-status.tsx:87`), `"Cartagena"` (one of the 8 launch markets — `terms.tsx:67`, `privacy.tsx:214`,
`admin/data.tsx:70`, `admin/event-packages.tsx:132`).

**Bucket:** (i) cosmetic UI copy — freely renameable, no coordination needed beyond the testid/CI items below.

---

## 2. Navigation, routing, and the nav-header chip

- **`client/src/lib/nav-config.ts`** (the actual single-source-of-truth nav config file, per its own header
  comment) — **contains no "Cart" string at all.** The primary nav (`navGroupsConfig`), the authenticated nav
  (`authNavConfig`), and the footer (`footerSectionsConfig`) have no Cart entry. There is no "Cart" nav link to
  rename here.
- **The actual global cart UI is `TripStrip`** (`client/src/components/trip/trip-strip.tsx`), mounted once in
  `client/src/components/layout.tsx:706` (`<TripStrip />`). Its own doc-comment calls it "the site's single
  cart display." It renders:
  - The cart chip itself: `<Link href="/cart" data-testid="trip-strip-cart">` with a `ShoppingCart` icon and
    `{cartCount} · ${cartTotal}` (trip-strip.tsx:157-166) — **this is the literal element the decision-maker
    means by "the global Cart header/nav."**
  - It fetches `GET /api/cart` (trip-strip.tsx:54-57) purely for `itemCount`/`total`; no copy string "Cart"
    appears in the chip itself, only the icon + count + `/cart` href. The renameable surface here is the
    **route it links to (`/cart`)** and the icon choice, not a text label.
- **Route:** `/cart` is declared in `client/src/App.tsx:417-418` (`<Route path="/cart"><Layout><CartPage /></Layout></Route>`).
  Two additional legacy redirects also point at `/cart` (`App.tsx:534, 1079` — dead-endpoint redirects for a
  cart-shaped API response that would otherwise crash old code).
- **Console scope — which consoles this hits:** `Layout` (with the mounted `TripStrip`) wraps **traveler-facing
  pages AND the Executive Assistant console** — confirmed by `App.tsx`: `<Layout><ProtectedRoute
  component={ExecutiveAssistant} /></Layout>` (App.tsx:1098) uses the same `Layout`/`TripStrip` as the landing
  page, Discover, and Cart itself. **Expert, Provider, and Admin dashboards do NOT share this** — they mount
  `ExpertLayout` / `ProviderLayout` / `AdminLayout` respectively (`App.tsx` comments explicitly say "no global
  Layout" at lines 625, 838, 937), and none of those three layout files contain any "cart" reference. So: a
  rename of the `TripStrip` chip hits **Traveler console + EA console in one shot** (shared component); Expert/
  Provider/Admin consoles are unaffected because they never render it.
- **No separate mobile-nav/drawer variant** was found carrying cart vocabulary — `TripStrip` itself is the only
  chip, and it is not device-conditional (same markup renders in all viewports via CSS wrapping, per its
  `flex-wrap` container).
- **Guest-cart migration flow:** `App.tsx`'s `GuestCartMigrator` component (`App.tsx:1116-1140`) calls
  `/api/cart/migrate` and logs `[cart] Guest cart migration ...` — internal, not user-visible, but the function/
  component name itself carries the vocabulary.

**Bucket:** (i) cosmetic for the chip's visible copy (there is none beyond the icon+count — safe); route path
`/cart` and testid `trip-strip-cart` fall into buckets (ii)/(iii) below.

---

## 3. Test IDs

All 14 distinct `data-testid` patterns containing "cart", the component that owns each, and every spec file
that references it.

| testid | Component (file:line) | Referenced by |
|---|---|---|
| `trip-strip-cart` | `client/src/components/trip/trip-strip.tsx:161` | `playwright/tests/tripstrip-count-accuracy.spec.ts` (6 references: lines 197, 202, 294, 326, 331, 414) |
| `button-add-to-cart` (static) | `client/src/pages/service-detail.tsx:1142, 1186` (×2 instances, hotel + service) | `e2e/specs/journey-4-5.spec.ts:167` |
| `button-add-to-cart-${id}` (dynamic) | `client/src/pages/discover.tsx:447`, `trip-details.tsx:1226`, `service-browser.tsx:200`, `ui/marketplace-card.tsx:149`, `venue-card.tsx:142` (5 components) | `e2e/specs/journey-1.spec.ts:31` (`button-add-to-cart-` prefix selector), `playwright/tests/discover-tabs.spec.ts:356` |
| `button-add-content-to-cart` | `client/src/components/add-to-experience-dialog.tsx:215` | UNVERIFIED — no spec reference found |
| `cart-summary-persistent` | `client/src/pages/experience-template.tsx:2661` | UNVERIFIED — no spec reference found |
| `badge-cart-count` | `client/src/pages/experience-template.tsx:2664` | UNVERIFIED — no spec reference found |
| `badge-cart-item-${id}` | `client/src/pages/experience-template.tsx:2673` | UNVERIFIED — no spec reference found |
| `text-cart-total-persistent` | `client/src/pages/experience-template.tsx:2686` | UNVERIFIED — no spec reference found |
| `button-view-cart-persistent` | `client/src/pages/experience-template.tsx:2706` | UNVERIFIED — no spec reference found |
| `cart-optimize-nudge` | `client/src/pages/cart.tsx:1560` | UNVERIFIED — no spec reference found |
| `cart-item-${id}` | `client/src/pages/cart.tsx:1604, 1681, 1805, 1897` (4 render sites) | UNVERIFIED — no spec reference found (also appears in `scripts/journeys/expert-loop.mjs`, an internal journey script, not a Playwright/CI spec) |
| `button-back-to-cart` | `client/src/pages/itinerary-comparison.tsx:1090, 1160` | UNVERIFIED — no spec reference found |
| `button-back-to-cart-error` | `client/src/pages/itinerary-comparison.tsx:1124` | UNVERIFIED — no spec reference found |
| `button-apply-to-cart` | `client/src/pages/itinerary-comparison.tsx:1865` | UNVERIFIED — no spec reference found |

**CI gates that actually assert on cart-related behavior (not just testids):**
- `.github/workflows/cart-checkout-redirect-gate.yml` — a **dedicated, cart-named workflow** wrapping
  `playwright/tests/cart-checkout-redirect.spec.ts`. Its assertions are about **redirect targets**
  (`cart.tsx` must `setLocation('/plans/${…}')`, not `/trips/${…}` or `/trip/${…}`) and route declarations in
  `App.tsx` — **not** about the string "Cart" itself. Critically: `cart-checkout-redirect.spec.ts:28` already
  documents that "cart conversion now lands on the SLIP, `/plans/:tripId`" — i.e., **the redirect target this
  gate protects is already the Trip Slip.** The gate hard-codes the file path
  `path.join(CLIENT_SRC, "pages/cart.tsx")` (spec line 44) — renaming/moving the `cart.tsx` file (not just its
  copy) breaks this gate's static-analysis suites A–C; renaming only in-page strings/testids does not.
- `.github/workflows/build.yml`, `.github/workflows/journey-suite.yml`, `.github/workflows/e2e-tests.yml` —
  reference "cart" only incidentally (running the broader Playwright/journey suites that happen to include
  cart specs); no cart-specific assertions of their own.
- `scripts/check-linkage-preservation.cjs` — a CI gate doing **static source analysis for identifier names**
  `'cartItem'`, `'getCartItemById'`, etc. (lines 59, 63, 192) as SOURCE markers proving an itinerary item still
  traces back to a sellable service. This is keyed on **code identifiers**, not UI copy — renaming visible
  strings is safe, but renaming the underlying variable/function names (e.g. `cartItem` → `slipItem`) requires
  updating this gate's identifier list in lockstep, or it will stop detecting real linkage-preservation bugs
  (a silent gate weakening, not a red build).

**Bucket:** (ii) testids — safe to rename **only with coordinated spec updates**; `trip-strip-cart` and the two
`button-add-to-cart*` patterns are the only ones with **verified** spec consumers found in this repo; the rest
are UNVERIFIED (no referencing spec found by search, but treat absence-of-evidence cautiously — a testid can
still be used by a manual QA checklist or a spec this search didn't surface).

---

## 4. API surface — `/api/cart/*`

| Method + path | File:line | Client callers |
|---|---|---|
| `POST /api/cart/items` | `server/routes.ts:4522` | UNVERIFIED direct caller in `client/src` (searched; the more common path is `POST /api/cart`, see below) |
| `GET /api/cart` | `server/routes.ts:5531` | `trip-strip.tsx:55`, `cart.tsx`, `experience-template.tsx:769`, `discover.tsx:596`, `itinerary-comparison.tsx`, `add-to-experience-dialog.tsx:86`, `trip-details.tsx:391` |
| `POST /api/cart/resolve-trip` | `server/routes.ts:5625` | UNVERIFIED direct caller found by this search |
| `POST /api/cart` | `server/routes.ts:5791` | `service-detail.tsx:263, 386`, `trip-details.tsx:388`, `experience-template.tsx:1527`, `add-to-experience-dialog.tsx:68` |
| `PATCH /api/cart/:id` | `server/routes.ts:5927` | `experience-template.tsx:1513, 1580` |
| `DELETE /api/cart/:id` | `server/routes.ts:5950` | `experience-template.tsx:1559` |
| `DELETE /api/cart` (clear) | `server/routes.ts:5968` | UNVERIFIED direct caller found by this search |
| `POST /api/cart/migrate` | `server/routes.ts:5980` | `App.tsx:1127` (`GuestCartMigrator`), `SignInModal.tsx:57` |
| `POST /api/cart/convert-to-itinerary` | `server/routes.ts:5996` | `cart.tsx` (redirects to `/plans/${tripId}` on success — the Slip), `scripts/check-linkage-preservation.cjs` references it in a comment as the historical site of a real bug (H1) |
| `GET /api/cart/fee-preview` | `server/routes/payments.routes.ts:1035` | `itinerary.tsx:333` |

**Bucket classification for the route paths themselves:**
- **(iii) breaking change — do not rename lightly.** These are REST paths consumed by 13+ client call sites,
  by `e2e/specs/*` and `playwright/tests/cart-checkout-redirect.spec.ts` directly (`POST ${BASE_URL}/api/cart`
  at spec line 142, `POST .../api/cart/convert-to-itinerary` at line 164), and by
  `server/__tests__/booking-ai-price-guard.test.ts` / `journey-suite-negatives.http.test.ts` indirectly through
  `bookingService.processCart`. A path rename (e.g. `/api/cart` → `/api/slip`) is a **breaking API change**
  requiring either a coordinated multi-repo-surface rename or a deprecation-alias period — **this is exactly
  the class of change CLAUDE.md's routing-realities note (§9) warns is easy to get wrong** ("dead endpoints
  return 200-HTML, not 404" — a stale old path wouldn't even 404 to signal the break).
- **The JSON body key `message: "Cart is empty"`** (`server/routes/payments.routes.ts:602`,
  `server/services/booking.service.ts:212`) is API **response content**, not a path — cosmetically renameable.
  Verified no client code branches on this string (client toasts with the same title are independently
  hard-coded, not parsed from the response body) — bucket (i).
- **`client/src/lib/bookingAPI.ts`'s `processCart()` / `CartItem` interface** targets
  `POST /api/bookings/process-cart` — this is the **separate, still-live legacy booking rail**
  (`bookings` table, `/booking-demo`, `/itinerary-comparison/:id`) that CLAUDE.md §15c explicitly says must
  **not** be deleted while the cart rail (`service_bookings`) works. Renaming "cart" vocabulary must not be
  read as license to touch this rail — it is a separately load-bearing, intentionally-still-running system.

---

## 5. Database / schema vocabulary — **DO NOT RENAME**

Per CLAUDE.md's Replit deploy-push trap and migration-discipline sections, renaming any of the following is
expensive and risky: the deploy-time `drizzle-kit push` enforces CHECK constraints and drops
undeclared indexes/tables at publish, and a rename here would require careful two-phase migration
(add-new-column, backfill, drop-old) plus a `shared/schema.ts` declaration to survive publish — not a
copy-edit. None of these should move unless the decision-maker explicitly asks for a schema change, per the
"Architectural Decision-Maker" gate at the top of CLAUDE.md.

| Object | Location | Note |
|---|---|---|
| Table `cart_items` | `shared/schema.ts:1071` (`pgTable("cart_items", …)`) | The canonical shopping-cart table. Columns: `serviceId`, `customVenueId`, `contentType/contentId/contentMeta`, `experienceSlug`, `quantity`, `tripId`, `scheduledDate`, `slotId`, `itineraryItemId`, `notes`. Referenced by 40+ server files. |
| Index `idx_cart_items_itinerary_item_id` | `shared/schema.ts:1103`, created in migration `160_cart_projection_key.sql` | Declared in BOTH the migration and `schema.ts` specifically **because** of the CLAUDE.md deploy-push-drops-undeclared-indexes trap — this is a live example of that rule being correctly followed. Renaming the table means re-declaring this too. |
| Column `concierge_requests.cart_id` | `shared/schema.ts:6254` | `text("cart_id")` — nullable, no FK. |
| `fee_bands` seed row key `experience_cart_checkout` | `server/migrations/174_seed_experience_cart_band.sql:26-27` | A `fee_bands.key` string value — per §8 of CLAUDE.md, `fee_bands` rows are the sanctioned home for rate config, but the **key name itself** is data other code may already be querying by string match; renaming it is a data migration, not a copy edit. |
| `upsell_config` seed row `surface = 'cart'` | `server/migrations/049_phase5_upsell_engine_tables.sql:72` | A persisted config row keyed by the literal string `'cart'`; also used as a TS union member `"cart"` throughout `server/services/upsell-engine.service.ts:35` and its 8-test suite (`upsell-engine.test.ts`). No DB CHECK constrains it, but it's read/written as an exact-match string in both the seed data and ~10 code/test sites — renaming requires a coordinated code+data change, not a UI copy edit. |
| `reconciliation_exceptions.rail` value `"cart"` | `server/migrations/177_reconciliation_exceptions.sql:70` (`rail VARCHAR(20) NOT NULL`, **no CHECK** — confirmed by the migration's own comment "NO DB CHECK on rail/kind/severity/status") | **Important disambiguation:** this "cart" is CLAUDE.md §15c/§17's own vocabulary for the **primary checkout rail** (`service_bookings`) as opposed to the "legacy" rail (`bookings` table) — it is an **ops/reconciliation term**, unrelated to the shopping-cart UI, appearing in `server/jobs/stripeReconciliation.ts` (9 occurrences), `admin/reconciliation.tsx`, and 2 test files. **Do not conflate this with the UI rename** — renaming the shopping-cart concept does not obligate renaming "cart rail," and renaming "cart rail" (e.g. because it now sounds confusingly like the UI cart) is its own separate, higher-risk exercise since it's a persisted, unconstrained string that historic rows already carry (a rename here is a silent-miss risk for any future `WHERE rail = 'cart'` query written against old data). |
| `analytics_events.funnel_stage` value `cart` (comment only, no enum) | `shared/schema.ts:5570` | `varchar("funnel_stage", { length: 50 })` with an inline comment listing `search, view, cart, checkout, payment, complete, abandoned` as the informal value set; also referenced as a literal in `server/routes/admin.routes.ts:5160` (`const stages = [..., "cart", ...]`). No CHECK constraint, but it is a **funnel-stage taxonomy** other analytics code/dashboards may filter on — renaming changes what counts as "cart" in historical funnel data unless old+new values are both handled. |
| Reserved-slug blocklist entry `"cart"` | `server/routes/storefront.routes.ts:52` | A list of path segments a provider storefront slug may not claim (`"trip", "booking", ..., "cart", "login", ...`) — tied to the `/cart` **route**, not the DB, but listed here because it is a code-level reservation that must track whatever the final `/cart` route path becomes. |

**Rationale for DO-NOT-RENAME:** CLAUDE.md's "Replit deploy-push vs. our migrations" section documents two
concrete production incidents (`expert_earnings.status='pending'`, `service_templates.delivery_method='document'`)
where a value/column that looked like a simple rename triggered a publish-time CHECK failure and Replit's
destructive "copy dev database over production" prompt. `cart_items` and its column/index are exactly this
shape of object. Any schema-level rename needs `scripts/preflight-prod-constraints.cjs` run against prod first,
plus explicit decision-maker sign-off per the file's own "Architectural Decision-Maker" line.

---

## 6. Vocabulary candidates

The product already has an established term for the traveler's working itinerary: **"Slip"** —
`client/src/components/plancard/SlipView.tsx`, `client/src/pages/slip-view.tsx` (route `/plans/:tripId`,
called "the Slip's canonical address" in its own header comment), `PlanSlipStrip.tsx`, and a
`trip.trackingNumber` rendered as literally `Slip ${trackingNumber}` (`SlipView.tsx:132`). Confirming the
connection is already half-built: **`cart.tsx`'s own conversion flow already redirects to `/plans/${tripId}`
— the Slip — on success** (`cart-checkout-redirect.spec.ts:28`, `cart.tsx` `convert-to-itinerary` handler).
The decision-maker's proposed rename is not inventing a new noun; it is extending one the app already uses one
step earlier in the funnel.

| Candidate | Nav label | Add-button copy | Empty state | Page title | Collision risk |
|---|---|---|---|---|---|
| **A — "Trip Slip" / "Slip"** (recommended) | `Trip Slip` (chip), `Slip` if space-constrained | `Add to Slip` / `Add to Trip Slip` | `"Your Trip Slip is empty"` | `"Your Trip Slip"` | **Direct term overlap with the existing post-optimize `SlipView`** (`/plans/:tripId`) — today "Slip" means the finished/optimized itinerary; extending it to the pre-purchase staging list means either (a) merging the two screens conceptually, which is literally what the decision-maker is proposing, or (b) needing a second qualifier ("Trip Slip" for staging vs. plain "Slip" for the optimized view) so travelers don't confuse an unoptimized 2-item staging list with a full day-by-day plan. Lowest *new*-vocabulary risk since the word is already product-native. |
| **B — "Trip" / "Add to trip"** | `Trip` | `Add to Trip` | `"Your trip is empty"` | `"Your Trip"` | **High collision.** `trip-strip.tsx:98` already renders the literal lead text `"Your trip"` for travel-vocab context; `/trip/:id` is a separate, already-existing route (`TripDetails` page, distinct from `/plans/:tripId`); `TripContext`/`trips` table/`tripId` are used everywhere. Three different things would all be called "Trip" — likely the worst collision of the three. |
| **C — "Plan" / "Add to plan"** | `My Plan` | `Add to Plan` | `"Your plan is empty"` | `"Your Plan"` | **High collision.** `authNavConfig` already has `"My Plans"` → `/dashboard` (`nav-config.ts:140`, meaning *all* the traveler's trips, plural); `"AI Plan Planner"` is a distinct nav item (`nav-config.ts:123`); the `plancard` component family and `SlipView`'s own fallback title `"Trip plan"` (`SlipView.tsx:157`) already use "plan" for the itinerary-detail concept. Adds a third meaning of "plan" to a codebase that already has two. |

**Recommendation:** Candidate A ("Trip Slip"), because it reuses the product's own established word instead of
introducing a fourth synonym for "the traveler's stuff," and because the actual conversion flow already lands
users on the Slip page today — the UI rename would just be catching the label up to where the code already
sends people. The one open design question it does NOT answer (flagged for the decision-maker, not resolved
here): whether the pre-purchase staging list and the post-optimize `SlipView` become the *same* screen (one
Slip, items appear immediately, no separate `/cart`), or *two* screens that both use the word "Slip" with a
qualifier. That is a product decision this audit does not make.

---

## 7. Rename blast-radius estimate

Assuming the decision-maker approves **only the cosmetic/UI-copy rename** (bucket i) plus **coordinated
testid + route-path updates** (buckets ii/iii), leaving the DB layer (§5) untouched:

**Files touched, by category:**
- `client/src` UI-copy files: **~61 files** contain a true-positive "cart" occurrence; the two heaviest are
  `client/src/pages/cart.tsx` (160 occurrences) and `client/src/pages/experience-template.tsx` (105
  occurrences) — these two alone are ~55% of all client-side "cart" text and carry the bulk of both copy and
  internal state-variable names (`cart`, `cartTotal`, `addToCart`, `removeFromCart`, `CartItem` interface,
  `cartOpen` state, etc.), so a careful pass distinguishing "user-visible string" from "internal variable name
  that's fine to leave as `cart*` for now" is required file-by-file, not a global find-replace.
- `server` non-test, non-migration files referencing "cart": **40 files** (routes, services, jobs) — the vast
  majority reference the `/api/cart/*` paths or the `cart_items` table/`CartItem` type, which per §4/§5 should
  largely stay as-is unless the route paths themselves are renamed.
- Server test files: **5** (`server/__tests__/*`) with cart-specific assertions (linkage-preservation N4,
  checkout-empty-cart N7, reconciliation rail checks) — these test **behavior**, not copy, so a pure UI rename
  should not touch them; a route-path rename would.
- Playwright specs: **19 files** reference "cart" in some form; of these, `cart-checkout-redirect.spec.ts` and
  `tripstrip-count-accuracy.spec.ts` have **hard assertions on testids and file paths** that must be updated in
  lockstep with any testid/route rename, or the following CI gates go red:
  - **`cart-checkout-redirect-gate.yml`** (dedicated workflow, 2 required jobs: `static-redirect-check`,
    `e2e-cart-redirect`) — goes red if `cart.tsx` is moved/renamed as a **file** (hard-coded path at spec
    line 44) or if the `/plans/${tripId}` redirect target or `POST /api/cart` / `POST
    /api/cart/convert-to-itinerary` endpoints are renamed without updating the spec's fetch calls (spec lines
    142, 164).
  - **`tripstrip-count-accuracy.spec.ts`** (referenced by the broader `journey-suite`/`e2e-tests` workflows,
    not its own dedicated gate file found in this search — UNVERIFIED whether it is a required check) — goes
    red if `data-testid="trip-strip-cart"` is renamed without updating its 6 locator references.
  - **`discover-tabs.spec.ts`** and **`e2e/specs/journey-1.spec.ts` / `journey-4-5.spec.ts`** — go red if
    `button-add-to-cart` / `button-add-to-cart-{id}` testids are renamed without updating their selectors.
  - **`scripts/check-linkage-preservation.cjs`** (a CI gate script, invocation site UNVERIFIED in this search —
    likely wired into `build.yml` or a dedicated workflow not matched by the "cart" keyword search since the
    workflow file itself may not contain the word) — its identifier allowlist (`cartItem`,
    `getCartItemById`) would silently under-detect if those TypeScript identifiers are renamed without updating
    the script; this is a **silent weakening**, not a red build, so it is the highest-risk item if missed.
- `.github/workflows`: **5 files** mention "cart"; only `cart-checkout-redirect-gate.yml` has cart-specific
  logic of its own (job names, PR-comment copy, file-existence assertion) — its own **workflow name and job
  names** are cosmetic and safe to rename, but its **assertions** are about redirect targets and file paths,
  not the word "cart," so most of a UI-only rename would leave this gate green as long as `cart.tsx` keeps its
  filename or the gate's `CART_FILE` path constant is updated alongside a file rename.
- `docs/**`: at least 8 markdown files under `docs/audits/`, `docs/testing/`, `docs/planning/` document current
  cart behavior/testids (e.g. `docs/testing/coverage-matrix.md:19-47` documents `cart.tsx` testids and flows
  directly) — these are documentation debt, not CI risk, but would go stale immediately.

**What would NOT need to change (and should not):** `cart_items` table/columns/index (§5), the
`reconciliation_exceptions.rail = 'cart'` ops vocabulary (§5, unrelated meaning), `fee_bands.key =
'experience_cart_checkout'`, `upsell_config.surface = 'cart'`, and the legacy `/api/bookings/process-cart`
rail (§4) — all persisted data or CLAUDE.md-governed money-path vocabulary, out of scope for a UI rename and
each individually risky enough (per CLAUDE.md §§8/14/15/17 and the deploy-push trap) to warrant its own
decision-maker-approved change, not a byproduct of a nav-copy rename.

**Net estimate:** a careful, fully-coordinated rename (copy + testids + the one dedicated CI gate + docs) is a
**~80-100 file change** (61 client + a handful of testid-consumer specs/workflows + docs), of which the large
majority (the ~61 client files) is copy-editing distinct strings/identifiers rather than structural change, and
a much smaller, higher-risk subset (≈6-10 files: `cart.tsx`'s file identity if renamed, `trip-strip.tsx`'s
testid, `cart-checkout-redirect-gate.yml` + its spec, `tripstrip-count-accuracy.spec.ts`,
`check-linkage-preservation.cjs`) is where an uncoordinated edit turns a cosmetic rename into a red CI build or
a silently-weakened guard.
