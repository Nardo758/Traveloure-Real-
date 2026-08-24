-- 247_trailhead_t3_resolution_waterfall.sql
--
-- Operation Trailhead LANE T3 (R-T3-a/-b/-c) — the booking-path resolution waterfall.
--
-- Adds the resolution PASS's stored state to the scraped-stub parent (dmo_raw_content) and the
-- append-only resolution audit log (resolution_events). The resolution pass classifies a published
-- stub's booking path in strict rung order — provider → affiliate_direct → affiliate_ota → external
-- (R-T3-a) — and stores where it landed, on what evidence, and at what confidence. Re-runs may
-- UPGRADE the rung but never downgrade silently (R-T3-c): every class change writes a resolution_events
-- row in the same operation.
--
-- Distinct from T4's inventory_class (migration 246): inventory_class is the born read-path class
-- (always 'external' for scraped content); these are written only by the T3 pass when it finds a
-- confident match. The born state is external/NULL — behavior-neutral on apply (a stub with no pass
-- run renders exactly as it did under T4).
--
-- ADDITIVE-NULLABLE, NO DB CHECK — the migration-181/195/228 posture, chosen deliberately to avoid the
-- Replit publish-time CHECK trap documented in CLAUDE.md. The class/subclass/rung shapes are
-- app-enforced (shared/trailhead-resolution.ts + shared/discover-stub.ts). Declared in shared/schema.ts
-- per the publish-trap rule (an object the code depends on must be in the schema or the deploy push is
-- authoritative and will remove it).
--
-- RUNNER CAVEAT: this session has NO DATABASE and NO network, so this migration was NOT applied here.
-- It is hand-verified against shared/schema.ts (column names/types/nullability match) and is idempotent
-- (IF NOT EXISTS on every add). First live apply is the Replit deploy / runMigrations() startup path.

-- ── dmo_raw_content: the pass's stored resolution state ───────────────────────────────────────────
ALTER TABLE dmo_raw_content
  ADD COLUMN IF NOT EXISTS resolution_class    VARCHAR(20) NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS resolution_subclass VARCHAR(20),
  ADD COLUMN IF NOT EXISTS resolution_ref      TEXT,
  ADD COLUMN IF NOT EXISTS match_confidence    NUMERIC(3, 2),
  ADD COLUMN IF NOT EXISTS resolved_at         TIMESTAMP;

-- Every pre-existing row is unresolved scraped content ⇒ external floor. The DEFAULT handles rows
-- inserted after this migration; this UPDATE covers already-present rows and is a no-op if the DEFAULT
-- already populated them.
UPDATE dmo_raw_content
  SET resolution_class = 'external'
  WHERE resolution_class IS NULL OR resolution_class = '';

COMMENT ON COLUMN dmo_raw_content.resolution_class IS
  'Trailhead T3 resolution class: ''external'' (unresolved floor) | ''provider'' (internal listing, never outbound) | ''affiliate'' (partner deep-link). Written by the resolution pass. App-enforced, no DB CHECK.';
COMMENT ON COLUMN dmo_raw_content.resolution_subclass IS
  'Trailhead T3 affiliate split: ''affiliate_direct'' | ''affiliate_ota''; NULL for provider/external.';
COMMENT ON COLUMN dmo_raw_content.resolution_ref IS
  'Trailhead T3 pointer: provider_services.id | program+product ref | source URL. NULL until resolved.';
COMMENT ON COLUMN dmo_raw_content.match_confidence IS
  'Trailhead T3 name/geo/category composite 0.00-1.00 (R-T3-b). NULL for the external floor.';

-- ── resolution_events: the append-only resolution audit log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS resolution_events (
  id          VARCHAR PRIMARY KEY,
  stub_id     VARCHAR NOT NULL,           -- dmo_raw_content.id; NO FK (history outlives the stub)
  event_type  VARCHAR(20) NOT NULL DEFAULT 'upgrade',  -- upgrade | downgrade | initial (app-enforced)
  from_class  VARCHAR(20),                -- qualified rung before; NULL for the first (initial) resolution
  to_class    VARCHAR(20) NOT NULL,       -- qualified rung after
  ref         TEXT,                       -- the resolution_ref stamped
  confidence  NUMERIC(3, 2),              -- match_confidence at the time; NULL for external floor
  pass_id     VARCHAR(64) NOT NULL,       -- groups all rows one pass wrote
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resolution_events_stub_created_idx ON resolution_events (stub_id, created_at);
CREATE INDEX IF NOT EXISTS resolution_events_pass_idx ON resolution_events (pass_id);

COMMENT ON TABLE resolution_events IS
  'Trailhead T3 (R-T3-c) APPEND-ONLY resolution audit log. No UPDATE/DELETE. One row per class change the resolution pass applies; classes stored as the fully-qualified rung (external|affiliate_ota|affiliate_direct|provider). stub_id has no FK — history survives the stub.';
