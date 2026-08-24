-- 182_optimizer_gap_fills.sql — OPTIMIZER_SOURCING_BUILD_SPEC WP-B (gap-fill ledger).
--
-- WHY A NEW TABLE
-- ────────────────
-- The existing content-gap infrastructure (`content_gap_alerts`, migration 117) answers "how much
-- DMO content do we hold per editorial type vs. a target" for Kyoto only, reconciled by
-- `analyzeKyotoContentGaps` as ONE row per (market, city, contentType) that gets UPDATEd in place
-- as counts change. The sourcing rule needs something structurally different: a real-time,
-- market-agnostic ledger of every time the OPTIMIZER could not place a platform
-- (`provider_services`) match and fell back to external content — city, category/dataType,
-- itemKind (service|transport|content), source (tavily|google|grok|unfilled), tripId. The existing
-- shape has no itemKind, no source discriminator, no tripId, and is reconciled/UPDATEd rather than
-- appended — genuinely cannot carry these rows without redefining what it means.
--
-- DELIBERATE POSTURES (mirrors 177_reconciliation_exceptions.sql, the most recent append-only
-- ledger in this codebase)
--   * APPEND-ONLY. No app code carries an UPDATE or DELETE against optimizer_gap_fills. "Dedupe by
--     counts, not UPDATE-in-place of facts" is a READ-time aggregation (GROUP BY city, category
--     with COUNT(*) over a window) — not a write-time upsert — so a persistent gap reads as rising
--     demand volume without any row ever being rewritten.
--   * NO DB CHECK on item_kind/source (migration-159/171/177 posture). Canonical vocabulary lives
--     in shared/schema.ts (OPTIMIZER_GAP_ITEM_KINDS / OPTIMIZER_GAP_SOURCES). New table, no legacy
--     rows — a CHECK here buys nothing and only risks a publish-time remap trap if the vocabulary
--     grows. Nothing added to preflight-prod-constraints.cjs's CONSTRAINT_MANIFEST.
--   * `trip_id` has NO FK, deliberately: a ledger row records what the optimizer NEEDED, and must
--     outlive the trip it was observed on (the reconciliation_exceptions.booking_id rationale).
--   * The table AND both indexes are declared in shared/schema.ts in the SAME commit — the deploy
--     push is authoritative over objects it does not find declared there and will drop them, and a
--     stamped migration never recreates them (CLAUDE.md deploy-push rule).
--   * The ledger write is BEST-EFFORT from every call site (a plan flag must never fail the
--     optimize/Apply flow, §15b posture) — enforced in app code (optimizer-gap-ledger.service.ts),
--     not here.

CREATE TABLE IF NOT EXISTS optimizer_gap_fills (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  occurred_at TIMESTAMP NOT NULL DEFAULT now(),
  city VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  -- service | transport | content (app-enforced, see OPTIMIZER_GAP_ITEM_KINDS)
  item_kind VARCHAR(20) NOT NULL,
  -- tavily | google | grok | unfilled (app-enforced, see OPTIMIZER_GAP_SOURCES)
  source VARCHAR(20) NOT NULL,
  trip_id VARCHAR,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS optimizer_gap_fills_city_category_idx ON optimizer_gap_fills (city, category);
CREATE INDEX IF NOT EXISTS optimizer_gap_fills_occurred_at_idx ON optimizer_gap_fills (occurred_at);
