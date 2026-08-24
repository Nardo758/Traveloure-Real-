-- 240_email_outbox.sql
--
-- Email outbox: durable store for transactional emails that must survive a
-- Resend outage or network blip without being silently lost.
--
-- Design decisions:
--   * ADDITIVE-NULLABLE where possible (§239 posture) — no DB CHECK on status
--     so the app layer can freely extend the vocabulary without a migration.
--   * status is app-enforced: pending → sent | failed → dead (after max_attempts).
--   * retry_after is set by the outbox service on each failure with exponential
--     backoff; a NULL means "eligible immediately".
--   * html / text_body stored as TEXT so Resend can be called without re-
--     rendering the template — the outbox row is self-contained.
--   * metadata JSONB holds caller-supplied context (e.g. bookingId) for the
--     admin view — it is never sent to Resend.
--   * Indexes cover the two hot queries:
--       - poller: WHERE status IN ('pending','failed') AND retry_after <= now()
--       - admin list: ORDER BY created_at DESC

CREATE TABLE IF NOT EXISTS email_outbox (
  id              BIGSERIAL PRIMARY KEY,
  email_type      VARCHAR(64)  NOT NULL DEFAULT 'generic',
  to_email        TEXT         NOT NULL,
  subject         TEXT         NOT NULL,
  html            TEXT         NOT NULL,
  text_body       TEXT,
  from_address    TEXT,
  reply_to        TEXT,
  status          VARCHAR(16)  NOT NULL DEFAULT 'pending',  -- pending|sent|failed|dead
  attempt_count   INTEGER      NOT NULL DEFAULT 0,
  max_attempts    INTEGER      NOT NULL DEFAULT 5,
  last_error      TEXT,
  resend_id       TEXT,                                      -- Resend message id on success
  retry_after     TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE email_outbox IS
  'Durable outbox for transactional emails. Failed rows are retried by the '
  'email-outbox scheduler with exponential backoff (max 5 attempts). Dead rows '
  'are surfaced on the admin dashboard for manual inspection.';

COMMENT ON COLUMN email_outbox.status IS
  '''pending'' = not yet attempted; ''sent'' = delivered to Resend; '
  '''failed'' = last attempt failed, will retry if attempt_count < max_attempts; '
  '''dead'' = max_attempts exhausted, no further retries.';

-- Poller index: pick up rows that are due for sending/retry
CREATE INDEX IF NOT EXISTS email_outbox_retry_idx
  ON email_outbox (status, retry_after)
  WHERE status IN ('pending', 'failed');

-- Admin list index
CREATE INDEX IF NOT EXISTS email_outbox_created_idx
  ON email_outbox (created_at DESC);
