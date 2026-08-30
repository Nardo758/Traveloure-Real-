# DISPATCH — Trend + Crowd Engine, Phase 1 CORRECTIVE (pre-merge)

**Lane:** `lane/trend-engine` · same branch, no new lane
**Status:** Phase 1 gates 1–8 accepted. Merge is HELD on two open items. This dispatch closes them. No other work is in scope.

---

## ITEM 1 — Season seed content review (skipped requirement, now enforced)

Brief §Phase 1 required the season calendar seed to be **Leon-reviewed before insert**. It was inserted unreviewed. The review happens now, before merge.

**1a. Paste the full seed — all 26 rows**, exactly these columns, as a table in the PR:

```
market_key | season_key | display_name | start_month_day | end_month_day | expected_demand_multiplier
```

**1b. For every `expected_demand_multiplier`, state its basis** in one line each. Acceptable bases: official visitor statistics (name the source), documented seasonal pattern (name it), or "agent estimate — no source." Do not dress an estimate up as sourced. Estimates are acceptable in dev; mislabeled estimates are not.

**1c. Answer these specifically** (the rows most likely to be wrong):
- Kyoto: exact sakura and momiji window boundaries used, and whether tsuyu's multiplier is below 1.0 (it should be — it is a demand trough, not a peak).
- Edinburgh: is festival-August its own row with the highest multiplier in that market? What are the shoulder boundaries around it?
- Bogotá: which two windows were chosen as the rainy periods, and are all four multipliers near-flat (the brief describes Bogotá as near-seasonless — multipliers should cluster near 1.0, not swing)?
- Cartagena (2 rows): boundary between dry-peak and rainy, and the multiplier spread.
- Goa/Mumbai monsoon rows: multipliers below 1.0, yes/no.

**1d. Then STOP.** Leon reviews the pasted rows. Corrections, if any, are applied as an UPDATE migration on the same branch **before** merge — not as a follow-up. If Leon approves as-is, note "season seed approved as-inserted" in the lane `DECISIONS.md` with the date.

**Do not** re-derive, re-research, or restructure the calendar unprompted. Paste what exists, label the bases honestly, answer 1c, stop.

## ITEM 2 — #1496 ownership and status (unaccounted blocker)

The republish hold is enforced by #1496 existing as a **blocking** task. Its status was absent from the gate evidence. Close the gap:

**2a. Report status**: not started / in progress / shipped-as-separate-PR (name it).

**2b. If not started or unowned — execute it now, in this lane, this branch:**
- Suppress `activeTravelers` rendering at exactly: `CityCard.tsx:142`, `CityGrid.tsx:377`, `CityDetailView.tsx:880`, `TrendingCities.tsx:74`.
- `crowdLevel` band-string **remains rendered** (option b, locked). Band word only — audit the copy adjacent to each of the four render sites and remove any text implying live or measured crowd data ("real-time", "live crowd", "current visitors", similar). Report what copy, if any, was changed, with file:line.
- No layout rework, no component refactors, no other TravelPulse surface touched. Suppression means the count does not render; it does not mean redesign.

**2c. Mark #1496 blocking-republish in the tracker** and paste proof (screenshot or tracker link/state).

**2d. Grep gate:** `activeTravelers` has zero traveler-facing render sites remaining (admin surfaces exempt per R3's labeled-illustration allowance). Paste grep output.

## GATES (all must pass; then hard stop)

1. All 26 season rows pasted with multiplier bases labeled (1a/1b) and 1c answered.
2. Any Leon-directed season corrections applied and re-pasted; or "approved as-inserted" recorded in `DECISIONS.md`.
3. #1496 status reported; if executed here: screenshots of all four surfaces showing no count, band-word crowd intact; copy-audit results with file:line.
4. Grep: no traveler-facing `activeTravelers` render (2d output pasted).
5. `tsc`: still zero new errors vs main baseline (168).

## HARD STOP

Post evidence, stop. Human read covers this corrective plus the original Phase 1 commit plus the carried R4 hotfix in one merge review. Phase 2 remains gated on its own dispatch (BestTime tier, PredictHQ contract, X credential — Leon-side, unchanged).
