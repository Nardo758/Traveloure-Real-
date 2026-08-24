-- Migration 194: deliverable_downloads — append-only download log for the D3 deliverable rail.
-- R4/R5 (docs/DECISIONS.md ruling 58). One row per SUCCESSFUL fetch of
-- GET /api/service-bookings/:id/deliverable — the download signal D8's proposed
-- "auto-complete after N days undownloaded" needs and does not yet have (P2,
-- QA_PUNCH_LIST.md). This migration only creates the log table; it implements no
-- completion/auto-complete behavior (D8 is unruled). `protected` distinguishes a proxied
-- `objstore:` stream (true) from a legacy pasted-URL reveal (false). Additive, idempotent,
-- no CHECK (publish-trap avoidance). Table + indexes are ALSO declared in shared/schema.ts
-- so the deploy push cannot drop them (publish-trap rule).

CREATE TABLE IF NOT EXISTS deliverable_downloads (
  id varchar PRIMARY KEY,
  booking_id varchar NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
  service_id varchar NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  protected boolean NOT NULL DEFAULT false,
  downloaded_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS deliverable_downloads_booking_idx
  ON deliverable_downloads (booking_id);

CREATE INDEX IF NOT EXISTS deliverable_downloads_service_idx
  ON deliverable_downloads (service_id);
