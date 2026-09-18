-- Migration 313: THE PLATFORM'S OWN BOOKING CONCIERGE LISTING — where no expert offers one.
--
-- Ledger `2026-09-18-platform-concierge-listing`. CLAUDE.md Locked Decision 51 (decision-maker
-- ratified 2026-09-18): the platform may itself offer Booking Concierge in every market. Three
-- ratified choices, all landed in this ONE data-only migration:
--   (1) MECHANISM — seed an approved `local_expert_forms` row for a reserved platform account
--       naming all 8 operating markets, reusing the two LIVE gates
--       (`GET /api/experts`'s location filter, `server/services/lead-routing.service.ts`'s
--       scorer — both `INNER/LEFT JOIN local_expert_forms` already) with NO new bypass
--       predicate and no `expert_neighborhoods` touch of any kind (that table governs a
--       DIFFERENT surface — see `docs/design/PLATFORM_CONCIERGE_LISTING_BRIEF.md` §1's
--       correction to migration 065's own "market-scoped via expert_neighborhoods" comment,
--       which was the migration's stated INTENT, never the live code path — annotated below,
--       not rewritten, per §13/ledger posture on a superseded comment).
--   (2) MONEY — no split for the platform-owned listing: the Booking Concierge facilitation
--       fee's expert share is skipped at the ONE completion-mint site
--       (`storage.mintCompletionEarningsForBooking`) when the listing's owner is this account —
--       100% of the fee stays platform revenue. Enforced in code (`server/storage.ts`), not by
--       this migration; this migration only creates the account the code check reads.
--   (3) RANKING — the platform's `local_expert_forms` row carries NO specialties and NO
--       `expert_requests` history, so it clears the scorer's existing floor (specialty score 10,
--       availability 20, response-rate 8 with no history) rather than a fabricated tie-break — a
--       real, responsive expert's Booking Concierge listing in the same market outranks it on
--       the SAME merits the scorer already measures. No new column, no new comparison.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE RESERVED ACCOUNT
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE `users` row, fixed uuid-shaped id (so `platform-concierge.service.ts` and every fixture can
-- name it without a lookup), never a login: `password` NULL (the password-auth path requires a
-- hash to authenticate — a NULL password cannot pass it), `email` on a domain this platform
-- controls and never delivers to, `role='local_expert'` — deliberately the MOST GATED role, not
-- an exemption, so this account clears the exact SECURITY GATE every real local expert clears
-- (`storage.getExpertsWithProfiles`'s `expertForm?.status === 'approved'` check) rather than
-- being special-cased around it. `handle` is claimed directly at seed time (this is not a login
-- account, so LD 40's "handles are claimed" banner flow does not apply) so every public card/link
-- resolves through `/s/:handle`, never `/experts/:id` — LD 40's own posture applied to an account
-- that will never claim its own handle through the ordinary flow.
--
-- Idempotent: `ON CONFLICT (id) DO NOTHING`. The id is the natural key here (chosen by this
-- migration, not derived from the email), so a re-run — or an environment where the row already
-- exists from a prior partial apply — inserts nothing a second time.
INSERT INTO users (id, email, password, first_name, last_name, role, handle, created_at, updated_at)
VALUES (
  '00000000-0000-4000-a000-0000636e6367',
  'concierge@traveloure.internal',
  NULL,
  'Destination Concierge',
  NULL,
  'local_expert',
  'traveloure-concierge',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- `platform_settings`: THE ONE FACT — which user id is the platform account
-- ─────────────────────────────────────────────────────────────────────────────
-- Read by `server/services/platform-concierge.service.ts` (`getPlatformConciergeUserId`) — the
-- ONE helper both money-path call sites (`storage.mintCompletionEarningsForBooking`,
-- `concierge-handoff.service.ts`) read, rather than each hardcoding this id (§18 rule 1).
-- `ON CONFLICT (setting_key) DO NOTHING` — read-only after seeding; an admin changing WHICH
-- account is the platform concierge is a deliberate, separate operation this migration does not
-- perform.
INSERT INTO platform_settings (setting_key, setting_value, description, updated_by)
VALUES (
  'platform_concierge_user_id',
  '00000000-0000-4000-a000-0000636e6367',
  'Locked Decision 51 / migration 313: the reserved platform account that owns the fallback Booking Concierge listing in every operating market where no expert offers one. Read via server/services/platform-concierge.service.ts:getPlatformConciergeUserId(), never hardcoded a second place.',
  'migration-313'
)
ON CONFLICT (setting_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- `local_expert_forms`: THE SURFACING MECHANISM — an approved, all-market form row
-- ─────────────────────────────────────────────────────────────────────────────
-- `destinations` is the 8 `OPERATING_MARKETS` city names, spelled out here because this file
-- cannot import `shared/operating-markets.ts` at migration time. Authority: that module's
-- `OPERATING_MARKET_CITY_NAMES` — kept equal to this literal by
-- `server/__tests__/platform-concierge-listing.db.test.ts` F6, which fails the build the day one
-- list drifts from the other. `specialties` is deliberately `[]` (ranked choice 3 above — no
-- specialty score to inflate the platform row); `stripe_connect_status` is left at its column
-- DEFAULT `'not_started'`, which BOTH live gates already treat as passing (`lead-routing`'s
-- `WHERE lef.stripe_connect_status IS NULL OR != 'restricted'`; `/api/experts` reads no Connect
-- column at all). `status='approved'` — born approved by a MIGRATION, the same authority that
-- seeds `expert_offering_types` (065) and `market_geography`/`city_neighborhoods` (LD 20), never
-- by a client wizard (F2's hole was a CLIENT path reaching `approval_status`; nothing here does).
--
-- Idempotent: `ON CONFLICT (id) DO NOTHING` on a fixed id — `local_expert_forms.user_id` carries
-- no UNIQUE constraint (a real applicant's re-submission legitimately produces more than one row
-- per user over time), so the fixed PRIMARY KEY id is this seed's own idempotency key, exactly the
-- same shape the `users`/`provider_services` inserts above and below use.
--
-- ANNOTATION on migration 065's own comment (§13 — a superseded comment is annotated, never
-- rewritten): 065's "market-scoped via expert_neighborhoods" line describes 065's STATED INTENT
-- at the time, not a live code path — no route or service that surfaces or ranks a
-- `booking_concierge` listing has ever read `expert_neighborhoods` (that table is Locked
-- Decision 27's ratified-claim-only surface, gating a DIFFERENT feature: the city-page "one local
-- expert per neighborhood" card and upsell endorsements). See the annotation added directly on
-- 065's comment block below this migration in the same commit.
INSERT INTO local_expert_forms (
  id, user_id, expert_type, first_name, last_name, email,
  display_name, headline, destinations, specialties, languages,
  status, stripe_connect_status, offering_type_key, created_at
)
VALUES (
  '00000000-0000-4000-b000-0000636e6367',
  '00000000-0000-4000-a000-0000636e6367',
  'local_expert',
  'Destination',
  'Concierge',
  'concierge@traveloure.internal',
  'Destination Concierge — powered by local experts',
  'Booking Concierge, everywhere we operate',
  '["Kyoto","Goa","Mumbai","Jaipur","Edinburgh","Porto","Bogotá","Cartagena"]'::jsonb,
  '[]'::jsonb,
  '["English"]'::jsonb,
  'approved',
  DEFAULT,
  'booking_concierge',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- `fee_bands`: the platform listing's OWN sale price (facilitation-fee base per Locked Decision
-- 51's rate/cap — `commission.ts`'s `getConciergeBookingRate`/`getConciergeBookingCap` multiply a
-- BOOKING CONCIERGE LINE'S OWN `provider_services.price`, not the underlying partner item's price;
-- see `server/routes/payments.routes.ts` lines building `conciergeFeeAmt` from the cart line's own
-- `price`). Admin-editable (§8 — never a literal in application code); seeded here as a plain
-- migration DATA value, the SAME pattern migration 311(c)'s `0.75` split literal uses. `flat`
-- rate_type — a dollar amount, not a fraction.
--
-- DELIBERATELY NOT DECLARED in `server/services/fee-band-requirements.ts` — no resolver reads
-- this band at request time (it seeds a static `provider_services.price` column ONCE, here, the
-- same way any provider sets their own listing price; nothing re-resolves it live). This is the
-- SAME posture `fee-band-admin-guards.test.ts` D4/D4b already rule for the two retired
-- `concierge:booking_*` duplicates: a seeded-but-unread band is correctly left undeclared, and
-- declaring one with an invented "resolver" would be the dishonest reverse of that (§13).
INSERT INTO fee_bands (band_key, rate_type, default_rate, description, is_active)
VALUES (
  'platform_concierge_booking_listing_price',
  'flat',
  25.00,
  'Locked Decision 51 / migration 313: list price of the platform-owned Booking Concierge listing shown where no expert offers one in a market. Seeds provider_services.price for that ONE listing at migration time — admin-editable by editing this row and the listing directly; no live resolver reads it (fee-band-admin-guards D4/D4b posture).',
  true
)
ON CONFLICT (band_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- `provider_services`: THE ONE LISTING
-- ─────────────────────────────────────────────────────────────────────────────
-- `approval_status='approved'`, `created_via='seed'` (the existing app-enforced provenance
-- vocabulary already carries this value — `shared/schema.ts`) — born approved by this migration,
-- never by a client wizard (F2 is unaffected: see the note above). `expert_offering_type_key`
-- names the SAME `booking_concierge` row migration 065 seeded into `expert_offering_types` — the
-- listing's own statement of what it sells (migration 292's canonical key column), read by
-- `server/services/booking-concierge.service.ts`'s `resolveBookingConciergeItems`, the ONE
-- predicate every money surface calls. `delivery_method='async_messaging'` — one of the canonical
-- 7 (CLAUDE.md Locked Decision 3): this is an off-site facilitation, not an in-person meeting.
--
-- Idempotent: `ON CONFLICT (id) DO NOTHING` on a fixed id (the natural key for a singleton seeded
-- listing — one platform account owns at most one platform-wide fallback listing, so there is no
-- other column this migration could sensibly key a conflict target on).
INSERT INTO provider_services (
  id, user_id, service_name, short_description, description,
  service_type, price, price_type, delivery_method,
  status, approval_status, expert_offering_type_key, created_via
)
VALUES (
  '00000000-0000-4000-c000-0000636e6367',
  '00000000-0000-4000-a000-0000636e6367',
  'Booking Concierge',
  'We''ll book this off-site item and add it to your trip.',
  'The platform''s own Booking Concierge, offered in every market where no local expert has listed one. A traveler''s plan items get handed to our booking-agent queue and facilitated the same way a local expert''s Booking Concierge listing would be.',
  'concierge',
  (SELECT default_rate FROM fee_bands WHERE band_key = 'platform_concierge_booking_listing_price'),
  'fixed',
  'async_messaging',
  'active',
  'approved',
  'booking_concierge',
  'seed'
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN local_expert_forms.destinations IS
  'For the platform-owned Booking Concierge row (migration 313, id 00000000-0000-4000-b000-0000636e6367): the 8 OPERATING_MARKETS city names, kept equal to shared/operating-markets.ts by server/__tests__/platform-concierge-listing.db.test.ts F6. For every other row: the expert''s own stated coverage, free text.';
