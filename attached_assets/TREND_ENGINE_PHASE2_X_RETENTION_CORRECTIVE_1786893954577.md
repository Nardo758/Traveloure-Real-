# DISPATCH — Trend + Crowd Engine, Phase 2 CORRECTIVE: X retention architecture + adapter enablement

**Lane:** `lane/trend-engine` · same branch
**Trigger:** proposed X purge job would delete aggregate signal rows and permanently cap X baselines at 30 days. The purge design is rejected. Compliance is achieved by never storing X content, not by purging our own derived aggregates.
**Scope:** items below, then first ingestion. Nothing else.

---

## RULING R9 — X data retention (append to DECISIONS.md before work)

The X developer agreement's 30-day cap applies to **X Content** — post text, IDs, media, user objects, anything reproducing or reconstructing posts. It does not, under the standard industry reading, reach **our own derived, non-reconstructable aggregates** ("N mentions resolving to entity E on date D"). Architecture: content is processed in-flight and never stored; aggregate counts/velocities are our analytics and persist indefinitely — same class as trend scores. Retained derived aggregates are the standard social-listening architecture (Brandwatch/Sprinklr class), not a workaround.
**Counsel item (parked with data-resale ToS + 10DLC):** "X data retention — derived-aggregates-only architecture — confirm under current X developer agreement + our tier." The architecture ships now; counsel confirms, doesn't design. If counsel later requires aggregate purging under a maximally conservative reading, the fallback in §3 preserves the signal.

## ITEM 1 — Kill the purge job design

- Do **not** implement the proposed `DELETE FROM trend_signals WHERE source='x_api' AND observed_at < NOW() - 30 days` job. No purge job on aggregate signal rows for any source.
- If any scheduled-job scaffolding for it was already written, remove it. Grep gate: no purge/delete logic targeting `trend_signals` anywhere.

## ITEM 2 — Enforce content-free X ingestion

1. **`raw_ref IS NULL` for `source = 'x_api'`, hard-enforced twice:** (a) adapter never writes it; (b) DB CHECK constraint or trigger-equivalent rejecting any x_api row with non-null `raw_ref` (same belt-and-suspenders pattern as the Kyoto submit gate). Test: insert attempt with raw_ref populated → fails; paste output.
2. **Content-debris sweep:** audit the x_api adapter's full path — code, debug statements, logs, any cache/temp writes — for stored post text, tweet/post IDs, user handles/IDs, or payload fragments. Report findings file:line. If any content-bearing debris exists from build/testing (in raw_ref, logs, or elsewhere), purge it now, once, and remove the code path that wrote it.
3. **In-flight only:** confirm the adapter's compute path processes API responses in memory and discards them within the run — nothing content-shaped persists to any table, log file, or cache beyond run completion. State how verified.
4. **Adapter header note:** retention rule = "derived aggregates persist indefinitely; X Content never stored; R9, counsel verification pending."
5. `x_handle_or_query` on `trend_entities` is **our** query configuration, not X content — it stays. Note this in the header too so nobody later "cleans" it.

## ITEM 3 — Baseline-survival fallback (cheap insurance, build the stub now)

The nightly scoring run (Phase 4) will materialize rolling baseline statistics per entity (trailing mean/variance per metric). Add to the Phase 4 requirements — recorded now in the lane FOLLOWUPS/brief margin, implemented in Phase 4, not here: baseline stats are computed and stored as first-class rows (not just intermediate values), so that under a worst-case forced-purge reading of any licensed source, scores degrade gracefully from stored baselines instead of dying. No Phase 4 code in this dispatch — just the recorded requirement.

## ITEM 4 — Enable + first ingestion (per Phase 2 dispatch gates)

1. Flip all 8 adapters `enabled = true` in `trend_source_config` (config change, no deploy — verify that holds true).
2. Run first daily ingestion across all sources.
3. **Weather note stands:** open_meteo `avg_temp_c`/`precip_mm` ingest and store; the scorer ignores weather in v1 (L3). No one wires weather into any math in this lane.
4. Gates (from Phase 2 dispatch, restated):
   - Cost rows exist for every external call post-run — DB read pasted, per source.
   - All sources within their Leon-confirmed ceilings; source-health panel state pasted.
   - Idempotency: same-day re-run adds zero duplicate (source, entity, metric, observed_at) rows — test output.
   - `resale_class` per row matches config per source — assertion query pasted.
   - x_api rows: counts/velocities only, `raw_ref` null across 100% of rows — query pasted.
   - Spot-check: one resolved Kyoto gem shows plausible first-day rows from ≥5 sources — DB read.

## HARD STOP

Post evidence for Items 1–2 and Gate set 4. Then proceed to the Phase 2.4 backfill execution per the standing Phase 2 dispatch (backfill passes remain cost-tracked; x_api backfill depth per tier entitlement, aggregates-only same as daily). Calibration-readiness summary closes Phase 2 as previously specified. Human read covers this corrective with the Phase 2 branch review.
