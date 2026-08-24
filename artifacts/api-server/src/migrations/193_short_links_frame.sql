-- Migration 193: short_links.frame — frame-aware short links.
-- D4 (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md, decision-maker ratified Aug 10, 2026).
-- Additive nullable varchar(20) column. NULL = an untagged/generic link — the historical shape;
-- every existing row and every caller that omits frame keeps working exactly as before. No
-- DEFAULT, no backfill (nothing minted before this migration carried a frame). No CHECK — the
-- closed allowlist (shared/share-frames.ts SHARE_FRAMES: feed | story | route | review) is
-- app-enforced at the create route, the same NO-CHECK-on-app-vocabulary posture target_type
-- already uses on this same table (migration 139) — a CHECK over an app-layer vocabulary is the
-- publish-time push trap (CLAUDE.md). Also declared in shared/schema.ts (publish-trap rule).

ALTER TABLE short_links ADD COLUMN IF NOT EXISTS frame varchar(20);
