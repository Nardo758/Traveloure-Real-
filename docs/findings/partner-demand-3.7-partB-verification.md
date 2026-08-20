# Partner Demand · STEP 3.7 · PART B — verification record (data correctness)

**Branch:** `lane/partner-demand-fidelity` · run by Leon on Replit (dev DB), read-only + seed/cleanup.
**Result: ALL PASS.** No code changes during verification. Provider =
`c96e66a2-5601-49dc-8ece-fa800ca65542` (`kyoto-temples@traveloure.test`).

**Static:** demand suite **33/33** (incl. R29: enumerable floor 3, derived stays 5, the $240/n=3
enumerable cell `status:ok`+`lowN:true`, n=3 derived suppressed, [3,5) early-signal labeling);
demand-rollup gate + self-test green; `git diff --check` clean.

**§1 R29 hero** — `readPartnerDemandRollup(<kyoto>)` returns
`requested.slipAmount=240, slipCount=3, slipValuedCount=3, slipLowN=true` (stay: 27/135, `stayLowN=false`).
The n=1 slip cell is `no_data`; the n=3 slip cell is `ok`+`lowN`. Hero render branch is slip-first →
resolves to **"$240 … [early signal]"**, not the "27 trips · 135 nights" stay fallback. ✅

**§2 R29 negatives** — seeded fixtures read back through the same provider path:
enumerable own-book slip n=3 → `ok`+`lowN`; derived funnel n=3 → `no_data` (value hidden); any n=2 →
`no_data`. Fixtures cleaned (0/0). ✅

**§3 B1 Bali filter** — seeded provider rows `city='Bali'` + `city='Kyoto'`; the endpoint's
`declaredCities=[Bali,Kyoto]` → `operatingCities=[Kyoto]` → `markets=[kyoto]`. **Bali dropped**;
partner sees Kyoto only. Fixtures cleaned. ✅

**§4 B-search** — `market-research.tsx` has 0 `<SearchInterestLayer/>` JSX mounts (only the removal
comment). Hero + requested/missed windows retained. ✅

**§5 B2 label** — Catalog `text-real-search-count` renders "Based on N real searches · M coverage
gaps · Kyoto" with **no "90 days"**. ✅

**Verification limitation (honest):** the Replit NixOS sandbox cannot run direct Playwright (missing
browser deps), so the checks above are at the service/read + component-condition layer, not an
authenticated browser assertion. `readPartnerDemandRollup(providerId)` is the exact read behind the
authenticated route, so R29/B1 are proven; the *rendered pixels* are what the B4 pixel gate exists to
verify on an `ubuntu-latest` CI runner.

## Leon's Part-B rulings (recorded)
- **B2:** no further work — `demand_signals` is a dead source (0 rows), so dropping it changes nothing;
  the honest label shipped is sufficient. Real repair arrives with the search write-path FOLLOWUP.
- **B4:** build the pixel gate now, in this order so baselines never enshrine the unfixed UI:
  1. `ubuntu-latest` workflow (reuse `playwright install --with-deps chromium`), **baseline-freezing OFF**
     — its first job is producing screenshots for human eyes, not enforcing them.
  2. Land the A4 visual deltas (Fraunces, hero gold-wash, ±90 scrubber band, row links).
  3. Screenshots → Leon, compared against `partner-demand-visual-target.html` — the fidelity pass.
  4. On Leon's approval, freeze those screenshots as baselines — the gate flips to a regression guard.
     That approval is 3.7's fidelity sign-off; the frozen baselines are its durable artifact.
