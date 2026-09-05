-- 285 — `venue`: the 21st discipline in the service-category taxonomy.
-- Ledger `2026-09-04-venue-category`; CLAUDE.md Locked Decision 31 (as amended by the same row).
--
-- WHY. `experience_types.roles_needed` (migration 280) answers "who do you hire for this
-- occasion?" as `service_categories.category_key` values. For a wedding, a corporate event, an
-- engagement party or a reunion the FIRST hire is the place — and there was no key for it. The
-- nearest rows are `dining_venue` (Restaurants & Dining) and `accommodation` (Lodging), neither of
-- which is a ballroom, a barn, an estate, a rooftop or a hired hall. So a venue could be named by
-- no occasion, listed by no provider, and reached by no offering: absent, not merely empty.
--
-- WHAT THIS IS NOT. DJs and bands are NOT added here — they are already sold as the `entertainer`
-- offering under `category_key = 'entertainment'` (migration 038), which is exactly why
-- `music-performance` is declared key-less by decision in `check-category-reachability.cjs`.
-- Adding a second home for the same supply is the taxonomy fork this lane exists to avoid.
--
-- THE REGISTRY. Migration 034 was "the sole taxonomy authority" for as long as it was the only
-- migration assigning `category_key`. This file is the second, so the authority becomes a
-- committed REGISTRY — `scripts/lib/taxonomy-registry.cjs` `TAXONOMY_MIGRATIONS` — which both
-- reachability guards and `shared/__tests__/roles-needed.test.ts` read. A new category is a
-- registry entry plus a migration, never an ad-hoc INSERT.
--
-- BANDS ARE NOT LITERALS (§8). `commission_band_key` reuses the EXISTING `moderate` band
-- (seeded by 033/259) — the same band 034 gives `dining_venue`, `rentals` and `event_coordinator`,
-- the three closest comparables: a hired place, at an event, at that ticket size. No rate appears
-- anywhere in this file.
--
-- PUBLISH-TRAP POSTURE. Data-only: no ALTER, no CHECK, no index, no new table — so
-- `scripts/preflight-prod-constraints.cjs` is unaffected and the deploy push has nothing to fail
-- on. Idempotent via `ON CONFLICT DO NOTHING`: unlike 034's `DO UPDATE`, this file never
-- overwrites an admin-tuned band, sort order or copy on a database where the row already exists.

-- ─── The category ────────────────────────────────────────────────────────────
-- Column list and shape mirror migration 034's upsert (the registry parser is column-aware, but
-- matching 034 keeps the two files readable side by side).
INSERT INTO service_categories
  (name, slug, description, category_type, verification_required, is_active, sort_order,
   category_key, source_type, launch_tier, commission_band_key, insurance_band,
   risk_profile, requires_background_check)
VALUES
  ('Venues',                       'venues',
   'Event venues — ballrooms, halls, estates, gardens, rooftops, barns, wineries and private event spaces.',
   'service_provider', true,  true, 105,
   'venue',             'platform_provider', 'segment',   'moderate',   2, 'moderate', false)
ON CONFLICT (slug) DO NOTHING;

-- ─── Its offering(s) ─────────────────────────────────────────────────────────
-- Row shape follows migration 038 (`offering_type_key, category_key, display_name, tagline,
-- is_surprising, sort_order`). Without at least one offering the category would be a keyed row the
-- provider offering picker never renders — reachable in principle, invisible in practice, which is
-- the dead-but-live-looking shape `check-category-reachability.cjs` R3 guards from the other side.
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('wedding_venue',      'venue', 'Wedding & Event Venue',   'Your space, booked for the day.',        false, 230),
  ('private_event_space','venue', 'Private Event Space',     'A room, a rooftop, a garden — hired.',   false, 231)
ON CONFLICT (offering_type_key) DO NOTHING;
