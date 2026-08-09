-- 186: market_geography — a market's self-rendered water/parks/roads layer moves to the DB so
-- the admin "Add market" flow is one action with no code commit per market (CLAUDE.md §20b;
-- decision-maker ratified Aug 9 2026). No seed row: lookup is DB-first with the committed
-- KYOTO_GEOGRAPHY literal as server-side fallback, so an empty table is behavior-neutral on
-- apply. Idempotent. Declared in shared/schema.ts in the same commit (publish-trap rule).

CREATE TABLE IF NOT EXISTS market_geography (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  market varchar(100) NOT NULL UNIQUE,
  display_name varchar(100),
  country varchar(100),
  bbox jsonb NOT NULL,
  water jsonb NOT NULL DEFAULT '[]',
  parks jsonb NOT NULL DEFAULT '[]',
  roads jsonb NOT NULL DEFAULT '[]',
  way_counts jsonb,
  source varchar(30) NOT NULL DEFAULT 'overpass',
  extracted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
