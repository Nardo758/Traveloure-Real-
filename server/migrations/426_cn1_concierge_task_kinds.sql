-- 426 — Local concierge task kinds, and the tasks a concierge listing offers.
--
-- HELD. The SQL is in the pull request for review.
--
-- service_type already allows concierge. The per-trip unit is the existing
-- pricing_unit value per_trip. Reply hours reuse response_window_hours.
-- This file does not alter provider_services and does not change any existing
-- listing's service_type. expert_offering_types is not updated: Reservation
-- Lifeline and Done-for-You Booking stay on their current rows and are also
-- seeded here as task kinds.
--
-- Stays and transport are link-only. That rule lives in the app
-- (shared/concierge-tasks.ts), not in a CHECK.
--
-- Additive tables. No DEFAULT, no CHECK, no backfill of listings.
-- Active NULL or true is listed; false is hidden. A second run is a no-op.
-- 425 is unused. This file is the next free number above 425.

CREATE TABLE IF NOT EXISTS concierge_task_kinds (
  id varchar PRIMARY KEY,
  label varchar(120) NOT NULL,
  domain varchar(40) NOT NULL,
  sort_order integer,
  active boolean
);

CREATE TABLE IF NOT EXISTS provider_service_concierge_tasks (
  id varchar PRIMARY KEY,
  service_id varchar NOT NULL,
  task_kind_id varchar NOT NULL,
  cap integer
);

DO $$ BEGIN
  ALTER TABLE "provider_service_concierge_tasks"
    ADD CONSTRAINT "provider_service_concierge_tasks_service_id_provider_services_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "provider_services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "provider_service_concierge_tasks"
    ADD CONSTRAINT "provider_service_concierge_tasks_task_kind_id_concierge_task_kinds_id_fk"
    FOREIGN KEY ("task_kind_id") REFERENCES "concierge_task_kinds"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS provider_service_concierge_tasks_service_kind_key
  ON provider_service_concierge_tasks (service_id, task_kind_id);

CREATE INDEX IF NOT EXISTS idx_provider_service_concierge_tasks_service_id
  ON provider_service_concierge_tasks (service_id);

INSERT INTO concierge_task_kinds (id, label, domain, sort_order, active) VALUES
  ('experiences', 'Experiences', 'experiences', 10, true),
  ('meals', 'Meals', 'meals', 20, true),
  ('admissions', 'Admissions', 'admissions', 30, true),
  ('entry', 'Entry', 'entry', 40, true),
  ('errands', 'Errands', 'errands', 50, true),
  ('stays', 'Stays', 'stays', 60, true),
  ('transport', 'Transport', 'transport', 70, true),
  ('reservation_lifeline', 'Reservation Lifeline', 'meals', 80, true),
  ('done_for_you_booking', 'Done-for-You Booking', 'experiences', 90, true)
ON CONFLICT (id) DO NOTHING;
