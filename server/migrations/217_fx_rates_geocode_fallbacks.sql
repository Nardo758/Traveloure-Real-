-- 217: DB-backed fallbacks for FX rates and geocode city coordinates (task: remove the
-- hardcoded /api/exchange-rates literal and the dead FALLBACK_COORDINATES map).
-- Idempotent per AUTHORING.md: IF NOT EXISTS + ON CONFLICT DO NOTHING. Declared in
-- shared/schema.ts the same commit (publish-trap rule).

CREATE TABLE IF NOT EXISTS fx_rates (
  currency_code varchar(8) PRIMARY KEY,
  rate_to_usd double precision NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Seed with the values the code used to hardcode (units per USD). The daily refresh
-- scheduler overwrites these on first successful fetch.
INSERT INTO fx_rates (currency_code, rate_to_usd) VALUES
  ('EUR', 0.92),
  ('GBP', 0.79),
  ('JPY', 149.50),
  ('AUD', 1.53),
  ('SGD', 1.34)
ON CONFLICT (currency_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS geocode_fallbacks (
  slug varchar(120) PRIMARY KEY,
  city_name varchar(120) NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  formatted_address varchar(255) NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Seed: the exact set the removed FALLBACK_COORDINATES literal carried.
INSERT INTO geocode_fallbacks (slug, city_name, lat, lng, formatted_address) VALUES
  ('rome', 'Rome', 41.9028, 12.4964, 'Rome, Italy'),
  ('paris', 'Paris', 48.8566, 2.3522, 'Paris, France'),
  ('london', 'London', 51.5074, -0.1278, 'London, United Kingdom'),
  ('tokyo', 'Tokyo', 35.6762, 139.6503, 'Tokyo, Japan'),
  ('new york', 'New York', 40.7128, -74.0060, 'New York, NY, USA'),
  ('barcelona', 'Barcelona', 41.3874, 2.1686, 'Barcelona, Spain'),
  ('bangkok', 'Bangkok', 13.7563, 100.5018, 'Bangkok, Thailand'),
  ('sydney', 'Sydney', -33.8688, 151.2093, 'Sydney, Australia'),
  ('dubai', 'Dubai', 25.2048, 55.2708, 'Dubai, UAE'),
  ('marrakech', 'Marrakech', 31.6295, -7.9811, 'Marrakech, Morocco'),
  ('bali', 'Bali', -8.3405, 115.0920, 'Bali, Indonesia'),
  ('istanbul', 'Istanbul', 41.0082, 28.9784, 'Istanbul, Turkey'),
  ('lisbon', 'Lisbon', 38.7223, -9.1393, 'Lisbon, Portugal'),
  ('singapore', 'Singapore', 1.3521, 103.8198, 'Singapore'),
  ('los angeles', 'Los Angeles', 34.0522, -118.2437, 'Los Angeles, CA, USA'),
  ('miami', 'Miami', 25.7617, -80.1918, 'Miami, FL, USA'),
  ('amsterdam', 'Amsterdam', 52.3676, 4.9041, 'Amsterdam, Netherlands'),
  ('berlin', 'Berlin', 52.5200, 13.4050, 'Berlin, Germany'),
  ('hong kong', 'Hong Kong', 22.3193, 114.1694, 'Hong Kong'),
  ('goa', 'Goa', 15.2993, 74.1240, 'Goa, India')
ON CONFLICT (slug) DO NOTHING;
