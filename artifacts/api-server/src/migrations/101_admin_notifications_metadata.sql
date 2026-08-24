-- Migration 101: Add metadata JSONB column to admin_notifications
--
-- Stores a structured cost breakdown on lead_unassigned notifications so
-- admins can see how much AI spend was incurred in the 5-minute window
-- leading up to each dead-end routing event (concierge quote, optimization
-- preview, etc.) without leaving the notification panel.
--
-- Column is nullable — existing rows and non-cost notification types stay NULL.

ALTER TABLE admin_notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB;
