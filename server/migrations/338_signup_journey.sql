-- Additive journey state only. No enrollment/backfill and no production execution
-- by the agent. Each new object is also declared in shared/schema.ts.
CREATE TABLE IF NOT EXISTS signup_journey_state (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_state varchar(32) NOT NULL,
  failed_attempts integer NOT NULL,
  locked_until timestamptz,
  welcome_at timestamptz,
  deletion_requested_at timestamptz,
  deletion_due_at timestamptz
);
CREATE TABLE IF NOT EXISTS signup_journey_jobs (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type varchar(64) NOT NULL,
  related_id varchar NOT NULL,
  idempotency_key text NOT NULL,
  send_at timestamptz NOT NULL,
  status varchar(32) NOT NULL,
  skip_reason text,
  payload jsonb NOT NULL,
  attempt_count integer NOT NULL,
  outbox_id bigint,
  lease_until timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS signup_journey_jobs_idempotency_idx
  ON signup_journey_jobs(idempotency_key);
CREATE INDEX IF NOT EXISTS signup_journey_jobs_due_idx
  ON signup_journey_jobs(status, send_at);
CREATE TABLE IF NOT EXISTS signup_journey_devices (
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint varchar(64) NOT NULL,
  first_seen_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, fingerprint)
);
-- Scoped to journey rows; the other producers' outbox behavior is unchanged.
CREATE UNIQUE INDEX IF NOT EXISTS journey_email_idempotency_idx
  ON email_outbox ((metadata->>'journeyIdempotencyKey'))
  WHERE metadata ? 'journeyIdempotencyKey';
CREATE UNIQUE INDEX IF NOT EXISTS journey_email_alert_idx
  ON email_outbox ((metadata->>'journeyAlertFor'),to_email)
  WHERE metadata ? 'journeyAlertFor';