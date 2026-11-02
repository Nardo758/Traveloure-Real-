-- 430 — CN-1e: the concierge task log.
--
-- HELD until Leon approves this SQL on the pull request. Do not merge on the file alone.
--
-- concierge_tasks: one row per task the traveler asks a concierge engagement to do. The
-- engagement is a service_bookings row whose listing is service_type 'concierge'. State is
-- 'requested' | 'traveler_ok' | 'done' | 'could_not_get' | 'withdrawn', app-enforced in
-- shared/concierge-task-log.ts. No amount, price or payment column: venue costs never pass
-- through the platform. link_url is for link-only kinds (stays, transport), https only,
-- validated in the app.
-- concierge_task_events: one row per state change, written in the same transaction as the
-- change. Append-only.
--
-- Additive: two new tables, born empty. No DEFAULT, no CHECK. The app sets ids and
-- timestamps. Both tables and their indexes are declared in shared/schema.ts so a publish
-- push does not drop them. A second run is a no-op.

CREATE TABLE IF NOT EXISTS concierge_tasks (
  id varchar PRIMARY KEY,
  service_booking_id varchar NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
  task_kind_id varchar NOT NULL REFERENCES concierge_task_kinds(id) ON DELETE RESTRICT,
  title varchar(200) NOT NULL,
  note text,
  link_url text,
  state varchar(20) NOT NULL,
  requested_by varchar NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL,
  traveler_ok_at timestamptz,
  traveler_ok_by varchar,
  resolved_at timestamptz,
  resolved_by varchar,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_concierge_tasks_booking_created
  ON concierge_tasks (service_booking_id, created_at);

CREATE INDEX IF NOT EXISTS idx_concierge_tasks_booking_kind_state
  ON concierge_tasks (service_booking_id, task_kind_id, state);

CREATE TABLE IF NOT EXISTS concierge_task_events (
  id varchar PRIMARY KEY,
  task_id varchar NOT NULL REFERENCES concierge_tasks(id) ON DELETE CASCADE,
  service_booking_id varchar NOT NULL,
  from_state varchar(20),
  to_state varchar(20) NOT NULL,
  actor_type varchar(20) NOT NULL,
  actor_id varchar,
  note text,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_concierge_task_events_task_created
  ON concierge_task_events (task_id, created_at);
