# DISPATCH — Trend + Crowd Engine, Phase 1 CLOSE-OUT + Calibration Follow-up Registration

**Lane:** `lane/trend-engine` · same branch · this dispatch closes the corrective and clears the merge
**Scope:** two season rows, ledger entries, FOLLOWUPS registration, merge prep. Nothing else. No Phase 2 work.

---

## ITEM 1 — Season gap rows (Leon-approved, insert as specified)

Add exactly two rows to `market_season_calendars` via UPDATE/INSERT migration on this branch:

| market_key | season_key | display_name | start_month_day | end_month_day | expected_demand_multiplier |
|---|---|---|---|---|---|
| kyoto | spring_shoulder | Spring Shoulder | 04-21 | 06-06 | 1.100 |
| edinburgh | autumn_shoulder | Autumn Shoulder | 09-01 | 10-31 | 0.900 |

Basis labels (record alongside, same discipline as 1b): both "Leon-approved estimate — Kyoto spring_shoulder held at 1.10 because Golden Week (late Apr–early May) sits inside the window; Edinburgh autumn_shoulder 0.90 as post-Festival cooldown above winter floor."

**Gate:** full-year coverage check per market — for kyoto and edinburgh, every calendar day resolves to exactly one season row (no gaps, no overlaps). Paste the query proving it. Run the same check on all 8 markets while you're there; report any other gap/overlap found (report only — no unauthorized new rows).

## ITEM 2 — Ledger entries (lane `DECISIONS.md`, append-only)

1. **Season seed approved with two additions** — 26 agent rows approved as-inserted with bases labeled; kyoto spring_shoulder + edinburgh autumn_shoulder added per Leon (this dispatch, dated).
2. **#1496 executed in-lane, expanded scope** — 6 render sites suppressed (not the audited 4; `discover-location.tsx:385` and `discover.tsx:652` found during execution — note the discover.tsx aliasing of a count into "review counts" as an instance of the fabrication class). `crowdLevel` band retained per option (b). Copy audit: "Real-time"/"Live Updates" language removed from all adjacent sites.
3. **R3 amendment path recorded (not yet active):** absolute crowd counts may return per-entity as *calibrated range estimates* only — fitted against external ground truth, rendered as ranges with "estimated" label, permitted only where fit quality passes a config threshold. Amendment activates when the Calibration Lane ships, not before. Until then R3 stands as-is.

## ITEM 3 — FOLLOWUPS.md registration

**#12 — Crowd Calibration Lane.** Fits `calibration_constant × proxy_composite` against external ground truth; constants fitted per season-calendar window. Scope tiers: market-level all 8 (official stats: Kyoto City Tourism Survey/JNTO, VisitScotland/ALVA, INE/Turismo de Portugal, Migración Colombia/MinCIT + Cartagena cruise counts, India MoT state stats), neighborhood-level Kyoto-only (NTT docomo Mobile Spatial Statistics — licensed_no_resale, cost-ceilinged), gem-level ticketed venues only. Range rendering, per-entity earned display (L9 extension), no-calibration→band-only. Supporting cross-checks: hotel occupancy × inventory, airport passenger stats. **Blocked on:** ≥1 full season of `trend_signals` proxy history (Phases 2–3 output) + docomo MSS quote.

**Leon-side action recorded (not agent work):** request docomo MSS pricing for Kyoto 500m-mesh — long lead time expected, start early.

## ITEM 4 — Merge prep

- `tsc` still 168 (zero new vs baseline) after the two-row migration.
- Confirm branch contains, in order: R4 hotfix (carried), Phase 1 schema+seeds, corrective (#1496 suppressions + copy audit), this close-out (2 season rows + ledger + FOLLOWUPS).
- Post final gate evidence. **HARD STOP.** Human read covers the whole branch in one review; Leon merges.

## AFTER MERGE (for the record, not this dispatch)

Republish is unblocked on the count side once merged: `activeTravelers` suppressed everywhere traveler-facing, `crowdLevel` band rides interim. Phase 2 dispatch follows separately — still gated on Leon's three externals: BestTime tier, PredictHQ contract, and which X credential exists (X API v2 vs xAI live-search).
