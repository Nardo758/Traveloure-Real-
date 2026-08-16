# DISPATCH — Trend + Crowd Engine, Phase 2 CORRECTIVE 2 + Trending Cities repair

**Lane:** `lane/trend-engine` (items C–F) · Item A is a separate platform task outside this lane
**Trigger:** first-ingestion evidence review. X retention work accepted and closed. Four findings require correction before backfill; Trending City Rankings requires a real data path.
**Sequence is binding:** A (parallel) · B → C → D (backfill) → E (v0 resolver + cards) → F (Grok removal read).

---

## ITEM A — Migration runner audit (P1, own task, own branch, NOT this lane)

Migrations 235 and 236 silently no-oped; the runner only fires at app startup and skips without reporting. Two ledger entries are now hand-stamped. Consequences exceed this lane:
1. **Audit every registered migration vs. actual DB state** (dev and — read-only check — production). Report: applied-and-ledgered / applied-but-hand-stamped / registered-but-unapplied. Any unapplied migration found is escalated to Leon before being applied — do not blanket-apply.
2. **Runner fails loudly:** a registered-but-unapplied migration at startup = error state with visible alert, never a silent skip. (Standing bug class: absence-compared-to-absence — the runner exists, runs, and reports nothing.)
3. Ledger entries for 235/236 annotated "applied manually, runner defect" with date.
**Gate:** audit table pasted; synthetic unapplied migration triggers the loud failure; human read (platform-wide behavior change). Until this closes, "migration merged" is not proof of "migration applied" anywhere — treat as a standing caveat in all lanes.

## ITEM B — rowsInserted counter fix (#1512, gates backfill)

The counter increments on `ON CONFLICT DO NOTHING` conflicts, so it reports insertions that didn't happen. Backfill evidence depends on this number being true.
- Counter reports actual inserted rows (use insert-returning or xmax/rowCount semantics — agent's choice, correctness gated not implementation).
- **Gate:** re-run same-day ingestion → counter reports 0 new across all sources while DB row counts confirm 0 delta; paste both.

## ITEM C — Source health honesty + GDELT backoff (gates backfill)

G2 reported all 8 sources healthy while GDELT 429'd on runs 2 and 3. A source failing its last runs displayed as healthy is a silent-skip in new clothing (L5/R5 class).
1. Health status derives from last-run outcome per source: consecutive failures → `degraded`, visibly, with last error + timestamp. "Healthy" means the last run succeeded.
2. GDELT adapter gains rate-limit handling: exponential backoff on 429, bounded retries, per-run failure isolation preserved. Backfill-mode pacing (inter-request delay) — a full-depth historical pull against an API already 429ing at daily volume needs throttling by design.
3. Nager-India gap recorded: adapter header notes IN not in Nager.Date; **FOLLOWUPS #13** — India holiday-pressure alternate (static table or alternate API) for Mumbai/Jaipur/Goa; Diwali-class calendar pressure is exactly what the signal exists for and three of eight markets currently lack it.
**Gate:** simulated consecutive failure shows `degraded` in the panel; GDELT backoff test output; FOLLOWUPS entry pasted.

## ITEM D — Backfill execution (#1510, per standing Phase 2 dispatch §2.4)

Runs only after B and C close. All prior rules stand: cost-tracked per pass, R7 (no Grok-output ingestion — DB assertion required), R8 pre-launch flagging, x_api aggregates-only at whatever depth the tier allows, per-source depth as specced.
**Deliverable:** the calibration-readiness summary (per-market proxy depth, row counts, ground-truth overlap span, internal volume curve). Gates as previously written, plus: backfill progress/evidence counts come from the fixed counter (B).

## ITEM E — Trending City Rankings repair (the cards)

**Problem:** the cards rank cities on Grok-era `trending_score` values — inputs severed by R4, generator removed by 2.3. The ranking is fabricated and will freeze permanently. **Banned fix:** any ranking formula in the UI, a component helper, or a new service — that is a second scorer (L6).

**Required fix — v0 resolver, market grain only, in the canonical home:**
1. Create `trend-score.service.ts` now, implementing the brief §4.1 trend math **restricted to entity_type = market**: 90-day trailing baseline per metric (real, from backfilled history) → deviation → source-weighted, decay-adjusted composite (weights/half-lives from `trend_source_config`) → ÷ seasonal-expected (from `market_season_calendars`) → `trend_score` + `trend_confidence`. Writes `trend_scores` rows with `scoring_run_id`. This is not a parallel scorer — it is Phase 4's resolver, first slice, in its permanent file. Phase 4 extends it to the other entity types; nothing gets thrown away.
2. Deterministic (identical inputs → identical outputs; test). No LLM anywhere in the path (R2 grep gate). No literals — config only.
3. Nightly run scoped to markets, appended to the existing scheduler.
4. **Rewire `TrendingCities.tsx` (and any other surface ranking cities on the legacy score — grep for consumers of the old field and list them)** to rank by resolver `trend_score`, 8 operating markets only. Confidence floor applies (L9): a below-floor market renders unranked/without badge rather than with a fake position. Card copy: no "real-time" language; "updated daily" pattern from the #1496 copy audit.
5. Legacy `trending_score` field: stops being written (2.3 removes its generator), stops being read (this item removes its consumers). Grep gate: zero live readers of the legacy field after rewire.
**Gates:** determinism test; seasonal test at market grain (synthetic spike in-season scores lower than off-season); confidence-floor render test (screenshot); consumer grep before/after; screenshots of the cards ranked by resolver scores; tsc zero-new.
**Honesty note for the evidence:** with backfill providing years of Wikimedia/GDELT/internal history, baselines are real — but early confidence values will vary by market (thin sources outside Kyoto). Below-floor markets rendering unranked is the correct outcome, not a bug to fix by lowering the floor. The floor is config; only Leon moves it.

## ITEM F — Grok scoring removal (#1511, per Phase 2 dispatch §2.3, human read)

Unchanged in scope, with one amendment now that E exists: the interim static `crowdLevel` persistence rule stands, but `trending_score` needs no interim persistence — E's resolver replaces it live at market grain. Confirm the four traveler surfaces render correctly post-removal (band interim + resolver-ranked cards). Human read before merge, as standing.

## WHAT NOT TO DO
- No ranking math outside `trend-score.service.ts` (L6). No LLM in any scoring path (R2). No non-market entity types in the v0 resolver — Phase 4's dispatch owns those. No lowering the confidence floor to make more cards rank. No blanket-applying unapplied migrations found in A. No prod writes from this lane; Item A's prod check is read-only.

## HARD STOP
Evidence per item, in sequence. D's calibration-readiness summary and E's card screenshots are the two Leon-review artifacts. Phase 4 dispatch (remaining entity types + crowd bands) keys off both.
