-- Additive migration: wire affiliate products into the content hub
-- Safe to run on an existing database (uses IF NOT EXISTS guards)

-- 1. Extend the content_type enum with affiliate_product entry
--    (ADD VALUE is idempotent in PostgreSQL 9.6+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'affiliate_product'
      AND enumtypid = 'content_type'::regtype
  ) THEN
    ALTER TYPE content_type ADD VALUE 'affiliate_product';
  END IF;
END$$;

-- 2. Add tracking_number to affiliate_products (links back to content_registry)
ALTER TABLE "affiliate_products"
  ADD COLUMN IF NOT EXISTS "tracking_number" varchar(25);

-- 3. Add content_tracking_number to affiliate_earnings (revenue↔registry join)
ALTER TABLE "affiliate_earnings"
  ADD COLUMN IF NOT EXISTS "content_tracking_number" varchar(25);
