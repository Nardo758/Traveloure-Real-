-- Migration 223: add email_booking_alerts to users
-- Experts can opt out of booking-alert emails from Settings → Notifications.
-- Default true preserves existing behaviour for all current users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_booking_alerts boolean NOT NULL DEFAULT true;
