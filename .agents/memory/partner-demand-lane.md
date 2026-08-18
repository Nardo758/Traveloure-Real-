---
name: Partner Demand Data lane
description: State + conventions of the partner-demand lane (Phase 1/2A verified; Q9 verdict; what gates Phase 3)
---
- Phase 1 (de-fabrication) and Phase 2A (migrations 241/242, item_removed diary, R9 test-exclusion predicate) are merged and verified; findings live in `docs/findings/R7_DB_PASS.md`.
- **Q9 verdict (2026-08-18): Kyoto clears the 10-floor with real trips — n=29 strict (real account AND author_id IS NULL), n=53 on the looser framing.** Overturned R14's "likely zero qualifying markets" prior; Phase 4 one-pager may generate for Kyoto.
- The `(unmapped)` market bucket (145 trips / 90 real — Lisbon/SF/Paris/Barcelona clusters) is the largest demand pool; Kyoto is the only mapped market with rows.
- Test-account predicate: `email ILIKE '%@traveloure.test'`; NULL email = REAL (§13). Any demand rollup must reuse `isRealAccountSql` from server/services/demand-test-exclusion.
- Authoring trips (`author_id IS NOT NULL`) are expert inventory, not traveler demand — exclude from demand counts.
- Lane scripts (r7-db-pass.sql, q9.sql) historically existed only as chat artifacts, never in-tree — both now committed. If a lane dispatch references a script the repo lacks, ask for the file; do not reconstruct.
- HARD STOP before Phase 3: requires 2A/2B evidence + Q9 verdict + the 2.5 brief together, with human review. 2B rollup skeleton and 2.5 brief are separate dispatches — do not start unprompted.
- DB-write tests in this lane guard against non-disposable DBs; deliberate opt-in is `JOURNEY_DB_WRITES_OK=1` on the dev DB.

**Why:** lane decisions are ruling-driven (ledger); acting ahead of dispatches or re-deriving scripts corrupts the evidence chain.
**How to apply:** when a partner-demand dispatch arrives, verify exactly what it asks, commit findings to docs/findings/, and hold at the stated gates.
