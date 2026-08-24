-- CON-A.P8 (N6): Event packages catalog for Full / Done-for-You concierge tier.
-- Admin-curated listings the Concierge surface presents as quote-on-request.
-- Phase A is catalog-only; the transactional flow lands in Phase C / C1.

CREATE TABLE IF NOT EXISTS event_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  market TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_from_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_packages_event_type_idx ON event_packages(event_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS event_packages_status_idx ON event_packages(status);
CREATE INDEX IF NOT EXISTS event_packages_market_idx ON event_packages(market) WHERE status = 'active';
