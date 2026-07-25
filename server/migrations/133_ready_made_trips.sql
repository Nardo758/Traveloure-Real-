-- Migration 133 — Ready-Made Trips (Trips by Locals), authoring Phase 1 (spec v3 + brief v1.1).
--
-- 1) trips.author_id (ADDITIVE NULLABLE, no CHECK/DEFAULT → no publish-push trap). Authoring trips
--    are created with user_id = NULL + author_id = expert (traveler-surface exclusion by construction).
-- 2) itinerary_items.gem_id (ADDITIVE NULLABLE soft reference — no FK; two gem tables exist).
-- 3) Four NEW tables (ready_made_trips, ready_made_purchases, boards, board_items) with their status
--    CHECKs created WITH the tables — new tables have no legacy rows, so CHECK-at-creation is safe
--    (no publish-time drizzle-push remap trap). Real day-one migrations per spec v3 §8 — never
--    push-canonical.
-- 4) Fee band 'ready_made_trip' (percent; default_rate = platform take 0.25 → expert keeps 75%;
--    max_rate 0.25 enforces the 75% expert floor). Idempotent ON CONFLICT DO NOTHING (§8 pattern).
-- All idempotent (IF NOT EXISTS) — safe re-run.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS author_id VARCHAR REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trips_author_id ON trips(author_id) WHERE author_id IS NOT NULL;

ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS gem_id VARCHAR;

CREATE TABLE IF NOT EXISTS ready_made_trips (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id VARCHAR NOT NULL REFERENCES users(id),
  source_trip_id VARCHAR NOT NULL REFERENCES trips(id),
  market VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  hero_image_url TEXT,                      -- nullable until submit (D2 Unsplash picker)
  hero_image_meta JSONB,
  duration_days INTEGER NOT NULL,
  best_season VARCHAR(60),
  pricing_mode VARCHAR(20) NOT NULL DEFAULT 'fixed'
    CONSTRAINT ready_made_trips_pricing_mode_check CHECK (pricing_mode IN ('fixed','per_traveler')),
  price_cents INTEGER,
  fee_band_key VARCHAR(100) NOT NULL DEFAULT 'ready_made_trip',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CONSTRAINT ready_made_trips_status_check CHECK (status IN ('draft','submitted','approved','rejected')),
  badge VARCHAR(30),
  inside_counts JSONB,
  build_review JSONB,
  rejection_reason TEXT,
  submitted_at TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  last_verified_at TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rmt_market_status ON ready_made_trips(market, status);
CREATE INDEX IF NOT EXISTS idx_rmt_author ON ready_made_trips(author_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rmt_source_trip ON ready_made_trips(source_trip_id);

CREATE TABLE IF NOT EXISTS ready_made_purchases (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id VARCHAR NOT NULL REFERENCES users(id),
  ready_made_trip_id VARCHAR NOT NULL REFERENCES ready_made_trips(id),
  price_paid_cents INTEGER NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  stripe_payment_intent_id VARCHAR NOT NULL UNIQUE,  -- §15 idempotency anchor
  attribution_ref VARCHAR(64),
  clone_trip_id VARCHAR REFERENCES trips(id),
  status VARCHAR(20) NOT NULL DEFAULT 'paid'
    CONSTRAINT ready_made_purchases_status_check CHECK (status IN ('paid','cloned','refunded','revoked')),
  purchased_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Re-buy guard: one active purchase per buyer+trip.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rmp_buyer_trip_active
  ON ready_made_purchases(buyer_id, ready_made_trip_id)
  WHERE status IN ('paid','cloned');

CREATE TABLE IF NOT EXISTS boards (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,  -- NULL = editorial (platform-owned)
  board_type VARCHAR(20) NOT NULL
    CONSTRAINT boards_type_check CHECK (board_type IN ('wishlist','storefront','editorial')),
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(200) UNIQUE,
  market VARCHAR(100),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS board_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id VARCHAR NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  ready_made_trip_id VARCHAR NOT NULL REFERENCES ready_made_trips(id) ON DELETE CASCADE,
  position INTEGER,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT board_items_board_trip_unique UNIQUE (board_id, ready_made_trip_id)
);

-- Fee band: platform take 0.25 (expert keeps 75%); max 0.25 = the 75% expert-share floor.
INSERT INTO fee_bands (band_key, rate_type, default_rate, min_rate, max_rate, display_name, description, is_active)
VALUES ('ready_made_trip', 'percent', 0.25, 0.10, 0.25,
        'Ready-Made Trip sale',
        'Trips by Locals listing sale. Platform take (default 0.25 → expert keeps 75%). Low price / high volume / zero marginal cost — its own band, not bespoke-service economics.',
        true)
ON CONFLICT (band_key) DO NOTHING;
