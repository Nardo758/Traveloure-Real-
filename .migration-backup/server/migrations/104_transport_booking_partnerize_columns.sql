-- Migration 104: Partnerize sourcing on transport booking options
--
-- Flags transport_booking_options rows generated from a synced Partnerize
-- campaign so the client can show the "book with an expert" CTA (in addition
-- to the direct affiliate link) for these offers specifically.

ALTER TABLE transport_booking_options ADD COLUMN IF NOT EXISTS is_partnerize_sourced BOOLEAN DEFAULT FALSE;
ALTER TABLE transport_booking_options ADD COLUMN IF NOT EXISTS partnerize_partner_id VARCHAR(255);
