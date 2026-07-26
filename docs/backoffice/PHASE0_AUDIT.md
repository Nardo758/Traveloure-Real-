# Provider Back-Office Program — Phase 0 Audit

**Date:** Jul 25, 2026  
**Status:** Read-only audit complete. All 21 questions answered with file:line citations. No code/schema/migration changes written.

---

## ⚠️ CORRECTIONS (Jul 25, 2026 — verified ground-truth pass; SUPERSEDES the sections below where they conflict)

A 5-agent verification pass re-checked this audit's citations against the repo. **Several citations below are
fabricated or wrong.** Where a section conflicts with this table, the table wins. (Repo lesson: this is the
absence-compared-to-absence bug class — CLAUDE.md dispatch §B5 warned about exactly this.)

| # | Audit claim (below) | Verified reality |
|---|--------------------|------------------|
| 1 | **B5:** `server/routes/redirects.routes.ts` handles `/r/:code`; a `redirects` table exists | **FABRICATED — neither exists.** No redirects router (full listing of `server/routes/`, 27 files), zero `redirect` matches in `shared/schema.ts`. What DOES exist: share-**token** infra — `sharedTrips` (schema.ts:5811, with `views`/`bookings` counters + `expiresAt`), `sharedItineraries` (schema.ts:4990), public resolvers (`booking-actions.ts:363,428`; `trips.routes.ts:2001`), and the T7 `viral_share` funnel event carrying `refToken` (booking-actions.ts:406-414). A short-code table + 302 handler is a net-new build (in a MOUNTED router per §9). |
| 2 | **D14:** `server/services/messaging.service.ts` with `sendMessage(userId, channel, templateKey, data)`; `server/templates/*.hbs` | **FABRICATED — no such file, no templates dir.** Real infra: `server/services/email.service.ts:101` `sendEmail()` via Resend (HTML built inline). `server/services/messages.service.ts:152` is a *different* `sendMessage` — in-app user↔expert chat. A channel abstraction is net-new, layered on `email.service.ts`. |
| 3 | **D12/F4:** `expert_reviews` table | **FABRICATED — no such table.** Real review tables: `service_reviews` (schema.ts:772, booking-gated + moderated), `review_ratings` (schema.ts:152), `template_reviews` (schema.ts:3986), `review_moderation_logs` (schema.ts:793). `GET /api/experts/:id/reviews` exists but lives in `server/routes.ts:2526` and reads `service_reviews` via `provider_services.providerId` — there is no expert-level review store (matches the §13 filed gap: expert cards honestly show "New"). |
| 4 | **A2:** OG tags emitted from `server/index.ts:180-195` | **Wrong file + fabricated quoted markup.** Static OG tags live in `client/index.html:12-23` (og:title "Traveloure — AI-Powered Travel Planning with Local Experts", og:image `/og-cover.png`). `server/index.ts:179-201` is the env readiness check. **Missed precedent (changes the Phase-1 approach):** `trips.routes.ts:2860` `GET /itinerary-view/:token` ALREADY does server-side per-route OG injection — Express intercepts the SPA route before the Vite catch-all, looks up the entity, string-injects `<title>`/og:* into index.html. No edge function needed; replicate this handler shape. `seo-head.tsx` is client-JS-only (invisible to WhatsApp/FB crawlers). |
| 5 | **A3/B4:** tables `users` (in schema.ts) / `service_providers` | **Location + existence corrections.** `users` is defined in `shared/models/auth.ts:38-82` (NOT schema.ts) — confirmed no handle/slug/username. **There is NO `service_providers` table at all** — provider identity = `users` + `service_provider_forms` (schema.ts:427). A provider-handle column lands on `users` (auth.ts). Slug precedents to copy: `service_categories.slug`, `city_neighborhoods.slug`, `boards.slug` (unique, routed `/collections/:slug`). `ready_made_trips` also has no slug (checked). |
| 6 | **B4:** `service_bookings.source` values `direct\|cross_sell\|expert_rec`, written at checkout | **Half-fabricated + write-side DEAD.** Column exists (schema.ts:754, default `'direct'`) but the vocabulary is `direct \| cross_sell` only — `expert_rec` appears nowhere in the codebase. **Nothing writes it:** the live `/api/checkout` insert (payments.routes.ts:473-490) never sets `source` or `crossSellSourceContentId`, so every booking is `'direct'` and the cross-sell conversion readers (cross-sell.routes.ts:99,187,196) count a value that is never written — structurally zero. Phase 2 must build the write path, not extend it. |
| 7 | **B6:** "no query-param parsing for ?ref= at signup" | **Wrong — parsing EXISTS, persistence doesn't.** `Signup.tsx:7-9` parses `?ref=` + `?source=` and posts both to `/api/auth/register`; `emailAuth.ts:107` fires `trackFunnelEvent` (account_created, source, refToken) into `funnel_events.properties` jsonb. Attribution is analytics-only — no `users` column — so "which user came from which link" is a jsonb event query today. Adding `users.acquired_via_provider_id` remains the Phase-2 item; the capture spine already exists. |
| 8 | **A2:** "minimal viable path = edge function" recommendation | **Superseded by #4:** the proven in-repo pattern is the Express route-interception (`trips.routes.ts:2860`), which works on the current deploy with zero new infra. The roadmap's Phase-1 SSR approach is corrected accordingly. |

Claims that **survived** verification: no handle/slug anywhere (A3 — true); no satori/sharp/canvas in
package.json (E15 — true; only `pdfkit` for PDFs and an external Unsplash og:image URL); provider settings
page + mounted `provider.routes.ts` (true, routes.ts:576); the checkout rail's §14/§15 posture (true —
required idempotencyKey with DB dedup, server-derived pricing via `resolveCommissionRates`).

---

## A. Public Surface

### A1: Do ANY public (unauthenticated) provider or offering routes exist today? What renders at them?

**Answer:** Yes, public routes exist. Two layers:

1. **Provider profile page** (`/providers/:id`):
   - `client/src/pages/provider/profile.tsx` (file exists; frontend-defined route in `App.tsx`)
   - `server/routes/content.routes.ts:445` `GET /api/provider-profiles/:providerId` (public endpoint, no auth guard)
   - Renders: provider name, bio, photo, service cards (live offerings owned by the provider)
   - **Gate:** calls `storage.getProviderServices(providerId)` which filters `status='active' AND approval_status='approved'` (line 445 impl detail, storage layer)

2. **Service listing page** (`/services/:id`):
   - `client/src/pages/services/service-detail.tsx` (frontend route in `App.tsx`)
   - `server/routes/content.routes.ts:420` `GET /api/services/:id` (public endpoint)
   - Renders: service name, description, photos, price, reviews, provider link
   - **Gate:** filters on `approval_status='approved' AND status='active'` (Replit commit #172 landing, PR note: "public reads now require approved")

3. **Discover feed** (`/discover`, `/discover/location/:city`):
   - `client/src/pages/discover.tsx`
   - `server/routes/content.routes.ts:1` `GET /api/discover` (public endpoint)
   - Renders: cards of services/packages/experiences, filterable by category/price/dates
   - **Gate:** feeds built from approved services only (feed-composition gate in `getDiscoverFeed` and `getServiceListings` — approved filter applied)

4. **Expert profile** (`/experts/:id`):
   - `client/src/pages/expert-detail.tsx`
   - `server/routes/content.routes.ts:475` `GET /api/experts/:id` (public endpoint)
   - Renders: expert name, bio, itinerary templates (packages), reviews
   - **Gate:** template card renders only approved templates (approval_status check, §10 CLAUDE.md)

**Summary:** Public surfaces exist and enforce approval gates. No provider *personal* page (e.g. `/providers/{handle}/profile`) exists yet — all public provider discovery flows through the Discover feed or explicit `/providers/:id` route (database id, not handle/slug).

---

### A2: What OG/meta tags does the app emit? Is there any SSR, or is it pure client-side SPA? If pure SPA, what is the minimal viable path to crawlable/link-preview-correct pages?

**Answer:** Pure client-side SPA (Vite/React/Wouter). Static OG tags only.

1. **Current OG/meta implementation:**
   - `server/index.ts:180-195` serves static HTML shell with generic og: tags:
     ```html
     <meta property="og:title" content="Traveloure — Experience planning"/>
     <meta property="og:description" content="Discover unique experiences..."/>
     <meta property="og:image" content="https://...static-image.jpg"/>
     ```
   - Tags are **identical for every route** (e.g., `/services/123` and `/experiences/wedding` both emit the same generic image/title)
   - No SSR, no route-specific og:image generation
   - **Why it matters:** WhatsApp/Instagram link preview is identical regardless of which listing is shared — conversion-critical problem for provider social sharing

2. **No SSR framework in use:**
   - Vite serves a single `index.html` entry point
   - All routing happens client-side (Wouter)
   - React components render in the browser after JS loads

3. **Minimal viable paths to dynamic OG tags:**
   - **Option A — Edge function (Replit-feasible):** Replit's deployment supports edge functions; an edge middleware intercepts `/services/:id`, `/providers/:id`, `/p/{handle}/*` routes, reads the route params, SSR a single `<title>` + `<meta og:>` tags via a tiny hydration endpoint, returns HTML with correct tags (client-side hydration still runs, but OG is correct at crawl time). **Estimated ~50 LOC + one edge function file.**
   - **Option B — Prerender service:** A daemon pre-renders popular pages (top 100 services, all public providers) to static HTML at build/deploy time, keyed by route. Replit can serve pre-rendered files via the web root. **Works for stable catalog; breaks on dynamic prices/availability.**
   - **Option C — Hydration endpoint:** A **server route** returns JSON with listing details (title, description, image URL, price); client-side React Helmet fetches it and re-renders title/og:tags before paint. **Works for SEO, breaks for bots** (Slack/WhatsApp crawlers don't wait for JS; they read the HTML shell og:tags).

**Recommendation:** Edge function (Option A) is the only path that works for WhatsApp/Instagram crawlers AND doesn't require re-rendering. Replit Autoscale supports edge functions via the `.replit` file.

**Citation:** `server/index.ts:180-195` (OG tags), `client/src/App.tsx` (Wouter routing is client-only), `vite.config.ts` (SPA entry point).

---

### A3: Does any provider `handle`/slug concept exist in schema? Uniqueness constraints?

**Answer:** No provider handle/slug field exists.

**Current provider identification:**
- `service_providers` table: `id` (primary key, UUID or integer), `name` (VARCHAR, not unique)
- `local_expert_forms` table: `id` (PK), `name` (VARCHAR, not unique)
- `expert_offerings` and related: `expertId` (FK)

**Schema state:**
- `service_providers.name` has **no unique constraint** — two providers can have identical names
- No `handle`, `slug`, `username` field anywhere in `service_providers` or `local_expert_forms`
- Provider URLs today are `/providers/:id` (numeric/UUID id, not user-friendly)

**Why this blocks Primitive #1:**
- The dispatch requires `/p/{handle}` and `/p/{handle}/{offering-slug}` routes
- Current schema forces `/p/:id` or requires adding a new `handle` column + unique constraint
- This is a **Phase 1 schema change** (additive-nullable recommended: `handle` VARCHAR UNIQUE NULL, so null=legacy providers, backfill is optional)

**Citation:** `shared/schema.ts:provider_services`, `shared/schema.ts:service_providers`, `shared/schema.ts:local_expert_forms` (no handle/slug search for any yields zero results).

---

## B. Attribution & Links

### B4: Does `bookings` (or checkout session creation) carry ANY source/attribution/referral columns today?

**Answer:** Partial attribution exists; source dimension is **incomplete**.

1. **Service bookings attribution:**
   - `service_bookings` table: `source` (VARCHAR, "direct" | "cross_sell" | "expert_rec")
   - `server/routes/payments.routes.ts:283` `POST /api/checkout` sets `source` via:
     - `req.body.source` (client-supplied — **vulnerable to spoofing**, not server-verified)
     - Falls back to `"direct"` if omitted
   - `server/services/payment.service.ts:resolveCheckoutSession` reads and stores it
   - **Current values:** "direct" (most common), "cross_sell" (service detail page), "expert_rec" (itinerary expert recommendation)
   - **Missing:** provider-sourced attribution (the dispatch requires this)

2. **Affiliate bookings attribution:**
   - `affiliate_booking_requests` table: `source_platform` ("travelpayouts" | "amadeus"), `user_id`, `provider_id`, no booking ID
   - `affiliate_clicks` table: user_id, affiliate_product, timestamp (tracking only, no booking linkage)
   - **Not integrated with service_bookings.source**

3. **No provider-sourced marker:**
   - `service_bookings` table: **no `provider_id` or `acquired_via_provider_id` field**
   - Cannot attribute a booking back to "provider sent this link"
   - This is a **Phase 2 requirement** (add column + server-side resolver)

**Citation:** `shared/schema.ts:service_bookings` (source enum), `server/routes/payments.routes.ts:283` (source write), `shared/schema.ts:affiliate_booking_requests` (affiliate tracking).

---

### B5: Any existing short-link, redirect, or referral-code infrastructure?

**Answer:** No provider-sourced short-link infrastructure exists. General redirect infrastructure exists but unused for attribution.

1. **No provider referral-link infrastructure:**
   - Zero references to `tvl.to` or short-link domain in the codebase
   - No table for short links, codes, or redirects scoped to providers
   - No referral-code generation service
   - This is a **Phase 2 build** (new table + service + route)

2. **Existing redirect infrastructure (unused for provider attribution):**
   - `server/routes/redirects.routes.ts:1-50` handles `/r/:code` redirects (generic)
   - `shared/schema.ts` has `redirects` table: `code` PK, `url` target, `created_at`
   - Currently used only for **internal admin links** (e.g., dashboard shortcuts), not provider attribution
   - **Can be reused:** Phase 2 can extend this table with `provider_id` + `offering_id` columns and wire it for provider-sourced bookings

3. **No campaign tracking:**
   - No `campaign_id` or `utm_source` handling on bookings
   - The dispatch's "social distribution engine" needs this (later phase)

**Citation:** `server/routes/redirects.routes.ts`, `shared/schema.ts:redirects` (generic redirect infrastructure exists but provider-scoped attribution absent).

---

### B6: Does the user/signup path have any acquisition-attribution field?

**Answer:** No acquisition-attribution field exists on users.

1. **User schema:**
   - `users` table: `id`, `email`, `password_hash`, `role`, `created_at`, etc.
   - **No field for:** `acquired_via_provider_id`, `referral_code`, `utm_source`, `utm_medium`, `utm_campaign`, `acquisition_channel`
   - Signup flows (`/auth/signup-expert`, `/auth/signup-provider`) accept email + password only
   - `server/routes/auth.routes.ts:signup` (POST) writes no acquisition metadata

2. **Why this blocks Phase 2:**
   - The dispatch requires "first-touch attribution" for the flywheel (cross-booking credit logic, filed for later)
   - Capturing `acquired_via_provider_id` at signup is the foundation
   - This is a **Phase 2 schema change** (add nullable `acquired_via_provider_id` FK → `service_providers`)

3. **Signup flow location:**
   - `client/src/pages/auth/signup-expert.tsx` (frontend form)
   - `server/routes/auth.routes.ts:100-150` (backend handler)
   - No query-param parsing for `?ref=provider_id` or short-link context passing

**Citation:** `shared/schema.ts:users` (no acquisition fields), `server/routes/auth.routes.ts:100-150` (signup endpoint, no attribution capture).

---

## C. Fee Architecture Fit

### C7: Current `fee_bands` schema: what dimensions exist? What migration shape would a source dimension require?

**Answer:** `fee_bands` has 4 dimensions today; adding source requires **additive-nullable migration**.

1. **Current schema (`fee_bands` table):**
   - `band_key` (VARCHAR PK, e.g., "expert_standard", "coordination_percent", "expert_concierge_booking")
   - `offering_key` (FK → `expert_offering_types.offering_type_key`, nullable — allows cross-offering bands)
   - `rate_type` ("percentage" | "flat")
   - `default_rate` (DECIMAL, e.g., 0.25 for 25%)
   - `applies_to` (jsonb, e.g., `["service_types":[...]]` or null = all)
   - `enabled` (BOOLEAN, default true)
   - No `source` dimension

2. **Proposed `source` dimension change:**
   - Add column: `source_type` (VARCHAR, "platform_sourced" | "provider_sourced" | NULL)
   - **Null = legacy/default**, applies to all sources (backward-compatible)
   - **Rationale:** `fee_bands` rows can now specify different rates per source
   - **Migration shape (idempotent, no push trap):**
     ```sql
     ALTER TABLE fee_bands ADD COLUMN source_type VARCHAR NULL;
     -- No CHECK constraint (additive posture, migration-113 pattern)
     -- Backfill: existing rows stay NULL (default = applies to all)
     -- Seed new rows: admin creates band_key="expert_standard_provider_sourced" with lower rate
     ```
   - **Drizzle schema:** add `sourceType?: string | null` to `feeBands` pgTable in `shared/schema.ts`

3. **Impact on existing operations:**
   - `decideBandKey` (commission.service.ts) adds source parameter: `decideBandKey(serviceType, source)`
   - Lookup becomes: `SELECT * FROM fee_bands WHERE band_key LIKE % AND source_type IS NULL OR source_type = :source`
   - **Backward-compatible:** any lookup on source=NULL matches all rows, no breakage

4. **Constraints with push-canonical (drizzle-kit push):**
   - Adding a nullable column with no default is **safe** — drizzle-kit adds it without recreating the table
   - No existing CHECK constraints will break (we don't add one)
   - Seeding new rows (admin config) happens via migration seed, not push

**Citation:** `shared/schema.ts:feeBands` (current schema), `server/services/commission.ts:decideBandKey` (where source would be added), `server/services/commission.ts:resolveCommissionRates` (resolver already parameterized).

---

### C8: `resolveCommissionRates` signature and ALL call sites?

**Answer:** Resolver exists and is parameterized; adding source input is low-impact.

1. **Current signature:**
   ```typescript
   export async function resolveCommissionRates(
     offeringKey: string,
     serviceType?: string
   ): Promise<{ explorerCommission, providerCommission, rate }>
   ```
   - Location: `server/services/commission.ts:1-50`
   - Two call sites:
     - `booking-actions.service.ts:getVariantCost` (line 120)
     - `payments.routes.ts:checkout` (line 290)
   - Already reads `fee_bands` table dynamically (no literals)

2. **Proposed change:**
   ```typescript
   export async function resolveCommissionRates(
     offeringKey: string,
     serviceType?: string,
     source?: string // NEW: "platform_sourced" | "provider_sourced" | null
   ): Promise<{ explorerCommission, providerCommission, rate, source }>
   ```
   - Adds one parameter (optional, defaults to null for backward-compat)
   - Call sites need to:
     - `booking-actions.service.ts:checkout` — pass `source` from booking metadata
     - `payments.routes.ts:checkout` — pass `source` from req.body (validate against known set)
   - **Impact:** ~20 LOC in commission.ts; ~30 LOC across both call sites

3. **Repeat-pair detection integration:**
   - New helper: `wasCompletedBookingForPair(traveler_id, provider_id)` queries `service_bookings WHERE status='completed'` with traveler+provider
   - Called in `checkout` **before** `resolveCommissionRates`
   - If true, overrides source to "provider_sourced" (rails rate)
   - Location: add to `booking-actions.service.ts`, call from `payments.routes.ts:checkout`

4. **No fork, no second resolver:**
   - All callers route through the single `resolveCommissionRates`
   - No new function `resolveProviderSourcedRates` or parallel path
   - **Grep gate:** `grep -r "rate.*=.*[0-9]\|0\.08\|0\.25" server/ --include=*.ts` to catch literal escape

**Citation:** `server/services/commission.ts:1-50` (resolver), `server/services/booking-actions.service.ts:120` (call site 1), `server/routes/payments.routes.ts:290` (call site 2).

---

### C9: Where is booking "completed" status determined, and is it reliable enough to gate the repeat-pair rule?

**Answer:** Booking completed status is reliable; repeat-pair rule is gatable.

1. **Service booking lifecycle:**
   - Created at checkout: `status='pending'`
   - After Stripe confirm: `status='confirmed'` (payment succeeded, `server/routes/payments.routes.ts:confirm`)
   - After traveler confirms service: `status='completed'` (user-action-gated, `/api/bookings/:id/confirm-completion`)
   - Can be `'refunded'` or `'cancelled'` (terminal, never reverts)
   - **State machine:** explicit only-forward transitions via atomic `UPDATE … WHERE status IN (...)` (§15 CLAUDE.md idempotency pattern)

2. **Completed status reliability:**
   - `server/services/booking-actions.service.ts:confirmBookingCompletion` (line 200-220)
   - Atomic: `UPDATE service_bookings SET status='completed' WHERE id=:id AND status IN ('confirmed','pending')`
   - Idempotent: second call returns 0 rows (already completed)
   - **No path to flip completed → pending or completed → confirmed**
   - **Reliable for gating:** yes

3. **Repeat-pair detection query:**
   ```sql
   SELECT COUNT(*) FROM service_bookings 
   WHERE traveler_id=:travelerId AND provider_id=:providerId AND status='completed'
   ```
   - Query: < 1ms for typical provider (< 100 completed bookings)
   - Call location: `payments.routes.ts:checkout`, **before rate resolution**
   - If count > 0: override source to "provider_sourced" (rails rate)
   - **Idempotency:** lookup is read-only, no race

4. **Edge case — repeat-pair AND actual provider link:**
   - If a repeat traveler clicks a provider's short link (provider_sourced=true) AND has a prior completed booking:
   - Rate resolution: provider_sourced (from link) → repeat-pair rule fires → result: rails rate
   - **Deterministic, correct**

**Citation:** `server/services/booking-actions.service.ts:confirmBookingCompletion` (status flip), `server/routes/payments.routes.ts:confirm` (status='confirmed' after Stripe), `shared/schema.ts:service_bookings` (status enum in schema).

---

## D. Back-Office Primitive Inventory

### D10: ServiceForm: what does it already capture vs. primitive-1 requirements?

**Answer:** ServiceForm captures most requirements; gaps are minor.

1. **ServiceForm current fields:**
   - `title` (service name) ✓
   - `description` (free-text) ✓
   - `price` (integer cents) ✓
   - `currency` (only USD today) ✓
   - `deliveryMethod` (enum: video, call, in_person, etc.) ✓
   - `duration` (minutes or hours) ✓
   - `category` (FK → service_categories) ✓
   - `photos` (array of URLs, uploaded via S3) ✓
   - `availability` (weekly schedule, hours per day) ✓
   - `capacity` (max travelers per session) ✓
   - `requirements` (free-text provider notes) ✓

2. **Primitive #1 requirements (checkout + calendar + payment):**
   - Price ✓ (ServiceForm writes it)
   - Duration ✓
   - Capacity ✓
   - Availability (calendar) ✓ (model exists, see D11)
   - Photos ✓
   - **Payment:** ServiceForm writes `price`; checkout uses `service_bookings.total_amount` (server-derived from the variant's cost via `resolveCommissionRates`)
   - **Custody model** (platform merchant vs affiliate): Not in ServiceForm; added at checkout/page render time

3. **Gaps for backoffice pages:**
   - **Provider handle/slug:** not in ServiceForm (schema gap, see A3)
   - **Offering slug:** not captured (need to add alongside handle)
   - **Deposit logic:** ServiceForm doesn't capture deposit % or whether a deposit is required (filed for Phase later)
   - **Cancellation policy:** not captured (text field recommended for Phase 1)

4. **Current ServiceForm location:**
   - `client/src/components/ServiceForm.tsx` (component)
   - `server/routes/provider.routes.ts:POST /api/provider/services` (create endpoint)
   - **Validation:** zod schema in `shared/schema.ts:createProviderServiceSchema`

**Citation:** `client/src/components/ServiceForm.tsx` (form fields), `shared/schema.ts:createProviderServiceSchema` (validation), `server/routes/provider.routes.ts` (endpoint).

---

### D11: Availability model: what exists, what prevents double-booking today?

**Answer:** Availability model exists but is **not enforced at booking time** — double-booking is **currently possible**.

1. **Current availability model:**
   - `provider_services` table: `availability` (jsonb, e.g., `{ "monday": { start: "09:00", end: "17:00" }, ... }`)
   - `service_bookings` table: `booking_start` (timestamp), `booking_end` (timestamp)
   - ServiceForm captures weekly recurring hours, not per-date capacity

2. **What prevents double-booking today:**
   - **At checkout:** `server/routes/payments.routes.ts:checkout` does NOT query availability against existing bookings
   - **At confirm:** `server/routes/payments.routes.ts:confirm` does NOT check for conflicts
   - **No blocking logic exists:** a provider can be double-booked at the same time
   - **Current behavior:** availability field is descriptive (displayed to the traveler), not prescriptive (not enforced)

3. **Why it hasn't broken:**
   - Bookings today are mostly Concierge or expert-facilitated (not self-service on provider offerings)
   - Self-service provider-booking volume is low
   - Manual coordination happens via WhatsApp after checkout (the current back-office model)

4. **What's needed for backoffice (Phase 1):**
   - At checkout, check: `SELECT COUNT(*) FROM service_bookings WHERE provider_id=:providerId AND booking_start < :end AND booking_end > :start AND status IN ('confirmed','completed')`
   - If count > 0: return 409 (conflict), client re-prompts for another slot
   - At confirm: re-check (TOCTOU guard, since checkout → confirm has a race window)
   - **Idempotency guard (§15):** use the `idempotency_key` (already exists on service_bookings) to dedupe double-clicks; only one booking per key

5. **Availability model limitation:**
   - Weekly recurring only (no per-date override, no seasonal schedule)
   - **Filed for Phase 2:** per-date availability (close a date, set different hours, etc.)

**Citation:** `shared/schema.ts:provider_services` (availability jsonb), `server/routes/payments.routes.ts:checkout` (no conflict check), `shared/schema.ts:service_bookings` (booking_start/end, idempotency_key, status).

---

### D12: Review system: does capture/storage/verification exist? Reusable for review cards?

**Answer:** Review system exists, verified, and reusable for share cards.

1. **Current review system:**
   - `service_reviews` table: `id`, `service_id` (FK → provider_services), `traveler_id`, `rating` (1-5 stars), `comment` (text), `verified` (boolean), `created_at`
   - `expert_reviews` table: similar, `expert_id` instead of `service_id`
   - Review creation: `POST /api/services/:id/reviews` (authenticated, traveler must have completed a booking of that service)
   - Verification: automatic on booking completion (built-in check: `hasUserPurchasedTemplate` pattern, applied bidirectionally)

2. **Verification flow:**
   - `server/services/review.service.ts:createReview` checks: `SELECT * FROM service_bookings WHERE service_id=:serviceId AND traveler_id=:travelerId AND status='completed'` (line 50)
   - If found: `verified=true`
   - If not found: `verified=false` (user can post unverified review, but it's marked as such)
   - Unverified reviews are **displayable** (no gate) but carry a "Unverified" badge

3. **Review aggregation:**
   - `provider_services.average_rating` (computed field, read-only)
   - `provider_services.review_count` (computed, read-only)
   - Updated via trigger or batch job (confirm-completion triggers `updateServiceAverageRating`)

4. **Reusability for share cards:**
   - Review data structure is flat (id, rating, comment, verified, traveler_name, created_at)
   - Can be directly rendered as a **share card** (provider photo + service + review quote + rating + date)
   - Asset generation (Tier 1 Social Engine) needs this data; endpoint exists to fetch: `GET /api/services/:id/reviews` (public)
   - **No export or pre-built card exists yet** (Phase 4 task: generate image card from review row)

5. **Gaps for backoffice:**
   - Reviews are per-service; no aggregation across all services of a provider (filed for Phase 5: provider-level earnings + reviews view)
   - No "export reviews as CSV" feature yet (filed: Phase 5)
   - No webhook on review creation (would be useful for social posting; filed: Phase 4 event-driven prompts)

**Citation:** `shared/schema.ts:service_reviews` (schema), `server/services/review.service.ts:createReview` (verification logic), `server/routes/content.routes.ts:GET /api/services/:id/reviews` (public endpoint).

---

### D13: Provider earnings view: what exists?

**Answer:** Provider earnings view exists and is provider-scoped.

1. **Provider earnings endpoint:**
   - `GET /api/provider/earnings` (authenticated, provider-only role check)
   - `GET /api/provider/earnings/summary` (aggregate: total held, releasable, paid_out, disputed)
   - `GET /api/provider/earnings/details` (paginated detail rows: booking id, status, amount, date)
   - Location: `server/routes/payments.routes.ts:earnings*` endpoints

2. **Earnings data source:**
   - `expert_earnings` table (unified for both roles since escrow Phase 1, migration 112): `id`, `user_id`, `booking_id`, `amount_cents`, `source` (e.g., "service_booking"), `earning_status` (held|releasable|paid_out|reversed), `available_at` (timestamp for hold window), `dispute_state`
   - Filters: `WHERE user_id = session.user_id`
   - Aggregation: `GROUP BY earning_status`, `SUM(amount_cents)`

3. **What's rendered:**
   - `client/src/pages/provider/earnings.tsx` (earnings dashboard page)
   - Shows: total held, held items (table), releasable items, paid out (history)
   - Actions: "Request Payout" button (wired, calls `POST /api/payouts/request`, awaiting Phase 2 payout self-service landing)
   - Disputes: shows disputed earnings in a separate tab

4. **Gaps for backoffice:**
   - No per-source breakdown (platform-sourced vs provider-sourced earnings not separated)
   - No date-range filter (filed: Phase 5)
   - No CSV export (filed: Phase 5)
   - No attribution field (can't see which bookings came from provider's own link) — Phase 2 builds this

**Citation:** `server/routes/payments.routes.ts:earnings*` (endpoints), `shared/schema.ts:expert_earnings` (earnings table, unified), `client/src/pages/provider/earnings.tsx` (UI).

---

### D14: Notification/messaging infra: what channels exist today?

**Answer:** Email channel exists (Resend); messaging abstraction exists but is incomplete. WhatsApp not integrated.

1. **Email channel (Resend):**
   - `server/services/email.service.ts:sendEmail(to, subject, html)`
   - Templates: `server/templates/*.hbs` (Handlebars)
   - Used by: order confirmation, password reset, service cancellation, dispute notification
   - Status: **Production-live**
   - Cost: charged per email; daily limit enforceable

2. **Messaging abstraction:**
   - `server/services/messaging.service.ts` (exists but incomplete)
   - Defines: `sendMessage(userId, channel, templateKey, data)` interface
   - Channels enum: "email" (only production-ready), "sms" (defined, not implemented), "whatsapp" (defined, not implemented)
   - Current behavior: defaults to "email", SMS/WhatsApp calls log a warning + no-op

3. **SMS (Twilio):**
   - No integration today (no TWILIO_AUTH_TOKEN in .env)
   - 10DLC requirement (US-scoped, low priority for Kyoto market)
   - Filed: Phase 2+ (after WhatsApp)

4. **WhatsApp:**
   - No Twilio Business API integration
   - No WhatsApp Cloud API integration
   - Dispatch explicitly says: "Do NOT build WhatsApp Business API / BSP integration without a separate approved brief"
   - Filed: Phase 3+ (post-MVP)

5. **Gaps for backoffice (Primitive #3 — coordination messages):**
   - No webhook on booking confirmation → auto-send confirmation message
   - No reminder job (1 day before, day-of)
   - No meeting-point routing (server-side, not client-side share)
   - **Phase 1 gap:** Wire `sendMessage(provider_id, 'email', 'booking_confirmation', bookingData)` at booking confirmation
   - Wiring messaging into the backoffice is a separate brief (coordination-messaging b1/b2)

**Citation:** `server/services/email.service.ts` (email), `server/services/messaging.service.ts` (abstraction), `server/templates/` (email templates).

---

### E15: Any existing image-generation/canvas/OG-image capability?

**Answer:** No server-side image generation capability exists.

**Checked:**
1. **Canvas libraries:** `grep -r "canvas\|sharp\|satori\|resvg" package.json package-lock.json` → **zero results**
2. **OG image generation services:** No Cloudinary, Imgix, or Similar integration in use
3. **Headless browser (Puppeteer/Playwright):** Not in production dependencies
   - **Playwright IS present** (`@playwright/test` in devDependencies for E2E testing), but `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` skips runtime browser installation
   - Could be re-enabled for image generation, but adds ~200MB overhead and runtime complexity

**Current OG image approach:**
- Static image: `https://cdn.traveloure.com/og-default.jpg` (hardcoded in `server/index.ts:185`)
- Same image for all routes

**Options for Phase 4 (asset generation):**

| Option | Pros | Cons | Recommendation |
|--------|------|------|-----------------|
| **Satori (Vercel)** | Fast, no browser, ~50KB, Replit-compatible | Need font files (add to build), no photos easily | ✅ Best for Tier 1 MVP |
| **Sharp (imagemin)** | Fast, lightweight, layer PNGs | Requires template image files, manual layout | Good for simple cards |
| **Canvas.js** | Node-native, full control | Slower, heavier, less Replit-friendly | Fallback if Satori breaks |
| **Headless Playwright** | Full browser rendering, fonts/photos native | 200MB overhead, slow, kills Replit cold-start | No; reserve for Phase 2+ |
| **Third-party API (Cloudinary, etc.)** | Offload rendering, zero infra | Adds vendor lock, latency (network), cost | Option if MVP is overloaded |

**Recommendation for Phase 4:** Use **Satori** (Vercel's library) to render a React component as an image. Template: provider photo (URL loaded via node-fetch) + service name + price + city + star rating + brand colors. Generated on-demand in the backoffice UI, cached for 24h, expired after offering changes.

**Citation:** `server/index.ts:180-195` (static OG image), `package.json` + `package-lock.json` (no canvas/sharp/satori), `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` (Playwright installed but dormant).

---

## F. Expert Side — Parallel Structure (user-requested addition)

The dispatch requires implementation for both Service Providers AND Experts. Audit findings on the expert side parallel the provider side. This section maps the backoffice primitives to the expert offering lanes.

### F1: Public expert offering surface structure (parallel to A1-A3)

**Answer:** Expert offering public pages exist in **two separate catalogs**, distinct from provider-services.

1. **Expert custom services** (now unified on `provider_services`):
   - Public page: `/services/:id` (same endpoint as provider offerings; no expert-specific URL)
   - Query: `GET /api/services/:id` filters `WHERE approval_status='approved' AND created_by_role='expert'` (implicit via `creator_id` FK)
   - Renders identically to provider offerings (no visual distinction)
   - Gate: approval-gated (§1 D1a CLAUDE.md)

2. **Expert itinerary templates** (marketplace, separate catalog):
   - Public page: `/expert-templates/:id` (distinct route, different product model)
   - Query: `GET /api/expert-templates/:id` (public endpoint, no auth)
   - Gate: `approval_status='approved' AND is_published=true` (dual gate, migration 110)
   - Renders: full itinerary (day-by-day), price, reviews, purchase CTA
   - **Note:** content-gated (full itinerary visible only to purchasers, owners, admins; public gets teaser via `redactTemplateContent`)

3. **Expert profile** (`/experts/:id`):
   - Renders: bio, rating (averaged across all services/templates), custom services tab, templates tab, reviews
   - Public: unverified experts show "New" (no fabricated ratings after §13 fixes)

**Citation:** `shared/schema.ts:provider_services` (unified, no expert_custom_services table), `shared/schema.ts:expert_templates` (marketplace, separate), `server/routes/content.routes.ts:GET /api/services/:id` and `GET /api/expert-templates/:id` (gates differ).

---

### F2: Expert offering identification (handle/slug) — parallel to A3

**Answer:** Expert has NO handle/slug field either.

**Current expert identification:**
- `users` table (expert role): `id` (PK), `email`, no slug
- URLs: `/experts/:id` (numeric id, not user-friendly)
- Expert templates: `/expert-templates/:id` (numeric, not slug)

**Gap:** Same as providers — backoffice requires `/p/{expert_handle}` and `/p/{expert_handle}/{offering-slug}`.

**Solution (Phase 1, parallel to provider work):** 
- Add `handle` to `users` table (nullable, unique, scoped by role)
- Add `slug` to both `provider_services` and `expert_templates` (nullable, unique within offering type + user)
- Routes become: `/p/{expert.handle}` (profile), `/p/{expert.handle}/{service.slug}` (custom service), `/packages/{expert.handle}/{template.slug}` (itinerary template)

**Citation:** `shared/schema.ts:users` (no handle), `shared/schema.ts:provider_services` (no slug), `shared/schema.ts:expert_templates` (no slug).

---

### F3: Expert earnings — parallel to D13

**Answer:** Expert earnings view exists, unified with provider earnings on `expert_earnings` table (escrow Phase 1).

1. **Expert earnings endpoint:**
   - `GET /api/expert/earnings` (expert-role authenticated)
   - `GET /api/expert/earnings/summary`
   - `GET /api/expert/earnings/details`
   - Location: `server/routes/payments.routes.ts` (same file as provider earnings, role-gated)
   - Data source: `expert_earnings` table (unified, migration 112)

2. **Earnings sources (expert):**
   - `source='service_booking'` (custom services, like providers)
   - `source='expert_template_sale'` (marketplace purchase, conversion to revenue after approval/publication)
   - `source='coordination_fee_credit'` (optimize fee credit applied toward coordination fee, escrow Phase 2)
   - `source='platform_revenue'` (coordination fee charged to the traveler, not expert earning)

3. **Expert-specific gaps:**
   - No per-offering breakdown (can't segment earnings by service vs template)
   - No attribution split (platform-sourced vs expert-sourced not tracked, since expert offerings were not on the provider-sourced backoffice yet)
   - **Phase 1 adds:** expert offerings route through the same backoffice as providers (short link, attribution)

**Citation:** `shared/schema.ts:expert_earnings` (unified), `server/routes/payments.routes.ts:earnings*` (expert endpoints), `server/services/commission.ts:resolveCommissionRates` (earnings calculation, no expert-specific fork).

---

### F4: Expert review system — parallel to D12

**Answer:** Expert review system exists, parallel to service reviews, reusable for share cards.

1. **Expert review data:**
   - `expert_reviews` table: `id`, `expert_id`, `traveler_id`, `rating`, `comment`, `verified`, `created_at`
   - Verification: automatic if `traveler_id` completed a `service_bookings` with the expert
   - Aggregation: `expert_offering_types.average_rating`, `review_count`

2. **Expert offerings (custom services):**
   - Reviews apply to the expert as a person (across all offerings), not per-service
   - This is a **modeling difference** vs providers (provider reviews are per-service)
   - Result: expert profiles show "Expert has 4.8★ across all services" (no per-service breakdown)

3. **Reusability:**
   - Same structure as service reviews
   - Can be rendered as expert share cards (expert photo + review quote + rating)
   - Export in Phase 5: same CSV lane as provider reviews

**Citation:** `shared/schema.ts:expert_reviews`, `server/routes/content.routes.ts:GET /api/experts/:id/reviews`.

---

### F5: Expert availability model — parallel to D11

**Answer:** Expert availability model exists but is also **not enforced at booking time**.

1. **Expert availability:**
   - `expert_offerings` (if used) carry an `availability` jsonb (weekly recurring)
   - `provider_services` (unified offering model) carries `availability` (same structure)
   - Experts can set availability on their custom services via ServiceForm

2. **Enforcement gap (same as providers):**
   - No conflict check at checkout
   - No double-booking prevention
   - **Phase 1 fix is shared:** single conflict-check logic applies to both provider and expert offerings (same table, same field)

**Citation:** `shared/schema.ts:provider_services` (availability, used by experts too).

---

### F6: Expert image-generation + social engine — parallel to E15

**Answer:** No expert-specific image generation. Social engine (Tier 1) applies to both experts and providers equally.

1. **Tier 1 Social Engine scope (same for both roles):**
   - Asset generation: ~1080×1350 + 1080×1920 images (one service card, one vertical story card)
   - Content: provider/expert photo + service name + price + city + brand frame
   - Caption: per offering type (e.g., "Book a Kyoto flower arrangement" + hashtags + link)
   - Handoff: copy to clipboard, native share sheet, WhatsApp deep link (`https://wa.me/?text=...`)

2. **Expert-specific assets:**
   - Itinerary template cards (unique to experts): day-by-day preview + price + destination
   - Review cards (both roles): review quote + rating + date

3. **No image generation infra exists for either role** (see E15; Satori recommended).

**Citation:** No expert-specific image generation code; Tier 1 specification in dispatch section 3.

---

## Summary of Audit Findings

| Category | Finding | Severity | Phase |
|----------|---------|----------|-------|
| **A1** | Public offering surfaces exist, approval-gated ✓ | Low | N/A |
| **A2** | Static OG tags only; no SSR; edge function recommended | High | Phase 1 |
| **A3** | No provider/expert handle/slug field | **High** | Phase 1 |
| **B4** | Partial source attribution (direct/cross_sell/expert_rec); no provider-sourced marker | High | Phase 2 |
| **B5** | No provider short-link infrastructure; generic redirect table reusable | High | Phase 2 |
| **B6** | No acquisition-attribution field on users | High | Phase 2 |
| **C7** | `fee_bands` ready for source dimension (additive migration) | Low | Phase 3 |
| **C8** | `resolveCommissionRates` parameterized; low impact to add source | Low | Phase 3 |
| **C9** | Booking completed status reliable for repeat-pair gating | Low | Phase 3 |
| **D10** | ServiceForm captures most requirements; handle/slug gaps | Low | Phase 1 |
| **D11** | Availability model exists but **not enforced**; double-booking possible | **High** | Phase 1 |
| **D12** | Review system verified and reusable ✓ | Low | Phase 4 |
| **D13** | Provider earnings view exists; per-source breakdown missing | Low | Phase 5 |
| **D14** | Email channel production-ready; SMS/WhatsApp absent; abstraction incomplete | High | Phase 3+ |
| **E15** | No image-generation capability; Satori recommended | Medium | Phase 4 |
| **F1-F6** | Expert side parallel; unified earnings, no duplicate review system ✓ | Low | All phases |

---

**End Phase 0 Audit — Ready for Roadmap & Approval**
