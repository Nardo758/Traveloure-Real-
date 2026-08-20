# Partner Demand · STEP 3.7 · PART A — Diagnosis (read-only)

**Branch:** `lane/partner-demand-fidelity` · **Base SHA:** `3258f4fd` (off current `main`).
**Posture:** READ-ONLY. No fixes applied. This is the HARD-STOP evidence post; Part B is written from
Leon's rulings on this, not from the symptom list. All Phase-3 rulings carry (R13, R19, R20, R21,
R25-final, R27, §13).

**One structural fact that underpins A1–A3:** the Market Research page runs **TWO independent data
paths**, and the reviewer's three anomalies all live on the *second* one:
- **Hero + Windows** → `GET /api/me/demand-rollup` (`market-research.tsx:67`) → `readPartnerDemandRollup`.
  This path IS operating-market-correct: it resolves the provider's service cities through
  `resolveMarketSlug` (the 8-market allow-list) and **excludes the `__unmapped__` bucket (R13)**.
- **Search-interest layer** → `<MarketInsightsView />` → `GET /api/provider/market-insights`
  (`catalog-map-view.tsx:394`). This path uses **raw `providerServices.city` strings** with **no
  operating-market validation and no R13 guard**. The Bali leak, the zero-vs-dots contradiction, and
  the "search interest" label all originate here.

The search layer is not a thin version of the rollup — it is a *different, older subsystem*
(`market-insights`, demand + coverage-gaps) reused as the map. That mismatch is the root of A1 and A2.

---

## A1 — Where does Bali enter?

**Data path, end to end:**
1. `market-research.tsx:166` mounts `<SearchInterestLayer market={selected} />`.
2. `SearchInterestLayer` (`market-research.tsx:277–322`) uses `market` **only** for the toggle-signal
   POST (`:289`); it renders `<MarketInsightsView />` (`:318`) **with no props** — the selected market
   never scopes the map.
3. `MarketInsightsView` (`catalog-map-view.tsx:393–395`) fetches `GET /api/provider/market-insights`
   with **no market parameter**.
4. Server (`server/routes.ts:2375–2415`): `cities = storage.getProviderMarketCities(userId)` →
   `getMarketDemandRows(cities, tokens, 90)` → `resolveDemandBuckets(...)`.
5. `getProviderMarketCities` (`storage.ts:6627–6635`): `SELECT DISTINCT city FROM provider_services
   WHERE user_id = ? AND city IS NOT NULL` — returns the raw city strings, trimmed, **nothing else**.

**(a) Is there ANY operating-market filter on that path?** **NO.**
- `resolveMarketSlug` (the 8-market allow-list) is imported in `storage.ts:137` but used **only at
  trip-write time** (`storage.ts:1300`, `:1338`) — never on the market-insights path.
- Grep of `server/routes.ts` (the endpoint), `server/storage.ts` (the three readers), and
  `server/services/market-insights.service.ts` (the resolver) for `OPERATING_MARKETS` /
  `resolveMarketSlug` / `market_geography` / `UNMAPPED` on this path: **zero hits**. The path never
  intersects the operating-market set.

**(b) ⚑ REPLIT — what destination values exist in the source rows.** The map's substrate is
`search_analytics.destination` + `demand_signals.destination` (see A2), scoped by
`destination ILIKE '%<city>%'` where `<city>` is a provider's own `provider_services.city`. Run and paste:
```sql
-- the provider's declared market cities (this is what scopes everything):
SELECT DISTINCT city FROM provider_services WHERE user_id = '<KYOTO_PROVIDER_ID>' AND city IS NOT NULL;
-- destination distribution the layer can surface for that provider:
SELECT destination, count(*) FROM search_analytics WHERE created_at > now() - interval '90 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 40;
SELECT destination, search_count FROM demand_signals ORDER BY search_count DESC LIMIT 40;
```
**Hypothesis to confirm/deny:** "Bali" appears because the provider has a `provider_services` row with
`city = 'Bali'` (or a Bali-referencing string), so `getProviderMarketCities` returns
`['Kyoto', 'Bali', …]` and Bali's search rows pass the `ILIKE '%Bali%'` scope. Bali is **not** one of
the 8 operating markets — so this is a non-operating market rendered on a partner surface.

**(c) Does the declared-market anchor scope the query?** Partially, and that is the bug. The query IS
scoped to the provider's cities (`getMarketDemandRows`, `storage.ts:6703–6740`, `ILIKE '%city%'` OR
exact neighborhood-token). But the **anchor itself is unvalidated** — it is whatever the provider
typed into `provider_services.city`, not an operating-market slug. So the layer renders whatever the
feed contains *within the provider's own declared cities, however non-canonical those cities are*.

**R13 citation:** R13 = *unmapped / non-operating markets are admin-only, never partner-facing.* The
rollup path enforces this (`readPartnerDemandRollup` excludes `__unmapped__`). The market-insights
path has **no equivalent guard** — it predates the rollup and never got one. A Kyoto provider seeing
"Bali, Kyoto" is exactly the R13 violation, occurring because the two paths were never unified.

---

## A2 — The zero-vs-dots contradiction

**Both trace to `/api/provider/market-insights` → `demand` + `gaps`, rendered in `MarketInsightsView`
(`catalog-map-view.tsx:417–517`).** They diverge because **the label counts ONE substrate and the
map plots TWO.**

**(a) What the LABEL counts** — `catalog-map-view.tsx:418–421`, rendered at `:439–440`:
```
totalRealSearches = Σ demand.byNeighborhood.searchCount + Σ demand.cityLevel.searchCount + demand.unplaceableCount
"Based on {totalRealSearches} real searches in the last 90 days"
```
This is **searches only** (from `search_analytics` + `demand_signals`).

**(b) What the DOTS plot** — `catalog-map-view.tsx:425–428`:
```
points = [ ...demand.byNeighborhood centroids, ...gaps centroids ]
```
The map renders **two mark types**: search-demand `CircleMarker`s (`:468–482`, red `#E85D55`, sized by
searchCount) **AND coverage-gap `+N` squares** (`:483–503`, `#9A6B1F`, label `+${g.gap}`). The `gaps`
array comes from `resolveCoverageGaps(supply, targets, neighborhoods)` (`routes.ts:2404`) — **targets
minus supply, NOT searches.** `nothingToShow` (`:430`) is false whenever `gaps.length > 0`, so the map
paints even with zero searches.

**(c) Where they diverge — file:line:** `catalog-map-view.tsx:418–421` (label = searches) vs `:425–428`
+ `:483–503` (dots = searches **+ coverage gaps**). The reviewer's "0 real searches … +1 dots" is a
**"0 searches" label sitting over a `+1` coverage-gap square** — two different metrics fused into one
layer whose header says "search interest." The honesty line is technically correct (0 searches); the
pixels are a supply-gap metric; a viewer reads the map as search activity, so they contradict.

**Second, smaller divergence — the window label over-claims.** `getMarketDemandRows` windows
`search_analytics` to 90 days (`storage.ts:6718`) but reads `demand_signals` with **no window**
(`:6725–6728`, comment "no per-event window — it is already a rollup"). So the "last 90 days" label
(`catalog-map-view.tsx:440`) is inaccurate for any `demand_signals` contribution — it is really
"90 days of search_analytics + all-time demand_signals."

**⚑ REPLIT — is the search substrate actually populated on real data?** Run and paste:
```sql
SELECT count(*) total, count(*) FILTER (WHERE created_at > now() - interval '90 days') AS last_90d,
       min(created_at), max(created_at) FROM search_analytics;
SELECT count(*) total, sum(search_count) AS total_search_count FROM demand_signals;
```
**If `search_analytics.last_90d` is effectively 0** (the reviewer's "0 real searches" says it is): the
hybrid ruling's premise — "the populated neighborhood search signal" — **does not hold on real data.**
The layer is then rendering coverage-gaps under a "search interest" header. Per §13 a mostly-empty
layer *labeled honestly* is acceptable; a layer whose **label and pixels disagree is not**. This is an
input to Leon's Part-B ruling, up to and including **unmounting the layer** until the search
write-path FOLLOWUP lands (the write path is out of scope here per WHAT-NOT-TO-DO).

---

## A3 — Why is the hero stay-only?

**The hero reads the ROLLUP path (correct, R13-clean), not the search path.** Selection logic —
`market-research.tsx:174–208`:
```
b = summary.requested
hasSlip = b.slipAmount != null && b.slipAmount > 0     // service $, shown FIRST
hasStay = b.stayTrips > 0                               // stay, shown ONLY if !hasSlip
```
This is the **same R19 posture as the Today card's `pickTopDemandSignal`**: service-$ wins; stay is the
fallback; the two never blend. So "27 trips · 135 nights" means **`summary.requested.slipAmount` is
null/0 on real Kyoto data** while `stayTrips > 0`.

**Which of (a)/(b)/(c) holds:**
- **(b) selection picks stay over service — NO.** The selection is slip-first; it only shows stay when
  there is no positive slip amount. Not a selection bug.
- **(c) job computes service cells over fixtures but not real rows — UNLIKELY.** `computeUnmetSlip`
  runs identically over all open items regardless of source; the fixtures proved it. But confirm with
  the ⚑ rows below.
- **(a) the slip cell is genuinely null/zero/suppressed on real data — MOST LIKELY, and honest.**
  `slipAmount` is `Σ estimatedCost over open items that carry a price` (`demand-rollup.compute.ts`
  `computeUnmetSlip`). It is null when **no open Kyoto item carried an `estimatedCost`** — the
  real-data analog of the "capture/linkage gap" already filed for coords/category (followup #1–3).

**⚑ REPLIT — paste the rollup rows + item-level counts:**
```sql
-- Kyoto requested market cells (slip vs stay), forward window:
SELECT metric, value, source_row_count, date FROM partner_demand_rollup
 WHERE market_slug='kyoto' AND partner_id IS NULL AND service_id IS NULL
   AND metric IN ('unmet_demand_slip','unmet_demand_stay') AND date >= CURRENT_DATE
 ORDER BY metric, date;
-- item-level: do real open Kyoto items carry price / service linkage?
SELECT count(*) open_items,
       count(ii.provider_service_id) with_service,
       count(ii.estimated_cost)      with_price
FROM itinerary_items ii JOIN trips t ON t.id = ii.trip_id
LEFT JOIN users u ON u.id = t.user_id
WHERE t.market_slug='kyoto' AND ii.routing_status IN ('in_planning','with_expert')
  AND (u.email IS NULL OR u.email NOT LIKE '%@traveloure.test') AND t.author_id IS NULL;  -- R16 approx
```
**If (a):** the hero render is **CORRECT and honest** — the finding is a *capture/linkage gap* for the
FOLLOWUP (real open items lack the price the fixtures had), **not** something to "fix" in the hero.

**One nuance for Leon (not a defect, a design call):** the hero gate is `slipAmount > 0`, so a
**count-only slip cell** (open items exist, none priced → `slipCount > 0`, `slipAmount = null`) is
skipped entirely and the hero falls to stay — even though the windows-list `SlipCell`
(`market-research.tsx:325–336`) *does* render "N requested (no priced items)". Question: should a
count-only service figure be hero-worthy ("N requested in Kyoto, no priced items") ahead of stay, or
does stay correctly win when service has no $? Leon rules; it is one line either way.

---

## A4 — Visual-fidelity delta table

Target: `docs/planning/partner-demand-visual-target.html` Surface 5 (map vocab in Surface 3). The
target's own standing rule (lines 13–14): it is a **layout+behavior** reference; colors/fonts come from
code brand tokens — so token/hex parity is expected and **is honored** (see row e).

| Section | Target (visual-target.html) | Observed (file:line) | Root cause |
|---|---|---|---|
| **(a) Hero** | Fraunces serif, navy figure, on a **gold-wash gradient band**; trip-count subtext (lines 24, 38–39, 119–123). | Figure is `Fraunces, Georgia, serif` 30px navy (`market-research.tsx:183`) BUT **Fraunces is never loaded** — `client/index.html:28` loads ~25 fonts, Fraunces not among them; `index.css` imports Inter + DM Serif only → **falls back to Georgia**. Hero is a plain shadcn `Card` (`:179–181`) with **no gold-wash band**. | **Built-unstyled** (font asset missing + no band). Token/navy correct. |
| **(b) Windows row `calendar↗`/`map↗`** | Each row: `[calendar↗] [map↗] [add window / create →]` (lines 318–320); the surface is billed "the calendar↔map bridge" (294). | `WindowRow` (`:234–266`) renders date + slip/stay cell + **only** the create link (`:258–263`). **No `calendar↗` and no `map↗` element exists** — grep returns zero hits. | **Never-built.** Documented as a deliberate deferral in the file header (`:13–18`). |
| **(c) Scrubber / ±90 axis** | A **band**: −90…+90 track, half-grey/half-gold, **navy vertical "today" marker** at 50% + caption + forward-pressure strip (lines 300–312). | `demand-scrubber` (`:138–158`) is a **text line** `Window {from} → {to}` + two toggle pills (Requested/Missed). No axis rail, no today tick, no pressure strip. | **Re-shaped / built-unstyled.** The *behavior* (R20 requested/missed, never summed) is correct; the visual band form was never built. |
| **(d) Map vocabulary** | Gold **dashed** unmet-demand circles at centroids, radius ∝ **$ requested**; stay-gap ring; expired circle; teal pins; red gap markers; layer legend (Surface 3, lines 227–264). | Map is `SearchInterestLayer → MarketInsightsView` rendering a **different metric (search interest)**: **red** `#E85D55` circles sized by **search count** (`catalog-map-view.tsx:469–473`) + brown/gold `+N` gap squares (`:489`). No gold dashed $-circles, no $ radius, no stay/expired rings, no layer legend. | **Deliberate deferral + semantic substitution** — the $ centroid map needs a neighborhood grain (deferred, header `:13–18`); a *different* labeled layer stands in its place by design. |
| **(e) Brand tokens** | `--navy:#1E3A5F`, gold `#E8B339`, gold-ink `~#8A6A15` (lines 16–21); take from code tokens. | `NAVY=var(--earn-navy)` etc. (`market-research.tsx:58–60`); `index.css` `--earn-navy:#1E3A5F` (**exact**), `--earn-gold-ink:#8A6414` (≈), `--earn-gold-wash` (same family). | **Not a delta** — honored. |

**Which a pixel gate would have caught:** (a) Fraunces→Georgia and the missing gold band, (c) the
pills-not-band scrubber, (d) red count-circles vs gold $-circles — all directly pixel-diffable. **Which
it would NOT settle:** (b) `calendar↗/map↗` (a gate sees "text missing" but not "never built"), and
(d)'s *semantic* substitution (the map area paints richly, so a "did it render?" gate passes; only a
reviewer catches that it is the wrong metric). Net: **the skipped pixel gate would have caught the
hero + scrubber + map-color deltas**; it would not have caught the never-built row links or the
metric substitution.

---

## A5 — Pressure-flag review input

**There is no decomposed calendar-pressure read to review — it was never built.**
- No partner surface reads `trend_scores` / `seasonalExpected` / `contributingSources` (grep across
  `client/src` + `server/routes`: **zero hits**).
- `pressureShade()` (`calendar.tsx:78–80`) is a **pure stub**: `if (!SHOW_PRESSURE_SHADING) return
  undefined; return undefined;`. There is no `/api` endpoint serving decomposed pressure.
- So `trend_scores` being populated (8/8 rows) satisfies the **data** precondition the fixture named,
  but the **code** (a decomposed season+holiday/festival read + its render, never the composite
  `trend_score`/`crowd_band` — R21) does not exist. Flipping `SHOW_PRESSURE_SHADING` today renders
  **nothing** (the stub returns undefined regardless).

**Recommendation:** the flag is **not a flip** — it is a build. Keep it `false`. If Leon rules pressure
in for Part B, the work is: (1) a read that decomposes `trend_scores` into forward calendar pressure
(season + holiday/festival) + attention deviation, confidence-floored, **never** the composite; (2)
wire it into `pressureShade()` + the 90d strip with an "updated daily" cadence label; (3) render honest
`no-data` where a market/week has no row. That is Part-B scope only on Leon's ruling.

---

## A6 — Pixel-gate environment fix

**Missing lib:** `libglib-2.0.so.0`. **Root reason:** the Replit runner is **NixOS**, and Playwright's
`apt`-based `install-deps` does not run there. The repo's own history confirms direct Playwright in the
Replit sandbox SIGSEGVs even after Nix `glib` + X11/Mesa installs (`e2e/VERIFICATION_RESULTS.md:235`,
`docs/planning/QA_PUNCH_LIST.md:227`).

**Every existing Playwright gate already solves this on CI** with one cache-keyed two-step block, e.g.
`.github/workflows/discover-tabs-gate.yml:87–100`:
```yaml
- Cache Playwright browsers            # actions/cache@v4, path ~/.cache/ms-playwright
- run: npx playwright install --with-deps chromium     # cache miss (line 96) — apt-installs libglib2.0-0
- run: npx playwright install-deps chromium            # cache hit  (line 100)
```
on `runs-on: ubuntu-latest`. `--with-deps` apt-installs `libglib2.0-0`, which ships the exact missing
`libglib-2.0.so.0`. The same block appears in ~14 workflows (spec-coverage, provider-console,
app-routes, auth-routes, navbar, selection-controls, e2e-tests).

**Smallest fix (ranked):**
1. **Run the pixel/screenshot gate as a GitHub Actions job on `ubuntu-latest`, reusing the exact cache
   + `playwright install --with-deps chromium` block** — recommended. Zero invention; sidesteps the
   NixOS SIGSEGV class; makes `libglib-2.0.so.0` present the same way every green gate already does.
   Pin the ubuntu image and generate snapshot baselines on the same runner for font/render determinism.
2. Add `glib`(+`glib-networking`) to `.replit:7` nix packages — right shape, but the repo already tried
   this and still SIGSEGV'd; would also need `webkit-smoke.sh`-style `LD_LIBRARY_PATH` plumbing.
   Not the smallest reliable fix.
3. `playwright install-deps` alone — apt-based, does not run on Replit NixOS; already a component of #1.

**Consequence for Part B:** the pixel gate must be RUNNABLE (via #1) before any visual fix in B4 is
claimed — "verified via API contracts" is not a substitute for a visual gate on visual work, which is
exactly why this step exists.

---

## HARD STOP — Leon rules on:
1. **Search layer's fate** — filter to the 8 operating markets + declared-market anchor (B1) · relabel
   (it is coverage-gaps, not search, when the substrate is dark) · or **unmount** until the search
   write-path FOLLOWUP lands. A2's ⚑ substrate query decides how dark it is.
2. **Hero (A3)** — accept as honest render + file the count-only-slip capture gap as FOLLOWUP (likely),
   or adopt the count-only-slip-hero nuance (one line).
3. **Pressure flag (A5)** — keep off (no read exists), or rule the decomposed read into Part B as a build.
4. **Part B scope** — B1/B2 (data correctness) are almost certainly in; B4 (fidelity) is gated on the
   pixel gate (A6 #1) being live first; B3/B5 per the above rulings.
