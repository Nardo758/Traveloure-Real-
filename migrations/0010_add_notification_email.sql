-- Migration 207: add notification_email to users
-- Experts/providers can set a separate business email for booking alert emails.
-- Falls back to users.email when NULL. Never used for auth flows.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email varchar(255);
