CREATE TABLE IF NOT EXISTS restaurant_cache (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  external_id VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  cuisine VARCHAR(255),
  price_level VARCHAR(10),
  rating VARCHAR(10),
  review_count INTEGER DEFAULT 0,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  city VARCHAR(255),
  booking_url TEXT,
  image_url TEXT,
  last_updated TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);
