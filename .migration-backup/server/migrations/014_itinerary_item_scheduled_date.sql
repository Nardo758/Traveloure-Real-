-- Migration 014: Add scheduled_date to itinerary_items
-- Allows date-aware "Add to {date}" flow to persist the chosen calendar date
-- alongside dayNumber (which is trip-relative and computed at add time).
ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS scheduled_date date;
