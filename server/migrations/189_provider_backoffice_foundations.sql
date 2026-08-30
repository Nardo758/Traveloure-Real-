-- 189: schema foundations for the ratified provider back-office wave (decision-maker approved
-- Aug 9 2026). Three additive parts, none of them wire enforcement — the feature builds that
-- read these columns/tables land separately. Idempotent, additive-nullable, no CHECK (house
-- posture). All declared in shared/schema.ts in the same commit (publish-trap rule).

-- ─── Part 1 — Vacation mode (business-level flag) ────────────────────────────────────────────
-- A provider/expert can mark themselves away without touching a single provider_services row —
-- this is deliberately account-level, not per-listing, so it can't drift out of sync with a
-- provider's catalog. `vacation_until` non-null AND in the future = away; NULL or past = not away
-- (no separate boolean to fall out of sync with the date). Read at QUERY TIME by
-- search/storefront/advisor/checkout surfaces — none of those reads are wired here, this
-- migration only adds the column pair. Confirmed bookings are explicitly UNAFFECTED — vacation
-- mode blocks new inbound discovery/booking, never touches booking rows already in flight.
ALTER TABLE users ADD COLUMN IF NOT EXISTS vacation_until timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vacation_message varchar(200);

COMMENT ON COLUMN users.vacation_until IS
  'Vacation mode (business-level, never touches provider_services rows). Non-null AND in the '
  'future = away. Enforcement (search/storefront/advisor/checkout reads) lands in the feature '
  'build; this column is the foundation only. Confirmed bookings are unaffected.';
COMMENT ON COLUMN users.vacation_message IS
  'Optional traveler-facing away message shown alongside vacation mode. NULL = no message.';

-- ─── Part 2 — offering_type_requests ──────────────────────────────────────────────────────────
-- Provider "I don't see my offering type" requests, consumed by the admin categories page.
-- status is app-enforced vocabulary (pending|approved|rejected) — no DB CHECK (house posture:
-- a CHECK on a value-holding column risks the publish-time constraint-violation trap).
CREATE TABLE IF NOT EXISTS offering_type_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_name varchar(120) NOT NULL,
  description text,
  status varchar(30) NOT NULL DEFAULT 'pending',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offering_type_requests_status_idx ON offering_type_requests (status);

COMMENT ON TABLE offering_type_requests IS
  'Provider "don''t see your offering" requests. App-enforced status vocabulary: '
  'pending|approved|rejected (no DB CHECK). Consumed by the admin categories page.';

-- ─── Part 3 — demand_signal_events (append-only event log) ───────────────────────────────────
-- §13-honest posture: every trending/demand surface must read ONLY these logged events, never
-- infer demand from anything else. Writers land in the feature builds that produce each signal
-- kind; this migration only creates the ledger. kind is app-enforced vocabulary
-- (stay_anchor_miss|places_fallthrough|no_stay_flag|search_unfilled) — no DB CHECK, same posture
-- as offering_type_requests.status and the optimizer_gap_fills precedent (migration 182).
-- latitude/longitude follow the house column-naming convention used by dmo_extracted_places
-- (migration 185) and market gems, rather than abbreviated lat/lng column names.
CREATE TABLE IF NOT EXISTS demand_signal_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(40) NOT NULL,
  market varchar(100),
  category varchar(60),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  context jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demand_signal_events_kind_created_idx ON demand_signal_events (kind, created_at);
CREATE INDEX IF NOT EXISTS demand_signal_events_market_idx ON demand_signal_events (market);

COMMENT ON TABLE demand_signal_events IS
  '§13 — append-only demand/trending event log. Every trending/demand surface reads ONLY these '
  'logged events; writers (stay_anchor_miss|places_fallthrough|no_stay_flag|search_unfilled, '
  'app-enforced, no DB CHECK) land in the feature builds, not here.';

-- ─── Seed groundwork — offering fallback ──────────────────────────────────────────────────────
-- The "Custom / Other" service_categories row (migration 034) was deliberately left with a NULL
-- category_key ("outside brief taxonomy"). The provider offering picker filters on a truthy
-- category_key (client/src/components/ServiceForm.tsx), so a catch-all offering type needs this
-- row to carry one. Predicate-guarded so this is a no-op on any environment where an admin has
-- already assigned a different key (same guard shape as migration 180's re-band protection).
UPDATE service_categories
   SET category_key = 'custom_other', updated_at = now()
 WHERE name = 'Custom / Other'
   AND (category_key IS NULL OR category_key = '');

-- One catch-all provider offering-type row so "I don't see my offering" has a landing option in
-- the picker itself, alongside the request flow (Part 2). Follows the service_offering_types
-- seed conventions (migration 038/065): ON CONFLICT (offering_type_key) DO NOTHING, high
-- sort_order so it sorts last, market_scoped left NULL (universal).
INSERT INTO service_offering_types
  (offering_type_key, category_key, display_name, tagline, is_surprising, sort_order)
VALUES
  ('custom_other_offering', 'custom_other', 'Something else / not listed',
   'Tell us what you do — request a new type', false, 999)
ON CONFLICT (offering_type_key) DO NOTHING;
