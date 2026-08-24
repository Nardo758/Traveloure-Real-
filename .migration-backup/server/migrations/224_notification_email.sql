-- 224: add notification_email to users.
--
-- Experts and providers can set a separate business email for booking alert
-- emails. Falls back to users.email when NULL. Never used for login or any
-- authentication flow — account email is always authoritative for security.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email varchar(255);
