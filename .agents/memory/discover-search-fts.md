---
name: Discover search FTS design
description: How unifiedSearch's full-text + trigram search is layered and its thresholds
---
Discover search (`storage.unifiedSearch`, GET /api/discover) is layered: (1) weighted tsvector FTS (name 'A' > description 'B', `websearch_to_tsquery`) ranked by ts_rank; (2) if zero matches, pg_trgm fallback on service_name (`word_similarity > 0.35` OR `similarity > 0.3`); (3) if still zero, a "Did you mean" `suggestion` field from the closest name with `similarity > 0.2`.

**Why:** raw ILIKE gave no typo tolerance and no relevance order; thresholds chosen so multi-word typo queries still hit fuzzy without garbage suggestions.

**How to apply:** GIN indexes live in migration 217 — if the tsvector expression in storage.ts changes, the index expression must change in lockstep or the index is unused. Price/rating filters are SQL-side (decimal columns compare numerically). Response also carries `packagesTotal` (pre-LIMIT count).
