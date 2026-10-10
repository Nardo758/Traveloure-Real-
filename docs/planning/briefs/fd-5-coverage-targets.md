# FD-5 — coverage targets (Phase 0 + rulings, Oct 10, 2026)

Read on `main` at `80789efd9` (R406); built on FD-3's branch (DayBlock's feasibility line). Ledger row
`2026-10-10-fd5-coverage-targets` (R?). No migration.

## 1. Production facts (Replit reads, Oct 10, 2026)
- Kyoto `city_neighborhoods`: one row each — `gion`, `higashiyama`, `arashiyama`, `pontocho`, `kyoto-station`,
  `nishijin`, `kawaramachi-sanjo`, `fushimi` (`server/seeds/city-neighborhoods.seed.ts:100-156`). No duplicates.
- **Migration 042 is stale:** `server/migrations/042_phase3_seed_neighborhoods.sql:17-21` seeds `fushimi_inari` and
  `downtown_kawaramachi`, which never reached production. Production slugs are canonical. No merge lane.
- `place_facts` (Kyoto): 24 rows, all `places_api`; zero official facts. `content_sources`: 0 rows.

## 2. Rulings (decision-maker, Oct 10, 2026)
1. **Peak** = a season with `market_season_calendars.expected_demand_multiplier ≥ COVERAGE_PEAK_MULTIPLIER` (config,
   1.5 — Kyoto: sakura, momiji) **or** a Saturday/Sunday. Public holidays not now; the Nager.Date trend adapter
   (`server/services/trend-engine/adapters/nager-date.adapter.ts`) is the later source.
2. **Unconfirmed dates** gate against `peak`, the stricter target.
3. **Per neighbourhood.** A day's teaser counts only the neighbourhoods at or above their own target; none ⇒ the
   day shows nothing. Never summed.
4. **Only the teaser's own counts gate** (`localPicks`, `localNotes`). Official-fact targets are census-reported,
   not gating (FD-3's day line already says "not checked").
5. Expert door / Ask a local stay on the expert-supply gate. Unchanged.
6. Resolved by 4.
7. **Numbers (Leon, Oct 10, 2026)** — every Kyoto production slug: `peak` 5 picks / 3 notes, `normal_weekday`
   3 / 2. Official fields unset.

Also in scope: the client renders `localTeaser` on `DayBlock`, beside the feasibility line (the one-prop pattern of
FD-3). `neighborhood_coverage_target` (provider-supply targets, `shared/schema.ts:5283-5295`) is not touched.

## 3. Built
| Piece | Where |
|---|---|
| Targets + threshold (config) | `server/config/coverage-targets.config.ts` |
| Day type, `meetsTarget`, the ONE `nearestArea`, census (pure) | `shared/coverage-targets.ts` |
| Gate (per neighbourhood, day type) | `shared/free-draft-cap.ts` `localTeasersByDay({ gate })` |
| Service: market targets, season rows, plan day dates | `server/services/local-teaser.service.ts` |
| Census loader (injected query, SELECT only) | `server/services/coverage-census.service.ts` |
| Read-only census script | `scripts/report-coverage-census.cjs <market>` |
| Nightly line | `server/jobs/contentExpiryCensus.ts` → `coverage[market] = censusSummary(...)` |
| Words | `shared/free-draft-cap.ts` `localTeaserLine` — "3 local picks and 2 local notes for this day" |
| Render | `client/src/components/plan/DayBlock.tsx` `localTeaser` prop; mounts: `SlipView.tsx` (one prop), `TripCardDays.tsx` |

**How the gate measures.** A neighbourhood is at target on its WHOLE live local content (tagged local, unexpired
gems by slug; nuggets by id or name) — the census's measure. The teaser then shows the plan's remainder (gems not
already on the plan) for the neighbourhoods that passed. A slug with no target has no gate (FD-1's behaviour). A
failed season read gates every day as `peak`.

**Not mounted:** the Workstation (an expert's surface; a handed-off plan is paid and carries no teaser) and the
versions board.

**SlipView diff (sanctioned one prop; no placement pins changed):**
```
                 feasibility={day?.feasibility ?? null}
+                localTeaser={day?.localTeaser ?? null}
```

**Copy.** The content-tiers ruling §4 sentence is not in the repo; the words are one function, held for Leon's
wording review. Nothing is drawn on a zero day.

## 4. Tests
- `shared/__tests__/coverage-targets.test.ts` CT1–CT7 (whole-directory job): day type; `meetsTarget`; zero ⇒
  nothing, under target ⇒ nothing, at target ⇒ the honest count, two neighbourhoods never summed; the census;
  the words; Leon's numbers on the eight production slugs.
- `server/__tests__/fd5-coverage-gate.db.test.ts` C1–C6 (wired into `scheduler-jobs-gate.yml`): weekday at target
  speaks; Saturday, momiji and unconfirmed dates gate as peak; an untargeted plan is ungated; the nightly line.
- `client/src/components/plancard/__tests__/day-local-teaser-line.test.tsx` LT1–LT4 (whole-directory job).

## 5. Consequence, stated
With Leon's numbers and today's production content, a Kyoto neighbourhood speaks only once it holds ≥3 live local
gems and ≥2 live local notes (≥5 / ≥3 on peak days). Run `node scripts/report-coverage-census.cjs kyoto` against
production to see which neighbourhoods do.
