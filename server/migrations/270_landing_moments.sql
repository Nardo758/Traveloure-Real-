-- 270_landing_moments.sql — Landing v2.5 Lane 2 (Moments)
-- Rulings 2026-09-01-landing-moments (attribution) + 2026-09-01-moment-key (fine identity).
-- Additive only, no CHECK (publish-trap posture); both objects declared in shared/schema.ts
-- per the deploy-push durability rule.

-- (1) trips.moment_key — the fine occasion identity when a trip is born from a Moment CTA.
--     experienceType stays the coarse machine key; moment_key never drives fees/templates.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS moment_key varchar(30);

-- (2) landing_moment_events — attribution for the Moments section (mirrors upsell_impressions'
--     session posture: guest_session_id + nullable user_id, no PII beyond that token).
CREATE TABLE IF NOT EXISTS landing_moment_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_key        varchar(30) NOT NULL,
  kind              varchar(20) NOT NULL, -- impression | tab | dot | cta
  position          integer,
  guest_session_id  varchar(255),
  user_id           varchar(255),
  created_at        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_landing_moment_events_moment_kind ON landing_moment_events (moment_key, kind);
CREATE INDEX IF NOT EXISTS idx_landing_moment_events_created_at ON landing_moment_events (created_at);
