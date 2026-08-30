# Operation Trailhead — T2 Kyoto Batch Review Pack (HARD STOP)

**Evidence recorded from the development-only T2.3 Kyoto ignition run. Leon retains the market-expansion decision.**
No market moves and no expert-intake happens until this pack is filled and signed off. Edinburgh is promoted ONLY by the evidence in §6 (R-T1-b), never by schedule.

- **Run date:** 2026-08-21 (development environment; run timestamps recorded in UTC)
- **Run by:** Replit Agent, authorized development-only run
- **Commit / deploy SHA ignited:** not captured in this dispatch
- **Tavily dashboard price confirmed this run:** not independently verified; the configured planning assumption remains `$0.008` / credit

---

## 1. Per-category: scraped vs target (Kyoto)

Targets are the hand-set `KYOTO_CONTENT_PLAN` (authoritative for Kyoto), total 57.
Fill `held after run` from:
```sql
SELECT content_type, count(*) FROM dmo_raw_content
WHERE city='Kyoto' AND status NOT IN ('rejected','quarantined')
GROUP BY content_type ORDER BY content_type;
```

| Content type | Target | Held before | Held after | Δ this run | % of target | Still short |
|---|---|---|---|---|---|---|
| attraction | 15 | 16 | 16 | 0 | 106.7% | 0 |
| venue | 12 | 6 | 9 | +3 | 75.0% | 3 |
| restaurant | 12 | 6 | 12 | +6 | 100.0% | 0 |
| event | 10 | 6 | 9 | +3 | 90.0% | 1 |
| destination | 8 | 6 | 6 | 0 | 75.0% | 2 |
| **Total** | **57** | **40** | **52** | **+12** | **91.2%** | **6** |

## 2. Extraction-quality sample (10 stubs)

Pick 10 stubs the run created/enriched; judge each by hand. "Usable" = a real, correctly-typed Kyoto place with a plausible source URL an expert could curate — NOT a listicle, aggregator page, or off-topic hit.

| # | Stub name | content_type | Source URL | Correct type? | Real place? | Usable? | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Japan Festivals 2026 & 2027 | event | Indochina Travel | No | No | No | Japan-wide festival guide, not a Kyoto event/place; manual URL check returned 406. |
| 2 | Top 3 Traditional Festivals in Kyoto | event | H.I.S. USA | No | No | No | Kyoto-relevant multi-event editorial guide, not one event/place; source returned 200. |
| 3 | Must-see Summer Festivals in Kyoto 2026 | event | Rakuten Travel | No | No | No | Seasonal guide, not an individual event/place; manual retrieval did not complete. |
| 4 | Where to Eat in Kyoto, Japan: Best Restaurants & Dining Guide | restaurant | Travel Caffeine | No | No | No | Restaurant guide/listicle, not a restaurant record; source returned 200. |
| 5 | Fine Dining Restaurant Japan (TikTok) | restaurant | TikTok | No | No | No | Generic Japan discovery page, not Kyoto-specific and not a restaurant; source returned 200. |
| 6 | Best Fine Dining Restaurants in Kyoto: 8 Top Picks | restaurant | byFood | No | No | No | Kyoto-relevant listicle, not an individual restaurant; manual URL check returned 403. |
| 7 | Restaurants in Kyoto, Japan: Budget Eats & Fine Dining Spots | restaurant | WanderOn | No | No | No | Restaurant guide/listicle, not a restaurant record; manual URL check returned 429. |
| 8 | 15 Fine Dining Restaurants in Kyoto to Die for | restaurant | Tsunagu Japan | No | No | No | Listicle, not an individual restaurant; source returned 200. |
| 9 | Best Fine Dining Restaurants in Kyoto | restaurant | En Primeur Club | No | No | No | Restaurant guide, not a restaurant record; manual URL check returned 429. |
| 10 | Festivals & Events | event | Kyoto Travel | No | No | No | Official and Kyoto-specific, but still an events index rather than one event/place; source returned 200. |

**Usable rate:** **0 / 10** under the stated strict per-place rubric.

**Method note:** This was a manual source-plausibility spot-check using the stored title/description and live URL retrieval where possible. It was **not** an automated Google Places or other venue-verification pass.

## 3. Cost actuals vs estimate

- **Extraction (Anthropic) actual** — from `ai_cost_tracking`:
  ```sql
  SELECT count(*) AS calls, round(sum(cost)::numeric,4) AS cost_usd
  FROM ai_cost_tracking WHERE source_type='dmo_extract_places'
    AND created_at > '<run start>';
  ```
- **Tavily actual** — read the Tavily dashboard (not metered in code; see dispatch §3).

| Line | Estimate (dispatch §0) | Actual | Under cap? |
|---|---|---|---|
| Tavily credits used | ≤ ~40 | Not metered in application data; Tavily dashboard not independently verified | Unverified |
| Tavily $ spend | ~$0.32 | Not independently verified | Unverified vs $150 cap |
| Anthropic extraction $ | — | $0.0194 (3 `dmo_extract_places` calls) | Yes |
| **Total run $** | | Unknown (Tavily actual unavailable) + $0.0194 | Unverified |

Cost-per-usable-item = **not computable**: the strict sample found 0 usable raw stubs and Tavily actuals were not independently available.

## 4. Duplicate / junk rate

- **Duplicates suppressed** (idempotent (source_url, source_id) conflicts) — from the run's `gapfill` return (`created` vs `duplicates`): created **12**, duplicates **6**.
- **Junk** (unusable from §2 + any off-topic rows found): **10 / 10 = 100% in the manual sample**. This is a sample quality rate, not a claim that all 12 new rows were individually reviewed.

| Metric | Count | Rate |
|---|---|---|
| Rows created this run | 12 | — |
| Duplicates skipped | 6 | 33.3% of 18 gap candidates |
| Junk / unusable (manual sample) | 10 / 10 | 100.0% |

## 5. Kyoto plan diff (derived browsable-minimum vs hand plan)

Reference only — confirms the hand plan is the deeper, authoritative one; the derived plan is NOT applied to Kyoto. Generated by `diffKyotoPlan()` (`server/services/content-gap-taxonomy.ts`):

| Content type | Hand target | Derived (Tier-2 min) | Δ (hand − derived) | Note |
|---|---|---|---|---|
| attraction | 15 | 8 | +7 | hand deeper (Kyoto wedge) |
| venue | 12 | 4 | +8 | hand deeper (Kyoto wedge) |
| restaurant | 12 | 6 | +6 | hand deeper (Kyoto wedge) |
| event | 10 | 4 | +6 | hand deeper (Kyoto wedge) |
| destination | 8 | 4 | +4 | hand deeper (Kyoto wedge) |
| **Total** | **57** | **26** | **+31** | — |

Honesty notes carried by the derivation (§13): `destination` is a browsable-minimum type with **zero** template-matrix demand (neighborhoods are browsability scaffolding, not template-demanded); `transport` is matrix-demanded but **deferred** (outside the browsable minimum). Neither is faked into the plan.

## 5.1 Single-stub walkthrough and final reset

- Selected new hidden item: `Top 3 Traditional Festivals in Kyoto` (event).
- Development-only test-admin route sequence: intake approve → single-item publish → traveler payload → tracked source click.
- Published API payload exposed it as an `external` non-bookable stub with the stored source URL; its approval hook produced two extracted Kyoto place records with coordinates.
- The click-out rail returned success and wrote one `affiliate_clicks` record for `dmo:Top 3 Traditional Festivals in Kyoto:Kyoto`.
- The item was then restored to expert-only, unpublished state. Final hard gate: **52 Kyoto rows; 0 traveler-visible; 0 `status='published'`; public external-stub count 0.**
- `DMO_INGEST_ENABLED` was returned to `0` after the one-time run so the daily scheduler cannot incur further development spend.

## 6. Edinburgh-promotion recommendation (the decision this pack gates)

Edinburgh is the named next-up market (R-T1-b), promoted **only** by this run's evidence — extraction quality, cost-per-usable-item, and review burden — never by schedule. Fill and recommend:

| Signal | This Kyoto run | Bar to clear for Edinburgh | Meets bar? |
|---|---|---|---|
| Usable rate (§2) | 0 / 10 | (Leon sets) | No evidence of meeting a viable bar |
| Cost-per-usable-item (§3) | Not computable | ≪ affiliate CAC | Unverified |
| Duplicate/junk rate (§4) | 100% manual-sample unusable; 33.3% duplicates | (Leon sets) | No evidence of meeting a viable bar |
| Review burden (expert-hours to curate the batch) | At least 12 new raw rows; sample indicates curation/discard rather than simple approval | sustainable at 2 markets | Unverified / likely high |

**Recommendation:** ☐ Promote Edinburgh to ignition · ☒ Hold — tune Kyoto first · ☐ Abort market expansion

**Evidence rationale (pending Leon):** The bounded run remained hidden and the workflow itself passed, but the strict manual sample yielded 0 usable per-place stubs out of 10. Do not expand markets until gap-fill extraction produces individual, correctly typed Kyoto entities and Tavily actual spend is independently verified.

**If promoting Edinburgh:** it is a flag-flip + a Leon go on the already-authored inert Edinburgh plan (`INERT_MARKET_CONTENT_PLANS['edinburgh']`, R-T1-d) — plus first supplying real, verified Edinburgh DMO domains (VisitScotland / Forever Edinburgh were named in the registry without a confirmable domain, so no `dmo_sources` row exists yet — never invent one, §13).

---

**Sign-off (Leon):** ____________________  **Date:** __________
