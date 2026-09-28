-- Migration 328: re-create migration 089's five funnel_events indexes.
-- Ledger `2026-09-27-migration-indexes-declared` (R175); CLAUDE.md "Replit deploy-push vs. our
-- migrations" and §20.
--
-- WHY: 089 created these five indexes but shared/schema.ts declared none of them, so every publish's
-- automatic drizzle-kit push DROPPED them — and 089, already stamped, never recreated them.
-- Production very likely carries none. They are now DECLARED on `funnelEvents` in shared/schema.ts
-- (so the push stops dropping them), and this migration re-creates them where they are absent.
--
-- §20: because 328 is registered, declared and NOT YET STAMPED on production, a publish prompt that
-- offers exactly these CREATE INDEX IF NOT EXISTS statements is the approvable case; declining it is
-- also safe — boot runs this file a minute later. All five are NON-UNIQUE, so no duplicate precheck
-- applies. Statements are byte-equivalent to 089's (same names, columns, order, sort direction).
-- Idempotent: IF NOT EXISTS makes a second run, or a run after an approved push, a no-op.

CREATE INDEX IF NOT EXISTS funnel_events_user_idx    ON funnel_events(user_id);
CREATE INDEX IF NOT EXISTS funnel_events_type_idx    ON funnel_events(event_type);
CREATE INDEX IF NOT EXISTS funnel_events_stage_idx   ON funnel_events(stage);
CREATE INDEX IF NOT EXISTS funnel_events_created_idx ON funnel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_stage_time_idx ON funnel_events(stage, created_at DESC);
