# DISPATCH — Trend + Crowd Engine, Phase 2 (ingestion + backfill + Grok removal)

**Lane:** `lane/trend-engine` · continues on the lane branch after the Phase 1 merge (which includes migration 233 — do not start Phase 2 until that merge lands)
**Brief:** v1.1 §Phase 2, amended by everything below. Read brief + lane DECISIONS.md before any write.
**Externals confirmed:** Leon holds API credentials for BestTime, PredictHQ, and X. Exact credential types/tiers verified in 2.0, not assumed.

---

## NEW RULINGS (append to DECISIONS.md before work starts)

**R7 — Backfill ruling (clarifies "do not invent backfill").** The ban covers *fabricating* history, not *retrieving* it. A historical observation fetched from a source's archive, or deterministically reconstructed from existing platform rows, is legitimate: `observed_at` = the real historical date, `ingested_at` = now. What remains banned: manufacturing rows for periods a source has no record of, and — explicitly — **ingesting Grok's historical pulse/trending/crowd/traveler-estimate outputs as signals.** Those are outputs of the fabrication this lane replaces. They never enter `trend_signals`, ever.

**R8 — Calibration window starts at real traffic.** Reconstructed internal signals from before public launch measure the dev team, not demand. The backfill still ingests them (they're real observations), but a `pre_launch` flag or config cutoff date excludes them from any future calibration fit. Config, not literal.

**FU-12 amendment:** blocking condition changes from "≥1 full season of collected signals" to "backfill ingestion complete + entity resolution complete + docomo MSS quote answered." Market-level Kyoto calibration is expected to be viable weeks after this phase ships.

**Process ruling (from close-out):** full-domain coverage queries are the standard gate for any seeded calendar/range table going forward — boundary spot-checks are insufficient. Record it.

---

## PHASE 2.0 — Credential + entitlement verification (report before building adapters)

For each of the three, verify against the live API from the dev environment and report:
- **X:** which credential exists — X API v2 (which access tier: Basic/Pro? rate limits? counts endpoint access?) or xAI API (live-search entitlement?). If both exist, report both; Leon picks. Adapter design differs: v2 uses the counts/recent-search endpoints for mention velocity; xAI live-search extracts counts server-side and the cost ceiling is set against token spend.
- **BestTime:** plan level, venue quota, forecast vs live endpoints available.
- **PredictHQ:** plan, geo coverage across the 8 markets, attendance-prediction entitlement.
Report actual monthly cost implications per source → Leon sets the three `monthly_cost_ceiling` values in `trend_source_config` (agent proposes, Leon confirms — ceilings are Leon's numbers, not the agent's).
**Checkpoint (not a hard stop):** post 2.0 findings; proceed with open-license adapter work (2.2a) while awaiting Leon's ceiling confirmations; licensed adapters (2.2b) wait for them.

## PHASE 2.1 — Cost-tracking enforcement (net-new, prerequisite for all external adapters)

Per Phase 0 Gap 2: tracking exists, zero live callers, no ceiling logic. Build in-lane:
- Enforcement wrapper every trend-source adapter must call: records cost per call via the existing `api-costs` entry point, checks month-to-date vs `trend_source_config.monthly_cost_ceiling`, **halts that source** (not the run) at ceiling, raises a visible alert (source-health state, not a silent skip).
- Backfill passes are cost-tracked identically — a backfill cannot blow through a ceiling silently.
**Gate:** synthetic test — a source with a tiny test ceiling halts mid-run, alert state visible, other sources unaffected; DB read showing cost rows. Commit.

## PHASE 2.2 — Entity resolution + adapters

**2.2a Resolution + open-license adapters (proceed immediately):**
- Resolution pass per brief: 8 markets, Kyoto neighborhoods (FK → `city_neighborhoods`), Kyoto gems. Wikidata/Wikipedia by name+geo, null when unconfident. Report match rates.
- Adapters: `wikimedia_pageviews`, `gdelt`, `nager_date`, `open_meteo` — each with **two modes: `daily()` and `backfill(from, to)`** (R7). Backfill depths: Wikimedia to 2015-07 (API floor), GDELT v2 to 2015, Open-Meteo historical archive, Nager.Date deterministic.
- **Internal reconstruction adapter** (R1 plumbing, migrated per R6): `trips_active_on_date` + `trips_upcoming_30d_from_date` as deterministic as-of-date queries over both booking rails (rail-tagged) and trips — `daily()` and `backfill()` across full platform history, `pre_launch` flagging per R8.

**2.2b Licensed adapters (after Leon confirms ceilings from 2.0):**
- `besttime`: match Kyoto gems flagged venue-matchable in Phase 0 §0.4 → `besttime_venue_id`; report match rate; forecast (+ live if entitled) ingestion. No meaningful backfill — daily-forward only.
- `predicthq`: predicted event attendance per market geo; historical events backfillable if plan allows — report.
- `x_api`: per the 2.0 credential outcome. Mention/post counts + velocity per market and resolvable gems (`x_handle_or_query`). Counts and velocities only — **no LLM summarization or scoring of X content (R2)**. Backfill depth per tier entitlement — report.
- All three: `licensed_no_resale`, ToS-compliant retention (no storing beyond permitted windows — check each ToS, note retention rule per source in the adapter header).

**Gates 2.2:** every external call produces cost rows (DB read post-run); idempotency — same-day re-run adds zero duplicate (source, entity, metric, observed_at) rows, and backfill re-run over the same range likewise; a resolved Kyoto gem shows real Wikimedia history spanning years (DB read: min/max observed_at); no adapter writes a `resale_class` other than its config value (test). Commit per sub-phase.

## PHASE 2.3 — Grok scoring removal + scope drop (one PR, human read required)

- Remove the Grok scoring call from the daily city refresh. Pulse/trending/crowd values stop being Grok-generated. **Interim `crowdLevel` handling:** the last-written band values persist as-is (static interim, option (b) continues) until Phase 4's resolver takes over the field — do not null them, do not let the UI break, do not re-generate them.
- Traveler-estimate write path removed (R3); admin-tab illustration retention optional per R3's label rule.
- Refresh scope drops from 25 cities to the 8 operating markets (config).
- SerpAPI call in this path: confirm already dead per R4 hotfix; grep gate extends to it.
**Gates:** grep — no Grok/LLM invocation reachable from the refresh scheduler; scheduler trace showing 8 markets; four traveler surfaces render band-only, unbroken (screenshots); tsc zero-new. **Human read before merge** (live-behavior removal).

## PHASE 2.4 — One-time backfill execution

After 2.2 adapters land: run `backfill()` per source (open-license full-depth; licensed per entitlement; internal reconstruction full-history with R8 flags). Then report the **calibration-readiness summary**: per market — proxy history depth (min observed_at per source), row counts, overlap span with known ground-truth publications (Kyoto City/JNTO/INE/etc.), and the reconstructed-internal volume curve (so thin-early-history is visible). This summary is the FU-12 trigger evidence.
**Gates:** cost report per backfill pass (within ceilings); spot-check — three Kyoto entities' Wikimedia rows match the public API for three random historical dates (paste both); zero rows sourced from Grok outputs (grep the adapter set + a DB assertion that no source value equals the legacy travel_pulse estimate fields' lineage — state method used).

## WHAT NOT TO DO
- No resolver/scoring work — Phase 4. No traveler-facing UI. No calibration fitting — FU-12 lane.
- No Grok historical outputs into `trend_signals` (R7 — this is the tempting one; the numbers are sitting in the DB looking like history).
- No fuzzy-forced entity matches; null is honest. No literals — everything via config. No parallel agents. No prod writes.

## HARD STOP
Post all gate evidence + the calibration-readiness summary. Leon review. The Phase 4 (resolver) dispatch and the FU-12 kickoff decision both key off the readiness summary.
