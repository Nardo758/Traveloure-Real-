# Provider Back-Office Program — Roadmap Proposal

**Date:** Jul 25, 2026  
**Status:** Proposed phases 1–5 with model-tier estimates. Awaiting roadmap approval before Phase 1 execution.

---

## Program Priorities & Sequencing

The five primitives ranked by provider pain (dispatch §2):
1. One link that books and pays (checkout + calendar)
2. Availability that prevents double-booking
3. Automated coordination (messaging)
4. Review capture and reuse (share cards)
5. A money record (earnings view — already exists)

**Sequencing rationale:** Phases 1–3 build the core backoffice (link, availability, attribution, payments). Phases 4–5 build the social engine and analytics (proof content, performance data).

---

## Phase 1 — Public Backoffice Pages (Primitives #1–2 foundation)

**Goal:** Providers and experts get `/p/{handle}` + `/p/{handle}/{offering-slug}` pages — a checkout with a calendar, SSR/link-preview-ready, with custody labeling. Block double-booking at checkout. Approve/publish discipline enforced.

### Scope

1. **Schema changes:**
   - Add `handle` column to `users` table (VARCHAR UNIQUE, nullable)
   - Add `slug` column to `provider_services` table (VARCHAR, unique within `user_id`)
   - Add `slug` column to `expert_templates` table (VARCHAR, unique within `user_id`)
   - Migration: additive-nullable, idempotent, no CHECK (migration-safe)
   - Backfill: generate slugs from title (URL-safe: lowercase, trim, hyphenate spaces) for existing offerings; handle backfill deferred (only new signups get handles)

2. **Public provider/offering pages:**
   - `/p/:handle` → redirects to provider profile (OR shows aggregated offerings list)
   - `/p/:handle/:offering-slug` → service booking page (checkout form + calendar)
   - `/p/:handle/packages/:template-slug` → expert template detail page
   - Client routes: new component `ProviderPublicProfile.tsx`, new component `OfferingPublicCheckout.tsx`

3. **SSR + OG tags (link preview):**
   - Implement edge-function solution (Option A from A2 audit)
   - Routes intercepted at edge: `/p/:handle`, `/p/:handle/*`
   - OG data resolved: offering title, description, price, provider name, teaser image
   - Fallback: static title if edge function fails (graceful degradation)

4. **Double-booking prevention:**
   - `POST /api/checkout` adds conflict check:
     ```sql
     SELECT COUNT(*) FROM service_bookings 
     WHERE service_id=:serviceId AND booking_start < :end AND booking_end > :start 
     AND status IN ('confirmed','completed')
     ```
   - If count > 0: return 409 (conflict), client re-prompts
   - Repeat check at `POST /api/checkout/confirm` (TOCTOU guard)

5. **Custody labeling:**
   - Platform merchant (Traveloure is the seller):
     - All platform-sourced bookings (via Discover, expert rec)
     - Full refund via Traveloure (stripe refund issued by platform)
     - Language: "Refundable through Traveloure"
   - Provider-sourced bookings (via provider's short link):
     - Provider is the merchant (customer relationship with provider)
     - Refund policy dictated by provider
     - Language: "Contact [provider name] directly"
     - **Custody determined server-side at checkout from attribution source**
   - Render custody label on the booking detail page + confirmation email

6. **Approval lifecycle enforcement:**
   - Public `/p/:handle/:offering-slug` renders only if `approval_status='approved'`
   - `/p/:handle` (profile) shows only approved offerings
   - Provider console `/expert/services` (owner view) shows draft/submitted/approved
   - No approved-bypass (no "preview as published" for drafts)

### Files Touched

**Schema:** `shared/schema.ts` (add handle, slug columns + indexes)  
**Migration:** `server/migrations/13x_backoffice_phase1_schema.sql` (additive-nullable)  
**Client routes:** `client/src/App.tsx` (register new routes)  
**Client components:** 
- `client/src/pages/provider/public-profile.tsx` (new)
- `client/src/pages/provider/offering-checkout.tsx` (new, wraps existing checkout logic)
- `client/src/components/OGTagRenderer.tsx` (new, SSR support if edge function)

**Server routes:**
- `server/routes/provider.routes.ts` (new `GET /p/:handle/:offering-slug` — public)
- `server/routes/content.routes.ts` (extend existing offering endpoint with slug support)

**Server services:**
- `server/services/booking-actions.service.ts` (add conflict check)
- `server/services/edge-function.service.ts` (new, OG tag hydration — optional if edge middleware is used instead)

### Migration Plan

| Step | Command | Notes |
|------|---------|-------|
| 1 | Add columns to schema + migration file | Additive-nullable, no defaults, no CHECK |
| 2 | Generate slugs for existing rows | Background job (idempotent, safe to re-run) |
| 3 | Add indexes on (user_id, slug) | Performance for lookups |
| 4 | Backfill `acquired_via_provider_id` on users | Deferred (Phase 2), set NULL for now |
| 5 | Deploy migration | Run at startup; idempotent `DO / EXCEPTION` pattern |

### Verification Gates

**tsc + build:** Must stay at baseline (no new errors)  
**Grep gates:**
- No literal custody strings: `grep -r "Refundable through Traveloure\|Contact.*directly" client/ server/ --include=*.ts --include=*.tsx` → zero matches (use `getCustodyLabel(source)` function)
- No hardcoded provider paths: `grep -r "/p/" client/ server/ --include=*.ts | grep -v "routes\|test" → zero matches (use route builder function)

**Behavioral:**
1. Provider signs up, creates offering, submits → offering is draft (not public)
2. Admin approves offering → `/p/{handle}/{slug}` becomes accessible, OG tags show offering title/price
3. Unauthenticated user clicks the link, sees offering details + calendar
4. Clicks checkout → calendar conflict check fires (409 if double-booked), resolves to provider-sourced rate
5. Completes checkout → ownership transfer (provider+traveler matched)
6. Custody label on detail page matches source (provider-sourced → "Contact [provider]")

**Neutrality check (deferred to Phase 3):** Existing platform-sourced bookings resolve to identical rates (run after Phase 3 fee changes land).

**Migration rollback:** Rollback removes new columns (data preserved in migration backup; handle/slug loss acceptable since data is regenerable).

### Model-Tier Estimate

**Fable 5** — Recommended  
- Edge function + OG hydration logic requires careful SSR reasoning
- Conflict checking involves state-machine thinking (TOCTOU guard pattern)
- Custody labeling touches payment semantics

**Why not Haiku/Sonnet:** Routing changes + SSR are system-architecture concerns, not mechanical builds.

---

## Phase 2 — Attribution Infrastructure (Primitive #1 completion)

**Goal:** Provider short links → `/p/{handle}/{slug}` → checkout → server-side attribution capture → `acquired_via_provider_id` on users. Repeat-pair detection enabled.

### Scope

1. **Schema changes:**
   - Add `provider_id` FK to `service_bookings` (VARCHAR, nullable)
   - Add `acquired_via_provider_id` FK to `users` (nullable, FK → `service_providers`)
   - Add `campaign_id` VARCHAR to `service_bookings` (nullable, for future social campaigns)
   - Migration: additive-nullable, backfill null (no historic data to remap)

2. **Short-link generation:**
   - Extend `redirects` table with `provider_id`, `offering_id` (nullable), `campaign_id` (nullable)
   - New service: `shortLinkService.generateProviderLink(provider_id, offering_id?, campaign_id?)`
   - Returns: `tvl.to/{code}` or similar (platform domain TBD; use existing redirects table capacity)
   - Call site: provider settings page, offering detail page (copy link button)

3. **Link resolution at checkout:**
   - New middleware/route: `GET /r/:code` (or path-based equivalent)
   - Resolves: `SELECT provider_id, offering_id, campaign_id FROM redirects WHERE code=:code`
   - Sets session context: `session.attributionContext = { providerId, offeringId, campaignId }`
   - Redirects to: `/p/{provider.handle}/{offering.slug}` (or checkout page directly)
   - **Never returns URL to client** (custody rule: attribution stays server-side)

4. **Attribution capture at checkout:**
   - `POST /api/checkout` reads `session.attributionContext` (never `req.body`)
   - Sets: `source='provider_sourced'`, `provider_id={resolvedProviderId}`, `campaign_id={resolvedCampaignId}`
   - Sets: traveler signup capture (if first-time user) `users.acquired_via_provider_id = providerId`

5. **Repeat-pair detection:**
   - Before rate resolution: query `SELECT COUNT(*) FROM service_bookings WHERE traveler_id=:travelerId AND provider_id=:providerId AND status='completed'`
   - If count > 0: override source to `'provider_sourced'` (rails rate applies, even if platform-sourced)

6. **Signup flow update:**
   - Signup endpoint (`POST /auth/signup`) accepts optional `?ref=provider_id` (query param, URL-trusted, NOT body-trusted)
   - Validates: `provider_id` exists and is active
   - Writes: `users.acquired_via_provider_id = provider_id`
   - **NOT a high-friction affiliate system** — optional, no signup incentive, just tracking

### Files Touched

**Schema:** `shared/schema.ts` (service_bookings: add provider_id, campaign_id; users: add acquired_via_provider_id)  
**Migration:** `server/migrations/13x_backoffice_phase2_attribution.sql`  
**Services:**
- `server/services/short-link.service.ts` (new, generateProviderLink)
- `server/services/booking-actions.service.ts` (add repeat-pair detection before rate resolution)

**Server routes:**
- `server/routes/redirects.routes.ts` (extend GET /r/:code to handle provider attribution)
- `server/routes/auth.routes.ts` (extend signup to accept ?ref and capture acquired_via_provider_id)
- `server/routes/provider.routes.ts` (new endpoint: POST /api/provider/short-link to generate link on-demand)

**Client components:**
- `client/src/pages/provider/settings.tsx` (add "Copy provider link" action)
- `client/src/pages/provider/offering.tsx` (add "Share" button → generate link → copy)

### Verification Gates

**tsc + build:** Baseline maintained

**Grep gates:**
- No client-supplied source: `grep -r "req.body.source\|req.body.provider_id\|req.body.acquired_via" server/routes/ --include=*.ts` → zero matches
- Attribution derived server-side only: `grep -r "session.attributionContext\|resolvedProviderId" server/routes/payments.routes.ts` → present
- No hardcoded provider links: `grep -r "tvl\.to/\|/r/" client/ --include=*.ts | grep -v "route\|test" → zero matches

**Behavioral:**
1. Provider generates short link via settings → receives `tvl.to/abc123`
2. Shares link on Instagram → traveler clicks
3. Server resolves code to `provider_id=X, offering_id=Y`
4. Checkout shows offering from provider X
5. Checkout resolves rate as `provider_sourced` (rail rate ~8%)
6. Booking created with `provider_id=X, source='provider_sourced'`
7. If traveler is new: `users.acquired_via_provider_id = X`
8. If traveler previously booked provider X: rate still `provider_sourced` (repeat-pair rule fires)
9. If traveler previously booked provider Y (different): this booking is provider_sourced (no cross-provider repeat rule)

**Repeat-pair proof:**
- Traveler A books Provider X via link (platform-sourced originally) → completed
- Traveler A books Provider X again via Discover (platform-sourced) → repeat-pair rule fires → rails rate applied (earnings diff verifiable)

### Model-Tier Estimate

**Sonnet** — Recommended  
- Repeat-pair detection is a straightforward query
- Attribution capture is mechanical (read session, write columns, validate)
- Short-link generation is standard CRUD

**Why not Haiku:** Session/context handling in middleware is detail-oriented but not Haiku-scale.

---

## Phase 3 — Fee Architecture Update (Primitive #1 completion, money-path)

**Goal:** `fee_bands` gains source dimension. `resolveCommissionRates` reads source. Repeat-pair rule enforced. Neutrality proof run. **HARD STOP for human read before merge.**

### Scope

1. **Schema change:**
   - Add `source_type` VARCHAR to `fee_bands` (nullable, "platform_sourced" | "provider_sourced" | NULL)
   - Migration: additive-nullable, no CHECK, idempotent
   - Seed: create platform-sourced band with existing rate; create provider-sourced band with ~8% target rate (admin-editable)

2. **Fee resolution update:**
   - `resolveCommissionRates(offeringKey, serviceType, source)` reads `source_type` when matching band
   - Lookup becomes: `WHERE (source_type IS NULL OR source_type = :source) AND …`
   - NULL source matches all (backward-compat)
   - Result: two paths with potentially different rates (platform=25%, provider=8%)

3. **Repeat-pair integration:**
   - Called at checkout **before** rate resolution
   - If `wasCompletedBookingForPair(traveler_id, provider_id)` = true:
     - Override source to `'provider_sourced'` (rails rate applies)
     - Rationale: remove gaming incentive; repeat pairs always on rails rate

4. **Neutrality proof (critical):**
   - Seeded test data: provider X with 5 platform-sourced bookings (completed)
   - Verify: all 5 resolve to platform rate (25%) pre-Phase3, post-Phase3
   - New booking of provider X via Discover (platform-sourced) → rate = 25% (unchanged)
   - New booking of provider X via provider link (provider-sourced) → rate = 8% (rail rate, changed per spec)
   - Script: `scripts/verify-phase3-fee-neutrality.ts`
     - Pre-run: `npm run build && node scripts/verify-phase3-fee-neutrality.ts --prePhase3`
     - Post-run: `node scripts/verify-phase3-fee-neutrality.ts --postPhase3`
     - Diff: should show zero rate changes for platform-sourced, 8% for provider-sourced

5. **Money-path compliance:**
   - §14: amount derived server-side (existing checkout logic, no client-trusted amounts)
   - §15: idempotency key + atomic status claim (existing from Phase 1+)
   - No fee literals: all rates in `fee_bands`, grep-gated

### Files Touched

**Schema:** `shared/schema.ts` (feeBands: add sourceType)  
**Migration:** `server/migrations/13x_backoffice_phase3_fee_bands.sql`  
**Services:**
- `server/services/commission.ts` (resolveCommissionRates: add source parameter)
- `server/services/booking-actions.service.ts` (repeat-pair query + override at checkout)

**Server routes:**
- `server/routes/payments.routes.ts` (checkout: pass source to resolveCommissionRates)

**Scripts:**
- `scripts/verify-phase3-fee-neutrality.ts` (new, behavioral proof)

### Verification Gates

**tsc + build:** Baseline maintained

**Grep gates:**
- No fee literals: `grep -r "['\"]0\.08\|['\"]0\.25\|['\"]8%\|rate.*=.*[0-9]" server/services/commission.ts server/routes/ --include=*.ts` → zero matches outside fee_bands
- Source is server-derived: `grep -r "req.body.source.*rate\|req.body.fee\|req.body.commission" server/routes/payments.routes.ts` → zero matches
- Repeat-pair check present: `grep -r "wasCompletedBookingForPair" server/routes/payments.routes.ts` → present

**Behavioral (critical):**
1. Provider X with 5 completed bookings pre-Phase3
2. Book provider X platform-sourced post-Phase3 → same rate as pre-Phase3 (25%)
3. Book provider X provider-sourced (new) → 8% rate (verifiable earnings diff)
4. Book provider X again (repeat pair) → 8% rate (rails rate, not platform rate, regardless of source)
5. Admin changes `fee_bands` provider-sourced rate to 10% → next booking reflects 10% (not cached)

**Neutrality proof script must pass both directions** before the phase can merge.

### Model-Tier Estimate

**Fable 5** — Required  
- Money-path changes always need top-tier review
- Neutrality proof requires careful test design (state machine, rate comparison)
- Fee-resolution changes touch payment custody logic

**Money-path HARD STOP:** After this phase passes all gates, push the branch and await human read of the diff. Explicitly review:
- Which rows write to which tables and when
- Fee calculation logic (no literals, fee_bands-sourced)
- Repeat-pair override logic
- Neutrality proof results

---

## Phase 4 — Share Asset Generation + Social Engine Tier 1

**Goal:** Providers/experts tap "Share" → auto-generate card image (service + price + photo + brand) → copy caption → WhatsApp deep-link. Event-driven posting prompts (filed for Phase 5).

### Scope

1. **Asset generation service:**
   - New service: `server/services/share-asset-generator.service.ts`
   - Generates two images:
     - 1080×1350 (Instagram feed square)
     - 1080×1920 (Instagram story vertical)
   - **Template:** provider/expert photo + service name + price + city + brand frame (colors from `platform_settings`)
   - **Tech:** Satori (Vercel's React → PNG library, lightweight, Replit-compatible)
   - **Caching:** generated images cached for 24h in-memory (invalidated on offering change)
   - **Error handling:** if Satori fails, return graceful fallback (brand colors only, no photo) — §13 (never fabricate)

2. **Asset endpoint:**
   - `POST /api/backoffice/share-asset` (authenticated, provider/expert)
   - Input: `{ serviceId, offering_type }`
   - Output: `{ imageUrls: [feed_1080x1350, story_1080x1920], caption }`
   - Endpoint also returns: `shortLink` (from Phase 2 logic)

3. **Caption generation:**
   - Per offering type (service type, delivery method, event type for experts)
   - Template examples:
     - Service: "Book a {service} in {city}. {hashtagsPerCategory} {link}"
     - Template: "Plan your {event} in {city}. {hashtagsPerEvent} {link}"
   - Hashtags: from a configurable map (`platform_settings` table, seeded per market)
   - **No hardcoded text** (grep-gated)

4. **UI integration:**
   - New "Share" button on provider offering detail (backoffice + public page)
   - New "Share" section on provider dashboard
   - Click → fetches asset + caption → native share sheet (mobile) or copy-to-clipboard (desktop)
   - Deep-link option: pre-fill WhatsApp message with caption + link

5. **Social posting occasions (Tier 1 only, event-triggered):**
   - "New 5★ review" → prompt to share the review card
   - Implementation: `POST /api/backoffice/share-review` (same asset-gen pattern, review quote + rating)
   - "Last-minute slot" → prompt + gap-fill price (filed for Phase 5, complexity of dynamic pricing integration)
   - **Scope: Tier 1 = hand-off only; no OAuth auto-post** (Tier 2 deferred)

### Files Touched

**Services:** `server/services/share-asset-generator.service.ts` (new)  
**Routes:** `server/routes/provider.routes.ts` (new POST /api/backoffice/share-asset + share-review endpoints)  
**Client components:**
- `client/src/components/ShareAssetButton.tsx` (new)
- `client/src/pages/provider/backoffice.tsx` (add share section)

**Dependencies:** `satori` (npm install)

### Verification Gates

**tsc + build:** Baseline maintained; new service types checked

**Grep gates:**
- No hardcoded captions: `grep -r "Book a\|Plan your" server/ client/ --include=*.ts --include=*.tsx | grep -v config\|template\|map` → zero matches (use `getCaptionTemplate(offering_type)` function)
- No hardcoded hashtags: `grep -r "#kyoto\|#wedding\|#experience" server/ client/ --include=*.ts | grep -v test\|config\|mock` → zero matches
- Asset generation is lazy (on-demand, not pre-computed): `grep -r "generateAsset.*setInterval\|cron" server/services/share-asset-generator.ts` → zero matches (no background job unless Phase 5 files)

**Behavioral:**
1. Provider opens backoffice, clicks "Share service"
2. Asset generator fetches service details + photo
3. Generates 1080×1350 + 1080×1920 PNGs with service name, price, city
4. Returns caption pre-written (e.g., "Book a Kyoto flower arrangement #kyoto #local #flowers {link}")
5. Copy button → copied to clipboard
6. Share button → native sheet (mobile) or WhatsApp deep-link
7. New 5★ review arrives → notification + "Share review?" prompt
8. Click → asset generator creates review card (expert/provider photo, review quote, 5★ rating, date)
9. Share → same flow

**No OAuth, no auto-post** — Tier 1 is manual. Tier 2 (auto-post) is deferred.

### Model-Tier Estimate

**Sonnet** — Recommended  
- Asset generation is mechanical (data fetch + Satori render)
- Caption templating is straightforward (config-driven)
- No complex state machine or money-path reasoning needed

**Why not Haiku:** Satori integration + error handling for image generation adds enough nuance that Sonnet is safer.

---

## Phase 5 — Provider Analytics + Event-Driven Posting

**Goal:** Provider dashboard shows link performance (views, clicks, bookings, earnings). Event-driven posting prompts surface in the backoffice ("3 empty slots, 1 new review — post now?"). Archive review cards and earnings exports.

### Scope

1. **Analytics dashboard:**
   - `GET /api/backoffice/analytics` (authenticated, provider/expert)
   - Aggregates over last 7/30/90 days:
     - Short link: views (tracked via redirect), clicks (checkout initiated), conversions (completed bookings)
     - Earnings: total, platform-sourced vs provider-sourced split, held/releasable/paid_out breakdown
     - Trending: which offerings are booking most
   - Endpoint returns: time-series data (daily bucketed) for charting
   - UI: `client/src/pages/provider/analytics.tsx` (charts via Recharts or similar)

2. **Analytics data capture:**
   - New table: `link_analytics` (redirect_code, date, view_count, click_count, booking_count)
   - Populated by daily job: aggregate `redirects.created_at`, `service_bookings.source + provider_id`, `affiliate_clicks` (if relevant)
   - Queries are read-only; no new write paths

3. **Event-driven posting prompts (social engine occasion surface):**
   - New UI section: "Posting Opportunities" on the backoffice dashboard
   - Triggered by:
     - **New 5★ review** → "Share your review!" (asset already generated in Phase 4)
     - **Empty slots upcoming** → "3 spots available next week — share a last-minute deal?" (requires dynamic pricing integration, deferred if complex)
     - **Seasonal opportunity** → "Cherry blossoms starting! Share a cherry-blossom experience" (template per city/season, seeded in `platform_settings`)
   - **No auto-posting** (Tier 2 deferred)

4. **Exports:**
   - `GET /api/backoffice/earnings/export` → CSV (date, booking, status, amount, source)
   - `GET /api/backoffice/reviews/export` → CSV (date, reviewer, rating, comment, verified)
   - Used for tax/accounting/record-keeping (business formalization value)

5. **Analytics schema (minimal):**
   - `link_analytics`: redirect_code FK, date, view_count, click_count, completed_booking_count
   - No new columns on existing tables (backward-compat)
   - Backfill: compute from redirects/service_bookings for 90 days back (one-time)

### Files Touched

**Schema:** `shared/schema.ts` (add link_analytics table)  
**Migration:** `server/migrations/13x_backoffice_phase5_analytics.sql`  
**Services:**
- `server/services/analytics.service.ts` (new, aggregate endpoint logic)
- `server/services/posting-prompt.service.ts` (new, event-driven occasion surface)

**Server routes:**
- `server/routes/provider.routes.ts` (extend with GET /api/backoffice/analytics, /earnings/export, /reviews/export)

**Scripts:**
- `scripts/daily-link-analytics.ts` (new, daily aggregation job)

**Client components:**
- `client/src/pages/provider/analytics.tsx` (new)
- `client/src/pages/provider/backoffice.tsx` (add posting-opportunities section)

### Verification Gates

**tsc + build:** Baseline maintained

**Grep gates:**
- No hardcoded analytics queries: `grep -r "SELECT.*redirects\|SELECT.*service_bookings" server/services/analytics.ts` → present (no dynamic SQL injection)
- Event-triggered prompts use configs: `grep -r "cherry\|empty\|slots" server/ client/ --include=*.ts | grep -v config\|template\|test` → zero matches (use `getPostingPrompts(provider_id, context)` function)

**Behavioral:**
1. Provider views analytics dashboard → sees 100 link views, 15 clicks, 3 completed bookings in last week
2. Earnings breakdown: 2 platform-sourced (25% commission), 1 provider-sourced (8% commission) → verifiable earnings diff
3. Posting opportunity: "You got a new 5★ review! Share it?" → click → review card asset + caption
4. Export earnings → CSV with all bookings, status, amounts
5. Analytics updates daily (overnight job aggregates redirect/booking data)

### Model-Tier Estimate

**Haiku** — Recommended  
- Analytics aggregation is straightforward queries + summation
- Event-driven prompts are configuration-driven (no complex logic)
- Export is mechanical CSV generation

**Why Haiku:** No money-path changes, no state-machine reasoning, no architectural decisions. Pure data-plumbing phase.

---

## Summary: Phase Dependencies & Timeline

```
Phase 1 (Schema + SSR + Double-Book Check)
    ↓
Phase 2 (Attribution + Short Links)
    ↓
Phase 3 (Fee Bands + Repeat-Pair) ← MONEY-PATH, HARD STOP
    ↓
Phase 4 (Asset Gen + Share) ← Parallel with Phase 3 OK (no dependency)
    ↓
Phase 5 (Analytics + Prompts)
```

**Sequential phases:** 1 → 2 → 3 (blocking money decision) → 4/5 parallel  
**Critical stop:** Phase 3 merge requires human read; Phase 1 must land before Phase 2; Phase 2 must land before Phase 3 works

---

## Model-Tier Recommendations by Phase

| Phase | Tier | Rationale | Est. LOC | Duration |
|-------|------|-----------|---------|----------|
| 1 | **Fable 5** | SSR + state machine (TOCTOU) | 200-250 | 2–3d |
| 2 | **Sonnet** | Mechanical attribution capture | 150-200 | 1–2d |
| 3 | **Fable 5** | Money-path, repeat-pair logic | 100-150 | 1-2d + human read |
| 4 | **Sonnet** | Asset generation (Satori) | 120-180 | 1-2d |
| 5 | **Haiku** | Analytics + config-driven prompts | 100-150 | 1d |

**Total (all phases):** ~1000-1100 LOC, ~7-10 working days (sequential blocking on Phases 1, 2, 3).

**Budget estimate (token cost):**
- Phase 1: ~40-50k tokens (Fable, complex reasoning)
- Phase 2: ~20-25k tokens (Sonnet, mechanical)
- Phase 3: ~25-30k tokens (Fable, money-path) + human review overhead
- Phase 4: ~15-20k tokens (Sonnet, asset gen)
- Phase 5: ~10-12k tokens (Haiku, analytics)

**Total:** ~110-137k tokens (within typical session budgets if run as separate Phase briefs).

---

## Risk & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Handle/slug collisions | Medium | Unique constraint at DB; client warns on duplicate |
| OG tag crawl latency (edge function) | Low | Fallback to static tags; edge function is optional infra |
| Double-booking race (TOCTOU) | Medium | Repeat check at both checkout + confirm; atomic status claim |
| Fee resolution regression | High | Phase 3 neutrality proof + tsc + grep gates |
| Repeat-pair over-triggering (false positives) | Medium | Proof: only 2nd+ booking of same traveler×provider pair |
| Asset generation fallback (Satori fails) | Low | Graceful: return fallback brand card, never fabricate |
| Analytics backfill completeness | Low | One-time compute from existing data; schema is append-only |

---

## Out-of-Scope (Filed in FOLLOWUPS.md)

- Multi-staff scheduling (v2)
- Dynamic per-date pricing (filed for Phase 2 follow-up)
- WhatsApp Business API / SMS (separate brief)
- Tier 2 social auto-posting (OAuth/Instagram API/TikTok, deferred)
- Cross-booking referral payout (filed for post-Phase 2 flywheel analysis)
- Provider-to-expert earnings split (multi-role offering, v2)

---

**End Roadmap Proposal — Ready for Approval**
